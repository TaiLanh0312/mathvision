"""Gemini wrapper cho bóc tách hình học (SDK mới: google-genai).

Dùng model FLASH-LITE (không "thinking") để phản hồi nhanh (~2s) cho MỌI đề,
thay vì model pro/thinking (60-90s). Trả về scene-spec dict, hoặc None nếu
chưa cấu hình khoá (caller sẽ fallback mock).
"""
import os
import json

import base64

from prompts import (SYSTEM_PROMPT, USER_TEMPLATE, ONE_SHOT_PROBLEM, ONE_SHOT_JSON,
                     GRAPH_SYSTEM, GRAPH_USER, SOLUTION_SYSTEM, SOLUTION_USER,
                     OCR_SYSTEM, OCR_USER, SOLVE_SYSTEM, SOLVE_USER,
                     LATEX_SYSTEM, LATEX_USER)

try:  # SDK mới, hỗ trợ tắt thinking + nhanh
    from google import genai
    from google.genai import types
except ImportError:  # pragma: no cover
    genai = None
    types = None


def is_configured() -> bool:
    return bool(os.getenv("GEMINI_API_KEY")) and genai is not None


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
    model = os.getenv("GEMINI_MODEL", "gemini-flash-lite-latest")

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
            max_output_tokens=8192,
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


def _text_json(system: str, user: str, max_tokens: int = 4096) -> dict | None:
    """Gọi Gemini chỉ với văn bản, trả JSON."""
    if not is_configured():
        return None
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    model = os.getenv("GEMINI_MODEL", "gemini-flash-lite-latest")
    resp = client.models.generate_content(
        model=model, contents=user,
        config=types.GenerateContentConfig(
            system_instruction=system, response_mime_type="application/json",
            temperature=0.2, max_output_tokens=max_tokens,
        ),
    )
    return _extract_json(resp.text)


def solve_detailed(problem: str) -> dict | None:
    return _text_json(SOLVE_SYSTEM, SOLVE_USER.format(problem=problem))
