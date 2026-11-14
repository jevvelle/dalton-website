"""
Flask routes for Project Dalton.

Endpoints:
    GET  /video_feed      -> MJPEG stream, processed per the active color mode
    GET  /video_feed_raw  -> MJPEG stream, always unprocessed (true colors) —
                             used by AI Color Assist and the Color Picker
    POST /set_color        -> {"color": "<red|yellow|green|blue|orange|purple|normal>"}
    GET  /status           -> camera connection + active color mode
    GET  /robot/status      -> placeholder for future Dalton robot telemetry
    POST /robot/move        -> placeholder for future Dalton movement commands
"""

import time

import cv2
import numpy as np
from flask import Blueprint, Response, jsonify, request

from backend.camera import camera
from backend.color_processor import VALID_MODES, isolate_color, resize_for_stream
from backend.config import Config

bp = Blueprint("main", __name__)

# Shared, in-memory application state. A dict is enough for a single-robot,
# single-active-mode setup; if Dalton ever needs per-client state this is
# the place to grow it.
state = {"color": "normal"}


def _status_frame(message):
    """A simple placeholder frame shown while the ESP32-CAM is unreachable,
    so the browser never just shows a broken image with no explanation."""
    frame = np.full((360, 640, 3), 32, dtype=np.uint8)
    cv2.putText(
        frame, message, (24, 190), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (235, 235, 235), 2, cv2.LINE_AA
    )
    return frame


def _generate_frames(apply_isolation=True):
    while True:
        frame = camera.get_frame()

        if frame is None:
            frame = _status_frame(
                "Waiting for Dalton's camera..."
                if camera.is_connected()
                else "Dalton's camera is disconnected. Check the ESP32-CAM and stream URL."
            )
        else:
            frame = resize_for_stream(frame)
            if apply_isolation:
                frame = isolate_color(frame, state["color"])

        ok, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, Config.JPEG_QUALITY])
        if not ok:
            time.sleep(Config.FRAME_INTERVAL)
            continue

        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n"
        )
        time.sleep(Config.FRAME_INTERVAL)


@bp.route("/video_feed")
def video_feed():
    return Response(_generate_frames(apply_isolation=True), mimetype="multipart/x-mixed-replace; boundary=frame")


@bp.route("/video_feed_raw")
def video_feed_raw():
    """The unprocessed camera feed — always the true colors, regardless of
    whatever isolation mode the Color Isolation tab currently has active.

    AI Color Assist (vision simulation) and the Color Picker (eyedropper)
    both use this instead of /video_feed: they need Dalton's real colors to
    work correctly, not whatever HSV mask the Isolation tab happens to have
    selected right now. The two endpoints read from the same shared camera
    thread (backend/camera.py), so using both at once still opens only one
    connection to the ESP32-CAM itself.
    """
    return Response(_generate_frames(apply_isolation=False), mimetype="multipart/x-mixed-replace; boundary=frame")


@bp.route("/set_color", methods=["POST"])
def set_color():
    payload = request.get_json(silent=True) or {}
    color = str(payload.get("color", "")).strip().lower()

    if color not in VALID_MODES:
        return (
            jsonify(
                {
                    "ok": False,
                    "error": f"Invalid color '{color}'. Must be one of: {', '.join(sorted(VALID_MODES))}.",
                }
            ),
            400,
        )

    state["color"] = color
    return jsonify({"ok": True, "color": color})


@bp.route("/status")
def status():
    return jsonify(
        {
            "connected": camera.is_connected(),
            "color": state["color"],
            "stream_url": Config.ESP32_STREAM_URL,
        }
    )


# ---------------------------------------------------------------------------
# Dalton robot control — placeholders only.
#
# These exist so the frontend and any robot firmware can be built against a
# stable API shape now, without coupling the camera/vision code above to
# whatever transport (serial, HTTP, MQTT, BLE, etc.) Dalton's movement,
# sensors, and voice interaction end up using.
# ---------------------------------------------------------------------------


@bp.route("/robot/status")
def robot_status():
    return jsonify(
        {
            "connected": False,
            "note": "Robot telemetry is not implemented yet — this endpoint is a placeholder.",
        }
    )


@bp.route("/robot/move", methods=["POST"])
def robot_move():
    return (
        jsonify({"ok": False, "error": "Robot movement is not implemented yet."}),
        501,
    )


@bp.route("/robot/sensors")
def robot_sensors():
    return jsonify({"ok": False, "error": "Sensor data is not implemented yet."}), 501
