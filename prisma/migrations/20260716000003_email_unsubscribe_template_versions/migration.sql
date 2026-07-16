-- Add unsubscribe field to User
ALTER TABLE `User` ADD COLUMN `emailUnsubscribedAt` DATETIME(3) NULL;

-- CreateTable EmailTemplateVersion
CREATE TABLE `EmailTemplateVersion` (
  `id` VARCHAR(191) NOT NULL,
  `emailType` VARCHAR(64) NOT NULL,
  `subject` VARCHAR(191) NOT NULL,
  `bodyHtml` LONGTEXT NOT NULL,
  `savedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `savedBy` VARCHAR(191) NULL,
  PRIMARY KEY (`id`),
  INDEX `EmailTemplateVersion_emailType_savedAt_idx` (`emailType`, `savedAt` DESC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
