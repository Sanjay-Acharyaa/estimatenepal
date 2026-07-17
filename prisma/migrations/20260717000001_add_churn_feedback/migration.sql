-- Add free-text churn feedback field so users can elaborate beyond single-click reasons
ALTER TABLE `Org` ADD COLUMN `churnFeedback` TEXT NULL;
