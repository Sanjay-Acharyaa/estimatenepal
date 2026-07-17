-- Add purpose field to ShareLink to distinguish proposal approval links from read-only view links
ALTER TABLE `ShareLink` ADD COLUMN `purpose` VARCHAR(191) NOT NULL DEFAULT 'proposal';
