-- CreateTable OrgResource
CREATE TABLE `OrgResource` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` ENUM('CEMENT', 'FINE_AGGREGATE', 'COARSE_AGGREGATE', 'MASONRY', 'STEEL', 'TIMBER', 'LABOUR_SKILLED', 'LABOUR_UNSKILLED', 'EQUIPMENT', 'OTHER') NOT NULL,
    `unit` VARCHAR(191) NOT NULL,
    `unitRate` DOUBLE NOT NULL DEFAULT 0,
    `wastagePercent` DOUBLE NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `priceUpdatedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OrgResource_orgId_idx`(`orgId`),
    INDEX `OrgResource_orgId_category_idx`(`orgId`, `category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable RateAnalysisLine
CREATE TABLE `RateAnalysisLine` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `rateItemId` VARCHAR(191) NOT NULL,
    `resourceId` VARCHAR(191) NOT NULL,
    `lineType` VARCHAR(191) NOT NULL DEFAULT 'MATERIAL',
    `qtyPerUnit` DOUBLE NOT NULL DEFAULT 0,
    `wastagePercent` DOUBLE NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `RateAnalysisLine_orgId_rateItemId_idx`(`orgId`, `rateItemId`),
    INDEX `RateAnalysisLine_orgId_idx`(`orgId`),
    INDEX `RateAnalysisLine_resourceId_idx`(`resourceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable OrgRateSettings
CREATE TABLE `OrgRateSettings` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `overheadPct` DOUBLE NOT NULL DEFAULT 12,
    `profitPct` DOUBLE NOT NULL DEFAULT 10,
    `contingencyPct` DOUBLE NOT NULL DEFAULT 5,
    `vatPct` DOUBLE NOT NULL DEFAULT 13,
    `leadLiftPct` DOUBLE NOT NULL DEFAULT 0,
    `dryVolumeMortar` DOUBLE NOT NULL DEFAULT 1.30,
    `dryVolumeConcrete` DOUBLE NOT NULL DEFAULT 1.54,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `OrgRateSettings_orgId_key`(`orgId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `OrgResource` ADD CONSTRAINT `OrgResource_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `Org`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RateAnalysisLine` ADD CONSTRAINT `RateAnalysisLine_rateItemId_fkey` FOREIGN KEY (`rateItemId`) REFERENCES `RateItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RateAnalysisLine` ADD CONSTRAINT `RateAnalysisLine_resourceId_fkey` FOREIGN KEY (`resourceId`) REFERENCES `OrgResource`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrgRateSettings` ADD CONSTRAINT `OrgRateSettings_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `Org`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
