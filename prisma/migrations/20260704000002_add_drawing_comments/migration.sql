CREATE TABLE `DrawingComment` (
  `id`         VARCHAR(191) NOT NULL,
  `pageId`     VARCHAR(191) NOT NULL,
  `projectId`  VARCHAR(191) NOT NULL,
  `x`          DOUBLE NOT NULL,
  `y`          DOUBLE NOT NULL,
  `text`       TEXT NOT NULL,
  `authorId`   VARCHAR(191) NOT NULL,
  `parentId`   VARCHAR(191) NULL,
  `resolvedAt` DATETIME(3) NULL,
  `createdAt`  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `DrawingComment_pageId_idx` (`pageId`),
  INDEX `DrawingComment_pageId_parentId_idx` (`pageId`, `parentId`),

  CONSTRAINT `DrawingComment_pageId_fkey`
    FOREIGN KEY (`pageId`) REFERENCES `DrawingPage`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT `DrawingComment_authorId_fkey`
    FOREIGN KEY (`authorId`) REFERENCES `User`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
