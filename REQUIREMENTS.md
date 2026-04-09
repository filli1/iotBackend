# Retail Presence Sensor — Frontend Tool Requirements

## Project Context

Frontend web application for setting up, managing, and presenting data from a retail product display sensor system. The hardware consists of an Arduino MKR WiFi 1010 with 6× VL53L1X ToF sensors, a PIR sensor, and a Grove IMU 9DOF — all designed to detect customer presence and product interaction at retail product stands.

The MKR WiFi 1010 sends data over WiFi. The frontend communicates with a lightweight backend/API that receives sensor data and serves it to the dashboard.

---

## 1. Sensor Setup & Configuration

### 1.1 Device Registration
- Register a new sensor unit (one MKR board + its attached sensors) by giving it a name, location, and product association
- Support multiple sensor units (one per product stand) in a single dashboard
- Store device connection details (IP / MQTT topic / API endpoint depending on chosen transport)

### 1.2 ToF Sensor Calibration
- Configure the detection zone per sensor: minimum distance (mm) and maximum distance (mm)
- Set the fan angle label for each of the 6 ToF sensors (e.g., "left-wide", "left", "center-left", "center-right", "right", "right-wide") so events can reference a direction
- Provide a live calibration mode that shows real-time distance readings from all 6 sensors so the installer can verify placement and angles during physical setup
- Allow the user to set a "noise floor" / ambient threshold per sensor to filter false positives from nearby fixtures

### 1.3 PIR Configuration
- Toggle PIR as wake trigger on/off
- Set PIR cooldown period (seconds before it can retrigger after activation)

### 1.4 IMU Configuration
- Set sensitivity threshold for "product picked up" event (accelerometer g-force threshold)
- Set sensitivity threshold for "vibration on stand" event
- Toggle gyroscope-based "product rotated/examined" detection on/off
- Set the duration threshold that distinguishes a bump from an intentional pickup (ms)

### 1.5 Detection Logic Rules
- Dwell time: minimum seconds a person must be in the ToF zone before counting as a "presence event" (filters passers-by)
- Minimum sensor agreement: how many of the 6 ToF sensors need to detect something simultaneously to confirm presence (e.g., at least 2 of 6)
- Departure timeout: how many seconds of no detection before a presence session is considered ended
- Engagement score weights: let the user assign relative importance to presence duration, product pickup, and product examination when computing an engagement score

---

## 2. Real-Time Monitoring

### 2.1 Live Sensor Dashboard
- Show a real-time status card per registered sensor unit with: connection status (online/offline/last seen), current presence state (empty / person detected / engaged with product), and active sensor count
- Show a live heatmap or arc visualization of the 6 ToF sensors: which sensors are currently detecting an object and at what distance
- Display live IMU state: idle, vibration detected, product lifted, product being examined
- Show PIR state: idle / triggered

### 2.2 Live Event Feed
- A scrolling event log showing timestamped events as they happen: "Person detected", "Person left", "Product picked up", "Product put down", "Engagement session ended (duration: Xs, score: Y)"
- Visual/audio notification when a high-engagement event fires (configurable — this is the "alert a salesperson" trigger)

### 2.3 Multi-Unit Overview
- If multiple stands are configured, show a floor-level overview with status indicators per unit
- Quick-glance grid: green (idle), blue (person present), orange (product interaction), red (offline)

---

## 3. Data Presentation & Analytics

### 3.1 Session History
- List of all presence sessions with: start time, end time, duration, peak sensor count, whether product was picked up, engagement score
- Filter by date range, minimum duration, product pickup (yes/no), engagement score range
- Sort by any column

### 3.2 Aggregate Analytics
- Daily/weekly/monthly visitor count (unique presence sessions)
- Average dwell time per session
- Product pickup rate (% of sessions where IMU detected a pickup)
- Peak traffic hours (heatmap by hour of day × day of week)
- Average engagement score over time (line chart)
- Conversion funnel visualization: detected → lingered → picked up product → (external: purchased — optional manual input or POS integration placeholder)

### 3.3 Comparison Views
- Compare two date ranges side by side (e.g., this week vs last week)
- If multiple units exist, compare engagement metrics across different product stands
- Overlay charts: presence count vs product pickups over time

### 3.4 Export
- Export session data as CSV
- Export analytics charts as PNG
- API endpoint for raw data access (for integration with external BI tools)

---

## 4. Alerts & Notifications

### 4.1 Salesperson Alert
- Configurable alert rule: trigger when a presence session exceeds N seconds AND/OR product is picked up
- Delivery: in-app notification (visual + optional sound), push notification (if PWA), webhook to external system (Slack, Teams, etc.)
- Snooze / acknowledge mechanism so the same session doesn't keep alerting
- Per-unit enable/disable

### 4.2 System Alerts
- Device offline for more than N minutes
- Sensor reading anomaly (e.g., one ToF sensor stuck at a constant value — likely blocked or broken)
- IMU baseline drift warning (sensor may have moved)

---

## 5. User & Access Management

### 5.1 Roles
- Admin: full setup, configuration, and data access
- Staff / salesperson: live monitoring and alert acknowledgement only
- Viewer: analytics dashboard, read-only

### 5.2 Authentication
- Simple email + password login (or OAuth placeholder)
- Session-based auth with token refresh

---

## 6. Technical Requirements

### 6.1 Stack Assumptions
- React (Vite) frontend
- Real-time data via WebSocket or MQTT-over-WebSocket
- REST API for configuration CRUD and historical data queries
- Backend stores sessions and events in a database (SQLite for prototype, PostgreSQL for production)

### 6.2 Responsiveness
- Must work on a wall-mounted tablet (landscape, ~10") for in-store use
- Must work on desktop for back-office analytics
- Mobile-friendly for salesperson alerts on phone

### 6.3 Performance
- Live dashboard updates at minimum 2 Hz (500ms refresh) for sensor readings
- Historical queries return within 1 second for up to 90 days of data
- Support at least 20 concurrent sensor units without degradation

### 6.4 Offline Resilience
- If the frontend loses connection to the backend, show clear offline indicator
- Buffer incoming sensor data on the backend so no sessions are lost during frontend downtime

---

## 7. Nice-to-Haves (Future)

- Floor plan editor: upload a store layout image and place sensor units on it for spatial overview
- Camera snapshot integration: optionally capture a photo when a high-engagement event fires (privacy considerations apply)
- POS integration: match engagement sessions to actual sales transactions for true conversion tracking
- A/B testing support: compare engagement metrics when product placement or display changes
- ML anomaly detection: flag unusual patterns (e.g., sudden drop in traffic that might indicate a display issue)
