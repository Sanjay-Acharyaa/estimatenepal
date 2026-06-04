import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(user?: { id: string; name: string }): Socket {
  if (!socket) {
    socket = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
      auth: user ? { userId: user.id, userName: user.name } : {},
    });
  }
  return socket;
}

/** Room key used for collaboration — tab + drawing page */
export function roomId(disciplineId: string, pageId: string): string {
  return `${disciplineId}__${pageId}`;
}
