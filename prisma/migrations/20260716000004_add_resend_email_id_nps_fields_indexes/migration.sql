-- Add resendEmailId to EmailLog (L2: delivery webhook tracking)
ALTER TABLE `EmailLog` ADD COLUMN `resendEmailId` VARCHAR(50) NULL;
CREATE INDEX `EmailLog_resendEmailId_idx` ON `EmailLog`(`resendEmailId`);

-- Add NPS tracking fields to User (required by cron NPS batch)
ALTER TABLE `User` ADD COLUMN `npsSentAt` DATETIME(3) NULL;
ALTER TABLE `User` ADD COLUMN `npsScore` INT NULL;

-- Add index on emailUnsubscribedAt for fast unsubscribed-count queries (M2)
CREATE INDEX `User_emailUnsubscribedAt_idx` ON `User`(`emailUnsubscribedAt`);
