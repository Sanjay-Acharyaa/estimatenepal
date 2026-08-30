import type { Namespace } from "socket.io";

declare const globalThis: typeof global & { __procurementNsp?: Namespace };

export function emitProcurementNotification(
  userId: string,
  event: string,
  data: Record<string, unknown>
): void {
  try {
    const nsp = globalThis.__procurementNsp;
    if (!nsp) return;
    nsp.to(`user:${userId}`).emit("notification:new", { event, ...data });
  } catch {
    // Never let a socket error propagate into the HTTP response path
  }
}
