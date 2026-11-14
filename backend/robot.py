import json
import queue
import threading
import sys
import cv2
from google import genai
from google.genai import types
from google.genai.errors import APIError
from pydantic import BaseModel
from backend.config import Config

# --- Gemini API Client Setup ---
client = genai.Client(api_key=Config.GEMINI_API_KEY)
is_processing = False

# --- Active Priority Fallback Models ---
FALLBACK_MODELS = [
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.6-flash',
    'gemini-3.7-flash'
]

# --- Thread-Safe Native Windows Speech Queue ---
speech_queue = queue.Queue()

def tts_worker():
    """Isolated background worker thread using Windows Native SAPI Voice (Zero-Freeze)."""
    # Initialize COM library for this background thread
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
                speaker.Rate = 1  # Standard speaking speed
                speaker.Speak(text)
                pythoncom.CoUninitialize()
            else:
                # Fallback to pyttsx3 with thread-isolated engine re-init
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

# Launch persistent daemon worker thread
tts_thread = threading.Thread(target=tts_worker, daemon=True)
tts_thread.start()

def speak_text(text):
    """Enqueue speech requests safely without locking the Flask or vision loops."""
    if text:
        speech_queue.put(text)

# --- Pydantic Schemas ---
class DetectedObject(BaseModel):
    label: str
    box_2d: list[int]  # [y_min, x_min, y_max, x_max] normalized 0-1000
    color_name: str
    color_hex: str
    relative_position: str
    cvd_explanation: str  # Contextual guidance tailored for CVD users

class ImageAnalysisResponse(BaseModel):
    objects: list[DetectedObject]

# --- AI Vision Processing Functions ---
def query_gemini_with_fallback(image_bytes, prompt):
    """Queries active Gemini models with automatic fallback support."""
    for model_name in FALLBACK_MODELS:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=[
                    types.Part.from_bytes(data=image_bytes, mime_type='image/jpeg'),
                    prompt
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=ImageAnalysisResponse,
                ),
            )
            return response
        except APIError:
            continue
        except Exception:
            continue
    return None

def analyze_frame(frame, trigger_speech=True):
    """Encodes frame, queries Gemini API, and enqueues speech output."""
    global is_processing
    is_processing = True
    try:
        if frame is None:
            return {"status": "error", "message": "Frame is empty"}

        success, encoded_image = cv2.imencode('.jpg', frame)
        if not success:
            return {"status": "error", "message": "Encoding failed"}

        image_bytes = encoded_image.tobytes()
        prompt = """
        Identify key objects in this image for Color Vision Deficiency (CVD) users.
        Extract bounding boxes [y_min, x_min, y_max, x_max] (0-1000), primary color names,
        hex codes, relative positions, and a short CVD guidance sentence.
        """

        response = query_gemini_with_fallback(image_bytes, prompt)
        if not response or not response.text:
            msg = "Server busy. Please try scanning again."
            if trigger_speech:
                speak_text(msg)
            return {"status": "error", "message": msg}

        data = json.loads(response.text)
        objects = data.get("objects", [])

        spoken_sentences = []
        for obj in objects:
            explanation = obj.get('cvd_explanation', f"The {obj.get('label')} on the {obj.get('relative_position')} is {obj.get('color_name')}.")
            spoken_sentences.append(explanation)

        full_speech = " ".join(spoken_sentences)
        if trigger_speech and full_speech:
            speak_text(full_speech)

        return {"status": "success", "objects": objects, "speech": full_speech}
    finally:
        is_processing = False

def analyze_frame_with_prompt(frame, user_prompt):
    """Processes user query against image, speaks aloud, and returns speech text."""
    if frame is None:
        text = "No image frame is currently available."
        speak_text(text)
        return {"speech": text}
    
    success, encoded_image = cv2.imencode('.jpg', frame)
    if not success:
        text = "Unable to process the image frame."
        speak_text(text)
        return {"speech": text}

    image_bytes = encoded_image.tobytes()
    
    response = None
    for model_name in FALLBACK_MODELS:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=[
                    types.Part.from_bytes(data=image_bytes, mime_type='image/jpeg'),
                    f'You are Dalton AI assisting a user with color vision deficiency. Answer concisely in 1-2 sentences: "{user_prompt}"'
                ]
            )
            if response and response.text:
                break
        except Exception:
            continue

    reply_text = response.text.strip() if (response and response.text) else "Unable to analyze the image frame right now."
    
    # Trigger speech audio
    speak_text(reply_text)
    
    # Return speech text for frontend UI
    return {"speech": reply_text}