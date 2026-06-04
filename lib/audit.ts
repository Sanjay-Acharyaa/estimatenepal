import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export async function appendAuditLog({
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
}) {
  await prisma.auditLog.create({
    data: { orgId, userId, event, resourceId, meta, ipAddress },
  });
}
