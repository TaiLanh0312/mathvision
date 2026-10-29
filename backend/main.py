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

REPO_ROOT = Path(__file__).resolve().parent.parent
BUILT_FRONTEND_DIR = REPO_ROOT / "www"
FRONTEND_DIR = BUILT_FRONTEND_DIR if BUILT_FRONTEND_DIR.joinpath("index.html").exists() else REPO_ROOT

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
    image: str | None = None  # ảnh đơn (data URL)
    images: list[str] | None = None  # nhiều trang được Google Document Scanner quét


class SolveRequest(BaseModel):
    problem: str
    points: dict | None = None   # {tên: [x,y,z]} các điểm đã có trong hình
    constraints: list[dict] | None = None  # quan hệ hình học đã kiểm tra từ scene
    text_only: bool = False      # vẫn giải khi scene chưa dựng được


def _remove_solution_drawings(result: dict | None) -> dict | None:
    if not isinstance(result, dict):
        return result
    cleaned = dict(result)
    if isinstance(cleaned.get("solution"), list):
        cleaned["solution"] = [
            {**step, "draw": {"points": {}, "segments": [], "dashed": [], "labels": {}}}
            if isinstance(step, dict) else step
            for step in cleaned["solution"]
        ]
    return cleaned


@app.get("/api/health")
async def health():
    return {"ok": True, "gemini": is_configured()}


@app.post("/api/geometry/parse")
def parse(req: ParseRequest):
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
def grade(req: GradeRequest):
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
def grade_sol(req: GradeRequest):
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
def ocr(req: OcrRequest):
    images = req.images or ([req.image] if req.image else [])
    if not images:
        return JSONResponse({"error": "Thiếu ảnh."}, status_code=400)
    if len(images) > 6:
        return JSONResponse({"error": "Chỉ nhận tối đa 6 trang mỗi lần quét."}, status_code=400)
    try:
        result = ocr_problem(images)
        if result is None:
            result = mock_ocr("")
            result["source"] = "mock"
        else:
            result["source"] = "gemini"
        return result
    except Exception as exc:
        return JSONResponse({"error": f"{type(exc).__name__}: {exc}"}, status_code=500)


@app.post("/api/geometry/solve")
def solve(req: SolveRequest):
    problem = (req.problem or "").strip()
    if not problem:
        return JSONResponse({"error": "Đề bài trống."}, status_code=400)
    try:
        if req.text_only:
            points = None
            constraints = None
        else:
            points = req.points
            constraints = req.constraints
        exact = exact_solution(problem)
        if exact is not None:
            exact_result = _remove_solution_drawings(exact) if req.text_only else exact
            if not validate_solution_spec(exact_result, points, require_status=True, problem=problem):
                return exact_result
        result = solve_detailed(problem, points, constraints)
        if result is None:
            return JSONResponse({"error": "Chưa cấu hình Gemini; không có lời giải mẫu thay cho đề này."}, status_code=503)
        if req.text_only:
            result = _remove_solution_drawings(result)
        errors = validate_solution_spec(result, points, problem=problem)
        if errors:
            repaired = repair_detailed_solution(problem, points, constraints, result, errors)
            if repaired is not None:
                result = repaired
                if req.text_only:
                    repaired = _remove_solution_drawings(repaired)
                    result = repaired
                errors = validate_solution_spec(result, points, problem=problem)
        if errors:
            return JSONResponse({"error": "Lời giải AI còn thiếu hoặc sai cấu trúc sau khi tự sửa.", "details": errors}, status_code=422)
        review_error = None
        try:
            reviewed = verify_detailed(problem, points, constraints, result)
        except Exception as exc:
            reviewed = None
            review_error = f"AI kiểm tra độc lập gặp lỗi: {type(exc).__name__}: {exc}"
        if reviewed is None:
            # Preserve the valid first-pass solution. A failed second call means
            # it is unverified, not that the already generated solution vanished.
            reviewed = dict(result)
            reviewed["status"] = "uncertain"
            reviewed["issues"] = [review_error or "AI kiểm tra độc lập không phản hồi; lời giải chưa được xác nhận."]
        if req.text_only:
            reviewed = _remove_solution_drawings(reviewed)
        errors = validate_solution_spec(reviewed, points, require_status=True, problem=problem)
        if errors:
            return JSONResponse({"error": "Lời giải sau kiểm tra có cấu trúc không hợp lệ.", "details": errors}, status_code=422)
        reviewed["source"] = ("gemini-independent-review" if reviewed.get("status") != "uncertain"
                               or not review_error else "gemini-unverified")
        return reviewed
    except Exception as exc:
        return JSONResponse({"error": f"{type(exc).__name__}: {exc}"}, status_code=500)


@app.post("/api/latex/ocr")
def latex_ocr(req: OcrRequest):
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
