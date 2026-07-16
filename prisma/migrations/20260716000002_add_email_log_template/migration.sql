-- CreateTable EmailLog
CREATE TABLE `EmailLog` (
  `id` VARCHAR(191) NOT NULL,
  `orgId` VARCHAR(191) NULL,
  `recipientEmail` VARCHAR(191) NOT NULL,
  `recipientName` VARCHAR(191) NOT NULL,
  `emailType` VARCHAR(64) NOT NULL,
  `subject` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'sent',
  `errorMessage` LONGTEXT NULL,
  `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `EmailLog_orgId_sentAt_idx` (`orgId`, `sentAt` DESC),
  INDEX `EmailLog_emailType_sentAt_idx` (`emailType`, `sentAt` DESC),
  INDEX `EmailLog_sentAt_idx` (`sentAt` DESC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable EmailTemplate
CREATE TABLE `EmailTemplate` (
  `id` VARCHAR(191) NOT NULL,
  `emailType` VARCHAR(64) NOT NULL,
  `subject` VARCHAR(191) NOT NULL,
  `bodyHtml` LONGTEXT NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  `updatedBy` VARCHAR(191) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `EmailTemplate_emailType_key` (`emailType`),
  INDEX `EmailTemplate_emailType_idx` (`emailType`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
