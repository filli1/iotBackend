/*
  Warnings:

  - You are about to drop the column `requirePickup` on the `AlertRule` table. All the data in the column will be lost.
  - You are about to drop the column `productPickedUp` on the `PresenceSession` table. All the data in the column will be lost.
  - You are about to drop the column `imuExaminationEnabled` on the `UnitConfiguration` table. All the data in the column will be lost.
  - You are about to drop the column `imuPickupThresholdG` on the `UnitConfiguration` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AlertRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "unitId" TEXT NOT NULL,
    "dwellThresholdSeconds" INTEGER NOT NULL DEFAULT 30,
    "requireInteraction" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "AlertRule_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "SensorUnit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AlertRule" ("dwellThresholdSeconds", "enabled", "id", "unitId") SELECT "dwellThresholdSeconds", "enabled", "id", "unitId" FROM "AlertRule";
DROP TABLE "AlertRule";
ALTER TABLE "new_AlertRule" RENAME TO "AlertRule";
CREATE UNIQUE INDEX "AlertRule_unitId_key" ON "AlertRule"("unitId");
CREATE TABLE "new_PresenceSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "unitId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME,
    "dwellSeconds" INTEGER NOT NULL DEFAULT 0,
    "productInteracted" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    CONSTRAINT "PresenceSession_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "SensorUnit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PresenceSession" ("dwellSeconds", "endedAt", "id", "startedAt", "status", "unitId") SELECT "dwellSeconds", "endedAt", "id", "startedAt", "status", "unitId" FROM "PresenceSession";
DROP TABLE "PresenceSession";
ALTER TABLE "new_PresenceSession" RENAME TO "PresenceSession";
CREATE TABLE "new_UnitConfiguration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "unitId" TEXT NOT NULL,
    "minSensorAgreement" INTEGER NOT NULL DEFAULT 2,
    "departureTimeoutSeconds" INTEGER NOT NULL DEFAULT 5,
    "dwellMinSeconds" INTEGER NOT NULL DEFAULT 3,
    "imuVibrationThreshold" REAL NOT NULL DEFAULT 0.08,
    "imuEnabled" BOOLEAN NOT NULL DEFAULT true,
    "imuDurationThresholdMs" INTEGER NOT NULL DEFAULT 150,
    CONSTRAINT "UnitConfiguration_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "SensorUnit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UnitConfiguration" ("departureTimeoutSeconds", "dwellMinSeconds", "id", "imuDurationThresholdMs", "minSensorAgreement", "unitId") SELECT "departureTimeoutSeconds", "dwellMinSeconds", "id", "imuDurationThresholdMs", "minSensorAgreement", "unitId" FROM "UnitConfiguration";
DROP TABLE "UnitConfiguration";
ALTER TABLE "new_UnitConfiguration" RENAME TO "UnitConfiguration";
CREATE UNIQUE INDEX "UnitConfiguration_unitId_key" ON "UnitConfiguration"("unitId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
