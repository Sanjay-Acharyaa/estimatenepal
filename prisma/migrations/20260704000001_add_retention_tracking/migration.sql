-- AlterTable: add retention fields to Project
ALTER TABLE `Project` ADD COLUMN `retentionEnabled` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `Project` ADD COLUMN `retentionPct` DOUBLE NOT NULL DEFAULT 5;

-- CreateTable: RetentionRelease
CREATE TABLE `RetentionRelease` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `note` TEXT NULL,
    `releasedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RetentionRelease_projectId_idx`(`projectId`),
    INDEX `RetentionRelease_projectId_releasedAt_idx`(`projectId`, `releasedAt` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `RetentionRelease` ADD CONSTRAINT `RetentionRelease_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
