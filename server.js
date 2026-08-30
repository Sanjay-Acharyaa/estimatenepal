const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const Redis = require("ioredis");
const { PrismaClient } = require("@prisma/client");

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);

// H4: Validate required env vars at startup — fail fast with a clear message instead
// of a cryptic runtime error when the first request hits a misconfigured handler.
const REQUIRED_ENV = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "EMAIL_FROM",
  "RESEND_API_KEY",
  "CRON_SECRET",
  "REDIS_URL",
  "RESEND_WEBHOOK_SECRET",
  "WEBHOOK_ENCRYPTION_KEY",
];
const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingEnv.length > 0) {
  console.error("[server] Missing required environment variables:");
  missingEnv.forEach((k) => console.error(`  • ${k}`));
  console.error("Check your .env.local or DigitalOcean App Platform environment settings.");
  process.exit(1);
}

const app = next({ dev, dir: __dirname });
const handle = app.getRequestHandler();
const prisma = new PrismaClient();

function getInitials(name) {
  return name
    .split(" ")
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";
}

// ─── Redis-backed presence + lock helpers ─────────────────────────────────────
// Keys:
//   pres:{roomId}           Redis Hash  field=socketId  value=JSON user data  TTL=300s
//   shlock:{roomId}:{itemId} Redis String value=JSON lock data  TTL=30s
//
// Using a dedicated client (not the pub/sub pair) so HSET/GET/SET don't interfere
// with the adapter's pub-sub traffic.
let redisState = null;

async function presenceFor(roomId) {
  if (!redisState) return [];
  const raw = await redisState.hgetall(`pres:${roomId}`);
  if (!raw) return [];
  return Object.values(raw)
    .map((v) => { try { return JSON.parse(v); } catch { return null; } })
    .filter(Boolean);
}

async function upsertPresence(roomId, socketId, data) {
  if (!redisState) return;
  await redisState.hset(`pres:${roomId}`, socketId, JSON.stringify(data));
  await redisState.expire(`pres:${roomId}`, 300);
}

async function removePresence(roomId, socketId) {
  if (!redisState) return;
  await redisState.hdel(`pres:${roomId}`, socketId);
}

async function getLocksForRoom(roomId) {
  if (!redisState) return [];
  const prefix = `shlock:${roomId}:`;
  const result = [];
  let cursor = "0";
  do {
    const [next, keys] = await redisState.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 100);
    cursor = next;
    if (keys.length) {
      const vals = await redisState.mget(...keys);
      for (let i = 0; i < keys.length; i++) {
        if (!vals[i]) continue;
        try {
          const lock = JSON.parse(vals[i]);
          const itemId = keys[i].slice(prefix.length);
          result.push({ itemId, ...lock });
        } catch { /* skip malformed */ }
      }
    }
  } while (cursor !== "0");
  return result;
}

async function tryAcquireLock(roomId, itemId, socketId, userId, userName) {
  if (!redisState) return false;
  const key = `shlock:${roomId}:${itemId}`;
  const val = JSON.stringify({ socketId, userId, name: userName });
  // SET NX EX is atomic: first caller wins, rest get null
  const ok = await redisState.set(key, val, "EX", 30, "NX");
  if (ok) return true;
  // Lock exists — allow re-lock by the same socket (refreshes TTL)
  const existing = await redisState.get(key);
  if (!existing) return false;
  try {
    const parsed = JSON.parse(existing);
    if (parsed.socketId === socketId) {
      await redisState.expire(key, 30);
      return true;
    }
  } catch { /* skip */ }
  return false;
}

async function tryReleaseLock(roomId, itemId, socketId) {
  if (!redisState) return false;
  const key = `shlock:${roomId}:${itemId}`;
  const existing = await redisState.get(key);
  if (!existing) return false;
  try {
    const parsed = JSON.parse(existing);
    if (parsed.socketId !== socketId) return false;
  } catch { return false; }
  await redisState.del(key);
  return true;
}

