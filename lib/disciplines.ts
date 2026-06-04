import { prisma } from "./prisma";

export type DisciplineWithCount = {
  id: string;
  projectId: string;
  name: string;
  sortOrder: number;
  isPrimary: boolean;
  _count: { groups: number };
};

/**
 * Returns all disciplines for a project.
 * If none exist, auto-creates "Original" and migrates any orphaned groups into it.
 */
export async function getOrCreateDisciplines(projectId: string): Promise<DisciplineWithCount[]> {
  const existing = await prisma.discipline.findMany({
    where: { projectId },
    include: { _count: { select: { groups: true } } },
    orderBy: { sortOrder: "asc" },
  });

  if (existing.length > 0) return existing;

  // No disciplines yet — create "Original" as the primary tab
  const original = await prisma.discipline.create({
    data: { projectId, name: "Original", sortOrder: 0, isPrimary: true },
  });

  // Migrate any groups that have no discipline assigned (existing project data)
  const migrated = await prisma.takeoffGroup.updateMany({
    where: { projectId, disciplineId: null },
    data: { disciplineId: original.id },
  });

  return [{ ...original, _count: { groups: migrated.count } }];
}
