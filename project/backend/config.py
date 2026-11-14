"""
Central configuration for the Project Dalton backend.

Everything here is read from environment variables (optionally loaded from
a local .env file via python-dotenv), so no IPs, ports, or other
environment-specific values are hardcoded in the application code.
"""

import os
from dotenv import load_dotenv

# Loads variables from a .env file in the project root, if one exists.
# In production/deployment you can instead set real environment variables
# and skip the .env file entirely.
load_dotenv()


def _get_bool(name, default=False):
    val = os.getenv(name)
    if val is None:
        return default
    return val.strip().lower() in ("1", "true", "yes", "on")


class Config:
    # --- ESP32-CAM / Dalton robot camera ---
    # Example: http://192.168.1.50:81/stream
    ESP32_STREAM_URL = os.getenv("ESP32_STREAM_URL", "http://192.168.1.100:81/stream")

    # How long (seconds) to wait between reconnection attempts if the
    # ESP32-CAM stream drops or was never reachable.
    RECONNECT_DELAY = float(os.getenv("RECONNECT_DELAY", "2.0"))

    # --- Flask server ---
    HOST = os.getenv("HOST", "0.0.0.0")
    PORT = int(os.getenv("PORT", "5000"))
    DEBUG = _get_bool("DEBUG", False)

    # --- Streaming / processing performance ---
    # Frames wider than this are downscaled before processing/encoding to
    # keep things smooth over a local network with an ESP32-CAM source.
    MAX_STREAM_WIDTH = int(os.getenv("MAX_STREAM_WIDTH", "640"))
    JPEG_QUALITY = int(os.getenv("JPEG_QUALITY", "80"))
    # Target delay between streamed frames (seconds). ~30fps cap.
    FRAME_INTERVAL = float(os.getenv("FRAME_INTERVAL", "0.03"))

    # --- Color isolation tuning ---
    SATURATION_BOOST = float(os.getenv("SATURATION_BOOST", "1.6"))
    MASK_DILATE_ITERATIONS = int(os.getenv("MASK_DILATE_ITERATIONS", "1"))

    # --- Future: Dalton robot control (movement, sensors, voice) ---
    # Placeholders so robot.py has somewhere to read from once the robot's
    # control channel (serial, HTTP, MQTT, etc.) is decided.
    ROBOT_CONTROL_URL = os.getenv("ROBOT_CONTROL_URL", "")
