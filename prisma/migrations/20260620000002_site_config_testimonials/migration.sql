-- SiteConfig: key-value store for dynamic site settings (no redeploy needed)
CREATE TABLE `SiteConfig` (
  `key` VARCHAR(191) NOT NULL,
  `value` TEXT NOT NULL,
  `description` VARCHAR(191) NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Testimonial: user-submitted, approved by superadmin before displaying
CREATE TABLE `Testimonial` (
  `id` VARCHAR(191) NOT NULL,
  `authorName` VARCHAR(191) NOT NULL,
  `authorRole` VARCHAR(191) NULL,
  `company` VARCHAR(191) NULL,
  `content` TEXT NOT NULL,
  `rating` INTEGER NOT NULL DEFAULT 5,
  `isApproved` BOOLEAN NOT NULL DEFAULT false,
  `userId` VARCHAR(191) NULL,
  `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `approvedAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `Testimonial_isApproved_submittedAt_idx` ON `Testimonial` (`isApproved`, `submittedAt` DESC);

-- Seed default config values (INSERT IGNORE keeps existing values if rerun)
INSERT IGNORE INTO `SiteConfig` (`key`, `value`, `description`, `updatedAt`) VALUES
  ('trial_days',               '14',                                                                          'Number of days for free trial',                      NOW(3)),
  ('price_solo_monthly',       '999',                                                                         'Solo plan monthly price in NPR',                     NOW(3)),
  ('price_team3_monthly',      '1999',                                                                        'Team of 3 plan monthly price in NPR',                NOW(3)),
  ('price_team5_monthly',      '3000',                                                                        'Team of 5 plan monthly price in NPR',                NOW(3)),
  ('price_per_seat_enterprise','550',                                                                         'Enterprise per-seat anchor price in NPR',            NOW(3)),
  ('annual_free_months',       '2',                                                                           'Number of free months with annual plan',             NOW(3)),
  ('storage_limit_solo_gb',    '10',                                                                          'Solo plan storage limit in GB',                      NOW(3)),
  ('storage_limit_team_gb',    '20',                                                                          'Team plan storage limit in GB',                      NOW(3)),
  ('contact_email',            'hello@estimatenepal.com',                                                     'Public contact email address',                       NOW(3)),
  ('contact_whatsapp',         '+977XXXXXXXXX',                                                               'WhatsApp contact number with country code',          NOW(3)),
  ('whatsapp_message',         'Hi, I am interested in NepaliEstimate. Please share pricing details.',        'Default WhatsApp enquiry message',                   NOW(3)),
  ('maintenance_mode',         'false',                                                                       'Set to true to show maintenance page to all users',  NOW(3)),
  ('registration_enabled',     'true',                                                                        'Set to false to disable new user registrations',     NOW(3)),
  ('site_announcement',        '',                                                                            'Top banner shown to all visitors (empty = hidden)',  NOW(3));
