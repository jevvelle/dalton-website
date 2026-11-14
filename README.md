# Project Dalton

An assistive tool for color vision deficiency, with a live color-isolation
feed from Dalton — a physical robot using an ESP32-CAM.

This repo pairs a static frontend (HTML/CSS/JS) with a Python (Flask +
OpenCV + NumPy) backend. **All color isolation image processing runs in
Python**, not in the browser.

## Project structure

```
project/
├── app.py                   # Flask entrypoint — serves the frontend + API
├── requirements.txt
├── .env.example
├── .gitignore
├── backend/
│   ├── config.py             # Reads all settings from environment/.env
│   ├── camera.py              # Shared ESP32-CAM connection + reconnection
│   ├── color_processor.py      # HSV color isolation (OpenCV/NumPy)
│   ├── routes.py               # /video_feed, /set_color, /status, /robot/*
│   └── robot.py                 # Placeholder for future Dalton robot control
├── css/
│   └── styles.css
├── js/
│   ├── app.js                 # Page/tab router, shared upload dispatcher
│   ├── colorAssist.js          # AI vision simulation, color picker, mixing
│   ├── isolation.js             # Talks to the Flask backend for isolation
│   └── ishihara.js              # Ishihara-style screening test
└── index.html
```

## What changed from the old version

- The old **Color Isolation** tab used to run entirely in JavaScript on an
  uploaded photo (matching pixel colors against a fixed palette in
  `colorAssist.js`). That logic has been **removed**.
- Color Isolation is now a **live feed from Dalton's ESP32-CAM**, processed
  in Python using real HSV color ranges and OpenCV. The tab shows the
  backend's live stream and lets you pick which color stays vibrant.
- **AI Color Assist** (vision-type simulation), the **Color Picker**
  (eyedropper), **Activities** (color mixing), and the **Ishihara Test**
  are unchanged — they still run client-side on uploaded photos/live
  webcam, since only the isolation feature needed a backend.

## Installation

1. Create and activate a virtual environment:

   ```bash
   python -m venv venv
   ```

   - macOS/Linux: `source venv/bin/activate`
   - Windows: `venv\Scripts\activate`

2. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

3. Copy the example environment file and fill in your ESP32-CAM's address:

   ```bash
   cp .env.example .env
   ```

   Edit `.env`:

   ```
   ESP32_STREAM_URL=http://YOUR_ESP32_IP:81/stream
   ```

4. Run the app:

   ```bash
   python app.py
   ```

5. Open **http://localhost:5000** in your browser and go to the **Color
   Isolation** tab.

## Connecting the ESP32-CAM

1. Flash your ESP32-CAM with firmware that serves an MJPEG stream (the
   common Arducam/Espressif `CameraWebServer` example works — it serves the
   stream at `http://<device-ip>:81/stream` by default).
2. Power on the ESP32-CAM and make sure it's on the **same network** as the
   computer running `app.py`.
3. **Find its IP address** one of these ways:
   - Open your router's admin page and look at connected devices.
   - Watch the ESP32-CAM's Serial Monitor output when it boots — most
     example firmware prints its IP address there.
   - Use a network scanner (e.g. `arp -a` on the same network, or an app
     like Fing).
4. Put that IP into `.env`:
   ```
   ESP32_STREAM_URL=http://192.168.1.42:81/stream
   ```
5. Restart `python app.py`. The Color Isolation tab's status panel will
   show **Connected** once the backend successfully opens the stream.

## How the frontend and backend communicate

```
Browser (index.html + js/isolation.js)
     │
     │  <img src="/video_feed">           GET  /video_feed   → MJPEG stream
     │  fetch("/set_color", {color})      POST /set_color    → switch mode
     │  fetch("/status")                  GET  /status       → connection info
     ▼
Flask backend (app.py, backend/routes.py)
     │
     │  one shared background thread reads frames continuously
     ▼
backend/camera.py  →  ESP32-CAM (Dalton) MJPEG stream
     │
     ▼
backend/color_processor.py  →  HSV mask, saturation boost, grayscale composite
```

