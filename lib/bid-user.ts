import { prisma } from "./prisma";
import bcrypt from "bcrypt";

export async function getOrCreateBidUser(
  email: string,
  fullName: string,
  procurementRoles?: string[]
): Promise<{ id: number }> {
  const existing = await prisma.bidUser.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) return existing;

  const role = procurementRoles?.includes("CONTRACTOR")
    ? "CONTRACTOR"
    : procurementRoles?.includes("CONSULTANT")
    ? "CONSULTANT"
    : "CLIENT";

  const unusablePassword = await bcrypt.hash(
    Math.random().toString(36) + Math.random().toString(36) + Date.now().toString(36),
    10
  );

  const created = await prisma.bidUser.create({
    data: {
      email,
      full_name: fullName,
      password_hash: unusablePassword,
      role,
      account_type: "INDIVIDUAL",
      status: "ACTIVE",
    },
    select: { id: true },
  });
  return created;
}
