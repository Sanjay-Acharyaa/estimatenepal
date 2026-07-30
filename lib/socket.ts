import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

/** Return the shared Socket.io singleton.
 *  The first call MUST supply a `user` so the socket connects with auth.
 *  Subsequent calls (e.g. from event emitters) may omit `user` — the existing
 *  authenticated socket is returned.  Throws if called without `user` before the
 *  socket has been initialised, preventing an anonymous connection from being
 *  created. */
export function getSocket(user?: { id: string; name: string }): Socket {
  if (!socket) {
    if (!user) throw new Error("[socket] getSocket() called before initialisation — pass a user on the first call");
    socket = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
      auth: { userId: user.id, userName: user.name },
    });
  }
  return socket;
}

/** Room key used for collaboration — tab + drawing page */
export function roomId(disciplineId: string, pageId: string): string {
  return `${disciplineId}__${pageId}`;
}
