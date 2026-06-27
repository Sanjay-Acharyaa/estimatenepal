/**
 * seed-demo-projects.js
 * Creates one project (+ adds all org users as members) for every demo org
 * that has no project yet. Safe to re-run — skips orgs that already have projects.
 *
 * Run on server:
 *   cd /var/www/nepaliestimate
 *   node scripts/seed-demo-projects.js
 *
 * Cleanup (removes only the projects this script created):
 *   node scripts/seed-demo-projects.js --cleanup
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const isCleanup = process.argv.includes("--cleanup");

  if (isCleanup) {
    const deleted = await prisma.project.deleteMany({
      where: { name: "Demo Building Project" },
    });
    console.log(`Deleted ${deleted.count} demo projects.`);
    return;
  }

  // 1. Find all unique org IDs that have demo users
  const demoUsers = await prisma.user.findMany({
    where: { email: { contains: "loadtest.estimatenepal.local" } },
    select: { id: true, orgId: true },
  });

  const orgUserMap = new Map(); // orgId → [userId, ...]
  for (const u of demoUsers) {
    if (!u.orgId) continue;
    if (!orgUserMap.has(u.orgId)) orgUserMap.set(u.orgId, []);
    orgUserMap.get(u.orgId).push(u.id);
  }

  console.log(`Found ${demoUsers.length} demo users across ${orgUserMap.size} orgs`);

  // 2. Find which orgs already have at least one project
  const orgsWithProjects = await prisma.org.findMany({
    where: {
      id: { in: [...orgUserMap.keys()] },
      projects: { some: {} },
    },
    select: { id: true },
  });
  const alreadyHasProject = new Set(orgsWithProjects.map((o) => o.id));

  const orgsNeedingProjects = [...orgUserMap.keys()].filter(
    (id) => !alreadyHasProject.has(id)
  );

  console.log(
    `${alreadyHasProject.size} orgs already have projects (skipping)`
  );
  console.log(`Creating projects for ${orgsNeedingProjects.length} orgs...`);

  let created = 0;
  let errors  = 0;

  for (const orgId of orgsNeedingProjects) {
    const userIds = orgUserMap.get(orgId);
    try {
      // Create the project
      const project = await prisma.project.create({
        data: {
          name:   "Demo Building Project",
          orgId,
          status: "ESTIMATING",
        },
      });

      // Add all org demo users as project members so GET /api/projects returns it
      await prisma.projectMember.createMany({
        data: userIds.map((userId) => ({
          projectId:   project.id,
          userId,
          projectRole: "ESTIMATOR",
        })),
        skipDuplicates: true,
      });

      // Create one discipline so the takeoff canvas has a tab to work under
      await prisma.discipline.create({
        data: {
          projectId: project.id,
          name:      "Structural",
          sortOrder: 0,
          isPrimary: true,
        },
      });

      created++;
      if (created % 10 === 0) console.log(`  ${created} created...`);
    } catch (e) {
      errors++;
      console.error(`  Failed for org ${orgId}:`, e.message);
    }
  }

  console.log(`\nDone.`);
  console.log(`  Projects created : ${created}`);
  console.log(`  Orgs skipped     : ${alreadyHasProject.size}`);
  console.log(`  Errors           : ${errors}`);
  console.log(
    `\nAll ${demoUsers.length} demo users can now access a project.`
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
