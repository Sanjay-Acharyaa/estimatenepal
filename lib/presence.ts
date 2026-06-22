import { redis } from "./redis";
import { prisma } from "./prisma";

const PRESENCE_TTL = 5 * 60;       // 5 min — if no ping, user is offline
const SESSION_TTL  = 60 * 60;      // 60 min — session metadata survives a long idle
const SESSION_GAP  = 30 * 60 * 1000; // 30 min idle = new session

export type PresenceData = {
  userId: string;
  name: string;
  email: string;
  orgId: string | null;
  orgName: string | null;
  path: string;
  sessionStart: string; // ISO
  lastSeen: string;     // ISO
  pageCount: number;
};

type SessionMeta = {
  sessionId: string;
  startedAt: string;   // ISO
  lastSeen: string;    // ISO
  pageCount: number;
  pages: string[];     // last 20 unique paths visited
};

function presenceKey(userId: string) { return `presence:${userId}`; }
function sessionKey(userId: string)  { return `usersession:${userId}`; }
function heatmapKey(dow: number, hour: number) { return `heatmap:${dow}:${hour}`; }

export async function pingPresence(
  userId: string,
  name: string,
  email: string,
  orgId: string | null,
  orgName: string | null,
  path: string,
): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();

  try {
    // Read existing session metadata (60-min TTL key)
    const rawSession = await redis.get(sessionKey(userId));
    let session: SessionMeta | null = rawSession ? JSON.parse(rawSession) : null;

    // Detect gap: if last seen > 30min ago, close old session + start new
    if (session && (now.getTime() - new Date(session.lastSeen).getTime()) > SESSION_GAP) {
      // Write closed session to DB
      const endedAt = new Date(session.lastSeen);
      const startedAt = new Date(session.startedAt);
      const durationSeconds = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);
      if (durationSeconds > 60) { // only save sessions > 1 minute
        prisma.userSession.create({
          data: {
            userId,
            startedAt,
            endedAt,
            durationSeconds,
            pageCount: session.pageCount,
            date: new Date(startedAt.toDateString()),
          },
        }).catch(() => {});
      }
      session = null; // start fresh
    }

    // Start new session or continue existing
    const isNewSession = !session;
    const sessionId = isNewSession ? `${userId}:${now.getTime()}` : session!.sessionId;
    const startedAt = isNewSession ? nowIso : session!.startedAt;
    const pages = session?.pages ?? [];
    if (!pages.includes(path)) pages.push(path);
    if (pages.length > 20) pages.shift();

    const newSession: SessionMeta = {
      sessionId,
      startedAt,
      lastSeen: nowIso,
      pageCount: (session?.pageCount ?? 0) + 1,
      pages,
    };

    // Update session metadata (long TTL)
    await redis.set(sessionKey(userId), JSON.stringify(newSession), "EX", SESSION_TTL);

    // Update presence key (short TTL — expiry = offline)
    const presence: PresenceData = {
      userId, name, email, orgId, orgName, path,
      sessionStart: startedAt,
      lastSeen: nowIso,
      pageCount: newSession.pageCount,
    };
    await redis.set(presenceKey(userId), JSON.stringify(presence), "EX", PRESENCE_TTL);

    // Increment hourly heatmap (day-of-week × hour, persistent)
    const dow  = now.getDay();   // 0=Sun, 6=Sat
    const hour = now.getHours(); // 0-23
    await redis.incr(heatmapKey(dow, hour));

    // Update lastSeenPath on user record (fire-and-forget)
    prisma.user.update({ where: { id: userId }, data: { lastSeenPath: path } }).catch(() => {});

  } catch (err) {
    // Presence tracking must never crash the app
    console.error("[presence] pingPresence error:", (err as Error).message);
  }
}

export async function getOnlineUsers(): Promise<PresenceData[]> {
  try {
    const keys = await redis.keys("presence:*");
    if (keys.length === 0) return [];
    const values = await redis.mget(...keys);
    return values
      .filter((v): v is string => v !== null)
      .map(v => JSON.parse(v) as PresenceData);
  } catch (err) {
    console.error("[presence] getOnlineUsers error:", (err as Error).message);
    return [];
  }
}

// Returns a 7×24 matrix [dayOfWeek][hour] = count
export async function getHeatmap(): Promise<number[][]> {
  try {
    const pipeline = redis.pipeline();
    for (let dow = 0; dow < 7; dow++) {
      for (let h = 0; h < 24; h++) {
        pipeline.get(heatmapKey(dow, h));
      }
    }
    const results = await pipeline.exec();
    const matrix: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
    let i = 0;
    for (let dow = 0; dow < 7; dow++) {
      for (let h = 0; h < 24; h++) {
        const val = results?.[i]?.[1];
        matrix[dow][h] = val ? parseInt(val as string, 10) : 0;
        i++;
      }
    }
    return matrix;
  } catch (err) {
    console.error("[presence] getHeatmap error:", (err as Error).message);
    return Array.from({ length: 7 }, () => new Array(24).fill(0));
  }
}

// Called when user explicitly logs out — close current session immediately
export async function closeSession(userId: string): Promise<void> {
  try {
    const rawSession = await redis.get(sessionKey(userId));
    if (rawSession) {
      const session: SessionMeta = JSON.parse(rawSession);
      const endedAt = new Date();
      const startedAt = new Date(session.startedAt);
      const durationSeconds = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);
      if (durationSeconds > 60) {
        prisma.userSession.create({
          data: {
            userId,
            startedAt,
            endedAt,
            durationSeconds,
            pageCount: session.pageCount,
            date: new Date(startedAt.toDateString()),
          },
        }).catch(() => {});
      }
    }
    await redis.del(presenceKey(userId), sessionKey(userId));
  } catch (err) {
    console.error("[presence] closeSession error:", (err as Error).message);
  }
}
