"""Offline fallback scene (used when GEMINI_API_KEY is not configured).

Mirrors geometry3d.js samplePyramid() so the whole pipeline is demoable
without an API key. Derived points (H, M, N, O) computed with real vector math.
"""
import math


def _mock_pyramid() -> dict:
    a = 2.4
    h = a * math.sqrt(2)
    P = {"A": [0, 0, 0], "B": [a, 0, 0], "C": [a, a, 0], "D": [0, a, 0], "S": [0, 0, h]}

    def sub(u, v): return [u[0]-v[0], u[1]-v[1], u[2]-v[2]]
    def dot(u, v): return u[0]*v[0] + u[1]*v[1] + u[2]*v[2]
    def add(u, v, t): return [u[0]+v[0]*t, u[1]+v[1]*t, u[2]+v[2]*t]

    n = sub(P["C"], P["S"])  # plane normal = SC

    def foot(frm, to):
        d = sub(to, frm)
        t = dot(sub(P["A"], frm), n) / dot(d, n)
        return add(frm, d, t)

    P["H"] = foot(P["S"], P["C"])
    P["M"] = foot(P["S"], P["B"])
    P["N"] = foot(P["S"], P["D"])
    P["O"] = [(P["A"][0]+P["C"][0])/2, (P["A"][1]+P["C"][1])/2, (P["A"][2]+P["C"][2])/2]
    P = {k: [round(c, 4) for c in v] for k, v in P.items()}

    return {
        "title": "Chóp S.ABCD", "meta": "Oxyz [A = Gốc]",
        "points": P,
        "solidEdges": [["A", "B"], ["B", "C"], ["S", "A"], ["S", "B"], ["S", "C"]],
        "dashedEdges": [["C", "D"], ["D", "A"], ["S", "D"]],
        "faces": [["A", "B", "C", "D"]],
        "labels": {"A": [-0.28, -0.1, -0.28], "B": [0.28, -0.1, -0.28], "C": [0.28, -0.1, 0.28],
                   "D": [-0.25, -0.1, 0.28], "S": [0, 0.3, 0]},
        "entities": [
            {"label": "Đáy ABCD", "value": "Vuông cạnh a", "detail": "A(0,0,0) → C(a,a,0)", "tone": "slate"},
            {"label": "Đường cao", "value": "SA ⊥ Đáy", "detail": "S(0, 0, a√2)", "tone": "slate"},
            {"label": "Góc mục tiêu", "value": "∠(SC, ABCD)", "detail": "∠SCA = 45° (π/4)", "tone": "amber"},
            {"label": "Mặt phẳng (P)", "value": "(P) ⊥ SC qua A", "detail": "Thiết diện tứ giác AMHN", "tone": "blue"},
        ],
        "steps": [
            {"title": "Xác định hình chiếu SC", "body": "SA ⊥ (ABCD) ⇒ hình chiếu vuông góc của SC lên đáy là AC.", "tone": "amber"},
            {"title": "Tính số đo ∠SCA", "body": "Đáy vuông ⇒ AC = a√2. Tam giác SAC vuông cân tại A ⇒ tan∠SCA = 1 ⇒ ∠SCA = 45°.", "tone": "blue"},
            {"title": "Thiết diện (P) ⊥ SC", "body": "Hạ AH ⊥ SC, qua H kẻ // BD cắt SB, SD tại M, N. Thiết diện AMHN, diện tích 2a²/3.", "tone": "blue"},
        ],
        "layers": [
            {"key": "a", "name": "Câu a · Góc ∠SCA", "color": "cyan", "faces": [["A", "C", "S"]],
             "dashedEdges": [["A", "C"]], "angles": [{"at": "C", "from": "A", "to": "S", "label": "45°"}],
             "rightAngles": [{"at": "A", "from": "C", "to": "S"}]},
            {"key": "b", "name": "Câu b · Thiết diện (P)", "color": "magenta", "points": ["M", "H", "N"],
             "faces": [["A", "M", "H", "N"]], "dashedEdges": [["A", "H"]],
             "rightAngles": [{"at": "H", "from": "A", "to": "M"}]},
            {"key": "mp", "name": "Mặt chéo (SBD)", "color": "amber", "points": ["O"],
             "faces": [["S", "B", "D"]], "dashedEdges": [["B", "D"]], "solidEdges": [["S", "O"]]},
        ],
        "defaultLayers": ["a"],
    }


