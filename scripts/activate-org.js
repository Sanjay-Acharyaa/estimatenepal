/**
 * Manual org activation after QR payment.
 * Usage: node scripts/activate-org.js <email> <plan> [months]
 *
 * Plans: solo-pro | team-3 | team-5 | enterprise | free
 * Months: default 1 (number of months to grant)
 *
 * Examples:
 *   node scripts/activate-org.js user@example.com solo-pro 1
 *   node scripts/activate-org.js user@example.com team-5 12
 *   node scripts/activate-org.js user@example.com free
 */

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const PLAN_MAP = {
  "solo-pro":   { plan: "PRO",        planTier: "SOLO" },
  "team-3":     { plan: "PRO",        planTier: "TEAM3" },
  "team-5":     { plan: "PRO",        planTier: "TEAM5" },
  "enterprise": { plan: "ENTERPRISE", planTier: "ENTERPRISE" },
  "free":       { plan: "FREE",       planTier: "FREE" },
};

async function main() {
  const [, , email, planKey, monthsArg] = process.argv;

  if (!email || !planKey) {
    console.error("Usage: node scripts/activate-org.js <email> <plan> [months]");
    console.error("Plans:", Object.keys(PLAN_MAP).join(" | "));
    process.exit(1);
  }

  const planConfig = PLAN_MAP[planKey.toLowerCase()];
  if (!planConfig) {
    console.error(`Unknown plan "${planKey}". Valid: ${Object.keys(PLAN_MAP).join(", ")}`);
    process.exit(1);
  }

  const months = parseInt(monthsArg, 10) || 1;

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: { id: true, name: true, orgId: true },
  });

  if (!user) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  if (!user.orgId) {
    console.error(`User "${email}" has no org attached.`);
    process.exit(1);
  }

  const validUntil = new Date();
  validUntil.setMonth(validUntil.getMonth() + months);

  const updated = await prisma.org.update({
    where: { id: user.orgId },
    data: {
      plan: planConfig.plan,
      planTier: planConfig.planTier,
      trialEndsAt: planConfig.plan === "FREE" ? null : validUntil,
    },
    select: { id: true, name: true, plan: true, planTier: true, trialEndsAt: true },
  });

  console.log("\n✓ Activation complete");
  console.log("  User   :", user.name, `(${email})`);
  console.log("  Org    :", updated.name, `(${updated.id})`);
  console.log("  Plan   :", updated.plan, "/", updated.planTier);
  console.log("  Valid until:", updated.trialEndsAt ? updated.trialEndsAt.toDateString() : "N/A");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
