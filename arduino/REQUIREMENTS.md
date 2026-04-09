# Arduino Firmware Requirements — Store Attention Sensor Bridge

## Overview

The Arduino acts as a **dumb sensor-to-WiFi bridge**. It reads from the attached sensors, serialises the data as JSON, and HTTP POSTs it to the backend. All detection logic (dwell time, engagement scoring, alert rules) runs on the backend — the Arduino has no awareness of presence sessions or business rules.

**Hardware:** Arduino MKR WiFi 1010 + 1–6× VL53L1X ToF + Grove IMU 9DOF (accelerometer used for vibration detection)

---

## 1. Connectivity

### 1.1 WiFi
- Connect to a configured SSID and password at boot.
- Retry connection indefinitely if the network is unavailable at startup.
- Reconnect automatically if the WiFi link drops during operation.
- Use the `WiFiNINA` library.

### 1.2 Backend endpoints
- Sensor data: **HTTP POST** to `http://<backend-ip>:7000/api/sensors/data`
- Heartbeat ping: **HTTP POST** to `http://<backend-ip>:7000/api/sensors/ping`
- Required headers on every request:
  - `Content-Type: application/json`
  - `X-Api-Key: <key>` — the API key shown on the unit's Configure page in the dashboard. Hardcode it in the sketch as a `#define API_KEY "..."` constant.
- The backend IP and port are hardcoded in the sketch (same local network, no DNS required).
- On a `401` response, log "Invalid API key" to Serial and halt.
- On any other non-2xx response, log the status code to Serial and continue.

---

## 2. Sensor Reading Loop

### 2.1 Timing
- The main loop runs every **500 ms** (±50 ms jitter acceptable).
- One full sensor reading payload is POSTed each iteration.
- Hardware events (see §4) may be POSTed at any time outside the main loop.
- A heartbeat ping is sent to `/api/sensors/ping` every **30 seconds** as a fallback (the regular 500 ms POSTs already keep the unit online; the ping is only needed if no sensor data is flowing).

### 2.2 `unit_id`
- Each sketch is flashed with a hardcoded `unit_id` string (e.g. `"unit-01"`).
- The `unit_id` must match a unit registered in the backend before data will be accepted.

### 2.3 Timestamp
- `ts` is the number of milliseconds since the Unix epoch.
- Use `WiFi.getTime()` (SNTP) to get wall-clock time. Multiply to ms.
- If NTP is unavailable, use `millis()` as a fallback.

---

## 3. Sensor Reading Payload

Every 500 ms, POST the following JSON to `/api/sensors/data`:

```json
{
  "unit_id": "unit-01",
  "ts": 1711612800000,
  "tof": [
    { "id": 1, "distance_mm": 823, "status": "valid" },
    { "id": 2, "distance_mm": 790, "status": "valid" },
    { "id": 3, "distance_mm": 4000, "status": "out_of_range" }
  ],
  "imu": {
    "vibration_intensity": 0.04
  }
}
```

**Notes:**
- `tof` contains only the sensors that are wired up (1–6 entries). Always include all wired sensors even if in error state.
- `imu` is optional. Omit the field entirely if no IMU is installed or if IMU is disabled in configuration.

### 3.1 ToF sensors (`tof`)

| Field | Type | Description |
|---|---|---|
| `id` | integer 1–6 | Sensor index. Fixed mapping (see §3.1.1). |
| `distance_mm` | integer | Raw distance in millimetres from the VL53L1X. |
| `status` | string | `"valid"`, `"out_of_range"`, or `"error"`. |

**Status rules:**
- `"valid"` — sensor returned a distance within its measurement range.
- `"out_of_range"` — sensor fired but the target is beyond its range.
- `"error"` — sensor did not respond on I2C or returned an unrecoverable range error.

**Always include all wired sensor entries**, even if a sensor is in error state. Never omit an entry for a sensor that is physically connected.

#### 3.1.1 Physical sensor-to-index mapping

```
Index 1 — left-wide
Index 2 — left
Index 3 — center-left
Index 4 — center-right
Index 5 — right
Index 6 — right-wide
```

This mapping is fixed in hardware. Not all indices need to be present — only wire up as many sensors as the installation requires.

