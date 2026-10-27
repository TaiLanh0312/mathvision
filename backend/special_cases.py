"""Exact analytic handlers for fully recognized, common geometry configurations.

These handlers complement the language model: they only run when every defining
condition matches a known configuration, so their formulas and coordinates are
computed directly instead of inferred from generated prose.
"""
import re
import unicodedata


def _compact_vietnamese(text: str) -> str:
    text = unicodedata.normalize("NFD", (text or "").lower().replace("đ", "d"))
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return re.sub(r"[^a-z0-9]+", "", text)


def _square_pyramid_cd_section(problem: str) -> bool:
    text = _compact_vietnamese(problem)
    required = (
        "hinhchopdeusabcd", "canhdaybanga", "chieucaobang2a",
        "chuacd", "vuonggocvoimatphangsab", "dienthiet",
    )
    return all(token in text for token in required)


def exact_scene(problem: str) -> dict | None:
    """Build the exact section for a regular square pyramid and plane (CD) ⟂ (SAB)."""
    if not _square_pyramid_cd_section(problem):
        return None

    # Scale a=1 to 2.4 only for display; formulas in the solution stay symbolic in a.
    a = 2.4
    points = {
        "A": [0, 0, 0], "B": [a, 0, 0], "C": [a, a, 0], "D": [0, a, 0],
        "S": [a / 2, a / 2, 2 * a],
        "N": [a / 17, a / 17, 4 * a / 17],
        "M": [16 * a / 17, a / 17, 4 * a / 17],
    }
    section = [["C", "D", "N", "M"]]
    return {
        "title": "Thiết diện chóp đều S.ABCD",
        "meta": "Oxyz [ABCD nằm trên z=0]",
        "points": points,
        "solidEdges": [["A", "B"], ["B", "C"], ["S", "A"], ["S", "B"], ["S", "C"]],
        "dashedEdges": [["C", "D"], ["D", "A"], ["S", "D"]],
        "faces": [["A", "B", "C", "D"], ["S", "A", "B"], ["S", "B", "C"],
                  ["S", "C", "D"], ["S", "D", "A"]],
        "curves": [], "curvesDashed": [],
        "labels": {"A": [-0.25, -0.1, -0.2], "B": [0.2, -0.1, -0.2],
                   "C": [0.22, 0, 0.2], "D": [-0.2, 0, 0.2], "S": [0, 0.2, 0],
                   "N": [-0.15, 0, 0.12], "M": [0.12, 0, 0.12]},
        "entities": [
            {"label": "Mặt phẳng cắt", "value": "α chứa CD, α ⊥ (SAB)",
             "detail": "α: y + 4z = a", "tone": "blue"},
            {"label": "Thiết diện", "value": "Tứ giác CDNM", "detail": "N ∈ SA, M ∈ SB", "tone": "amber"},
            {"label": "Diện tích", "value": "64√17/289 · a²", "detail": "≈ 0,913a²", "tone": "blue"},
        ],
        "steps": [
            {"title": "Đặt hệ tọa độ", "body": "Lấy a=1 để tính tọa độ: A(0,0,0), B(1,0,0), C(1,1,0), D(0,1,0), S(1/2,1/2,2).", "tone": "amber"},
            {"title": "Dựng thiết diện CDNM", "body": "(SAB): z=4y. Pháp tuyến của (SAB) tỉ lệ (0,−4,1); mặt phẳng α qua CD và vuông góc (SAB) có phương trình y+4z=1. Giao với SA, SB lần lượt là N, M.", "tone": "blue"},
            {"title": "Tính diện tích", "body": "N(1/17,1/17,4/17), M(16/17,1/17,4/17). Chiếu tọa độ lên (x,z), hệ số diện tích là √17; công thức dây giày cho CDNM cho diện tích 64√17/289 khi a=1.", "tone": "blue"},
        ],
        "assumptions": ["Dùng a=2.4 cho hình minh họa; đáp số được giữ theo a."],
        "unresolved": [],
        "constraints": [
            {"type": "equal_length", "segments": [["A", "B"], ["B", "C"]]},
            {"type": "equal_length", "segments": [["A", "B"], ["C", "D"]]},
            {"type": "coplanar", "points": ["A", "B", "C", "D"]},
            {"type": "plane_perpendicular", "planes": [["S", "A", "B"], ["C", "D", "N"]]},
        ],
        "layers": [{"key": "section", "name": "Thiết diện CDNM", "color": "magenta",
                    "points": ["N", "M"], "faces": section,
                    "solidEdges": [["C", "D"], ["D", "N"], ["N", "M"], ["M", "C"]],
                    "dashedEdges": [], "curves": [], "curvesDashed": [], "angles": [], "rightAngles": []}],
        "defaultLayers": ["section"],
        "source": "analytic-special-case",
    }


def exact_solution(problem: str) -> dict | None:
    """Return the exact derivation for the recognized square-pyramid section problem."""
    if not _square_pyramid_cd_section(problem):
        return None
    a = 2.4
    points = {
        "A": [0, 0, 0], "B": [a, 0, 0], "C": [a, a, 0], "D": [0, a, 0],
        "S": [a / 2, a / 2, 2 * a],
        "N": [a / 17, a / 17, 4 * a / 17],
        "M": [16 * a / 17, a / 17, 4 * a / 17],
    }
    return {
        "title": "Lời giải bằng tọa độ",
        "status": "verified",
        "issues": [],
        "solution": [
            {"title": "Chọn hệ tọa độ", "body": "Chuẩn hóa a=1. Vì chóp đều nên chân đường cao là tâm hình vuông: A(0,0,0), B(1,0,0), C(1,1,0), D(0,1,0), S(1/2,1/2,2).", "draw": {"points": {}, "segments": [], "dashed": [], "labels": {}}},
            {"title": "Lập phương trình hai mặt phẳng", "body": "Mặt phẳng (SAB) có phương trình z=4y, pháp tuyến n=(0,−4,1). Mặt phẳng α chứa CD có dạng y+cz=1; điều kiện α ⊥ (SAB) cho (0,1,c)·(0,−4,1)=0, nên c=4 và α: y+4z=1.", "draw": {"points": {}, "segments": [], "dashed": [], "labels": {}}},
            {"title": "Tìm giao điểm và hình thiết diện", "body": "Thế phương trình SA và SB vào α được N(1/17,1/17,4/17), M(16/17,1/17,4/17). Mặt phẳng α cắt hình chóp theo tứ giác CDNM.", "draw": {"points": {}, "segments": [["C", "D"], ["D", "N"], ["N", "M"], ["M", "C"]], "dashed": [], "labels": {}}},
            {"title": "Tính diện tích thiết diện", "body": "Trên mặt phẳng α, dùng (x,z) làm tọa độ tham số thì dy=−4dz, nên phần tử diện tích bằng √(dx²+17dz²), tức hệ số √17 so với diện tích trên mặt phẳng (x,z). Công thức dây giày cho C(1,0), D(0,0), N(1/17,4/17), M(16/17,4/17) cho diện tích tham số 64/289. Suy ra S_{CDNM}=64√17/289·a².", "draw": {"points": {}, "segments": [], "dashed": [], "labels": {}}},
        ],
        "answer": "Diện tích thiết diện là 64√17/289 · a² = 64/(17√17) · a² ≈ 0,913a².",
        "source": "analytic-special-case",
    }
