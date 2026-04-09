# Arduino Firmware Requirements — Store Attention Sensor Bridge

## Overview

The Arduino acts as a **dumb sensor-to-WiFi bridge**. It reads from the attached sensors, serialises the data as JSON, and HTTP POSTs it to the backend. All detection logic (dwell time, engagement scoring, alert rules) runs on the backend — the Arduino has no awareness of presence sessions or business rules.

**Hardware:** Arduino MKR WiFi 1010 + 6× VL53L1X ToF + 1× PIR + Grove IMU 9DOF (LSM9DS1)

---

## 1. Connectivity

### 1.1 WiFi
- Connect to a configured SSID and password at boot.
- Retry connection indefinitely if the network is unavailable at startup.
- Reconnect automatically if the WiFi link drops during operation.
- Use the `WiFiNINA` library.

### 1.2 Backend endpoint
- All data is sent via **HTTP POST** to `http://<backend-ip>:7000/api/sensors/data`.
- Required headers on every request:
  - `Content-Type: application/json`
  - `X-Api-Key: <key>` — the API key shown on the unit's Configure page in the dashboard. Hardcode it in the sketch as a `#define API_KEY "..."` constant.
- The backend IP and port are hardcoded in the sketch (same local network, no DNS required).
- On a `401` response, log "Invalid API key" to Serial and halt — the sketch cannot recover from a bad key without reflashing.
- On any other non-2xx response, log the status code to Serial and continue — do not halt.

---

## 2. Sensor Reading Loop

### 2.1 Timing
- The main loop runs every **500 ms** (±50 ms jitter acceptable).
- One full sensor reading payload is POSTed each iteration.
- Hardware events (see §4) may be POSTed at any time outside the main loop if they occur between reading cycles.

### 2.2 `unit_id`
- Each sketch is flashed with a hardcoded `unit_id` string (e.g. `"unit-01"`).
- The `unit_id` must match a unit registered in the backend before data will be accepted.

### 2.3 Timestamp
- `ts` is the number of milliseconds since the Unix epoch.
- Use `WiFi.getTime()` (SNTP) to get wall-clock time. Multiply to ms.
- If NTP is unavailable, use `millis()` as a fallback (backend will tolerate approximate timestamps for POC).

---

## 3. Sensor Reading Payload

Every 500 ms, POST the following JSON to `/api/sensors/data`:

```json
{
  "unit_id": "unit-01",
  "ts": 1711612800000,
  "tof": [
    { "id": 1, "distance_mm": 823,  "status": "valid"        },
    { "id": 2, "distance_mm": 790,  "status": "valid"        },
    { "id": 3, "distance_mm": 4000, "status": "out_of_range" },
    { "id": 4, "distance_mm": 812,  "status": "valid"        },
    { "id": 5, "distance_mm": 4000, "status": "out_of_range" },
    { "id": 6, "distance_mm": 4000, "status": "out_of_range" }
  ],
  "pir": {
    "triggered": true,
    "last_trigger_ms": 1500
  },
  "imu": {
    "accel": { "x": 0.02, "y": 0.98, "z": 0.01 },
    "gyro":  { "x": 0.5,  "y": -0.3, "z": 0.1  },
    "mag":   { "x": 25.1, "y": -12.4, "z": 40.2 }
  }
}
```

### 3.1 ToF sensors (`tof`)

| Field | Type | Description |
|---|---|---|
| `id` | integer 1–6 | Sensor index. Fixed mapping (see §3.1.1). |
| `distance_mm` | integer | Raw distance in millimetres from the VL53L1X. |
| `status` | string | `"valid"`, `"out_of_range"`, or `"error"`. |

**Status rules:**
- `"valid"` — sensor returned a distance within its measurement range.
- `"out_of_range"` — sensor fired but the target is beyond its range (VL53L1X returns 4000+ mm or a range status indicating no target).
- `"error"` — sensor did not respond on I2C or returned an unrecoverable range error.

**Always include all 6 entries**, even if a sensor is in error state. Never omit an entry.

#### 3.1.1 Physical sensor-to-index mapping

