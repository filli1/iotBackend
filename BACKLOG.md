# Backlog — Store Attention

## Priority: Must Have (Prototype)

### INFRA-01: Project scaffolding
Set up monorepo with frontend (React + Vite + TS) and backend (Fastify + TS). Configure Tailwind, shared types, dev scripts. Both should start with one `npm run dev` command.

### INFRA-02: Prisma schema & migrations
Define `schema.prisma` with SQLite provider. Models: SensorUnit, TofSensor, PresenceSession, SessionEvent, AlertRule, UnitConfiguration. Set up relations (SensorUnit has many TofSensors, PresenceSessions, etc.). Create shared Prisma client in `backend/src/lib/prisma.ts`. Run initial migration with `npx prisma migrate dev`.

### INFRA-03: Sensor data ingest endpoint
Backend route `POST /api/sensors/data` that receives raw sensor JSON from the Arduino over HTTP. Parse and validate incoming payloads (ToF distances × 6, PIR state, IMU accelerometer/gyroscope values) and feed them into the detection engine. No MQTT — plain HTTP POST for POC simplicity.

### CORE-01: Detection engine
Backend service that processes raw sensor stream and produces presence events. Implements: distance thresholding, minimum sensor agreement, dwell time filter, departure timeout. Outputs "session started", "session ended", "product picked up", "product put down" events.

### CORE-02: Session manager
Tracks active presence sessions. Computes running dwell time and engagement score. Writes completed sessions to the database.

### DASH-01: Live sensor dashboard
Frontend page showing real-time state of a sensor unit: connection status, which ToF sensors are detecting, current distances, PIR state, IMU state. Updates via WebSocket at ~2 Hz.

### DASH-02: Live calibration mode
Frontend view that shows raw distance readings from all 6 ToF sensors in large, easy-to-read numbers. Used during physical installation to verify sensor angles and range thresholds. Should work on a phone held next to the display.

### DASH-03: Event feed
Scrolling real-time event log: person detected, person left, product picked up, session ended with duration and score.

### ALERT-01: Salesperson alert
Configurable alert rule engine. When triggered: in-app visual + sound notification. Acknowledge/snooze mechanism.

### DATA-01: Session history table
Paginated, sortable, filterable list of all past presence sessions. Filters: date range, min duration, product pickup yes/no.

---

## Priority: Should Have

### SETUP-01: Device registration UI
Form to register a new sensor unit: name, location, product association, connection details.

### SETUP-02: Sensor configuration UI
Configure per-unit: ToF distance thresholds, dwell time, sensor agreement count, departure timeout, IMU sensitivity, engagement score weights.

### DATA-02: Aggregate analytics dashboard
Daily/weekly visitor count, average dwell time, pickup rate, peak hours heatmap, engagement score trend line.

### DATA-03: CSV export
Export session history as CSV from the session table.

### ALERT-02: System health alerts
Device offline warning, sensor anomaly detection (stuck readings), IMU drift warning.

---

## Priority: Nice to Have

### DATA-04: Comparison views
Compare two date ranges or two sensor units side by side.

### DATA-05: Conversion funnel
Visual funnel: detected → lingered → picked up → purchased (last step manual input or POS placeholder).

### ALERT-03: Webhook integration
Push alert events to Slack/Teams/external system via webhook URL.

### MULTI-01: Multi-unit overview
Grid view showing status of all registered sensor units at a glance.

### AUTH-01: User roles & login
Admin / staff / viewer roles with email + password authentication.

---

## Priority: Future / Out of Scope for Prototype

### FLOOR-01: Floor plan editor
### POS-01: POS integration
### ML-01: Anomaly detection
### ARDUINO-01: OTA firmware updates