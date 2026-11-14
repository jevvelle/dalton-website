"""
Central configuration for the Project Dalton backend.

Everything here is read from environment variables (optionally loaded from
a local .env file via python-dotenv), so no IPs, ports, or other
environment-specific values are hardcoded in the application code.
"""

import os
from dotenv import load_dotenv

# Loads variables from a .env file in the project root, if one exists.
load_dotenv()


def _get_bool(name, default=False):
    val = os.getenv(name)
    if val is None:
        return default
    return val.strip().lower() in ("1", "true", "yes", "on")


class Config:
    # --- Gemini AI API Setup ---
    # Reads from .env file, or uses fallback key if .env is missing/overwritten
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") 

    # --- ESP32-CAM / Dalton robot camera ---
    ESP32_STREAM_URL = os.getenv("ESP32_STREAM_URL", "http://10.76.45.60/")

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
    ROBOT_CONTROL_URL = os.getenv("ROBOT_CONTROL_URL", "")