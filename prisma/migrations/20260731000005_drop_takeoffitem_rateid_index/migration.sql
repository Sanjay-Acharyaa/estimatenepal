-- L-NEW-07: Drop the dead index on TakeoffItem.rateItemId.
-- The column has no FK, is never queried, and is documented as a legacy stub.
-- Removing the index reduces write overhead on every TakeoffItem INSERT/UPDATE.
DROP INDEX `TakeoffItem_rateItemId_idx` ON `TakeoffItem`;