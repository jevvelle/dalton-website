"""
A single, shared connection to Project Dalton's ESP32-CAM MJPEG stream.
Parses multipart JPEG frames continuously, prioritizing real-time low latency.
"""

import threading
import time
import urllib.request
import cv2
import numpy as np

from backend.config import Config


class CameraStream:
    def __init__(self, url=None, reconnect_delay=None):
        self.url = url or Config.ESP32_STREAM_URL
        self.reconnect_delay = Config.RECONNECT_DELAY if reconnect_delay is None else reconnect_delay

        self._frame = None
        self._lock = threading.Lock()
        self._running = False
        self._connected = False
        self._thread = None

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True, name="esp32cam-reader")
        self._thread.start()

    def stop(self):
        self._running = False

    def update_url(self, url):
        with self._lock:
            self.url = url
            self._connected = False

    def _run(self):
        while self._running:
            try:
                req = urllib.request.Request(
                    self.url,
                    headers={'User-Agent': 'Mozilla/5.0'}
                )
                stream = urllib.request.urlopen(req, timeout=5)
                bytes_data = b''

                with self._lock:
                    self._connected = True

                while self._running:
                    # 4KB unblocks immediately per frame instead of waiting for 64KB to pile up
                    chunk = stream.read(4096)
                    if not chunk:
                        break
                    bytes_data += chunk

                    # Find the LAST complete JPEG frame in the buffer (Real-time catch-up)
                    a = bytes_data.find(b'\xff\xd8')
                    b = bytes_data.rfind(b'\xff\xd9')

                    if a != -1 and b != -1 and a < b:
                        jpg = bytes_data[a:b+2]
                        bytes_data = bytes_data[b+2:]

                        frame = cv2.imdecode(np.frombuffer(jpg, dtype=np.uint8), cv2.IMREAD_COLOR)
                        if frame is not None:
                            with self._lock:
                                self._frame = frame
                                self._connected = True

                    if len(bytes_data) > 65536:
                        bytes_data = b''

            except Exception:
                with self._lock:
                    self._connected = False
                time.sleep(self.reconnect_delay)

    def get_frame(self):
        with self._lock:
            return None if self._frame is None else self._frame.copy()

    def is_connected(self):
        with self._lock:
            return self._connected


camera = CameraStream()