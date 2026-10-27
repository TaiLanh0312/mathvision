"""MathVision PRO — FastAPI backend (Phase 3).

- Serves the static thin-client frontend (so ES modules load over http,
  no file:// CORS issue).
- POST /api/geometry/parse : turn a THPT problem into a validated 3D scene spec via Gemini.
- POST /api/geometry/solve : solve, then independently review the complete problem via Gemini.

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
                           ocr_problem, ocr_latex, solve_detailed, verify_detailed,
                           repair_geometry, repair_detailed_solution, is_configured)
from geometry_validation import validate_scene_spec, validate_solution_spec
from special_cases import exact_scene, exact_solution
from samples import (mock_grade, mock_solution, mock_ocr,
                     mock_latex)

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
    constraints: list[dict] | None = None  # quan hệ hình học đã kiểm tra từ scene


@app.get("/api/health")
async def health():
    return {"ok": True, "gemini": is_configured()}


@app.post("/api/geometry/parse")
async def parse(req: ParseRequest):
    problem = (req.problem or "").strip()
    if not problem:
        return JSONResponse({"error": "Đề bài trống."}, status_code=400)
    try:
        exact = exact_scene(problem)
        if exact is not None and not validate_scene_spec(exact, problem):
            return exact
        spec = parse_geometry(problem)
        if spec is None:
            return JSONResponse({"error": "Chưa cấu hình Gemini. Không tạo hình mẫu thay cho đề của bạn."}, status_code=503)
        errors = validate_scene_spec(spec, problem)
        if errors:
            repaired = repair_geometry(problem, spec, errors)
            if repaired is not None:
                spec = repaired
                errors = validate_scene_spec(spec, problem)
        if errors:
            return JSONResponse({"error": "Scene AI trả về không hợp lệ.", "details": errors}, status_code=422)
        if spec.get("unresolved"):
            return JSONResponse({
                "error": "Đề còn thiếu hoặc mâu thuẫn dữ kiện; chưa thể khẳng định hình này đúng.",
                "unresolved": spec["unresolved"],
            }, status_code=422)
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
        exact = exact_solution(problem)
        if exact is not None and not validate_solution_spec(exact, req.points, require_status=True, problem=problem):
            return exact
        result = solve_detailed(problem, req.points, req.constraints)
        if result is None:
            return JSONResponse({"error": "Chưa cấu hình Gemini; không có lời giải mẫu thay cho đề này."}, status_code=503)
        errors = validate_solution_spec(result, req.points, problem=problem)
        if errors:
            repaired = repair_detailed_solution(problem, req.points, req.constraints, result, errors)
            if repaired is not None:
                result = repaired
                errors = validate_solution_spec(result, req.points, problem=problem)
        if errors:
            return JSONResponse({"error": "Lời giải AI còn thiếu hoặc sai cấu trúc sau khi tự sửa.", "details": errors}, status_code=422)
        reviewed = verify_detailed(problem, req.points, req.constraints, result)
        if reviewed is None:
            return JSONResponse({"error": "AI kiểm tra độc lập không phản hồi; lời giải chưa được xác nhận."}, status_code=503)
        errors = validate_solution_spec(reviewed, req.points, require_status=True, problem=problem)
        if errors:
            return JSONResponse({"error": "Lời giải sau kiểm tra có cấu trúc không hợp lệ.", "details": errors}, status_code=422)
        reviewed["source"] = "gemini-independent-review"
        return reviewed
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
