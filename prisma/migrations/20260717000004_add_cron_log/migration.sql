CREATE TABLE `CronLog` (
  `id`          VARCHAR(191) NOT NULL,
  `runAt`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `durationMs`  INT          NOT NULL,
  `totalSent`   INT          NOT NULL,
  `totalFailed` INT          NOT NULL,
  `sent`        JSON         NOT NULL,
  `failed`      JSON         NOT NULL,
  `error`       LONGTEXT     NULL,
  PRIMARY KEY (`id`),
  INDEX `CronLog_runAt_idx` (`runAt` DESC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
