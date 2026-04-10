"""
Mock Arduino — Store Attention sensor simulator
Emulates realistic customer interactions to drive the full detection pipeline:
  idle → ToF in-range → session_started → (optional pickup) → session_ended

Usage:
    python mock_arduino.py                     # run default unit in a loop
    python mock_arduino.py --unit product-02   # override unit
    python mock_arduino.py --once              # run one interaction then exit
"""

import argparse
import requests
import time
import random

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

UNIT_KEYS = {
    "product-01": "dd246d8b709ca8638b1bed856c719cefd8d9ad98ea65f7c0",
    # Add more units here as you register them in the app
    # "product-02": "<api-key>",
}

BACKEND_URL = "http://localhost:7000/api/sensors/data"
LOOP_INTERVAL_S = 0.5   # matches real Arduino 500 ms cadence

# How many ToF sensors must be in-range to trigger presence detection.
# Should match the unit's minSensorAgreement setting in the app (default: 2).
MIN_SENSORS_IN_RANGE = 2

# Detection range that the backend considers "someone present".
# Must fall within the unit's per-sensor minDist/maxDist config in the app.
PRESENCE_DIST_MIN = 300
PRESENCE_DIST_MAX = 800

# Nominal out-of-range distance sent when no one is present
NO_PRESENCE_DIST = 4200

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_ts() -> int:
    return int(time.time() * 1000)


def build_imu(mode: str = "still") -> dict:
    """Return vibration_intensity for different physical states."""
    if mode == "still":
        return {"vibration_intensity": round(random.uniform(0.0, 0.05), 3)}
    if mode == "examining":
        # Slow tilt — someone rotating the product to look at the back
        return {"vibration_intensity": round(random.uniform(0.1, 0.4), 3)}
    if mode == "pickup":
        # Sharp movement spike
        return {"vibration_intensity": round(random.uniform(0.8, 2.5), 3)}
    return build_imu("still")


def make_tof_reading(num_in_range: int, dist: int) -> list:
    """
    Build a 6-sensor ToF array.
    `num_in_range` sensors report the given distance; the rest are out of range.
    """
    sensors = []
    for i in range(1, 7):
        if i <= num_in_range:
            sensors.append({
                "id": i,
                "distance_mm": dist + random.randint(-25, 25),
                "status": "valid",
            })
        else:
            sensors.append({
                "id": i,
                "distance_mm": NO_PRESENCE_DIST + random.randint(-50, 50),
                "status": "out_of_range",
            })
    return sensors


def post(unit_id: str, api_key: str, payload: dict) -> bool:
    headers = {"Content-Type": "application/json", "X-Api-Key": api_key}
    try:
        r = requests.post(BACKEND_URL, json=payload, headers=headers, timeout=2)
        if r.status_code == 401:
            print("  [!] 401 Unauthorised — check API key in UNIT_KEYS")
            return False
        if r.status_code == 404:
            print("  [!] 404 Unknown unit — register the unit in the app first")
            return False
        return True
    except Exception as e:
        print(f"  [!] POST failed: {e}")
        return False


def send_reading(unit_id: str, api_key: str, dist: int, num_in_range: int,
                 imu_mode: str = "still") -> bool:
    return post(unit_id, api_key, {
        "unit_id": unit_id,
        "ts": get_ts(),
        "tof": make_tof_reading(num_in_range, dist),
        "imu": build_imu(imu_mode),
    })


def send_event(unit_id: str, api_key: str, event_type: str, value: dict = {}) -> bool:
    ok = post(unit_id, api_key, {
        "unit_id": unit_id,
        "ts": get_ts(),
        "event": event_type,
        "value": value,
    })
    if ok:
        print(f"  >> EVENT: {event_type} {value or ''}")
    return ok

# ---------------------------------------------------------------------------
# Scenario builders
# ---------------------------------------------------------------------------

def scenario_pass_by(unit_id: str, api_key: str):
    """
    Quick walk-by: 1–3 seconds in range, no session should be committed
    (dwell minimum is typically 3 s, so this stays in 'pending' then cancels).
    """
    dwell = random.uniform(1, 2.5)
    dist = random.randint(500, 750)
    print(f"  Scenario: PASS-BY  ({dwell:.1f}s, dist~{dist}mm)")

    deadline = time.time() + dwell
    while time.time() < deadline:
        send_reading(unit_id, api_key, dist, num_in_range=random.randint(2, 4))
        time.sleep(LOOP_INTERVAL_S)

    # Walk away — send out-of-range readings so the engine resets to idle
    for _ in range(3):
        send_reading(unit_id, api_key, NO_PRESENCE_DIST, num_in_range=0)
        time.sleep(LOOP_INTERVAL_S)


