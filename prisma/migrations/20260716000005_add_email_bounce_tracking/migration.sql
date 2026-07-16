-- C3: Track hard bounces at User level so cron skips bounced addresses
ALTER TABLE `User` ADD COLUMN `emailBouncedAt` DATETIME(3) NULL;
CREATE INDEX `User_emailBouncedAt_idx` ON `User`(`emailBouncedAt`);

-- L6: Track delivery/open/click events from Resend webhooks
ALTER TABLE `EmailLog` ADD COLUMN `deliveredAt` DATETIME(3) NULL;
ALTER TABLE `EmailLog` ADD COLUMN `openedAt` DATETIME(3) NULL;
ALTER TABLE `EmailLog` ADD COLUMN `clickedAt` DATETIME(3) NULL;

-- L1: DB-level constraint so only known churn reasons can be stored
-- MySQL 8.0.16+ supports CHECK constraints; older versions parse but ignore them
ALTER TABLE `Org` ADD CONSTRAINT `chk_churnReason`
  CHECK (`churnReason` IS NULL OR `churnReason` IN ('too_expensive','missing_features','just_exploring','competitor'));
