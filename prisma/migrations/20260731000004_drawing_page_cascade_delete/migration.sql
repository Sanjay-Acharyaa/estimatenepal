-- L-NEW-05: Add ON DELETE CASCADE to DrawingPage.drawingId FK.
-- Without this, deleting a Drawing at the DB level (or via a Prisma call without
-- manual child deletion) raises a FK constraint error or leaves orphaned pages.
ALTER TABLE `DrawingPage`
  DROP FOREIGN KEY `DrawingPage_drawingId_fkey`;

ALTER TABLE `DrawingPage`
  ADD CONSTRAINT `DrawingPage_drawingId_fkey`
    FOREIGN KEY (`drawingId`) REFERENCES `Drawing`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;