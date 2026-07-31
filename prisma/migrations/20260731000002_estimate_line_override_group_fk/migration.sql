-- M-NEW-01: Add FK from EstimateLineOverride.groupId → TakeoffGroup.id (onDelete: Cascade).
-- Orphan rows must be purged first so MySQL accepts the constraint.
DELETE FROM `EstimateLineOverride`
WHERE `groupId` NOT IN (SELECT `id` FROM `TakeoffGroup`);

ALTER TABLE `EstimateLineOverride`
  ADD CONSTRAINT `EstimateLineOverride_groupId_fkey`
    FOREIGN KEY (`groupId`) REFERENCES `TakeoffGroup`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX `EstimateLineOverride_groupId_idx`
  ON `EstimateLineOverride`(`groupId`);
