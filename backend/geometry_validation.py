"""Structural checks for scene specs before the renderer accepts them."""
from math import isfinite, sqrt
import re


def _question_parts(problem: str) -> set[str]:
    return {part.lower() for part in re.findall(r"(?<![A-Za-z0-9])([a-z])\)\s*\S", problem or "", re.IGNORECASE)}


def validate_scene_spec(spec: object, problem: str = "") -> list[str]:
    if not isinstance(spec, dict):
        return ["Kết quả dựng hình không phải object JSON."]

    points = spec.get("points")
    if not isinstance(points, dict) or not points:
        return ["Scene thiếu danh sách tọa độ points."]

    errors: list[str] = []
    if not isinstance(spec.get("title"), str) or not spec["title"].strip():
        errors.append("Scene thiếu title hợp lệ.")
    has_point = lambda name: isinstance(name, str) and name in points

    def xyz(name: object):
        value = points.get(name) if has_point(name) else None
        if (not isinstance(value, list) or len(value) != 3
                or any(not isinstance(c, (int, float)) or not isfinite(c) for c in value)):
            return None
        return value

    def vec(segment: object):
        if (not isinstance(segment, list) or len(segment) != 2
                or not has_point(segment[0]) or not has_point(segment[1])):
            return None
        a, b = xyz(segment[0]), xyz(segment[1])
        if a is None or b is None:
            return None
        return [b[i] - a[i] for i in range(3)]

    def norm(v):
        return sqrt(sum(c * c for c in v))

    def sub(a, b):
        return [a[i] - b[i] for i in range(3)]

    def cross(a, b):
        return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]

    def check_segments(value, expected=None):
        if not isinstance(value, list) or (expected is not None and len(value) != expected):
            return None
        result = [vec(segment) for segment in value]
        return result if all(v is not None for v in result) else None
    for name, value in points.items():
        if not isinstance(name, str) or not name.strip():
            errors.append("Scene có tên điểm không hợp lệ.")
            continue
        if (not isinstance(value, list) or len(value) != 3
                or any(not isinstance(c, (int, float)) or not isfinite(c) for c in value)):
            errors.append(f"Tọa độ điểm {name} phải gồm ba số hữu hạn.")

    def check_edges(edges: object, label: str) -> None:
        if edges is None:
            return
        if not isinstance(edges, list):
            errors.append(f"{label} phải là một danh sách.")
            return
        for edge in edges:
            if (not isinstance(edge, list) or len(edge) != 2
                    or any(not has_point(point) for point in edge)):
                errors.append(f"{label} có cạnh trỏ tới điểm không tồn tại.")
            elif edge[0] == edge[1] or (xyz(edge[0]) is not None and xyz(edge[1]) is not None
                                        and norm(sub(xyz(edge[0]), xyz(edge[1]))) < 1e-8):
                errors.append(f"{label} có cạnh suy biến.")

    def check_faces(faces: object, label: str) -> None:
        if faces is None:
            return
        if not isinstance(faces, list):
            errors.append(f"{label} phải là một danh sách.")
            return
        for face in faces:
            if (not isinstance(face, list) or len(face) < 3
                    or any(not has_point(point) for point in face)
                    or len(set(face)) != len(face)):
                errors.append(f"{label} có mặt thiếu đỉnh hoặc trỏ tới điểm không tồn tại.")
                continue
            coords = [xyz(name) for name in face]
            if any(point is None for point in coords):
                errors.append(f"{label} có đỉnh không có tọa độ hợp lệ.")
                continue
            p0 = coords[0]
            normal = None
            for i in range(1, len(coords) - 1):
                candidate = cross(sub(coords[i], p0), sub(coords[i + 1], p0))
                if norm(candidate) > 1e-8:
                    normal = candidate
                    break
            if normal is None:
                errors.append(f"{label} có mặt suy biến.")
                continue
            nl = norm(normal)
            span = max((norm(sub(p, p0)) for p in coords), default=1)
            tolerance = 1e-3 * max(span, 1)
            if any(abs(sum(normal[j] * (p[j] - p0[j]) for j in range(3))) / nl > tolerance for p in coords):
                errors.append(f"{label} có mặt không đồng phẳng.")
                continue
            turns = [sum(cross(sub(coords[(i + 1) % len(coords)], coords[i]),
                               sub(coords[(i + 2) % len(coords)], coords[(i + 1) % len(coords)]))[j] * normal[j]
                           for j in range(3)) for i in range(len(coords))]
            nonzero = [turn for turn in turns if abs(turn) > 1e-8 * nl]
            if nonzero and min(nonzero) < 0 < max(nonzero):
                errors.append(f"{label} có đỉnh không theo thứ tự đa giác lồi.")

    def check_curves(curves: object, label: str) -> None:
        if curves is None:
            return
        if not isinstance(curves, list):
            errors.append(f"{label} phải là danh sách polyline.")
            return
        for curve in curves:
            if (not isinstance(curve, list) or len(curve) < 2
                    or any(not isinstance(p, list) or len(p) != 3
                           or any(not isinstance(c, (int, float)) or not isfinite(c) for c in p)
                           for p in curve)):
                errors.append(f"{label} có polyline thiếu hoặc tọa độ không hợp lệ.")

    solid_edges = spec.get("solidEdges", [])
    dashed_edges = spec.get("dashedEdges", [])
    check_edges(solid_edges, "solidEdges")
    check_edges(dashed_edges, "dashedEdges")
    if isinstance(solid_edges, list) and isinstance(dashed_edges, list):
        canonical = lambda edge: tuple(sorted(edge)) if isinstance(edge, list) and len(edge) == 2 and all(isinstance(n, str) for n in edge) else None
        solid_set = {canonical(edge) for edge in solid_edges} - {None}
        dashed_set = {canonical(edge) for edge in dashed_edges} - {None}
        if solid_set & dashed_set:
            errors.append("Một cạnh xuất hiện đồng thời trong solidEdges và dashedEdges.")
    check_faces(spec.get("faces", []), "faces")
    check_curves(spec.get("curves", []), "curves")
    check_curves(spec.get("curvesDashed", []), "curvesDashed")

    labels = spec.get("labels", {})
    if not isinstance(labels, dict) or any(name not in points for name in labels):
        errors.append("labels có điểm không tồn tại trong points.")

    for field in ("assumptions", "unresolved"):
        values = spec.get(field)
        if field not in spec:
            errors.append(f"Scene thiếu trường {field}.")
            continue
        if not isinstance(values, list) or any(not isinstance(value, str) for value in values):
            errors.append(f"{field} phải là danh sách văn bản.")

    layers = spec.get("layers", [])
    if not isinstance(layers, list):
        errors.append("layers phải là một danh sách.")
        layers = []
    layer_keys = set()
    for layer in layers:
        if not isinstance(layer, dict):
            errors.append("Một layer không phải object JSON.")
            continue
        key = layer.get("key")
        if not isinstance(key, str) or not key:
            errors.append("Mỗi layer cần có key.")
        elif key in layer_keys:
            errors.append(f"Layer key {key} bị lặp.")
        else:
            layer_keys.add(key)
        check_edges(layer.get("solidEdges", []), "layer.solidEdges")
        check_edges(layer.get("dashedEdges", []), "layer.dashedEdges")
        check_faces(layer.get("faces", []), "layer.faces")
        check_curves(layer.get("curves", []), "layer.curves")
        check_curves(layer.get("curvesDashed", []), "layer.curvesDashed")
        values = layer.get("points", [])
        if not isinstance(values, list) or any(not has_point(name) for name in values):
            errors.append("layer.points có điểm không tồn tại.")
        for field in ("angles", "rightAngles"):
            values = layer.get(field, [])
            if not isinstance(values, list):
                errors.append(f"layer.{field} phải là một danh sách.")
                continue
            required = ("at", "from", "to")
            for item in values:
                if not isinstance(item, dict) or any(not has_point(item.get(k)) for k in required):
                    errors.append(f"layer.{field} có góc trỏ tới điểm không tồn tại.")
                elif field == "rightAngles":
                    origin = xyz(item["at"]); p = xyz(item["from"]); q = xyz(item["to"])
                    if origin is None or p is None or q is None:
                        errors.append("Góc vuông có điểm không có tọa độ hợp lệ.")
                    else:
                        u, v = sub(p, origin), sub(q, origin)
                        lu, lv = norm(u), norm(v)
                        if lu < 1e-9 or lv < 1e-9 or abs(sum(u[i]*v[i] for i in range(3))) / (lu*lv) > 1e-3:
                            errors.append("Dấu góc vuông không khớp với tọa độ.")

    asked = _question_parts(problem)
    if asked and len(layers) < len(asked):
        errors.append(f"Đề có {len(asked)} ý hỏi có nhãn nhưng scene chỉ có {len(layers)} layer; có thể đã bỏ sót ý.")
    if asked:
        named_layers = " ".join(str(layer.get("name", "")) for layer in layers if isinstance(layer, dict)).lower()
        for part in sorted(asked):
            if not re.search(rf"(?:câu|ý)\s*{re.escape(part)}\b", named_layers):
                errors.append(f"Scene chưa có layer nhận diện rõ ý {part}.")

    scene_steps = spec.get("steps")
    if not isinstance(scene_steps, list) or not scene_steps:
        errors.append("Scene thiếu các bước dựng/giải thích hình.")
    elif asked:
        step_titles = " ".join(str(step.get("title", "")) for step in scene_steps if isinstance(step, dict)).lower()
        for part in sorted(asked):
            if not re.search(rf"(?:câu|ý)\s*{re.escape(part)}\b", step_titles):
                errors.append(f"Các bước của scene chưa đề cập rõ ý {part}.")

    defaults = spec.get("defaultLayers", [])
    if not isinstance(defaults, list) or any(not isinstance(key, str) or key not in layer_keys for key in defaults):
        errors.append("defaultLayers tham chiếu layer không tồn tại.")

    # Validate declared mathematical constraints against the returned coordinates.
    constraints = spec.get("constraints")
    if "constraints" not in spec:
        errors.append("Scene thiếu danh sách constraints để kiểm tra quan hệ hình học.")
        constraints = []
    if not isinstance(constraints, list):
        errors.append("constraints phải là một danh sách.")
        constraints = []
    for constraint in constraints:
        if not isinstance(constraint, dict):
            errors.append("Một constraint không phải object JSON.")
            continue
        kind = constraint.get("type")
        if kind == "plane_perpendicular":
            planes = constraint.get("planes")
            if (not isinstance(planes, list) or len(planes) != 2
                    or any(not isinstance(plane, list) or len(plane) != 3
                           or any(not has_point(name) for name in plane) for plane in planes)):
                errors.append("Constraint plane_perpendicular cần hai bộ ba điểm hợp lệ.")
                continue
            coords = [[xyz(name) for name in plane] for plane in planes]
            if any(any(p is None for p in plane) for plane in coords):
                errors.append("Constraint plane_perpendicular có tọa độ không hợp lệ.")
                continue
            normals = [cross(sub(plane[1], plane[0]), sub(plane[2], plane[0])) for plane in coords]
            lengths = [norm(n) for n in normals]
            if min(lengths) < 1e-9:
                errors.append("Constraint plane_perpendicular có ba điểm thẳng hàng.")
            elif abs(sum(normals[0][i] * normals[1][i] for i in range(3))) / (lengths[0] * lengths[1]) > 1e-3:
                errors.append("Tọa độ không thỏa ràng buộc plane_perpendicular.")
        elif kind in ("perpendicular", "parallel"):
            vectors = check_segments(constraint.get("segments"), 2)
            if vectors is None:
                errors.append(f"Constraint {kind} cần hai đoạn hợp lệ.")
                continue
            u, v = vectors
            lu, lv = norm(u), norm(v)
            if lu < 1e-9 or lv < 1e-9:
                errors.append(f"Constraint {kind} có đoạn suy biến.")
                continue
            dot = sum(u[i] * v[i] for i in range(3))
            cross = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
            ratio = abs(dot) / (lu * lv) if kind == "perpendicular" else norm(cross) / (lu * lv)
            if ratio > 1e-3:
                errors.append(f"Tọa độ không thỏa ràng buộc {kind}.")
        elif kind == "equal_length":
            vectors = check_segments(constraint.get("segments"), 2)
            if vectors is None or any(norm(v) < 1e-9 for v in vectors):
                errors.append("Constraint equal_length cần hai đoạn không suy biến.")
            elif abs(norm(vectors[0]) - norm(vectors[1])) > 1e-3 * max(norm(vectors[0]), norm(vectors[1])):
                errors.append("Tọa độ không thỏa ràng buộc equal_length.")
        elif kind == "midpoint":
            p = xyz(constraint.get("point"))
            seg = constraint.get("segment")
            ends = [xyz(n) for n in seg] if isinstance(seg, list) and len(seg) == 2 else None
            if p is None or ends is None or any(v is None for v in ends):
                errors.append("Constraint midpoint trỏ tới điểm không hợp lệ.")
            elif norm([p[i] - (ends[0][i] + ends[1][i]) / 2 for i in range(3)]) > 1e-3:
                errors.append("Tọa độ không thỏa ràng buộc midpoint.")
        elif kind == "coplanar":
            names = constraint.get("points")
            coords = [xyz(n) for n in names] if isinstance(names, list) and len(names) >= 4 else None
            if coords is None or any(p is None for p in coords):
                errors.append("Constraint coplanar cần ít nhất bốn điểm hợp lệ.")
            else:
                origin = coords[0]
                normal = next((cross(sub(coords[i], origin), sub(coords[j], origin))
                               for i in range(1, len(coords)) for j in range(i + 1, len(coords))
                               if norm(cross(sub(coords[i], origin), sub(coords[j], origin))) > 1e-9), None)
                nl = norm(normal) if normal is not None else 0
                if normal is not None and any(abs(sum(normal[i]*(p[i]-origin[i]) for i in range(3))) / nl > 1e-3 for p in coords[1:]):
                    errors.append("Tọa độ không thỏa ràng buộc coplanar.")
        else:
            errors.append(f"Loại constraint không được hỗ trợ: {kind}.")

    return errors