def scenario_browse(unit_id: str, api_key: str):
    """
    Customer stands and looks at the product: triggers session_started then session_ended.
    No pickup event.
    """
    dwell = random.randint(12, 35)
    dist = random.randint(420, 650)
    print(f"  Scenario: BROWSE   ({dwell}s, dist~{dist}mm)")

    deadline = time.time() + dwell
    while time.time() < deadline:
        send_reading(unit_id, api_key, dist, num_in_range=random.randint(3, 6))
        time.sleep(LOOP_INTERVAL_S)

    # Departure — a few frames with nothing detected
    for _ in range(4):
        send_reading(unit_id, api_key, NO_PRESENCE_DIST, num_in_range=0)
        time.sleep(LOOP_INTERVAL_S)


def scenario_pickup(unit_id: str, api_key: str):
    """
    Customer picks up product: triggers session_started + product_interacted (via imu_vibration).
    May also examine before putting it back.
    """
    approach_time = random.randint(4, 8)      # time before pickup
    examine_time = random.randint(8, 20)       # time holding product
    dist = random.randint(300, 500)
    print(f"  Scenario: PICKUP   (approach {approach_time}s, examine {examine_time}s, dist~{dist}mm)")

    # Approach phase
    deadline = time.time() + approach_time
    while time.time() < deadline:
        send_reading(unit_id, api_key, dist, num_in_range=random.randint(3, 6))
        time.sleep(LOOP_INTERVAL_S)

    # Pickup — vibration event signals product interaction
    send_event(unit_id, api_key, "imu_vibration", {"peak_intensity": round(random.uniform(1.3, 2.1), 2)})
    send_reading(unit_id, api_key, dist, num_in_range=5, imu_mode="pickup")
    time.sleep(LOOP_INTERVAL_S)

    # Examine phase — occasional vibration bursts
    deadline = time.time() + examine_time
    vibration_cooldown = 0.0
    while time.time() < deadline:
        imu_mode = "still"
        if time.time() > vibration_cooldown and random.random() > 0.85:
            send_event(unit_id, api_key, "imu_vibration",
                       {"peak_intensity": round(random.uniform(0.3, 0.8), 2)})
            imu_mode = "examining"
            vibration_cooldown = time.time() + 2.5
        send_reading(unit_id, api_key, dist, num_in_range=random.randint(3, 5),
                     imu_mode=imu_mode)
        time.sleep(LOOP_INTERVAL_S)

    # Departure
    for _ in range(4):
        send_reading(unit_id, api_key, NO_PRESENCE_DIST, num_in_range=0)
        time.sleep(LOOP_INTERVAL_S)


def scenario_alert(unit_id: str, api_key: str):
    """
    Long dwell + vibration — designed to reliably fire an alert rule
    (assumes rule is: dwell >= 30s AND pickup required, or just dwell >= 30s).
    """
    dwell = random.randint(35, 60)
    dist = random.randint(350, 550)
    print(f"  Scenario: ALERT    ({dwell}s, dist~{dist}mm) — designed to trigger alert rule")

    vibration_sent = False
    start = time.time()
    while (time.time() - start) < dwell:
        elapsed = time.time() - start

        # Send vibration event after ~5 s of presence (session will be active by then)
        if not vibration_sent and elapsed > 5:
            send_event(unit_id, api_key, "imu_vibration",
                       {"peak_intensity": round(random.uniform(1.4, 2.0), 2)})
            vibration_sent = True

        send_reading(unit_id, api_key, dist, num_in_range=random.randint(4, 6))
        time.sleep(LOOP_INTERVAL_S)

    for _ in range(4):
        send_reading(unit_id, api_key, NO_PRESENCE_DIST, num_in_range=0)
        time.sleep(LOOP_INTERVAL_S)

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

SCENARIOS = [
    (scenario_pass_by, 30),
    (scenario_browse,  35),
    (scenario_pickup,  25),
    (scenario_alert,   10),
]


def run(unit_id: str, once: bool = False):
    api_key = UNIT_KEYS.get(unit_id)
    if not api_key:
        print(f"No API key configured for '{unit_id}'. Add it to UNIT_KEYS.")
        return

    print(f"Mock Arduino '{unit_id}' online.")
    print(f"Posting to {BACKEND_URL}")
    print("-" * 50)

    fns, weights = zip(*SCENARIOS)

    iteration = 0
    while True:
        iteration += 1
        idle_s = random.randint(3, 8)
        print(f"\n[{iteration}] Idle for {idle_s}s...")
        time.sleep(idle_s)

        scenario_fn = random.choices(fns, weights=weights, k=1)[0]
        scenario_fn(unit_id, api_key)

        if once:
            print("\nDone (--once).")
            break


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Mock Arduino sensor for Store Attention")
    parser.add_argument("--unit", default="product-01", help="Unit ID to simulate")
    parser.add_argument("--once", action="store_true", help="Run one interaction then exit")
    args = parser.parse_args()

    run(args.unit, once=args.once)
