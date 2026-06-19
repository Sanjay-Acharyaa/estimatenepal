-- AlterTable: add POLYGON to ShapeType enum
ALTER TABLE `TakeoffItem` MODIFY `shapeType` ENUM('RECTANGLE', 'POLYLINE', 'POLYGON', 'CIRCLE', 'ARC');
