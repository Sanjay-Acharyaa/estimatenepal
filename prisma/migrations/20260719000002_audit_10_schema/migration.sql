-- Audit 10 schema changes
-- ARCH-8: RateBatch.type String -> RateBatchType enum
-- SEC-14:  RateItem @@unique([orgId, code])
-- SEC-15:  RateAnalysis and BOQOverride rateItem FK onDelete: Cascade
-- PERF-5:  RateItem @@index([orgId, batchId])
-- PERF-6:  RateAnalysisLine @@index([orgId, resourceId])

-- ARCH-8: convert RateBatch.type to MySQL ENUM
ALTER TABLE `RateBatch` MODIFY `type` ENUM('CUSTOM', 'DISTRICT') NOT NULL DEFAULT 'CUSTOM';

-- SEC-14: unique constraint on org-scoped rate codes
-- NOTE: platform rates have orgId = NULL; MySQL treats NULL as distinct in unique indexes,
-- so multiple platform rates with the same code are still permitted.
ALTER TABLE `RateItem` ADD UNIQUE INDEX `RateItem_orgId_code_key` (`orgId`, `code`);

-- SEC-15: cascade deletes from RateItem to RateAnalysis
ALTER TABLE `RateAnalysis` DROP FOREIGN KEY `RateAnalysis_rateItemId_fkey`;
ALTER TABLE `RateAnalysis` ADD CONSTRAINT `RateAnalysis_rateItemId_fkey`
  FOREIGN KEY (`rateItemId`) REFERENCES `RateItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- SEC-15: cascade deletes from RateItem to BOQOverride
ALTER TABLE `BOQOverride` DROP FOREIGN KEY `BOQOverride_rateItemId_fkey`;
ALTER TABLE `BOQOverride` ADD CONSTRAINT `BOQOverride_rateItemId_fkey`
  FOREIGN KEY (`rateItemId`) REFERENCES `RateItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- PERF-5: composite index for org rate list filtered by batch
CREATE INDEX `RateItem_orgId_batchId_idx` ON `RateItem`(`orgId`, `batchId`);

-- PERF-6: composite index for org resource usage queries
CREATE INDEX `RateAnalysisLine_orgId_resourceId_idx` ON `RateAnalysisLine`(`orgId`, `resourceId`);