def validate_solution_spec(result: object, base_points: object = None, require_status: bool = False,
                           problem: str = "") -> list[str]:
    """Reject malformed solution drawings instead of silently dropping them in Three.js."""
    if not isinstance(result, dict):
        return ["Lời giải AI không phải object JSON."]
    errors: list[str] = []
    if require_status and result.get("status") not in ("verified", "corrected", "uncertain"):
        errors.append("Trạng thái kiểm chứng lời giải không hợp lệ.")
    elif result.get("status") is not None and result.get("status") not in ("verified", "corrected", "uncertain"):
        errors.append("Trạng thái kiểm chứng lời giải không hợp lệ.")
    if not isinstance(result.get("solution"), list):
        return errors + ["Lời giải thiếu danh sách solution."]
    if not result["solution"]:
        errors.append("Lời giải chưa có bước giải nào.")
    if not isinstance(result.get("answer", ""), str):
        errors.append("answer phải là văn bản.")
    elif not result.get("answer", "").strip():
        errors.append("Lời giải chưa nêu kết luận hoặc lý do chưa thể kết luận.")
    if require_status and "issues" not in result:
        errors.append("Kết quả kiểm tra thiếu issues.")
    if "issues" in result and (not isinstance(result["issues"], list)
                               or any(not isinstance(issue, str) for issue in result["issues"])):
        errors.append("issues phải là danh sách văn bản.")

    points = dict(base_points) if isinstance(base_points, dict) else {}
    covered_parts: set[str] = set()
    for index, step in enumerate(result["solution"]):
        if not isinstance(step, dict):
            errors.append(f"Bước {index + 1} không phải object JSON.")
            continue
        heading = str(step.get("title", ""))
        if not heading.strip() or not str(step.get("body", "")).strip():
            errors.append(f"Bước {index + 1} thiếu tiêu đề hoặc nội dung lập luận.")
        covered_parts.update(re.findall(r"(?:câu|ý)\s*([a-z])\b", heading, re.IGNORECASE))
        draw = step.get("draw", {})
        if not isinstance(draw, dict):
            errors.append(f"Phần vẽ ở bước {index + 1} không hợp lệ.")
            continue
        new_points = draw.get("points", {})
        if not isinstance(new_points, dict):
            errors.append(f"draw.points ở bước {index + 1} phải là object.")
            new_points = {}
        for name, xyz in new_points.items():
            if (not isinstance(name, str) or not name.strip()
                    or not isinstance(xyz, list) or len(xyz) != 3
                    or any(not isinstance(c, (int, float)) or not isfinite(c) for c in xyz)):
                errors.append(f"Tọa độ điểm mới ở bước {index + 1} không hợp lệ.")
            elif name in points:
                old = points[name]
                if (not isinstance(old, list) or len(old) != 3
                        or any(not isinstance(c, (int, float)) or not isfinite(c) for c in old)
                        or any(abs(old[i] - xyz[i]) > 1e-3 for i in range(3))):
                    errors.append(f"Điểm {name} bị định nghĩa lại với tọa độ khác.")
            else:
                points[name] = xyz

        for field in ("segments", "dashed"):
            edges = draw.get(field, [])
            if not isinstance(edges, list):
                errors.append(f"draw.{field} ở bước {index + 1} phải là danh sách.")
                continue
            for edge in edges:
                if (not isinstance(edge, list) or len(edge) != 2
                        or any(not isinstance(name, str) or name not in points for name in edge)
                        or (isinstance(edge, list) and len(edge) == 2 and edge[0] == edge[1])):
                    errors.append(f"draw.{field} ở bước {index + 1} tham chiếu cạnh không hợp lệ.")

        labels = draw.get("labels", {})
        if not isinstance(labels, dict) or any(name not in points for name in labels):
            errors.append(f"draw.labels ở bước {index + 1} tham chiếu điểm không tồn tại.")
        elif any(not isinstance(offset, list) or len(offset) != 3
                 or any(not isinstance(c, (int, float)) or not isfinite(c) for c in offset)
                 for offset in labels.values()):
            errors.append(f"draw.labels ở bước {index + 1} có offset không hợp lệ.")

    missing_parts = _question_parts(problem) - {part.lower() for part in covered_parts}
    if missing_parts:
        errors.append("Lời giải chưa có bước riêng cho ý: " + ", ".join(sorted(missing_parts)) + ".")

    return errors
