-- Add audit timestamps to RateAnalysisLine.
-- createdAt uses a fixed default so existing rows get the migration timestamp (safe).
-- updatedAt uses ON UPDATE CURRENT_TIMESTAMP so Prisma keeps it current on updates.

ALTER TABLE `RateAnalysisLine`
  ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);