```
Index 1 — left-wide
Index 2 — left
Index 3 — center-left
Index 4 — center-right
Index 5 — right
Index 6 — right-wide
```

This mapping is fixed in hardware. Label names are configurable in the backend UI but index numbers never change.

#### 3.1.2 I2C addressing
- The VL53L1X sensors all share the same default I2C address (0x29). Each sensor's XSHUT pin must be driven individually to assign unique addresses at boot.
- Recommended address assignment: sensors 1–6 → addresses 0x30–0x35.
- If a sensor fails to respond during address assignment, mark all its readings as `"error"` for the rest of the session.

### 3.2 PIR sensor (`pir`)

| Field | Type | Description |
|---|---|---|
| `triggered` | boolean | `true` if the PIR output is currently HIGH. |
| `last_trigger_ms` | integer | Milliseconds since the last PIR rising edge, or `0` if never triggered since boot. |

### 3.3 IMU (`imu`)

Read from the Grove IMU 9DOF (LSM9DS1) via I2C.

| Field | Type | Unit |
|---|---|---|
| `accel.x/y/z` | float | g (gravitational units, ±4g range recommended) |
| `gyro.x/y/z` | float | °/s (degrees per second, ±245 °/s range recommended) |
| `mag.x/y/z` | float | µT (microtesla) |

Report raw calibrated values — no filtering required on the Arduino side.

---

## 4. Hardware Event Payload

In addition to the periodic reading, fire a **separate HTTP POST** to the same endpoint when a discrete hardware event is detected. Use the following shape:

```json
{
  "unit_id": "unit-01",
  "ts": 1711612800000,
  "event": "imu_pickup",
  "value": { "peak_g": 1.82 }
}
```

| `event` | Trigger condition | Recommended `value` fields |
|---|---|---|
| `"pir_trigger"` | PIR rising edge | `{}` |
| `"imu_shock"` | Single-axis acceleration spike above threshold | `{ "peak_g": <float>, "axis": "x"\|"y"\|"z" }` |
| `"imu_pickup"` | Sustained acceleration above threshold for > 150 ms | `{ "peak_g": <float> }` |
| `"imu_rotation"` | Gyroscope magnitude above threshold for > 200 ms | `{ "deg_per_s": <float> }` |

**Detection thresholds** are baked into the sketch as `#define` constants. The backend will re-classify events based on its own configured thresholds — the Arduino's thresholds only need to be sensitive enough not to miss real events.

Suggested defaults:
- `IMU_SHOCK_THRESHOLD_G` = 1.5
- `IMU_PICKUP_THRESHOLD_G` = 1.2 (must sustain > 150 ms)
- `IMU_ROTATION_THRESHOLD_DPS` = 30.0 (must sustain > 200 ms)

Events may be sent between reading cycles. Do not queue events — send immediately and resume the loop.

---

## 5. Libraries

| Library | Purpose |
|---|---|
| `WiFiNINA` | WiFi connection and NTP time |
| `ArduinoHttpClient` | HTTP POST |
| `VL53L1X` (Pololu) | ToF sensor ranging |
| `Wire` | I2C bus |
| `ArduinoJson` (v6+) | JSON serialisation |
| LSM9DS1 driver (SparkFun or Arduino) | IMU readings |

---

## 6. Serial Logging

- Log to `Serial` at 115200 baud.
- On boot: print WiFi connection status and assigned IP.
- Each loop: print a one-line summary (e.g. `[500ms] 3/6 valid, PIR=0, accel=(0.02,0.98,0.01)`).
- On HTTP error: print the status code and response body (truncated to 128 chars).
- On sensor error: print which sensor index failed.

---

## 7. Out of Scope

The following are **not** handled by the Arduino firmware:

- Presence session tracking or dwell time calculation
- Alert rule evaluation
- Sensor distance thresholds / zone configuration (these live in the backend)
- Storing readings locally (no SD card, no EEPROM persistence)
- OTA firmware updates
- TLS / HTTPS (plain HTTP on the local network is acceptable for POC)
