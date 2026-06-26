const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const Redis = require("ioredis");
const { PrismaClient } = require("@prisma/client");

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev });
const handle = app.getRequestHandler();
const prisma = new PrismaClient();

// room -> Map<socketId, { userId, name, initials }>
const roomPresence = new Map();
// room -> Map<itemId, { socketId, userId, name }> — shape currently being edited
const roomLocks = new Map();
// `${roomId}:${itemId}` -> timeoutId — 30s auto-release on disconnect
const lockTimeouts = new Map();

function getInitials(name) {
  return name
    .split(" ")
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";
}

function presenceFor(roomId) {
  return Array.from((roomPresence.get(roomId) ?? new Map()).values());
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
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  // Redis pub/sub adapter — required for PM2 cluster mode.
  // Without this, each worker process has its own in-memory socket registry, so
  // cursor events, shape locks, and presence emitted on worker A never reach
  // clients connected to worker B. The adapter forwards events across all workers.
  if (process.env.REDIS_URL) {
    const pubClient = new Redis(process.env.REDIS_URL);
    const subClient = pubClient.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
  }

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
    // Fallback: client-supplied identity (used only for presence display, not auth)
    if (!socket.data.userId && socket.handshake.auth?.userId) {
      socket.data.userId = socket.handshake.auth.userId;
      socket.data.userName = socket.handshake.auth.userName ?? "Unknown";
    }
    next();
  });

  io.on("connection", (socket) => {
    const joinedRooms = new Set();

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

      // Presence: add this user to the room
      if (socket.data.userId) {
        if (!roomPresence.has(roomId)) roomPresence.set(roomId, new Map());
        roomPresence.get(roomId).set(socket.id, {
          socketId: socket.id,
          userId: socket.data.userId,
          name: socket.data.userName ?? "Unknown",
          initials: getInitials(socket.data.userName ?? "?"),
        });
        io.to(roomId).emit("presence:update", presenceFor(roomId));
      }

      // Send current lock state to the joining user
      const locks = roomLocks.get(roomId);
      if (locks && locks.size > 0) {
        socket.emit("shape:locks:init", Array.from(locks.entries()).map(([itemId, lock]) => ({
          itemId, userId: lock.userId, name: lock.name,
        })));
      }
    });

    socket.on("leave:room", (roomId) => {
      if (typeof roomId !== "string") return;
      socket.leave(roomId);
      joinedRooms.delete(roomId);

      // Presence: remove from room
      const room = roomPresence.get(roomId);
      if (room) {
        room.delete(socket.id);
        if (room.size === 0) roomPresence.delete(roomId);
        else io.to(roomId).emit("presence:update", presenceFor(roomId));
      }
    });

    socket.on("disconnect", () => {
      // Release all shape locks held by this socket
      for (const [rid, locks] of roomLocks) {
        for (const [itemId, lock] of locks) {
          if (lock.socketId === socket.id) {
            locks.delete(itemId);
            const key = `${rid}:${itemId}`;
            if (lockTimeouts.has(key)) { clearTimeout(lockTimeouts.get(key)); lockTimeouts.delete(key); }
            io.to(rid).emit("shape:unlock", itemId);
          }
        }
        if (locks.size === 0) roomLocks.delete(rid);
      }

      // Clean up presence for all rooms this socket joined
      for (const roomId of joinedRooms) {
        const room = roomPresence.get(roomId);
        if (!room) continue;
        room.delete(socket.id);
        if (room.size === 0) roomPresence.delete(roomId);
        else io.to(roomId).emit("presence:update", presenceFor(roomId));
      }
      joinedRooms.clear();
    });

    // ─── Cursor sharing (throttled on client, just relay here) ──────────────
    socket.on("cursor:move", ({ roomId, x, y }) => {
      if (typeof roomId !== "string" || typeof x !== "number" || typeof y !== "number") return;
      socket.to(roomId).emit("cursor:move", {
        socketId: socket.id,
        userId: socket.data.userId,
        name: socket.data.userName ?? "?",
        x, y,
      });
    });

    // ─── Shape lock / unlock ─────────────────────────────────────────────────
    socket.on("shape:lock", ({ roomId, itemId }) => {
      if (typeof roomId !== "string" || typeof itemId !== "string") return;
      if (!roomLocks.has(roomId)) roomLocks.set(roomId, new Map());
      const locks = roomLocks.get(roomId);
      const existing = locks.get(itemId);
      if (existing && existing.socketId !== socket.id) return; // already locked by another user

      locks.set(itemId, { socketId: socket.id, userId: socket.data.userId, name: socket.data.userName ?? "Unknown" });

      const key = `${roomId}:${itemId}`;
      if (lockTimeouts.has(key)) clearTimeout(lockTimeouts.get(key));
      lockTimeouts.set(key, setTimeout(() => {
        const l = roomLocks.get(roomId);
        if (l) { l.delete(itemId); if (l.size === 0) roomLocks.delete(roomId); }
        lockTimeouts.delete(key);
        io.to(roomId).emit("shape:unlock", itemId);
      }, 30000));

      socket.to(roomId).emit("shape:lock", { itemId, userId: socket.data.userId, name: socket.data.userName ?? "Unknown" });
    });

    socket.on("shape:unlock", ({ roomId, itemId }) => {
      if (typeof roomId !== "string" || typeof itemId !== "string") return;
      const locks = roomLocks.get(roomId);
      if (!locks) return;
      const lock = locks.get(itemId);
      if (!lock || lock.socketId !== socket.id) return;
      locks.delete(itemId);
      if (locks.size === 0) roomLocks.delete(roomId);
      const key = `${roomId}:${itemId}`;
      if (lockTimeouts.has(key)) { clearTimeout(lockTimeouts.get(key)); lockTimeouts.delete(key); }
      socket.to(roomId).emit("shape:unlock", itemId);
    });

    // ─── Shape events ────────────────────────────────────────────────────────

    socket.on("takeoff:add", ({ roomId, item }) => {
      if (typeof roomId === "string" && item) {
        socket.to(roomId).emit("takeoff:add", item);
      }
    });

    socket.on("takeoff:update", ({ roomId, item }) => {
      if (typeof roomId === "string" && item) {
        socket.to(roomId).emit("takeoff:update", item);
      }
    });

    socket.on("takeoff:delete", ({ roomId, itemId }) => {
      if (typeof roomId === "string" && typeof itemId === "string") {
        socket.to(roomId).emit("takeoff:delete", itemId);
      }
    });
  });

  httpServer.listen(port, () => {
    console.log(
      `> Ready on http://localhost:${port} (${dev ? "dev" : "production"})`
    );
  });
});
