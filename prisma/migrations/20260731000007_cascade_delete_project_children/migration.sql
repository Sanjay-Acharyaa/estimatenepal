-- MED-1: Add ON DELETE CASCADE to all child tables that reference Project so that
-- deleting a project automatically removes all its data instead of blocking with RESTRICT.
-- Also changes TakeoffGroup's self-referential parent FK from RESTRICT to CASCADE so that
-- the project → TakeoffGroup cascade can propagate through the parent→child hierarchy.
-- Split into separate ALTER TABLE statements: MySQL disallows DROP + ADD of the same FK
-- name within a single statement (error 1826).

ALTER TABLE `ProjectMember` DROP FOREIGN KEY `ProjectMember_projectId_fkey`;
ALTER TABLE `ProjectMember`
  ADD CONSTRAINT `ProjectMember_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `Project` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Drawing` DROP FOREIGN KEY `Drawing_projectId_fkey`;
ALTER TABLE `Drawing`
  ADD CONSTRAINT `Drawing_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `Project` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Discipline` DROP FOREIGN KEY `Discipline_projectId_fkey`;
ALTER TABLE `Discipline`
  ADD CONSTRAINT `Discipline_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `Project` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TakeoffGroup` DROP FOREIGN KEY `TakeoffGroup_projectId_fkey`;
ALTER TABLE `TakeoffGroup`
  ADD CONSTRAINT `TakeoffGroup_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `Project` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TakeoffGroup` DROP FOREIGN KEY `TakeoffGroup_parentId_fkey`;
ALTER TABLE `TakeoffGroup`
  ADD CONSTRAINT `TakeoffGroup_parentId_fkey`
    FOREIGN KEY (`parentId`) REFERENCES `TakeoffGroup` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
