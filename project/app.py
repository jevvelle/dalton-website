"""
Project Dalton — Flask application entrypoint.

Serves the existing frontend (index.html, css/, js/) and the color-isolation
/ ESP32-CAM backend API from a single process, so there is no CORS setup to
worry about and only one server to run.

Run with:
    python app.py
"""

import os

from flask import Flask, send_from_directory

from backend.camera import camera
from backend.config import Config
from backend.routes import bp

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__, static_folder=None)
app.register_blueprint(bp)


@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/css/<path:filename>")
def css_files(filename):
    return send_from_directory(os.path.join(BASE_DIR, "css"), filename)


@app.route("/js/<path:filename>")
def js_files(filename):
    return send_from_directory(os.path.join(BASE_DIR, "js"), filename)


if __name__ == "__main__":
    # Start the single shared ESP32-CAM reader thread before serving requests.
    camera.start()
    try:
        app.run(host=Config.HOST, port=Config.PORT, debug=Config.DEBUG, threaded=True)
    finally:
        camera.stop()
