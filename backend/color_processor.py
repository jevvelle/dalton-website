"""
Color isolation image processing for Project Dalton.

This module replaces the old browser-side (colorAssist.js) color isolation
entirely. Given a BGR frame (as OpenCV reads it) and a color name, it:

  1. Converts the frame to HSV.
  2. Builds a mask for the requested color's HSV range(s) (red uses two
     ranges that wrap around hue 0/180 and are combined).
  3. Cleans the mask with a morphological close, then dilates it slightly.
  4. Boosts saturation within the masked region to make the isolated color
     pop.
  5. Converts everything outside the mask to grayscale.
  6. Composites the vibrant masked region back over the grayscale
     background.

"normal" (or None) mode returns the frame unchanged.
"""

import cv2
import numpy as np

from backend.config import Config

# HSV ranges as specified for Project Dalton. Values are (H: 0-180, S: 0-255,
# V: 0-255) to match OpenCV's HSV convention.
COLOR_RANGES = {
    "red": [
        ((0, 30, 30), (15, 255, 255)),
        ((155, 30, 30), (180, 255, 255)),
    ],
    "yellow": [
        ((12, 30, 30), (42, 255, 255)),
    ],
    "green": [
        ((33, 20, 20), (95, 255, 255)),
    ],
    "blue": [
        ((80, 30, 30), (140, 255, 255)),
    ],
    "orange": [
        ((8, 30, 30), (25, 255, 255)),
    ],
    "purple": [
        ((125, 20, 20), (170, 255, 255)),
    ],
}

# Everything the /set_color endpoint will accept.
VALID_MODES = set(COLOR_RANGES.keys()) | {"normal"}

_KERNEL = np.ones((5, 5), np.uint8)


def _build_mask(hsv_frame, color):
    """Combine all HSV ranges for a color into a single binary mask."""
    ranges = COLOR_RANGES[color]
    mask = None
    for lower, upper in ranges:
        part = cv2.inRange(hsv_frame, np.array(lower, dtype=np.uint8), np.array(upper, dtype=np.uint8))
        mask = part if mask is None else cv2.bitwise_or(mask, part)
    return mask


def isolate_color(frame_bgr, color, saturation_boost=None, dilate_iterations=None):
    """
    Return a BGR frame where `color` stays vibrant and everything else is
    grayscale. Pass color="normal" (or None) to get the frame unchanged.
    """
    if color is None or color == "normal":
        return frame_bgr

    if color not in COLOR_RANGES:
        # Defensive fallback — routes.py validates input before this is
        # ever called, but never silently mis-process an unknown color.
        return frame_bgr

    saturation_boost = Config.SATURATION_BOOST if saturation_boost is None else saturation_boost
    dilate_iterations = Config.MASK_DILATE_ITERATIONS if dilate_iterations is None else dilate_iterations

    hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)
    mask = _build_mask(hsv, color)

    # Clean up noise, then expand the region slightly so isolated shapes
    # aren't left with ragged edges.
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, _KERNEL)
    if dilate_iterations > 0:
        mask = cv2.dilate(mask, _KERNEL, iterations=dilate_iterations)

    # Boost saturation everywhere, then we'll only keep the boosted pixels
    # inside the mask when compositing below.
    hsv_boosted = hsv.astype(np.float32)
    hsv_boosted[..., 1] = np.clip(hsv_boosted[..., 1] * saturation_boost, 0, 255)
    boosted_bgr = cv2.cvtColor(hsv_boosted.astype(np.uint8), cv2.COLOR_HSV2BGR)

    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    gray_bgr = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)

    mask_norm = (mask.astype(np.float32) / 255.0)[..., np.newaxis]  # HxWx1
    result = boosted_bgr.astype(np.float32) * mask_norm + gray_bgr.astype(np.float32) * (1.0 - mask_norm)
    return result.astype(np.uint8)


def resize_for_stream(frame, max_width=None):
    """Downscale a frame for streaming/processing performance, if needed."""
    max_width = Config.MAX_STREAM_WIDTH if max_width is None else max_width
    if not max_width or frame.shape[1] <= max_width:
        return frame
    scale = max_width / frame.shape[1]
    new_size = (max_width, int(frame.shape[0] * scale))
    return cv2.resize(frame, new_size, interpolation=cv2.INTER_AREA)
