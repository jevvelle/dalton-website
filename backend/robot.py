"""
Gemini Vision & Text-To-Speech Processing Pipeline for Project Dalton.
Optimized for low-latency multimodal responses and non-blocking TTS.
"""

import json
import queue
import threading
import time
import cv2
from google import genai
from google.genai import types
from google.genai.errors import APIError
from pydantic import BaseModel
from backend.config import Config

# --- Active Priority Fallback Models (Fastest production models first) ---
FALLBACK_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
]

# Initialize Gemini Client from Config / .env
client = genai.Client(api_key=Config.GEMINI_API_KEY)

# --- Thread-Safe Native Windows Speech Queue ---
speech_queue = queue.Queue()


def tts_worker():
    """Isolated background worker thread using Windows Native SAPI Voice (Zero-Freeze)."""
    try:
        import pythoncom
        import win32com.client
    except ImportError:
        pythoncom = None
        win32com = None

    while True:
        text = speech_queue.get()
        if text is None:
            break
        try:
            if pythoncom and win32com:
                pythoncom.CoInitialize()
                speaker = win32com.client.Dispatch("SAPI.SpVoice")
                speaker.Rate = 1
                speaker.Speak(text)
                pythoncom.CoUninitialize()
            else:
                import pyttsx3
                engine = pyttsx3.init()
                engine.setProperty('rate', 155)
                engine.say(text)
                engine.runAndWait()
                engine.stop()
        except Exception as e:
            print(f"TTS Engine Error: {e}")
        finally:
            speech_queue.task_done()


tts_thread = threading.Thread(target=tts_worker, daemon=True)
tts_thread.start()


def speak_text(text):
    """Enqueue speech requests safely without locking Flask."""
    if text:
        speech_queue.put(text)


# --- Pydantic Response Schemas ---
class DetectedObject(BaseModel):
    label: str
    box_2d: list[int]  # [y_min, x_min, y_max, x_max] normalized 0-1000
    color_name: str
    color_hex: str
    relative_position: str
    cvd_explanation: str


class ImageAnalysisResponse(BaseModel):
    objects: list[DetectedObject]


def query_gemini_with_fallback(image_bytes, prompt, use_schema=True):
    """Queries active Gemini models with fast config and automatic fallback."""
    for model_name in FALLBACK_MODELS:
        for attempt in range(1, 3):
            try:
                contents = [prompt]
                if image_bytes:
                    contents.insert(0, types.Part.from_bytes(data=image_bytes, mime_type='image/jpeg'))

                config_kwargs = {
                    "temperature": 0.2,
                    "thinking_config": types.ThinkingConfig(thinking_budget=0),
                }
                if use_schema and image_bytes:
                    config_kwargs["response_mime_type"] = "application/json"
                    config_kwargs["response_schema"] = ImageAnalysisResponse
                else:
                    config_kwargs["max_output_tokens"] = 90

                response = client.models.generate_content(
                    model=model_name,
                    contents=contents,
                    config=types.GenerateContentConfig(**config_kwargs),
                )
                return response
            except APIError as e:
                if "503" in str(e):
                    time.sleep(0.6)
                else:
                    print(f"API Error on {model_name}: {e}")
                    break
            except Exception as e:
                print(f"Unexpected error on {model_name}: {e}")
                break
    return None


def analyze_frame(frame, trigger_speech=True):
    """Encodes small BGR frame, queries Gemini, speaks results, and returns dictionary."""
    if frame is None:
        return {"error": "No frame captured from camera", "objects": []}

    try:
        h, w = frame.shape[:2]
        small_frame = cv2.resize(frame, (320, int(320 * h / w)))
        success, encoded_image = cv2.imencode('.jpg', small_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 70])

        if not success:
            return {"error": "Failed to encode frame", "objects": []}

        image_bytes = encoded_image.tobytes()

        prompt = """
        Identify primary key objects in this image for a student with Color Vision Deficiency (CVD).
        For every object:
        1. Bounding box coordinates normalized 0-1000: [y_min, x_min, y_max, x_max].
        2. Primary color name and exact hex code.
        3. Relative position (e.g., center, left, right).
        4. cvd_explanation: Brief 1-sentence explanation tailored for a CVD user.
        Keep descriptions concise, direct, and short enough for text-to-speech.
        """

        response = query_gemini_with_fallback(image_bytes, prompt, use_schema=True)

        if not response or not response.text:
            if trigger_speech:
                speak_text("Server busy. Please try again.")
            return {"error": "Gemini API unavailable", "objects": []}

        data = json.loads(response.text)
        detected_objects = data.get("objects", [])

        spoken_sentences = []
        for obj in detected_objects:
            explanation = obj.get('cvd_explanation', f"The {obj.get('label')} is colored {obj.get('color_name')}.")
            spoken_sentences.append(explanation)

        full_speech = " ".join(spoken_sentences)
        if full_speech and trigger_speech:
            speak_text(full_speech)
        elif not full_speech and trigger_speech:
            speak_text("No clear objects detected.")

        return {"status": "success", "objects": detected_objects, "speech": full_speech}

    except Exception as e:
        print(f"Error in analysis pipeline: {e}")
        if trigger_speech:
            speak_text("Error processing scan.")
        return {"error": str(e), "objects": []}


def analyze_frame_with_prompt(frame, user_prompt):
    """Fast multimodal response: small JPEG payload + concise token cap + non-blocking TTS."""
    try:
        image_bytes = None
        if frame is not None:
            h, w = frame.shape[:2]
            small = cv2.resize(frame, (320, int(320 * h / w)))
            ok, encoded = cv2.imencode(".jpg", small, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
            if ok:
                image_bytes = encoded.tobytes()

        if image_bytes is None:
            prompt = f"You are Dalton AI for color-blind students. Answer in 1-2 short sentences: {user_prompt}"
        else:
            prompt = (
                "You are Dalton AI, an assistive color guide for students with color vision deficiency. "
                "Answer in 1-2 clear, concise sentences suitable for text-to-speech. "
                "If it's an uncolored drawing, state what colors items SHOULD be. "
                "If it's a real scene, state the objects and their visible colors. "
                f"User question: {user_prompt}"
            )

        response = query_gemini_with_fallback(image_bytes, prompt, use_schema=False)
        reply_text = (response.text or "Unable to analyze the image frame right now.").strip()

        speak_text(reply_text)
        return {"speech": reply_text}
    except Exception as e:
        print(f"Chat error: {e}")
        return {"speech": "Error communicating with Dalton AI."}