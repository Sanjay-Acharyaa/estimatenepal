-- Add last login tracking to User
ALTER TABLE `User` ADD COLUMN `lastLoginAt` DATETIME(3) NULL;

-- Analytics event log for all 5 tiers of platform analytics
CREATE TABLE `AnalyticsEvent` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `event` VARCHAR(100) NOT NULL,
    `meta` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    INDEX `AnalyticsEvent_event_createdAt_idx`(`event`, `createdAt` DESC),
    INDEX `AnalyticsEvent_orgId_createdAt_idx`(`orgId`, `createdAt` DESC),
    INDEX `AnalyticsEvent_createdAt_idx`(`createdAt` DESC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
