-- L-NEW-04: Change BOQOverride.rateItemId FK from CASCADE to RESTRICT.
-- Prevents silent deletion of approved BOQ override audit trail when a RateItem
-- (or its batch) is purged. Admin must explicitly archive/delete overrides first.
ALTER TABLE `BOQOverride`
  DROP FOREIGN KEY `BOQOverride_rateItemId_fkey`;

ALTER TABLE `BOQOverride`
  ADD CONSTRAINT `BOQOverride_rateItemId_fkey`
    FOREIGN KEY (`rateItemId`) REFERENCES `RateItem`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;