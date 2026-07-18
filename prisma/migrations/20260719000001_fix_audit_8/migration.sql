-- fix-audit-8: DB-1 unique constraint on OrgResource, DB-2 LineType enum,
--              DB-3 createdAt on EstimateLineOverride, DB-4 VarChar(200) on OrgResource.name

-- DB-3: Add createdAt to EstimateLineOverride (before anything else so the default applies to existing rows)
ALTER TABLE `EstimateLineOverride` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- DB-4: Constrain OrgResource.name to VARCHAR(200) (was TEXT/VARCHAR(191) by default)
ALTER TABLE `OrgResource` MODIFY COLUMN `name` VARCHAR(200) NOT NULL;

-- DB-1: Add unique constraint on (orgId, name, category) for OrgResource
-- Ignore duplicate errors — the seed route already deduplicates in application code;
-- existing data should already be clean. If it isn't, remove duplicates first.
ALTER TABLE `OrgResource` ADD CONSTRAINT `OrgResource_orgId_name_category_key` UNIQUE (`orgId`, `name`, `category`);

-- DB-2: Add LineType enum and migrate lineType column in RateAnalysisLine
-- MySQL enums are altered in-place; existing valid values (MATERIAL/LABOUR/EQUIPMENT/OTHER) carry over.
ALTER TABLE `RateAnalysisLine` MODIFY COLUMN `lineType` ENUM('MATERIAL', 'LABOUR', 'EQUIPMENT', 'OTHER') NOT NULL DEFAULT 'MATERIAL';
