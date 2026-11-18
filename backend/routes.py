"""
Flask routes for Project Dalton.

Endpoints:
    GET  /video_feed      -> MJPEG stream, processed per the active color mode
    GET  /video_feed_raw  -> MJPEG stream, always unprocessed (true colors) —
                             used by AI Color Assist and the Color Picker
    POST /set_color       -> {"color": "<red|yellow|green|blue|orange|purple|normal>"}
    GET  /status          -> camera connection + active color mode
    POST /api/scan        -> Trigger Gemini Vision AI analysis on current frame
    POST /api/chat        -> Conversational AI endpoint (custom prompts + uploaded images)
    POST /api/speak       -> Trigger Text-To-Speech audio queue directly
"""

import base64
import time

import cv2
import numpy as np
from flask import Blueprint, Response, jsonify, request

from backend.camera import camera
from backend.color_processor import VALID_MODES, isolate_color
from backend.config import Config
from backend.robot import analyze_frame, analyze_frame_with_prompt, speak_text

bp = Blueprint("main", __name__)

# Shared, in-memory application state.
state = {"color": "normal"}


def _status_frame(message):
    """Placeholder frame shown while the ESP32-CAM is unreachable."""
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
            # Downscale to 480px wide to cut hotspot + Cloudflare tunnel bandwidth
            h, w = frame.shape[:2]
            if w > 480:
                frame = cv2.resize(frame, (480, int(480 * h / w)))
            if apply_isolation:
                frame = isolate_color(frame, state["color"])

        ok, buffer = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 65])
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
    """The unprocessed camera feed — always true colors."""
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
# Project Dalton — Gemini AI Vision & Speech API Endpoints
# ---------------------------------------------------------------------------


@bp.route("/api/scan", methods=["POST", "GET"])
def api_scan():
    """Grabs the current raw frame from the ESP32 camera thread, sends it
    to the Gemini API for color/object analysis, and queues speech output.
    """
    frame = camera.get_frame()
    if frame is None:
        return jsonify({"ok": False, "error": "Dalton's camera is disconnected."}), 503

    results = analyze_frame(frame, trigger_speech=True)
    return jsonify({"ok": True, "data": results})


@bp.route("/api/chat", methods=["POST"])
def api_chat():
    """Allows interactive conversation with Dalton AI using camera input or uploaded image."""
    payload = request.get_json(silent=True) or {}
    user_prompt = str(payload.get("prompt", "")).strip()
    image_data = payload.get("image_data")

    if not user_prompt:
        return jsonify({"ok": False, "error": "No prompt provided."}), 400

    frame = None

    # Decode Base64 string if user uploaded an image from frontend canvas
    if image_data and "base64," in image_data:
        try:
            base64_str = image_data.split("base64,")[1]
            img_bytes = base64.b64decode(base64_str)
            np_arr = np.frombuffer(img_bytes, np.uint8)
            frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        except Exception as e:
            print(f"Error decoding image_data: {e}")

    # Fall back to live ESP32 camera frame if no uploaded image was attached
    if frame is None:
        frame = camera.get_frame()

    results = analyze_frame_with_prompt(frame, user_prompt)
    return jsonify({"ok": True, "reply": results["speech"], "data": results})


@bp.route("/api/speak", methods=["POST"])
def api_speak():
    """Enqueues custom text directly to the background speech queue."""
    payload = request.get_json(silent=True) or {}
    text = str(payload.get("text", "")).strip()

    if not text:
        return jsonify({"ok": False, "error": "No text string provided."}), 400

    speak_text(text)
    return jsonify({"ok": True, "queued": text})