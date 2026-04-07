-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SensorUnit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SensorUnit" ("createdAt", "id", "ipAddress", "location", "name", "productName", "updatedAt") SELECT "createdAt", "id", "ipAddress", "location", "name", "productName", "updatedAt" FROM "SensorUnit";
-- Assign placeholder keys to any pre-existing rows
UPDATE "new_SensorUnit" SET "apiKey" = 'legacy-' || "id" WHERE "apiKey" = '';
DROP TABLE "SensorUnit";
ALTER TABLE "new_SensorUnit" RENAME TO "SensorUnit";
CREATE UNIQUE INDEX "SensorUnit_apiKey_key" ON "SensorUnit"("apiKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
