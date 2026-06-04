/*
  Warnings:

  - Added the required column `projectId` to the `TakeoffGroup` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `TakeoffGroup` ADD COLUMN `additionalParams` JSON NULL,
    ADD COLUMN `isLocked` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `isVisible` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `lineWidth` INTEGER NOT NULL DEFAULT 2,
    ADD COLUMN `multiplier` DOUBLE NOT NULL DEFAULT 1,
    ADD COLUMN `projectId` VARCHAR(191) NOT NULL,
    ADD COLUMN `tag` VARCHAR(191) NULL,
    ADD COLUMN `type` ENUM('COUNT', 'LINEAR', 'COUNT_BY_DISTANCE', 'AREA', 'VOLUME', 'VERTICAL_WALL_AREA') NOT NULL DEFAULT 'LINEAR';

-- AlterTable
ALTER TABLE `TakeoffItem` ADD COLUMN `isLocked` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX `TakeoffGroup_projectId_idx` ON `TakeoffGroup`(`projectId`);

-- AddForeignKey
ALTER TABLE `TakeoffGroup` ADD CONSTRAINT `TakeoffGroup_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
