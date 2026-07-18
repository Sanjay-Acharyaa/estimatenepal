-- CreateTable EstimateLineOverride
CREATE TABLE `EstimateLineOverride` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NOT NULL,
    `markupPct` DOUBLE NOT NULL DEFAULT 0,
    `wastePct` DOUBLE NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EstimateLineOverride_projectId_groupId_key`(`projectId`, `groupId`),
    INDEX `EstimateLineOverride_projectId_idx`(`projectId`),
    INDEX `EstimateLineOverride_orgId_idx`(`orgId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EstimateLineOverride` ADD CONSTRAINT `EstimateLineOverride_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
