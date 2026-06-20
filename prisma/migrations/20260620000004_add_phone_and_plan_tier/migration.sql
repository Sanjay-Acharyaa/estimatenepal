-- Add phone number to users (nullable — existing users unaffected)
ALTER TABLE `User` ADD COLUMN `phone` VARCHAR(30) NULL;

-- Add planTier to orgs for plan enforcement
-- TRIAL = 3 members (trial), SOLO = 1, TEAM_3 = 3, TEAM_5 = 5, ENTERPRISE = unlimited
ALTER TABLE `Org` ADD COLUMN `planTier` VARCHAR(20) NOT NULL DEFAULT 'TRIAL';
