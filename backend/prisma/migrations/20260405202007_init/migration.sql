-- CreateTable
CREATE TABLE "SensorUnit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TofSensor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "unitId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "minDist" INTEGER NOT NULL,
    "maxDist" INTEGER NOT NULL,
    CONSTRAINT "TofSensor_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "SensorUnit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PresenceSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "unitId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME,
    "dwellSeconds" INTEGER NOT NULL DEFAULT 0,
    "productPickedUp" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    CONSTRAINT "PresenceSession_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "SensorUnit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SessionEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "ts" DATETIME NOT NULL,
    "payload" TEXT,
    CONSTRAINT "SessionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PresenceSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "unitId" TEXT NOT NULL,
    "dwellThresholdSeconds" INTEGER NOT NULL DEFAULT 30,
    "requirePickup" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "AlertRule_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "SensorUnit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UnitConfiguration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "unitId" TEXT NOT NULL,
    "minSensorAgreement" INTEGER NOT NULL DEFAULT 2,
    "departureTimeoutSeconds" INTEGER NOT NULL DEFAULT 5,
    "dwellMinSeconds" INTEGER NOT NULL DEFAULT 3,
    "pirEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pirCooldownSeconds" INTEGER NOT NULL DEFAULT 10,
    "imuPickupThresholdG" REAL NOT NULL DEFAULT 1.5,
    "imuExaminationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "imuDurationThresholdMs" INTEGER NOT NULL DEFAULT 500,
    CONSTRAINT "UnitConfiguration_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "SensorUnit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TofSensor_unitId_index_key" ON "TofSensor"("unitId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "AlertRule_unitId_key" ON "AlertRule"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "UnitConfiguration_unitId_key" ON "UnitConfiguration"("unitId");