#### 3.1.2 I2C addressing
- The VL53L1X sensors all share the same default I2C address (0x29). Each sensor's XSHUT pin must be driven individually to assign unique addresses at boot.
- Recommended address assignment: sensors 1–6 → addresses 0x30–0x35.
- If a sensor fails to respond during address assignment, mark all its readings as `"error"` for the rest of the session.

### 3.2 IMU (`imu`)

The sensor is mounted **beneath or in front of the product** (not on it). The IMU detects surface vibrations transmitted through the shelf when someone touches or picks up the product.

| Field | Type | Description |
|---|---|---|
| `vibration_intensity` | float | RMS vibration magnitude in g, computed over the 500 ms window. |

**How to compute `vibration_intensity`:**
1. Sample the accelerometer internally at the highest available ODR ≤ 200 Hz throughout the 500 ms loop cycle.
2. For each sample, compute the vector magnitude: `|a| = sqrt(ax² + ay² + az²)`.
3. Subtract 1.0 g from each magnitude to remove the static gravity component (or use the hardware high-pass filter if available).
4. Compute the RMS of these gravity-corrected magnitudes across all samples.
5. Report this value as `vibration_intensity`.

At rest on a stable surface, `vibration_intensity` should be < 0.05 g RMS. A shelf tap or product lift should produce > 0.15 g RMS.

**IMU is optional.** If no IMU is installed or if it fails to initialise, omit the `imu` field entirely from the payload.

---

## 4. Hardware Event Payload

In addition to the periodic reading, fire a **separate HTTP POST** to the same endpoint when a discrete hardware event is detected:

```json
{
  "unit_id": "unit-01",
  "ts": 1711612800000,
  "event": "imu_vibration",
  "value": { "intensity": 0.42 }
}
```

| `event` | Trigger condition | `value` fields |
|---|---|---|
| `"imu_vibration"` | Vibration intensity above threshold, sustained > 150 ms | `{ "intensity": <float> }` |
| `"imu_shock"` | Single-sample acceleration spike above a higher threshold | `{ "peak_g": <float>, "axis": "x"\|"y"\|"z" }` |

**PIR sensor:** The PIR sensor (if installed) is used **on-device only** as a local trigger to wake the sketch from low-power mode or to pre-arm the ToF sensors. It is **not** reported to the backend — do not include it in any payload.

**Detection thresholds** are baked into the sketch as `#define` constants.

Suggested defaults:
- `IMU_VIBRATION_THRESHOLD_G` = 0.15 (sustained > 150 ms triggers `imu_vibration` event)
- `IMU_SHOCK_THRESHOLD_G` = 1.5 (single-sample spike triggers `imu_shock` event)

Events may be sent between reading cycles. Do not queue events — send immediately and resume the loop.

---

## 5. Heartbeat Ping

Every **30 seconds**, POST to `/api/sensors/ping`:

```json
{ "unit_id": "unit-01" }
```

- Same `X-Api-Key` header required.
- Expected response: `204 No Content`.
- On `401`: log "Invalid API key" and halt.
- This keeps the unit marked as **Online** in the dashboard even when no ToF activity is detected (e.g. quiet store periods).

---

## 6. Libraries

| Library | Purpose |
|---|---|
| `WiFiNINA` | WiFi connection and NTP time |
| `ArduinoHttpClient` | HTTP POST |
| `VL53L1X` (Pololu) | ToF sensor ranging |
| `Wire` | I2C bus |
| `ArduinoJson` (v6+) | JSON serialisation |
| IMU driver matching your Grove module | Accelerometer readings (check silkscreen for exact chip: LSM9DS1 or MPU-9250) |

---

## 7. Serial Logging

- Log to `Serial` at 115200 baud.
- On boot: print WiFi connection status and assigned IP.
- Each loop: print a one-line summary (e.g. `[500ms] 2/3 valid, vib=0.03g`).
- On HTTP error: print the status code and response body (truncated to 128 chars).
- On sensor error: print which sensor index failed.

---

## 8. Out of Scope

The following are **not** handled by the Arduino firmware:

- Presence session tracking or dwell time calculation
- Alert rule evaluation
- Sensor distance thresholds / zone configuration (these live in the backend)
- Storing readings locally (no SD card, no EEPROM persistence)
- OTA firmware updates
- TLS / HTTPS (plain HTTP on the local network is acceptable for POC)
- PIR reporting to backend (PIR is on-device only)
