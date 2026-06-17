import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

// Non-blocking — fire-and-forget. Audit writes must never add latency to the calling request.
// Callers should NOT await this function.
export function appendAuditLog({
  orgId,
  userId,
  event,
  resourceId,
  meta,
  ipAddress,
}: {
  orgId: string;
  userId: string;
  event: string;
  resourceId?: string;
  meta?: Prisma.InputJsonValue;
  ipAddress?: string;
}): void {
  prisma.auditLog
    .create({ data: { orgId, userId, event, resourceId, meta, ipAddress } })
    .catch((err) => {
      console.error("[audit] Failed to write audit log:", { event, orgId, userId, err });
    });
}
