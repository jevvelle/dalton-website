"""
Project Dalton — Flask application entrypoint.

Serves the existing frontend (index.html, css/, js/) and the color-isolation
/ ESP32-CAM backend API from a single process, with CORS enabled so the
GitHub Pages frontend can also connect over a public HTTPS tunnel.

Run with:
    python app.py
"""

import os

from flask import Flask, send_from_directory
from flask_cors import CORS

from backend.camera import camera
from backend.config import Config
from backend.routes import bp

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__, static_folder=None)

# Enable CORS so your GitHub Pages site can access video feeds and API routes
CORS(app, resources={r"/*": {"origins": "*"}})

app.register_blueprint(bp)


@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/favicon.ico")
def favicon():
    """Serves the favicon or falls back to logo image files in root."""
    if os.path.exists(os.path.join(BASE_DIR, "favicon.ico")):
        return send_from_directory(BASE_DIR, "favicon.ico")
    elif os.path.exists(os.path.join(BASE_DIR, "logo.png")):
        return send_from_directory(BASE_DIR, "logo.png")
    elif os.path.exists(os.path.join(BASE_DIR, "logo.jpg")):
        return send_from_directory(BASE_DIR, "logo.jpg")
    return send_from_directory(BASE_DIR, "index.html"), 404


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
        # Binding to 0.0.0.0 exposes the app to all devices (phones, laptops) on the same Wi-Fi
        host_address = getattr(Config, 'HOST', '0.0.0.0')
        port_number = getattr(Config, 'PORT', 5000)
        debug_mode = getattr(Config, 'DEBUG', True)

        app.run(host=host_address, port=port_number, debug=debug_mode, threaded=True)
    finally:
        camera.stop()