Only **one** connection is ever opened to the ESP32-CAM (in
`backend/camera.py`), no matter how many browser tabs are viewing the
stream — every viewer shares the same processed frames.

### API reference

| Endpoint         | Method | Body                                | Description                                    |
|------------------|--------|--------------------------------------|-------------------------------------------------|
| `/video_feed`     | GET    | —                                     | MJPEG stream, processed per the active color mode |
| `/set_color`       | POST   | `{"color": "red"}`                    | Switch isolation mode. Valid: `red`, `yellow`, `green`, `blue`, `orange`, `purple`, `normal` |
| `/status`           | GET    | —                                     | `{"connected": bool, "color": str, "stream_url": str}` |
| `/robot/status`      | GET    | —                                     | Placeholder for future robot telemetry |
| `/robot/move`         | POST   | —                                     | Placeholder for future movement commands (returns 501) |

## Color isolation logic (backend/color_processor.py)

For a selected color:

1. Convert the frame from BGR → HSV.
2. Build a mask from the color's HSV range (red combines two ranges that
   wrap around hue 0).
3. Clean the mask with a morphological close, then dilate it slightly.
4. Boost saturation within the masked region.
5. Convert everything outside the mask to grayscale.
6. Composite: vibrant color where the mask matches, grayscale elsewhere.

`normal` mode (or no color selected) skips all of this and passes the frame
through unchanged.

## Performance notes

- Frames are downscaled to `MAX_STREAM_WIDTH` (default 640px) before
  processing and encoding.
- The ESP32-CAM capture buffer is kept at size 1 so the stream doesn't fall
  behind on a slow connection.
- A single background thread reads frames continuously; `/video_feed`
  requests just re-encode and stream the latest frame instead of each
  opening their own capture.
- If the ESP32-CAM disconnects, the backend retries on a delay
  (`RECONNECT_DELAY` in `.env`) instead of crashing, and the stream shows a
  clear "disconnected" placeholder frame instead of a broken image.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Isolation tab shows "Can't reach the video stream" | `app.py` isn't running, or something else is using port 5000. |
| Status panel says "Backend: Unreachable" | Same as above — confirm `python app.py` is running and check its terminal for errors. |
| Status panel says "ESP32-CAM: Disconnected — retrying…" | Check the ESP32-CAM is powered on, on the same network, and that `ESP32_STREAM_URL` in `.env` matches its current IP (IPs can change on DHCP networks — consider setting a static IP/DHCP reservation for Dalton). |
| Stream is very laggy | Lower `MAX_STREAM_WIDTH` or `JPEG_QUALITY` in `.env`, or check Wi-Fi signal strength to the ESP32-CAM. |
| Colors aren't isolating well under your lighting | Adjust the HSV ranges in `backend/color_processor.py` — lighting conditions shift hue/saturation/value quite a bit. |

## Security

- No IPs, credentials, or secrets are hardcoded in the frontend JavaScript
  or committed to the repo — everything sensitive lives in `.env`, which is
  git-ignored (see `.gitignore`).
- `.env.example` documents every variable with a placeholder value so the
  project is easy to configure without exposing real values.

## Limitations & assumptions

- Assumes the ESP32-CAM serves a standard MJPEG stream that OpenCV's
  `cv2.VideoCapture` can open directly (true for the common
  `CameraWebServer` example firmware).
- Robot movement, sensors, and voice interaction are **not implemented** —
  `backend/robot.py` and the `/robot/*` routes are placeholders so the
  frontend and firmware can be developed against a stable shape before
  those features exist.
- The app runs as a single Flask process handling one Dalton unit / one
  ESP32-CAM stream at a time; it isn't designed for multiple robots yet.
- Flask's built-in development server is used here for simplicity; for a
  long-running deployment consider a production WSGI server.
