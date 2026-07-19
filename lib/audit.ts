import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Fire-and-forget audit write. Returns void — callers that `await` this receive
 * immediate resolution. The DB write happens in the background. Never await or
 * chain .catch() on the return value.
 */
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
