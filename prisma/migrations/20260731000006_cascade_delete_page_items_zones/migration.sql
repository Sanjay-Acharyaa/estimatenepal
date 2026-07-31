-- HIGH-2: Add ON DELETE CASCADE to TakeoffItem.pageId and ScaleZone.pageId so that
-- deleting a DrawingPage (e.g. when a Drawing is deleted) automatically removes all
-- associated takeoff items and scale zones instead of blocking with FK RESTRICT.
-- Split into separate ALTER TABLE statements: MySQL disallows DROP + ADD of the same FK
-- name within a single statement (error 1826).

ALTER TABLE `TakeoffItem`
  DROP FOREIGN KEY `TakeoffItem_pageId_fkey`;

ALTER TABLE `TakeoffItem`
  ADD CONSTRAINT `TakeoffItem_pageId_fkey`
    FOREIGN KEY (`pageId`) REFERENCES `DrawingPage` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ScaleZone`
  DROP FOREIGN KEY `ScaleZone_pageId_fkey`;

ALTER TABLE `ScaleZone`
  ADD CONSTRAINT `ScaleZone_pageId_fkey`
    FOREIGN KEY (`pageId`) REFERENCES `DrawingPage` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
