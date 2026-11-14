"""
A single, shared connection to Dalton's ESP32-CAM stream.

Design goals (see project README for details):
  * Only ONE connection is ever opened to the ESP32-CAM, no matter how many
    browser tabs are watching /video_feed.
  * A background thread continuously reads frames so the video endpoint is
    never blocked waiting on the (potentially slow/laggy) ESP32-CAM.
  * If the stream drops or was never reachable, it retries on a delay
    instead of crashing the backend.
"""

import threading
import time

import cv2

from backend.config import Config


class CameraStream:
    def __init__(self, url=None, reconnect_delay=None):
        self.url = url or Config.ESP32_STREAM_URL
        self.reconnect_delay = Config.RECONNECT_DELAY if reconnect_delay is None else reconnect_delay

        self._cap = None
        self._frame = None
        self._lock = threading.Lock()
        self._running = False
        self._connected = False
        self._thread = None

    # ---- lifecycle -----------------------------------------------------

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True, name="esp32cam-reader")
        self._thread.start()

    def stop(self):
        self._running = False
        if self._cap is not None:
            self._cap.release()
            self._cap = None

    # ---- configuration ---------------------------------------------------

    def update_url(self, url):
        """Swap the stream source at runtime (e.g. after a config change)."""
        with self._lock:
            self.url = url
            self._connected = False
        if self._cap is not None:
            self._cap.release()
            self._cap = None

    # ---- internals -------------------------------------------------------

    def _connect(self):
        try:
            if self._cap is not None:
                self._cap.release()
            cap = cv2.VideoCapture(self.url)
            # Keep the internal buffer tiny so we always read the freshest
            # frame rather than falling behind on a laggy connection.
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            self._cap = cap
            self._connected = cap.isOpened()
        except Exception:
            self._connected = False
        return self._connected

    def _run(self):
        self._connect()
        while self._running:
            if not self._connected:
                time.sleep(self.reconnect_delay)
                self._connect()
                continue

            try:
                ok, frame = self._cap.read()
            except Exception:
                ok, frame = False, None

            if not ok or frame is None:
                self._connected = False
                continue

            with self._lock:
                self._frame = frame

    # ---- public reads ------------------------------------------------------

    def get_frame(self):
        with self._lock:
            return None if self._frame is None else self._frame.copy()

    def is_connected(self):
        return self._connected


# A single shared instance used by the whole app — routes.py imports this
# rather than constructing its own CameraStream, so there is only ever one
# connection to the ESP32-CAM regardless of how many clients are watching.
camera = CameraStream()
