"""
Gemini Vision & Text-To-Speech Processing Pipeline for Project Dalton.
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

# Exact active models verified for your API key (fastest first)
FALLBACK_MODELS = [
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.6-flash',
    'gemini-3.7-flash',
]

client = genai.Client(api_key=Config.GEMINI_API_KEY)
speech_queue = queue.Queue()


def tts_worker():
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
    if text:
        speech_queue.put(text)


class DetectedObject(BaseModel):
    label: str
    box_2d: list[int]
    color_name: str
    color_hex: str
    relative_position: str
    cvd_explanation: str


class ImageAnalysisResponse(BaseModel):
    objects: list[DetectedObject]


def query_gemini_with_fallback(image_bytes, prompt, use_schema=True):
    for model_name in FALLBACK_MODELS:
        for attempt in range(1, 3):
            try:
                contents = [prompt]
                if image_bytes:
                    contents.insert(0, types.Part.from_bytes(data=image_bytes, mime_type='image/jpeg'))

                config_kwargs = {"temperature": 0.2}
                if use_schema and image_bytes:
                    config_kwargs["response_mime_type"] = "application/json"
                    config_kwargs["response_schema"] = ImageAnalysisResponse
                else:
                    config_kwargs["max_output_tokens"] = 100

                return client.models.generate_content(
                    model=model_name,
                    contents=contents,
                    config=types.GenerateContentConfig(**config_kwargs),
                )
            except APIError as e:
                if "503" in str(e):
                    time.sleep(0.5)
                else:
                    print(f"API Error on {model_name}: {e}")
                    break
            except Exception as e:
                print(f"Error on {model_name}: {e}")
                break
    return None


def analyze_frame(frame, trigger_speech=True):
    if frame is None:
        return {"error": "No frame captured from camera", "objects": []}

    try:
        h, w = frame.shape[:2]
        small_frame = cv2.resize(frame, (400, int(400 * h / w)))
        ok, encoded_image = cv2.imencode('.jpg', small_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
        if not ok:
            return {"error": "Failed to encode frame", "objects": []}

        prompt = (
            "Identify primary objects in this image for a student with Color Vision Deficiency. "
            "Provide normalized 0-1000 box_2d, primary color_name, color_hex, relative_position, "
            "and a concise 1-sentence cvd_explanation."
        )
        response = query_gemini_with_fallback(encoded_image.tobytes(), prompt, use_schema=True)
        if not response or not response.text:
            return {"error": "Gemini API unavailable", "objects": []}

        data = json.loads(response.text)
        detected_objects = data.get("objects", [])
        full_speech = " ".join(
            obj.get('cvd_explanation', f"The {obj.get('label')} is {obj.get('color_name')}.")
            for obj in detected_objects
        )
        if full_speech and trigger_speech:
            speak_text(full_speech)

        return {"status": "success", "objects": detected_objects, "speech": full_speech}
    except Exception as e:
        print(f"Scan error: {e}")
        return {"error": str(e), "objects": []}


def analyze_frame_with_prompt(frame, user_prompt):
    try:
        image_bytes = None
        if frame is not None:
            h, w = frame.shape[:2]
            small = cv2.resize(frame, (400, int(400 * h / w)))
            ok, encoded = cv2.imencode(".jpg", small, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
            if ok:
                image_bytes = encoded.tobytes()

        prompt = (
            "You are Dalton AI, an assistive color guide for students with color vision deficiency. "
            "Answer in 1-2 short, clear sentences suitable for text-to-speech. "
            f"User question: {user_prompt}"
        )
        response = query_gemini_with_fallback(image_bytes, prompt, use_schema=False)
        reply_text = (response.text if response and response.text else "Unable to analyze the frame right now.").strip()
        speak_text(reply_text)
        return {"speech": reply_text}
    except Exception as e:
        print(f"Chat error: {e}")
        return {"speech": "Error communicating with Dalton AI."}