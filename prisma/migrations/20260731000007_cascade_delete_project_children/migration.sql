-- MED-1: Add ON DELETE CASCADE to all child tables that reference Project so that
-- deleting a project automatically removes all its data instead of blocking with RESTRICT.
-- Also changes TakeoffGroup's self-referential parent FK from RESTRICT to CASCADE so that
-- the project → TakeoffGroup cascade can propagate through the parent→child hierarchy.

ALTER TABLE `ProjectMember`
  DROP FOREIGN KEY `ProjectMember_projectId_fkey`,
  ADD CONSTRAINT `ProjectMember_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `Project` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Drawing`
  DROP FOREIGN KEY `Drawing_projectId_fkey`,
  ADD CONSTRAINT `Drawing_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `Project` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Discipline`
  DROP FOREIGN KEY `Discipline_projectId_fkey`,
  ADD CONSTRAINT `Discipline_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `Project` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TakeoffGroup`
  DROP FOREIGN KEY `TakeoffGroup_projectId_fkey`,
  ADD CONSTRAINT `TakeoffGroup_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `Project` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TakeoffGroup`
  DROP FOREIGN KEY `TakeoffGroup_parentId_fkey`,
  ADD CONSTRAINT `TakeoffGroup_parentId_fkey`
    FOREIGN KEY (`parentId`) REFERENCES `TakeoffGroup` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;