-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `emailVerified` BOOLEAN NOT NULL DEFAULT false,
    `role` ENUM('OWNER', 'ADMIN', 'MEMBER') NOT NULL DEFAULT 'MEMBER',
    `isSuperAdmin` BOOLEAN NOT NULL DEFAULT false,
    `orgId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_orgId_idx`(`orgId`),
    INDEX `User_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Org` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `plan` ENUM('FREE', 'PRO', 'ENTERPRISE') NOT NULL DEFAULT 'FREE',
    `trialEndsAt` DATETIME(3) NULL,
    `panNumber` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrgInvite` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `role` ENUM('OWNER', 'ADMIN', 'MEMBER') NOT NULL DEFAULT 'MEMBER',
    `token` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `acceptedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `OrgInvite_token_key`(`token`),
    INDEX `OrgInvite_orgId_idx`(`orgId`),
    INDEX `OrgInvite_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FailedLogin` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `email` VARCHAR(191) NOT NULL,
    `ipAddress` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FailedLogin_email_idx`(`email`),
    INDEX `FailedLogin_ipAddress_idx`(`ipAddress`),
    INDEX `FailedLogin_createdAt_idx`(`createdAt` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Project` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `district` VARCHAR(191) NULL,
    `seismicZone` VARCHAR(191) NULL,
    `unitSystem` ENUM('METRIC', 'IMPERIAL') NOT NULL DEFAULT 'METRIC',
    `dateFormat` VARCHAR(191) NOT NULL DEFAULT 'AD',
    `contingencyPct` DOUBLE NULL,
    `provisionalSum` DOUBLE NULL,
    `vatEnabled` BOOLEAN NOT NULL DEFAULT true,
    `vatRate` DOUBLE NOT NULL DEFAULT 13,
    `tdsRate` DOUBLE NOT NULL DEFAULT 1.5,
    `tdsEnabled` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('ESTIMATING', 'BID_SUBMITTED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETE', 'LOST', 'ARCHIVED') NOT NULL DEFAULT 'ESTIMATING',
    `ocrRegions` JSON NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Project_orgId_idx`(`orgId`),
    INDEX `Project_status_idx`(`status`),
    INDEX `Project_orgId_status_idx`(`orgId`, `status`),
    INDEX `Project_createdAt_idx`(`createdAt` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectMember` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `projectRole` ENUM('LEAD', 'ESTIMATOR', 'VIEWER') NOT NULL DEFAULT 'ESTIMATOR',
    `assignedBy` VARCHAR(191) NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProjectMember_userId_idx`(`userId`),
    INDEX `ProjectMember_projectId_idx`(`projectId`),
    UNIQUE INDEX `ProjectMember_projectId_userId_key`(`projectId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShareLink` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdBy` VARCHAR(191) NOT NULL,
    `viewCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ShareLink_token_key`(`token`),
    INDEX `ShareLink_projectId_idx`(`projectId`),
    INDEX `ShareLink_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Drawing` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `fileUrl` VARCHAR(191) NOT NULL,
    `pageCount` INTEGER NOT NULL,
    `revisionNumber` VARCHAR(191) NULL,
    `parentDrawingId` VARCHAR(191) NULL,
    `isLatest` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Drawing_projectId_idx`(`projectId`),
    INDEX `Drawing_projectId_isLatest_idx`(`projectId`, `isLatest`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DrawingPage` (
    `id` VARCHAR(191) NOT NULL,
    `drawingId` VARCHAR(191) NOT NULL,
    `pageNumber` INTEGER NOT NULL,
    `label` VARCHAR(191) NULL,
    `scale` DOUBLE NULL,
    `scaleUnit` VARCHAR(191) NOT NULL DEFAULT 'm',
    `canvasJson` JSON NULL,
    `annotationsJson` JSON NULL,

    INDEX `DrawingPage_drawingId_idx`(`drawingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScaleZone` (
    `id` VARCHAR(191) NOT NULL,
    `pageId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NULL,
    `scale` DOUBLE NOT NULL,
    `scaleUnit` VARCHAR(191) NOT NULL,
    `x` DOUBLE NOT NULL,
    `y` DOUBLE NOT NULL,
    `width` DOUBLE NOT NULL,
    `height` DOUBLE NOT NULL,

    INDEX `ScaleZone_pageId_idx`(`pageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Discipline` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `Discipline_projectId_idx`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TakeoffGroup` (
    `id` VARCHAR(191) NOT NULL,
    `disciplineId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `colour` VARCHAR(191) NOT NULL DEFAULT '#3B82F6',
    `preamble` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `TakeoffGroup_disciplineId_idx`(`disciplineId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TakeoffItem` (
    `id` VARCHAR(191) NOT NULL,
    `pageId` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NULL,
    `label` VARCHAR(191) NOT NULL,
    `toolType` ENUM('COUNT', 'LINEAR', 'COUNT_BY_DISTANCE', 'AREA', 'VOLUME', 'VERTICAL_WALL_AREA') NOT NULL,
    `shapeType` ENUM('RECTANGLE', 'POLYLINE', 'CIRCLE', 'ARC') NULL,
    `isNegative` BOOLEAN NOT NULL DEFAULT false,
    `multiplier` DOUBLE NOT NULL DEFAULT 1,
    `length` DOUBLE NULL,
    `breadth` DOUBLE NULL,
    `height` DOUBLE NULL,
    `wastagePct` DOUBLE NOT NULL DEFAULT 0,
    `siteLocation` VARCHAR(191) NULL,
    `measuredDate` DATETIME(3) NULL,
    `quantity` DOUBLE NOT NULL,
    `unit` VARCHAR(191) NOT NULL,
    `scaleUsed` DOUBLE NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `toolData` JSON NOT NULL,
    `rateItemId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TakeoffItem_pageId_idx`(`pageId`),
    INDEX `TakeoffItem_groupId_idx`(`groupId`),
    INDEX `TakeoffItem_pageId_sortOrder_idx`(`pageId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RateItem` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `unit` VARCHAR(191) NOT NULL,
    `baseRate` DOUBLE NOT NULL,
    `fiscalYear` VARCHAR(191) NOT NULL,
    `source` ENUM('DUDBC', 'DISTRICT', 'CUSTOM') NOT NULL,
    `orgId` VARCHAR(191) NULL,

    INDEX `RateItem_source_idx`(`source`),
    INDEX `RateItem_orgId_idx`(`orgId`),
    INDEX `RateItem_fiscalYear_idx`(`fiscalYear`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DistrictRate` (
    `id` VARCHAR(191) NOT NULL,
    `rateItemId` VARCHAR(191) NOT NULL,
    `district` VARCHAR(191) NOT NULL,
    `rate` DOUBLE NOT NULL,

    INDEX `DistrictRate_rateItemId_idx`(`rateItemId`),
    INDEX `DistrictRate_district_idx`(`district`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RateAnalysis` (
    `id` VARCHAR(191) NOT NULL,
    `rateItemId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `materialCost` DOUBLE NOT NULL DEFAULT 0,
    `skilledLabour` DOUBLE NOT NULL DEFAULT 0,
    `semiSkilledLabour` DOUBLE NOT NULL DEFAULT 0,
    `unskilledLabour` DOUBLE NOT NULL DEFAULT 0,
    `equipmentCost` DOUBLE NOT NULL DEFAULT 0,
    `overheadPct` DOUBLE NOT NULL DEFAULT 0,
    `profitPct` DOUBLE NOT NULL DEFAULT 0,
    `wastagePct` DOUBLE NOT NULL DEFAULT 0,
    `computedRate` DOUBLE NOT NULL,
    `useComputedRate` BOOLEAN NOT NULL DEFAULT false,

    INDEX `RateAnalysis_projectId_idx`(`projectId`),
    INDEX `RateAnalysis_rateItemId_idx`(`rateItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BOQOverride` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `rateItemId` VARCHAR(191) NOT NULL,
    `field` VARCHAR(191) NOT NULL,
    `originalValue` VARCHAR(191) NOT NULL,
    `proposedValue` VARCHAR(191) NOT NULL,
    `approvedValue` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `submittedBy` VARCHAR(191) NOT NULL,
    `reviewedBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,

    INDEX `BOQOverride_projectId_idx`(`projectId`),
    INDEX `BOQOverride_projectId_status_idx`(`projectId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `link` VARCHAR(191) NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_userId_idx`(`userId`),
    INDEX `Notification_userId_isRead_idx`(`userId`, `isRead`),
    INDEX `Notification_createdAt_idx`(`createdAt` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `orgId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `event` VARCHAR(191) NOT NULL,
    `resourceId` VARCHAR(191) NULL,
    `meta` JSON NULL,
    `ipAddress` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_orgId_idx`(`orgId`),
    INDEX `AuditLog_userId_idx`(`userId`),
    INDEX `AuditLog_orgId_createdAt_idx`(`orgId`, `createdAt` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `Org`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrgInvite` ADD CONSTRAINT `OrgInvite_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `Org`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FailedLogin` ADD CONSTRAINT `FailedLogin_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `Org`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectMember` ADD CONSTRAINT `ProjectMember_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectMember` ADD CONSTRAINT `ProjectMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShareLink` ADD CONSTRAINT `ShareLink_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Drawing` ADD CONSTRAINT `Drawing_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Drawing` ADD CONSTRAINT `Drawing_parentDrawingId_fkey` FOREIGN KEY (`parentDrawingId`) REFERENCES `Drawing`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DrawingPage` ADD CONSTRAINT `DrawingPage_drawingId_fkey` FOREIGN KEY (`drawingId`) REFERENCES `Drawing`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScaleZone` ADD CONSTRAINT `ScaleZone_pageId_fkey` FOREIGN KEY (`pageId`) REFERENCES `DrawingPage`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Discipline` ADD CONSTRAINT `Discipline_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TakeoffGroup` ADD CONSTRAINT `TakeoffGroup_disciplineId_fkey` FOREIGN KEY (`disciplineId`) REFERENCES `Discipline`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TakeoffItem` ADD CONSTRAINT `TakeoffItem_pageId_fkey` FOREIGN KEY (`pageId`) REFERENCES `DrawingPage`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TakeoffItem` ADD CONSTRAINT `TakeoffItem_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `TakeoffGroup`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DistrictRate` ADD CONSTRAINT `DistrictRate_rateItemId_fkey` FOREIGN KEY (`rateItemId`) REFERENCES `RateItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RateAnalysis` ADD CONSTRAINT `RateAnalysis_rateItemId_fkey` FOREIGN KEY (`rateItemId`) REFERENCES `RateItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RateAnalysis` ADD CONSTRAINT `RateAnalysis_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BOQOverride` ADD CONSTRAINT `BOQOverride_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BOQOverride` ADD CONSTRAINT `BOQOverride_rateItemId_fkey` FOREIGN KEY (`rateItemId`) REFERENCES `RateItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
