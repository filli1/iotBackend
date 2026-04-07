/*
  Warnings:

  - You are about to drop the column `ipAddress` on the `SensorUnit` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SensorUnit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SensorUnit" ("apiKey", "createdAt", "id", "location", "name", "productName", "updatedAt") SELECT "apiKey", "createdAt", "id", "location", "name", "productName", "updatedAt" FROM "SensorUnit";
DROP TABLE "SensorUnit";
ALTER TABLE "new_SensorUnit" RENAME TO "SensorUnit";
CREATE UNIQUE INDEX "SensorUnit_apiKey_key" ON "SensorUnit"("apiKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
