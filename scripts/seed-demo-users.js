/**
 * Demo User Seeder — creates 200 load-test accounts in MySQL via Prisma
 *
 * Distribution:
 *   4  large orgs  × 20 users = 80 users
 *   15 medium orgs ×  4 users = 60 users
 *   60 solo orgs   ×  1 user  = 60 users
 *   Total = 200 users
 *
 * Run on server:
 *   cd /var/www/nepaliestimate
 *   node scripts/seed-demo-users.js
 *
 * Cleanup (after testing):
 *   node scripts/seed-demo-users.js --cleanup
 */

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

const DEMO_PASSWORD = "Demo@123456";
const DEMO_EMAIL_DOMAIN = "loadtest.estimatenepal.local";
const TRIAL_DAYS = 60;
const OUTPUT_FILE = path.join(__dirname, "load-test-users.json");

// ─── Cleanup mode ────────────────────────────────────────────────────────────
async function cleanup() {
  console.log("🧹 Cleaning up demo accounts...");

  const demoUsers = await prisma.user.findMany({
    where: { email: { contains: DEMO_EMAIL_DOMAIN } },
    select: { id: true, orgId: true },
  });

  const orgIds = [...new Set(demoUsers.map((u) => u.orgId).filter(Boolean))];
  const userIds = demoUsers.map((u) => u.id);

  console.log(`Found ${userIds.length} demo users in ${orgIds.length} orgs`);

  // Delete in dependency order
  await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.failedLogin.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.projectMember.deleteMany({ where: { userId: { in: userIds } } });

  // Delete projects (and cascades) per org
  for (const orgId of orgIds) {
    const projects = await prisma.project.findMany({
      where: { orgId },
      select: { id: true },
    });
    for (const p of projects) {
      await prisma.takeoffGroup.deleteMany({ where: { projectId: p.id } });
      await prisma.discipline.deleteMany({ where: { projectId: p.id } });
      await prisma.projectNote.deleteMany({ where: { projectId: p.id } });
      await prisma.projectTask.deleteMany({ where: { projectId: p.id } });
      await prisma.changeOrder.deleteMany({ where: { projectId: p.id } });
      await prisma.shareLink.deleteMany({ where: { projectId: p.id } });
    }
    await prisma.project.deleteMany({ where: { orgId } });
    await prisma.orgInvite.deleteMany({ where: { orgId } });
    await prisma.rateBatch.deleteMany({ where: { orgId } });
  }

  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.org.deleteMany({ where: { id: { in: orgIds } } });

  if (fs.existsSync(OUTPUT_FILE)) fs.unlinkSync(OUTPUT_FILE);

  console.log("✅ Cleanup complete");
}

