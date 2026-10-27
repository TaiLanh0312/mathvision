"""Gemini wrapper cho bóc tách hình học (SDK mới: google-genai).

Dùng model FLASH-LITE (không "thinking") để phản hồi nhanh (~2s) cho MỌI đề,
thay vì model pro/thinking (60-90s). Trả về scene-spec dict, hoặc None nếu
chưa cấu hình khoá (caller sẽ fallback mock).
"""
import os
import json
import re
import unicodedata

import base64

from prompts import (SYSTEM_PROMPT, USER_TEMPLATE, ONE_SHOT_PROBLEM, ONE_SHOT_JSON,
                     GRAPH_SYSTEM, GRAPH_USER, SOLUTION_SYSTEM, SOLUTION_USER,
                     OCR_SYSTEM, OCR_USER, SOLVE_SYSTEM, SOLVE_USER,
                     VERIFY_SOLVE_SYSTEM, VERIFY_SOLVE_USER,
                     LATEX_SYSTEM, LATEX_USER, REPAIR_SCENE_SYSTEM, REPAIR_SCENE_USER,
                     REPAIR_SOLUTION_SYSTEM, REPAIR_SOLUTION_USER)

try:  # SDK mới, hỗ trợ tắt thinking + nhanh
    from google import genai
    from google.genai import types
except ImportError:  # pragma: no cover
    genai = None
    types = None


def is_configured() -> bool:
    return bool(os.getenv("GEMINI_API_KEY")) and genai is not None


def _reasoning_level(problem: str) -> str:
    """Use more reasoning for long, multi-part, or proof-heavy geometry prompts."""
    text = unicodedata.normalize("NFD", (problem or "").lower().replace("đ", "d"))
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    parts = re.findall(r"(?<![a-z0-9])([a-z])\)\s*\S", text)
    hard_markers = (
        "thiet dien", "khoang cach", "chung minh", "hinh chieu", "dong phang",
        "vuong goc", "song song", "mat phang", "goc giua", "hsg", "dinh ly",
    )
    marker_count = sum(text.count(marker) for marker in hard_markers)
    return "high" if len(text) > 450 or len(parts) > 1 or marker_count >= 2 else "medium"


def _extract_json(text: str) -> dict:
    """Gemini đôi khi bọc JSON trong ```fences dù đã dặn."""
    t = (text or "").strip()
    if t.startswith("```"):
        t = t.split("```", 2)[1]
        if t.lower().startswith("json"):
            t = t[4:]
        t = t.strip()
    start, end = t.find("{"), t.rfind("}")
    if start != -1 and end != -1:
        t = t[start:end + 1]
    return json.loads(t)


def parse_geometry(problem: str) -> dict | None:
    """Gọi Gemini flash-lite -> scene-spec dict. None nếu chưa cấu hình."""
    if not is_configured():
        return None

    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    model = os.getenv("GEMINI_GEOMETRY_MODEL") or "gemini-3.8-flash"

    # One-shot: ví dụ chuẩn (user->model) rồi tới đề thật.
    contents = [
        types.Content(role="user", parts=[types.Part(text=USER_TEMPLATE.format(problem=ONE_SHOT_PROBLEM))]),
        types.Content(role="model", parts=[types.Part(text=ONE_SHOT_JSON)]),
        types.Content(role="user", parts=[types.Part(text=USER_TEMPLATE.format(problem=problem))]),
    ]
    resp = client.models.generate_content(
        model=model,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            response_mime_type="application/json",
            temperature=0.15,
            max_output_tokens=16384,
            thinking_config=types.ThinkingConfig(thinking_level=_reasoning_level(problem)),
        ),
    )
    return _extract_json(resp.text)


def _vision_json(image_data_url: str, system: str, user: str, max_tokens: int = 4096) -> dict | None:
    """Gọi Gemini Vision với 1 ảnh + prompt, trả JSON. None nếu chưa cấu hình."""
    if not is_configured():
        return None
    header, _, b64 = (image_data_url or "").partition(",")
    if not b64:
        b64 = header  # không có tiền tố data:
    mime = "image/png" if "image/png" in header else "image/jpeg"
    img_bytes = base64.b64decode(b64)

    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    model = os.getenv("GEMINI_MODEL", "gemini-flash-lite-latest")
    contents = [types.Content(role="user", parts=[
        types.Part(text=user),
        types.Part.from_bytes(data=img_bytes, mime_type=mime),
    ])]
    resp = client.models.generate_content(
        model=model, contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=system, response_mime_type="application/json",
            temperature=0.2, max_output_tokens=max_tokens,
        ),
    )
    return _extract_json(resp.text)


