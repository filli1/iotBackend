/*
 * Store Attention — Arduino Sensor Bridge
 * 
 * REFERENCE SKETCH — shows the data format sent to the backend.
 * Hardware: MKR WiFi 1010 + 6× VL53L1X + PIR + Grove IMU 9DOF
 * Transport: HTTP POST to backend REST API (no MQTT for POC)
 *
 * Endpoint: POST http://<backend-ip>:3000/api/sensors/data
 * Content-Type: application/json
 * X-Api-Key: <key>
 * Frequency: every ~500ms
 *
 * Sensor payload format (JSON):
 * {
 *   "unit_id": "unit-01",
 *   "ts": 1711612800000,
 *   "tof": [
 *     {"id": 1, "distance_mm": 823, "status": "valid"},
 *     {"id": 2, "distance_mm": 790, "status": "valid"},
 *     {"id": 3, "distance_mm": 4000, "status": "out_of_range"},
 *     {"id": 4, "distance_mm": 812, "status": "valid"},
 *     {"id": 5, "distance_mm": 4000, "status": "out_of_range"},
 *     {"id": 6, "distance_mm": 4000, "status": "out_of_range"}
 *   ],
 *   "imu": {
 *     "accel": {"x": 0.02, "y": 0.98, "z": 0.01},
 *     "gyro":  {"x": 0.5, "y": -0.3, "z": 0.1},
 *     "mag":   {"x": 25.1, "y": -12.4, "z": 40.2}
 *   }
 * }
 *
 * Event payload (same endpoint, different shape):
 * {
 *   "unit_id": "unit-01",
 *   "ts": 1711612800000,
 *   "event": "imu_shock" | "imu_pickup" | "imu_rotation",
 *   "value": { ... event-specific data ... }
 * }
 *
 * Arduino libraries needed:
 *   - WiFiNINA (built-in WiFi)
 *   - ArduinoHttpClient (HTTP POST)
 *   - VL53L1X (Pololu or SparkFun)
 *   - Wire (I2C)
 *   - ArduinoJson (payload serialization)
 *
 * The backend IP is hardcoded in the sketch. On the same local network,
 * the Arduino just needs to know where to POST.
 */

// This file is for reference only — not compiled as part of the web project.
// The actual Arduino sketch lives in the Arduino IDE project.