// Per-userId Redis rate limiter for shape events (cross-connection, cross-worker).
// Uses SET NX EX + INCR pipeline for atomic first-create with TTL.
// Falls back to allow:true on Redis error so a Redis blip never freezes the canvas.
async function allowUserShape(userId, maxPerSec) {
  if (!redisState || !userId) return true;
  try {
    const key = `iorl:${userId}:shape`;
    const results = await redisState.pipeline()
      .set(key, "0", "EX", 1, "NX")
      .incr(key)
      .exec();
    const count = results?.[1]?.[1];
    return typeof count === "number" ? count <= maxPerSec : true;
  } catch {
    return true;
  }
}

app.prepare().then(async () => {
  // Decode NextAuth JWT from cookie to get userId + orgId for tenant guard
  let decode;
  try {
    const mod = await import("next-auth/jwt");
    decode = mod.decode;
  } catch {
    // Fallback: no cookie auth (presence still works via handshake.auth)
  }

  const httpServer = createServer((req, res) => {
    handle(req, res, parse(req.url, true));
  });

  const io = new Server(httpServer, {
    cors: { origin: "https://estimatenepal.com", methods: ["GET", "POST"] },
  });

  // Redis pub/sub adapter — required for PM2 cluster mode.
  // Without this, each worker process has its own in-memory socket registry, so
  // cursor events, shape locks, and presence emitted on worker A never reach
  // clients connected to worker B. The adapter forwards events across all workers.
  if (process.env.REDIS_URL) {
    const pubClient = new Redis(process.env.REDIS_URL);
    const subClient = pubClient.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
    // Dedicated client for application state (presence + locks)
    redisState = new Redis(process.env.REDIS_URL);
  }

  // ─── /procurement namespace — per-user push notifications ────────────────────
  // Separate from the default canvas namespace. Auth requires userId only (no orgId)
  // so individual contractors without an Estimation org can still connect.
  const procurementNsp = io.of("/procurement");
  global.__procurementNsp = procurementNsp;

  procurementNsp.use(async (socket, next) => {
    if (decode && process.env.NEXTAUTH_SECRET) {
      const cookieHeader = socket.handshake.headers.cookie ?? "";
      const tokenName =
        process.env.NODE_ENV === "production"
          ? "__Secure-next-auth.session-token"
          : "next-auth.session-token";
      const match = cookieHeader.match(new RegExp(`(?:^|; )${tokenName}=([^;]+)`));
      if (match) {
        try {
          const token = await decode({
            token: decodeURIComponent(match[1]),
            secret: process.env.NEXTAUTH_SECRET,
          });
          if (token) {
            socket.data.userId = token.sub ?? token.id;
          }
        } catch {
          // Invalid token
        }
      }
    }
    if (!socket.data.userId) {
      next(new Error("Unauthorized"));
      return;
    }
    next();
  });

  procurementNsp.on("connection", (socket) => {
    const room = `user:${socket.data.userId}`;
    socket.join(room);
    socket.on("disconnect", () => {
      socket.leave(room);
    });
  });

  // ─── Auth middleware — extract session from cookie ───────────────────────────
  io.use(async (socket, next) => {
    if (decode && process.env.NEXTAUTH_SECRET) {
      const cookieHeader = socket.handshake.headers.cookie ?? "";
      const tokenName =
        process.env.NODE_ENV === "production"
          ? "__Secure-next-auth.session-token"
          : "next-auth.session-token";
      const match = cookieHeader.match(
        new RegExp(`(?:^|; )${tokenName}=([^;]+)`)
      );
      if (match) {
        try {
          const token = await decode({
            token: decodeURIComponent(match[1]),
            secret: process.env.NEXTAUTH_SECRET,
          });
          if (token) {
            socket.data.userId = token.sub ?? token.id;
            socket.data.userName = token.name ?? "Unknown";
            socket.data.orgId = token.orgId ?? null;
          }
        } catch {
          // Invalid token — continue as unauthenticated
        }
      }
    }
    // Require a valid JWT-derived orgId — no orgId means the socket is either
    // unauthenticated or belongs to a user without an org. Both are rejected here
    // because the tenant guard in join:room relies on socket.data.orgId being set.
    // This also eliminates the previous client-supplied identity fallback, which
    // set userId without orgId and allowed unauthenticated sockets to bypass the
    // tenant check entirely.
    if (!socket.data.orgId) {
      next(new Error("Unauthorized"));
      return;
    }
    next();
  });

  io.on("connection", (socket) => {
    const joinedRooms = new Set();

    // Per-socket set of acquired lock keys ("${roomId}:${itemId}") for efficient
    // disconnect cleanup. Redis TTL (30s) is the fallback if the server crashes
    // before disconnect fires.
    const socketLocks = new Set();

    // Per-socket rate limiter — drops bursts above the per-second threshold.
    // Stored in closure so it's automatically GC'd when the socket disconnects.
    const _rl = new Map(); // eventKey -> { count, resetAt }
    function allow(eventKey, maxPerSec) {
      const now = Date.now();
      let e = _rl.get(eventKey);
      if (!e || now > e.resetAt) { e = { count: 1, resetAt: now + 1000 }; _rl.set(eventKey, e); return true; }
      return ++e.count <= maxPerSec;
    }

    socket.on("join:room", async (roomId) => {
      if (typeof roomId !== "string" || roomId.length > 200) return;

      // Tenant guard: validate discipline belongs to the user's org
      if (socket.data.orgId) {
        try {
          const [disciplineId] = roomId.split("__");
          const discipline = await prisma.discipline.findUnique({
            where: { id: disciplineId },
            select: { project: { select: { orgId: true } } },
          });
          if (
            !discipline ||
            discipline.project.orgId !== socket.data.orgId
          ) {
            return; // Cross-tenant join blocked
          }
        } catch {
          return;
        }
      }

      socket.join(roomId);
      joinedRooms.add(roomId);

      // Presence: add this user to the room (Redis hash, TTL 5 min)
      if (socket.data.userId) {
        await upsertPresence(roomId, socket.id, {
          socketId: socket.id,
          userId: socket.data.userId,
          name: socket.data.userName ?? "Unknown",
          initials: getInitials(socket.data.userName ?? "?"),
        });
        io.to(roomId).emit("presence:update", await presenceFor(roomId));
      }

      // Send current lock state to the joining user
      const locks = await getLocksForRoom(roomId);
      if (locks.length > 0) {
        socket.emit("shape:locks:init", locks.map((l) => ({
          itemId: l.itemId, userId: l.userId, name: l.name,
        })));
      }
    });

    socket.on("leave:room", async (roomId) => {
      if (typeof roomId !== "string") return;
      socket.leave(roomId);
      joinedRooms.delete(roomId);

      // Presence: remove from room
      await removePresence(roomId, socket.id);
      const presence = await presenceFor(roomId);
      if (presence.length > 0) io.to(roomId).emit("presence:update", presence);
    });

    socket.on("disconnect", async () => {
      // Release all shape locks held by this socket
      for (const lockKey of socketLocks) {
        const colonIdx = lockKey.indexOf(":");
        const roomId = lockKey.slice(0, colonIdx);
        const itemId = lockKey.slice(colonIdx + 1);
        const released = await tryReleaseLock(roomId, itemId, socket.id);
        if (released) io.to(roomId).emit("shape:unlock", itemId);
      }
      socketLocks.clear();

      // Clean up presence for all rooms this socket joined
      for (const roomId of joinedRooms) {
        await removePresence(roomId, socket.id);
        const presence = await presenceFor(roomId);
        if (presence.length > 0) io.to(roomId).emit("presence:update", presence);
      }
      joinedRooms.clear();
    });

    // ─── Cursor sharing (throttled on client, just relay here) ──────────────
    socket.on("cursor:move", ({ roomId, x, y }) => {
      if (!allow("cursor", 20)) return;
      if (typeof roomId !== "string" || typeof x !== "number" || typeof y !== "number") return;
      if (!joinedRooms.has(roomId)) return;
      socket.to(roomId).emit("cursor:move", {
        socketId: socket.id,
        userId: socket.data.userId,
        name: socket.data.userName ?? "?",
        x, y,
      });
    });

    // ─── Shape lock / unlock ─────────────────────────────────────────────────
    socket.on("shape:lock", async ({ roomId, itemId }) => {
      if (!allow("shape", 10)) return;
      if (!(await allowUserShape(socket.data.userId, 10))) return;
      if (typeof roomId !== "string" || typeof itemId !== "string") return;
      if (!joinedRooms.has(roomId)) return;
      const acquired = await tryAcquireLock(roomId, itemId, socket.id, socket.data.userId, socket.data.userName ?? "Unknown");
      if (!acquired) return;
      socketLocks.add(`${roomId}:${itemId}`);
      socket.to(roomId).emit("shape:lock", { itemId, userId: socket.data.userId, name: socket.data.userName ?? "Unknown" });
    });

    socket.on("shape:unlock", async ({ roomId, itemId }) => {
      if (!allow("shape", 10)) return;
      if (!(await allowUserShape(socket.data.userId, 10))) return;
      if (typeof roomId !== "string" || typeof itemId !== "string") return;
      if (!joinedRooms.has(roomId)) return;
      const released = await tryReleaseLock(roomId, itemId, socket.id);
      if (!released) return;
      socketLocks.delete(`${roomId}:${itemId}`);
      socket.to(roomId).emit("shape:unlock", itemId);
    });

    socket.on("shape:heartbeat", async ({ roomId, itemId }) => {
      if (!allow("shape:hb", 5)) return;
      if (typeof roomId !== "string" || typeof itemId !== "string") return;
      if (!joinedRooms.has(roomId)) return;
      if (!redisState) return;
      const key = `shlock:${roomId}:${itemId}`;
      try {
        const existing = await redisState.get(key);
        if (!existing) return;
        const parsed = JSON.parse(existing);
        if (parsed.socketId === socket.id) await redisState.expire(key, 30);
      } catch { /* ignore */ }
    });

    // ─── Shape events ────────────────────────────────────────────────────────
    // Guard: only relay if this socket has actually joined the room.
    // joinedRooms is populated in join:room which already runs the tenant check,
    // so a socket in joinedRooms is guaranteed to belong to the correct org.

    socket.on("takeoff:add", async ({ roomId, item }) => {
      if (!allow("shape", 10)) return;
      if (!(await allowUserShape(socket.data.userId, 10))) return;
      if (typeof roomId === "string" && item && joinedRooms.has(roomId)) {
        socket.to(roomId).emit("takeoff:add", item);
      }
    });

    socket.on("takeoff:update", async ({ roomId, item }) => {
      if (!allow("shape", 10)) return;
      if (!(await allowUserShape(socket.data.userId, 10))) return;
      if (typeof roomId === "string" && item && joinedRooms.has(roomId)) {
        socket.to(roomId).emit("takeoff:update", item);
      }
    });

    socket.on("takeoff:delete", async ({ roomId, itemId }) => {
      if (!allow("shape", 10)) return;
      if (!(await allowUserShape(socket.data.userId, 10))) return;
      if (typeof roomId === "string" && typeof itemId === "string" && joinedRooms.has(roomId)) {
        socket.to(roomId).emit("takeoff:delete", itemId);
      }
    });
  });

  // Log Socket.io stats every minute — visible in PM2 logs.
  // Watch with: pm2 logs nepaliestimate --lines 50 | grep socket-stats
  setInterval(() => {
    const connections = io.sockets.sockets.size;
    if (connections === 0) return; // silent when idle
    console.log(`[socket-stats] connections=${connections}`);
  }, 60_000);

  httpServer.listen(port, () => {
    console.log(
      `> Ready on http://localhost:${port} (${dev ? "dev" : "production"})`
    );
    // Signal PM2 that the server is actually listening — required for wait_ready: true
    if (process.send) process.send("ready");
  });
}).catch((err) => {
  console.error("[server] Failed to start:", err);
  process.exit(1);
});