def mock_scene(problem: str) -> dict:
    """Return a plausible offline scene. (Single shape for the demo.)"""
    return _mock_pyramid()


def mock_grade(problem: str) -> dict:
    """Kết quả chấm đồ thị mẫu (khi chưa cấu hình GEMINI_API_KEY)."""
    return {
        "score": 0.5, "max": 1.0, "verdict": "Demo — cần cấu hình API",
        "note": "Đây là kết quả mẫu. Thêm GEMINI_API_KEY để AI chấm thật qua Vision.",
        "criteria": [
            {"name": "Khảo sát & bảng biến thiên", "score": 0.25, "max": 0.25, "status": "ok", "note": "Dáng tăng/giảm hợp lý."},
            {"name": "Trục toạ độ & điểm đặc biệt", "score": 0.25, "max": 0.25, "status": "ok", "note": "Giao điểm đúng."},
            {"name": "Tiệm cận / cực trị", "score": 0.0, "max": 0.25, "status": "error", "note": "(demo) Đồ thị chạm tiệm cận đứng."},
            {"name": "Hình dáng đường cong", "score": 0.0, "max": 0.25, "status": "partial", "note": "(demo) Nhánh phải cong sai hướng."},
        ],
        "annotations": [
            {"type": "error", "box": [0.55, 0.12, 0.3, 0.18], "label": "Cắt tiệm cận", "detail": "Đồ thị không được chạm tiệm cận đứng."},
            {"type": "ok", "box": [0.1, 0.55, 0.22, 0.2], "label": "Giao Oy đúng", "detail": "Điểm cắt trục tung chính xác."},
        ],
    }


def mock_solution(problem: str) -> dict:
    """Chấm bài giải tự luận mẫu (khi chưa cấu hình GEMINI_API_KEY)."""
    return {
        "score": 0.6, "max": 1.0, "verdict": "Demo — cần cấu hình API",
        "note": "Kết quả mẫu. Thêm GEMINI_API_KEY để AI đọc bài viết tay và chấm thật.",
        "steps": [
            {"name": "Bước 1 · Thiết lập", "status": "ok", "note": "Gọi tên, đặt ẩn đúng."},
            {"name": "Bước 2 · Biến đổi", "status": "ok", "note": "Biến đổi hợp lệ."},
            {"name": "Bước 3 · Tính toán", "status": "error", "note": "(demo) Sai dấu khi khai triển."},
            {"name": "Bước 4 · Kết luận", "status": "partial", "note": "(demo) Thiếu điều kiện xác định."},
        ],
        "annotations": [
            {"type": "error", "box": [0.3, 0.45, 0.4, 0.12], "label": "Sai dấu", "detail": "Dòng khai triển bị sai dấu."},
        ],
    }


def mock_ocr(problem: str) -> dict:
    return {"text": "(demo OCR) Cho hình chóp S.ABCD đáy vuông cạnh a, SA ⊥ (ABCD), SA = a√2."}


def mock_solve(problem: str) -> dict:
    return {
        "title": "Lời giải (demo)",
        "solution": [
            {"title": "Phân tích đề", "body": "(demo) Thêm GEMINI_API_KEY để AI giải chi tiết đề bất kỳ."},
            {"title": "Hướng giải", "body": "Hệ thống sẽ trình bày lời giải từng bước kèm công thức tại đây."},
        ],
        "answer": "(demo) Đáp số sẽ hiển thị khi bật AI.",
    }


def mock_latex(problem: str) -> dict:
    return {"latex": r"I = \int_{0}^{\frac{\pi}{2}} \frac{\sin x}{\sin x + \cos x}\,dx", "display": True}
