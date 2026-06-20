-- Track per-org storage consumption (bytes). BigInt handles up to ~9.2 EB.
ALTER TABLE `Org` ADD COLUMN `storageUsedBytes` BIGINT NOT NULL DEFAULT 0;

-- Track per-drawing file size for accurate storage decrement on delete.
ALTER TABLE `Drawing` ADD COLUMN `fileSizeBytes` INT NOT NULL DEFAULT 0;
