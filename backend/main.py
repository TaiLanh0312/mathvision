"""MathVision PRO — FastAPI backend (Phase 3).

- Serves the static thin-client frontend (so ES modules load over http,
  no file:// CORS issue).
- POST /api/geometry/parse : turn a THPT problem into a 3D scene spec
  via Gemini 1.5 Pro, with an offline mock fallback.

Run:
    cd backend
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000
Then open http://localhost:8000
"""
import os
import mimetypes
from pathlib import Path

# Ensure .js is served as a JS module MIME (Windows registry often maps it to text/plain).
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/javascript", ".mjs")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from gemini_client import (parse_geometry, grade_graph, grade_solution,
                           ocr_problem, ocr_latex, solve_detailed, is_configured)
from samples import (mock_scene, mock_grade, mock_solution, mock_ocr,
                     mock_solve, mock_latex)

FRONTEND_DIR = Path(__file__).resolve().parent.parent  # repo root holds index.html

app = FastAPI(title="MathVision PRO API", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ParseRequest(BaseModel):
    problem: str
    image: str | None = None  # reserved: base64 for "Quét ảnh" (Phase later)


class GradeRequest(BaseModel):
    image: str                # data URL (base64) ảnh bài thi
    problem: str | None = ""  # hàm số / đề bài
    mode: str | None = None   # "graph" | "solution"


class OcrRequest(BaseModel):
    image: str                # data URL (base64) ảnh chứa đề bài / công thức


class SolveRequest(BaseModel):
    problem: str
    points: dict | None = None   # {tên: [x,y,z]} các điểm đã có trong hình


@app.get("/api/health")
async def health():
    return {"ok": True, "gemini": is_configured()}


@app.post("/api/geometry/parse")
async def parse(req: ParseRequest):
    problem = (req.problem or "").strip()
    if not problem:
        return JSONResponse({"error": "Đề bài trống."}, status_code=400)
    try:
        spec = parse_geometry(problem)
        if spec is None:
            spec = mock_scene(problem)
            spec["source"] = "mock"
        else:
            spec["source"] = "gemini"
        return spec
    except Exception as exc:  # surface a clean error to the frontend
        return JSONResponse({"error": f"{type(exc).__name__}: {exc}"}, status_code=500)


@app.post("/api/graph/grade")
async def grade(req: GradeRequest):
    if not req.image:
        return JSONResponse({"error": "Thiếu ảnh bài thi."}, status_code=400)
    try:
        result = grade_graph(req.image, req.problem or "")
        if result is None:
            result = mock_grade(req.problem or "")
            result["source"] = "mock"
        else:
            result["source"] = "gemini"
        return result
    except Exception as exc:
        return JSONResponse({"error": f"{type(exc).__name__}: {exc}"}, status_code=500)


@app.post("/api/solution/grade")
async def grade_sol(req: GradeRequest):
    if not req.image:
        return JSONResponse({"error": "Thiếu ảnh bài giải."}, status_code=400)
    try:
        result = grade_solution(req.image, req.problem or "")
        if result is None:
            result = mock_solution(req.problem or "")
            result["source"] = "mock"
        else:
            result["source"] = "gemini"
        return result
    except Exception as exc:
        return JSONResponse({"error": f"{type(exc).__name__}: {exc}"}, status_code=500)


@app.post("/api/ocr")
async def ocr(req: OcrRequest):
    if not req.image:
        return JSONResponse({"error": "Thiếu ảnh."}, status_code=400)
    try:
        result = ocr_problem(req.image)
        if result is None:
            result = mock_ocr("")
            result["source"] = "mock"
        else:
            result["source"] = "gemini"
        return result
    except Exception as exc:
        return JSONResponse({"error": f"{type(exc).__name__}: {exc}"}, status_code=500)


@app.post("/api/geometry/solve")
async def solve(req: SolveRequest):
    problem = (req.problem or "").strip()
    if not problem:
        return JSONResponse({"error": "Đề bài trống."}, status_code=400)
    try:
        result = solve_detailed(problem, req.points)
        if result is None:
            result = mock_solve(problem); result["source"] = "mock"
        else:
            result["source"] = "gemini"
        return result
    except Exception as exc:
        return JSONResponse({"error": f"{type(exc).__name__}: {exc}"}, status_code=500)


@app.post("/api/latex/ocr")
async def latex_ocr(req: OcrRequest):
    if not req.image:
        return JSONResponse({"error": "Thiếu ảnh."}, status_code=400)
    try:
        result = ocr_latex(req.image)
        if result is None:
            result = mock_latex(""); result["source"] = "mock"
        else:
            result["source"] = "gemini"
        return result
    except Exception as exc:
        return JSONResponse({"error": f"{type(exc).__name__}: {exc}"}, status_code=500)


# Static frontend LAST so API routes take precedence.
if FRONTEND_DIR.joinpath("index.html").exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
