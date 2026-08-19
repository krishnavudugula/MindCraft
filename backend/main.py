import os
import json
import traceback
import traceback
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from groq import Groq

ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=ENV_PATH)  # Reads .env file correctly from backend folder

app = FastAPI(title="MindCraft API")

# Serve the frontend directory
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

if FRONTEND_DIR.is_dir():
    @app.get("/")
    async def serve_index():
        return FileResponse(FRONTEND_DIR / "index.html")

    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

groq_error = ""
try:
    groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY", "mock_key"))
except Exception as e:
    groq_client = None
    groq_error = str(e)

from typing import Optional

class GenerateRequest(BaseModel):
    mode: str
    difficulty: str
    type: Optional[str] = "investigate"

class EvaluateRequest(BaseModel):
    transcript: str
    topic_context: dict

@app.post("/api/generate")
async def generate_topic(req: GenerateRequest):
    if not groq_client or groq_client.api_key == "mock_key":
        import os
        actual_key = os.environ.get("GROQ_API_KEY", "")
        # Fallback to mock if no key
        return {
            "status": "success", 
            "data": {
                "title": f"DEBUG: Error: {groq_error}",
                "type": "Concept",
                "category": "Psychology",
                "difficulty": req.difficulty,
                "hint": "The Ben Franklin effect suggests that we like people more after doing them a favor.",
                "speaking_task": "Explain this effect as if you're speaking to someone intelligent who knows nothing about it."
            }
        }

    if req.type == "quickfire":
        mode_instruction = f"Topic Category: {req.mode}\nFocus: Generate a rapid-fire, off-the-cuff speaking prompt specifically about the {req.mode} category."
    else:
        mode_instruction = f"Speaking Mode: {req.mode}\nFocus: Generate a deep-dive prompt that forces the user to perform the '{req.mode}' action."

    prompt = f"""Generate a topic for an interactive speaking gym.
{mode_instruction}
Difficulty: {req.difficulty}

You must return a raw JSON object (and nothing else) with exactly these fields:
- "title": The main prompt or question.
- "type": e.g., "Concept", "Scenario", "Argument"
- "category": e.g., "Psychology", "Leadership", "Philosophy"
- "difficulty": A scale like "Medium", "Hard", "Brutal"
- "hint": A small subtitle giving the user a starting thread of thought.
- "speaking_task": A 1 sentence instruction on what to do when the timer starts.
"""

    try:
        completion = groq_client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[
                {"role": "system", "content": "You are a helpful API that outputs only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.7,
        )
        data = json.loads(completion.choices[0].message.content)
        return {"status": "success", "data": data}
    except Exception as e:
        print(f"Error in /api/generate:")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/evaluate")
async def evaluate_transcript(req: EvaluateRequest):
    if not groq_client or groq_client.api_key == "mock_key":
        return {
            "status": "success",
            "scores": {"clarity": 85, "structure": 80, "vocabulary": 75, "reasoning": 90},
            "feedback": {
                "good": "You established your position early and spoke clearly.",
                "lost": "Your explanation got slightly repetitive towards the end.",
                "next": "Try explaining this in 60 seconds instead of 3 minutes."
            }
        }

    prompt = f"""Evaluate the following speech transcript.
Topic Context: {json.dumps(req.topic_context)}
Transcript: "{req.transcript}"

You must return a raw JSON object (and nothing else) with exactly these fields:
- "scores": An object containing integer scores (0-100) for "clarity", "structure", "vocabulary", and "reasoning".
- "feedback": An object containing 3 short string fields: "good" (what they did well), "lost" (where they lost momentum/struggled), and "next" (a follow up challenge).
"""

    try:
        completion = groq_client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[
                {"role": "system", "content": "You are an expert communication coach that outputs only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
        )
        data = json.loads(completion.choices[0].message.content)
        return {"status": "success", "scores": data.get("scores", {}), "feedback": data.get("feedback", {})}
    except Exception as e:
        print(f"Error in /api/evaluate:")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if FRONTEND_DIR.is_dir():
    # Catch-all: serve frontend files by name (style.css, app.js, etc.)
    @app.get("/{filename:path}")
    async def serve_file(filename: str):
        file_path = FRONTEND_DIR / filename
        if file_path.is_file():
            return FileResponse(file_path)
        raise HTTPException(status_code=404, detail="Not found")
