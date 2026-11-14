"""
Placeholder module for Dalton robot control (movement, sensors, voice).

Nothing here is wired up yet — this file exists so future robot features
have an obvious, separate home instead of getting bolted onto camera.py,
color_processor.py, or routes.py.

Suggested shape once the robot's control channel is decided (serial over
USB, HTTP to a second ESP32/microcontroller, MQTT, BLE, etc.):

    class RobotController:
        def __init__(self, connection_url=None):
            self.connection_url = connection_url or Config.ROBOT_CONTROL_URL
            self.connected = False

        def connect(self):
            ...

        def move(self, direction, speed=1.0):
            ...

        def read_sensors(self):
            ...

Then backend/routes.py's /robot/* endpoints would call into an instance of
this class the same way they currently call into backend/camera.py's shared
`camera` object.
"""
