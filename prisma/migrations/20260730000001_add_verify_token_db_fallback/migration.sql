-- Fix #17: Store verify token in DB so verification links survive a Redis flush.
-- Adds verifyToken (nullable, unique) and verifyTokenAt (nullable) to User.

ALTER TABLE `User`
  ADD COLUMN `verifyToken`   VARCHAR(191) NULL,
  ADD COLUMN `verifyTokenAt` DATETIME(3) NULL,
  ADD UNIQUE INDEX `User_verifyToken_key` (`verifyToken`);