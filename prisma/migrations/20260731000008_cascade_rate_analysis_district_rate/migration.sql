-- LOW-2: Add ON DELETE CASCADE to RateAnalysis.projectId and DistrictRate.rateItemId
-- so deleting a Project removes its rate analyses, and deleting a RateItem removes its district rates.

ALTER TABLE `RateAnalysis`
  DROP FOREIGN KEY `RateAnalysis_projectId_fkey`,
  ADD CONSTRAINT `RateAnalysis_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `Project` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `DistrictRate`
  DROP FOREIGN KEY `DistrictRate_rateItemId_fkey`,
  ADD CONSTRAINT `DistrictRate_rateItemId_fkey`
    FOREIGN KEY (`rateItemId`) REFERENCES `RateItem` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
