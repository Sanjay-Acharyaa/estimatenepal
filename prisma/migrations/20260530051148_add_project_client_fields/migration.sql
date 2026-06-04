-- AlterTable
ALTER TABLE `Project` ADD COLUMN `bidDueDate` DATETIME(3) NULL,
    ADD COLUMN `clientCompany` VARCHAR(191) NULL,
    ADD COLUMN `clientName` VARCHAR(191) NULL,
    ADD COLUMN `estimatedValue` DOUBLE NULL;