def grade_graph(image_data_url: str, problem: str) -> dict | None:
    return _vision_json(image_data_url, GRAPH_SYSTEM, GRAPH_USER.format(problem=problem or "(không nêu)"))


def grade_solution(image_data_url: str, problem: str) -> dict | None:
    return _vision_json(image_data_url, SOLUTION_SYSTEM, SOLUTION_USER.format(problem=problem or "(không nêu)"))


def ocr_problem(image_data_url: str) -> dict | None:
    return _vision_json(image_data_url, OCR_SYSTEM, OCR_USER, max_tokens=1024)


def ocr_latex(image_data_url: str) -> dict | None:
    return _vision_json(image_data_url, LATEX_SYSTEM, LATEX_USER, max_tokens=2048)


def _text_json(system: str, user: str, max_tokens: int = 8192,
               thinking_level: str = "high") -> dict | None:
    """Gọi Gemini chỉ với văn bản, trả JSON."""
    if not is_configured():
        return None
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    model = os.getenv("GEMINI_REASONING_MODEL") or "gemini-3.8-flash"
    resp = client.models.generate_content(
        model=model, contents=user,
        config=types.GenerateContentConfig(
            system_instruction=system, response_mime_type="application/json",
            temperature=0.1, max_output_tokens=max_tokens,
            thinking_config=types.ThinkingConfig(thinking_level=thinking_level),
        ),
    )
    return _extract_json(resp.text)


def repair_geometry(problem: str, candidate: dict, errors: list[str]) -> dict | None:
    """Ask Gemini to repair a structurally rejected scene once."""
    user = REPAIR_SCENE_USER.format(
        problem=problem,
        candidate=json.dumps(candidate, ensure_ascii=False),
        errors=json.dumps(errors, ensure_ascii=False),
    )
    return _text_json(REPAIR_SCENE_SYSTEM, user, max_tokens=16384)


def solve_detailed(problem: str, points: dict | None = None, constraints: list | None = None) -> dict | None:
    pts = json.dumps(points or {}, ensure_ascii=False)
    rels = json.dumps(constraints or [], ensure_ascii=False)
    level = _reasoning_level(problem)
    return _text_json(SOLVE_SYSTEM, SOLVE_USER.format(problem=problem, points=pts, constraints=rels),
                      max_tokens=16384 if level == "high" else 8192, thinking_level=level)


def verify_detailed(problem: str, points: dict | None, constraints: list | None, candidate: dict) -> dict | None:
    """Use a separate model turn to re-solve and correct the proposed answer."""
    pts = json.dumps(points or {}, ensure_ascii=False)
    rels = json.dumps(constraints or [], ensure_ascii=False)
    draft = json.dumps(candidate or {}, ensure_ascii=False)
    level = _reasoning_level(problem)
    return _text_json(VERIFY_SOLVE_SYSTEM,
                      VERIFY_SOLVE_USER.format(problem=problem, points=pts, constraints=rels, candidate=draft),
                      max_tokens=16384 if level == "high" else 8192, thinking_level=level)


def repair_detailed_solution(problem: str, points: dict | None, constraints: list | None,
                             candidate: dict, errors: list[str]) -> dict | None:
    """Repair missing answer/steps/drawing structure before independent review."""
    user = REPAIR_SOLUTION_USER.format(
        problem=problem,
        points=json.dumps(points or {}, ensure_ascii=False),
        constraints=json.dumps(constraints or [], ensure_ascii=False),
        candidate=json.dumps(candidate or {}, ensure_ascii=False),
        errors=json.dumps(errors, ensure_ascii=False),
    )
    return _text_json(REPAIR_SOLUTION_SYSTEM, user, max_tokens=16384)