// ─── Seed mode ───────────────────────────────────────────────────────────────
async function seed() {
  console.log("🌱 Starting demo user seed...");
  console.log(`Password for all accounts: ${DEMO_PASSWORD}`);

  // Check if already seeded
  const existing = await prisma.user.count({
    where: { email: { contains: DEMO_EMAIL_DOMAIN } },
  });
  if (existing > 0) {
    console.log(
      `⚠️  Found ${existing} existing demo users. Run with --cleanup first.`
    );
    process.exit(1);
  }

  // Hash password once — reused for all 200 users
  console.log("Hashing password...");
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  const allUsers = []; // { email, password, orgName, orgSize, role }
  let userIndex = 1;

  function nextEmail() {
    return `demo${String(userIndex).padStart(3, "0")}@${DEMO_EMAIL_DOMAIN}`;
  }

  function nextName() {
    return `Demo User ${userIndex}`;
  }

  // ── 4 large orgs (20 users each) ─────────────────────────────────────────
  const largeOrgNames = [
    "Himalayan Builders Pvt Ltd",
    "Summit Construction Co",
    "Everest Engineering Group",
    "Nepal Infrastructure Corp",
  ];

  for (let o = 0; o < 4; o++) {
    const org = await prisma.org.create({
      data: {
        name: largeOrgNames[o],
        plan: "FREE",
        planTier: "TRIAL",
        trialEndsAt,
      },
    });

    for (let i = 0; i < 20; i++) {
      const email = nextEmail();
      const role = i === 0 ? "OWNER" : i <= 2 ? "ADMIN" : "MEMBER";
      await prisma.user.create({
        data: {
          name: nextName(),
          email,
          passwordHash,
          emailVerified: true,
          role,
          orgId: org.id,
        },
      });
      allUsers.push({
        email,
        password: DEMO_PASSWORD,
        orgName: org.name,
        orgSize: "large",
        role,
      });
      userIndex++;
    }

    // 3 projects per large org
    for (let p = 1; p <= 3; p++) {
      await prisma.project.create({
        data: {
          name: `${largeOrgNames[o]} — Project ${p}`,
          orgId: org.id,
          status: p === 1 ? "ESTIMATING" : p === 2 ? "BID_SUBMITTED" : "IN_PROGRESS",
          priority: p === 1 ? "HIGH" : "MEDIUM",
        },
      });
    }

    console.log(`  ✓ Large org ${o + 1}/4: ${org.name} (20 users)`);
  }

  // ── 15 medium orgs (4 users each) ────────────────────────────────────────
  const mediumOrgNames = [
    "Kathmandu Civil Works",
    "Pokhara Design Studio",
    "Lalitpur Engineering",
    "Bhaktapur Contractors",
    "Chitwan Build Group",
    "Biratnagar Infra",
    "Butwal Construction",
    "Dharan Civil Associates",
    "Hetauda Projects",
    "Janakpur Engineers",
    "Birgunj Builders",
    "Nepalgunj Works",
    "Dhangadhi Estimators",
    "Itahari Civil Pvt",
    "Narayanghat Build Co",
  ];

  for (let o = 0; o < 15; o++) {
    const org = await prisma.org.create({
      data: {
        name: mediumOrgNames[o],
        plan: "FREE",
        planTier: "TRIAL",
        trialEndsAt,
      },
    });

    for (let i = 0; i < 4; i++) {
      const email = nextEmail();
      const role = i === 0 ? "OWNER" : i === 1 ? "ADMIN" : "MEMBER";
      await prisma.user.create({
        data: {
          name: nextName(),
          email,
          passwordHash,
          emailVerified: true,
          role,
          orgId: org.id,
        },
      });
      allUsers.push({
        email,
        password: DEMO_PASSWORD,
        orgName: org.name,
        orgSize: "medium",
        role,
      });
      userIndex++;
    }

    // 1-2 projects per medium org
    await prisma.project.create({
      data: {
        name: `${mediumOrgNames[o]} — Main Project`,
        orgId: org.id,
        status: "ESTIMATING",
        priority: "MEDIUM",
      },
    });

    console.log(`  ✓ Medium org ${o + 1}/15: ${org.name} (4 users)`);
  }

  // ── 60 solo users (own org each) ─────────────────────────────────────────
  console.log("  Creating 60 solo users...");
  for (let i = 0; i < 60; i++) {
    const email = nextEmail();
    const orgName = `Solo Estimator ${userIndex}`;
    const org = await prisma.org.create({
      data: {
        name: orgName,
        plan: "FREE",
        planTier: "TRIAL",
        trialEndsAt,
      },
    });
    await prisma.user.create({
      data: {
        name: nextName(),
        email,
        passwordHash,
        emailVerified: true,
        role: "OWNER",
        orgId: org.id,
      },
    });
    allUsers.push({
      email,
      password: DEMO_PASSWORD,
      orgName,
      orgSize: "solo",
      role: "OWNER",
    });
    await prisma.project.create({
      data: {
        name: `My Estimation Project`,
        orgId: org.id,
        status: "ESTIMATING",
        priority: "MEDIUM",
      },
    });
    userIndex++;
  }

  // Write credentials file for k6
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allUsers, null, 2));

  console.log("\n✅ Seed complete!");
  console.log(`   Total users created : ${allUsers.length}`);
  console.log(`   Large orgs (20 each): 4`);
  console.log(`   Medium orgs (4 each): 15`);
  console.log(`   Solo users          : 60`);
  console.log(`   Credentials saved to: ${OUTPUT_FILE}`);
  console.log(`   Password for all    : ${DEMO_PASSWORD}`);
}

// ─── Entry point ─────────────────────────────────────────────────────────────
const isCleanup = process.argv.includes("--cleanup");

(isCleanup ? cleanup() : seed())
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
