"""MathVision PRO — math_kernel.py

Bộ giải TOÁN ký hiệu (symbolic engine) kiểu Photomath: giải theo LUẬT bằng
SymPy -> đáp số CHÍNH XÁC + các bước deterministic, KHÔNG để LLM tự nghĩ.

Triết lý giống geokernel.js của phần hình học: thử kernel TRƯỚC; chỉ khi kernel
không nhận dạng được dạng bài (trả None) thì mới để AI (flash-lite) giải thay.

Entry point:
    solve_math(problem: str, subject: str = "auto") -> dict | None

Trả về cùng định dạng với bộ giải AI (solve_study_problem):
    {subject, title, recognized_problem, steps:[{title, explanation}],
     answer, notes:[...], source:"math-kernel"}
hoặc None nếu KHÔNG chắc chắn (để fallback sang AI). Tuyệt đối không trả lời sai:
mọi mơ hồ/parse lỗi -> None.
"""
from __future__ import annotations

import re
import unicodedata

try:
    import sympy as sp
    from sympy.parsing.sympy_parser import (
        parse_expr, standard_transformations,
        implicit_multiplication_application, convert_xor,
    )
    _TRANSFORMS = standard_transformations + (
        implicit_multiplication_application, convert_xor,
    )
except Exception:  # SymPy chưa cài -> kernel tắt, caller fallback AI
    sp = None
    _TRANSFORMS = None


# ----------------------------------------------------------------------------
# Chuẩn hoá đầu vào
# ----------------------------------------------------------------------------
def _fold(s: str) -> str:
    """Bỏ dấu tiếng Việt + hạ chữ thường để dò từ khoá lệnh."""
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.replace("đ", "d").replace("Đ", "D").lower()


_LATEX_FUNCS = ("sin", "cos", "tan", "cot", "ln", "log", "exp",
                "sqrt", "frac", "cdot", "times", "div", "left", "right",
                "pi", "le", "ge", "neq", "cdots", "ldots", "infty")


def _latex_to_plain(s: str) -> str:
    """Đổi các mẫu LaTeX phổ biến (từ OCR) về dạng SymPy đọc được."""
    s = s or ""
    s = s.replace("$", " ").replace("\\!", "").replace("\\,", " ").replace("\\;", " ")
    s = s.replace("\\left", "").replace("\\right", "")
    s = s.replace("\\cdot", "*").replace("\\times", "*").replace("\\div", "/")
    s = s.replace("\\pi", "pi").replace("\\infty", "oo")
    s = s.replace("\\le", "<=").replace("\\leq", "<=")
    s = s.replace("\\ge", ">=").replace("\\geq", ">=")
    s = s.replace("\\neq", "!=")
    # \frac{a}{b} -> ((a)/(b))  (lặp để lồng nhau)
    for _ in range(6):
        new = re.sub(r"\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}", r"((\1)/(\2))", s)
        if new == s:
            break
        s = new
    # \sqrt{a} -> sqrt(a) ; \sqrt[n]{a} -> (a)**(1/(n))
    s = re.sub(r"\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}", r"((\2)**(1/(\1)))", s)
    for _ in range(4):
        new = re.sub(r"\\sqrt\s*\{([^{}]*)\}", r"sqrt(\1)", s)
        if new == s:
            break
        s = new
    # ^{...} -> **(...)
    s = re.sub(r"\^\s*\{([^{}]*)\}", r"**(\1)", s)
    # _{...} (chỉ số) -> bỏ, tránh gây lỗi
    s = re.sub(r"_\s*\{[^{}]*\}", "", s)
    s = s.replace("_", "")
    # \sin -> sin ...
    s = re.sub(r"\\(" + "|".join(_LATEX_FUNCS) + r")", r"\1", s)
    s = s.replace("{", "(").replace("}", ")")
    return s


_UNICODE_MAP = {
    "×": "*", "·": "*", "⋅": "*", "÷": "/", "–": "-", "—": "-", "−": "-",
    "√": " sqrt ", "π": "pi", "∞": "oo", "≤": "<=", "≥": ">=", "≠": "!=",
    "⇔": "=", "“": '"', "”": '"', "’": "'",
    "⁰": "**0", "¹": "**1", "²": "**2", "³": "**3", "⁴": "**4",
    "⁵": "**5", "⁶": "**6", "⁷": "**7", "⁸": "**8", "⁹": "**9",
}


def _normalize(s: str) -> str:
    s = _latex_to_plain(s)
    for k, v in _UNICODE_MAP.items():
        s = s.replace(k, v)
    # sqrt theo sau là số/biến mà không có ngoặc: "sqrt 2" -> sqrt(2)
    s = re.sub(r"sqrt\s+([0-9a-zA-Z]+)", r"sqrt(\1)", s)
    # dấu phẩy thập phân VN giữa 2 chữ số -> dấu chấm
    s = re.sub(r"(?<=\d),(?=\d)", ".", s)
    return s.strip()


def _var_of(*exprs) -> "sp.Symbol":
    syms = set()
    for e in exprs:
        if e is not None:
            syms |= e.free_symbols
    if not syms:
        return sp.Symbol("x")
    for name in ("x", "y", "t", "n"):
        for sym in syms:
            if sym.name == name:
                return sym
    return sorted(syms, key=lambda s: s.name)[0]


def _parse(expr_str: str):
    expr_str = _normalize(expr_str)
    if not expr_str:
        raise ValueError("empty")
    local = {"e": sp.E, "E": sp.E, "pi": sp.pi, "oo": sp.oo, "I": sp.I}
    return parse_expr(expr_str, transformations=_TRANSFORMS, local_dict=local, evaluate=True)


def _fmt(e) -> str:
    """Chuỗi toán dễ đọc: ^ thay cho **, bỏ ký tự rườm rà."""
    try:
        s = sp.sstr(e)
    except Exception:
        s = str(e)
    s = s.replace("**", "^").replace("*", "·")
    s = s.replace("sqrt", "√").replace("(√", "√(")
    return s


def _step(title: str, explanation: str) -> dict:
    return {"title": title, "explanation": explanation}


# ----------------------------------------------------------------------------
# Các handler theo dạng bài
# ----------------------------------------------------------------------------
def _solve_equation(body: str) -> dict | None:
    if "=" not in body:
        return None
    lhs_s, rhs_s = body.split("=", 1)
    lhs, rhs = _parse(lhs_s), _parse(rhs_s)
    var = _var_of(lhs, rhs)
    expr = sp.expand(lhs - rhs)
    steps = [_step("Đưa về một vế",
                   f"Phương trình: {_fmt(lhs)} = {_fmt(rhs)}\n"
                   f"Chuyển vế: {_fmt(expr)} = 0")]

    poly = sp.Poly(expr, var) if expr.free_symbols == {var} and expr.is_polynomial(var) else None
    if poly is not None and poly.degree() == 1:
        a, b = poly.all_coeffs()
        root = sp.simplify(-b / a)
        steps.append(_step("Giải phương trình bậc nhất",
                           f"{_fmt(a)}·{var} + {_fmt(b)} = 0  ⇒  {var} = {_fmt(sp.nsimplify(-b))}/{_fmt(a)} = {_fmt(root)}"))
        sols = [root]
    elif poly is not None and poly.degree() == 2:
        a, b, c = poly.all_coeffs()
        disc = sp.simplify(b**2 - 4*a*c)
        steps.append(_step("Xác định hệ số",
                           f"a = {_fmt(a)}, b = {_fmt(b)}, c = {_fmt(c)}"))
        steps.append(_step("Tính biệt thức Δ",
                           f"Δ = b² − 4ac = ({_fmt(b)})² − 4·({_fmt(a)})·({_fmt(c)}) = {_fmt(disc)}"))
        dnum = sp.N(disc)
        if disc == 0:
            r = sp.simplify(-b / (2*a))
            steps.append(_step("Δ = 0 ⇒ nghiệm kép",
                               f"{var} = −b/(2a) = {_fmt(r)}"))
            sols = [r]
        elif dnum.is_real and dnum < 0:
            sols = sp.solve(sp.Eq(expr, 0), var)
            steps.append(_step("Δ < 0",
                               "Phương trình vô nghiệm trên tập số thực."
                               + (f" Nghiệm phức: {', '.join(_fmt(s) for s in sols)}" if sols else "")))
        else:
            r1 = sp.simplify((-b + sp.sqrt(disc)) / (2*a))
            r2 = sp.simplify((-b - sp.sqrt(disc)) / (2*a))
            steps.append(_step("Δ > 0 ⇒ hai nghiệm phân biệt",
                               f"{var} = (−b ± √Δ)/(2a)\n"
                               f"{var}₁ = {_fmt(r1)}\n{var}₂ = {_fmt(r2)}"))
            sols = [r1, r2]
    else:
        factored = sp.factor(expr)
        if factored != expr:
            steps.append(_step("Phân tích thành nhân tử", f"{_fmt(factored)} = 0"))
        sols = sp.solve(sp.Eq(expr, 0), var, dict=False)
        if not isinstance(sols, (list, tuple)):
            sols = [sols]
        steps.append(_step("Nghiệm", "Giải ra: " +
                           (", ".join(f"{var} = {_fmt(s)}" for s in sols) if sols else "vô nghiệm")))

    # Xác minh bằng cách thế lại (đặc trưng của kernel: luôn kiểm chứng)
    checked = []
    for s in sols:
        try:
            if sp.simplify(expr.subs(var, s)) == 0:
                checked.append(s)
        except Exception:
            checked.append(s)
    if checked and len(checked) != len(sols):
        steps.append(_step("Thử lại nghiệm",
                           "Sau khi thế lại, nghiệm hợp lệ: " +
                           ", ".join(f"{var} = {_fmt(s)}" for s in checked)))
        sols = checked

    answer = ("Vô nghiệm (trên ℝ)" if not sols
              else "; ".join(f"{var} = {_fmt(s)}" for s in sols))
    return _pack("Giải phương trình", f"{_fmt(lhs)} = {_fmt(rhs)}", steps, answer)


def _solve_inequality(body: str) -> dict | None:
    m = re.search(r"(<=|>=|<|>)", body)
    if not m:
        return None
    lhs = _parse(body[:m.start()])
    rhs = _parse(body[m.end():])
    op = m.group(1)
    var = _var_of(lhs, rhs)
    rel = {"<=": sp.Le, ">=": sp.Ge, "<": sp.Lt, ">": sp.Gt}[op]
    ineq = rel(lhs, rhs)
    try:
        sol = sp.solve_univariate_inequality(ineq, var, relational=False)
    except Exception:
        sol = sp.reduce_inequalities(ineq, var)
    steps = [
        _step("Bất phương trình", f"{_fmt(lhs)} {op} {_fmt(rhs)}"),
        _step("Chuyển vế", f"{_fmt(sp.expand(lhs - rhs))} {op} 0"),
        _step("Tập nghiệm", f"{var} ∈ {sol}"),
    ]
    return _pack("Giải bất phương trình", f"{_fmt(lhs)} {op} {_fmt(rhs)}", steps, f"{var} ∈ {sol}")


def _derivative(body: str) -> dict | None:
    expr = _parse(body)
    var = _var_of(expr)
    d = sp.diff(expr, var)
    ds = sp.simplify(d)
    steps = [_step("Hàm số", f"f({var}) = {_fmt(expr)}"),
             _step("Tính đạo hàm", f"f'({var}) = {_fmt(d)}")]
    if ds != d:
        steps.append(_step("Rút gọn", f"f'({var}) = {_fmt(ds)}"))
    return _pack("Tính đạo hàm", f"f({var}) = {_fmt(expr)}", steps, f"f'({var}) = {_fmt(ds)}")


def _integral(body: str, definite=None) -> dict | None:
    expr = _parse(body)
    var = _var_of(expr)
    if definite:
        lo, hi = definite
        a, b = _parse(lo), _parse(hi)
        F = sp.integrate(expr, var)
        val = sp.simplify(sp.integrate(expr, (var, a, b)))
        steps = [
            _step("Nguyên hàm", f"∫ {_fmt(expr)} d{var} = {_fmt(F)} + C"),
            _step("Thay cận", f"[{_fmt(F)}] từ {_fmt(a)} đến {_fmt(b)} = {_fmt(F.subs(var, b))} − {_fmt(F.subs(var, a))}"),
            _step("Kết quả", f"= {_fmt(val)}"),
        ]
        return _pack("Tính tích phân", f"∫ từ {_fmt(a)} đến {_fmt(b)} của {_fmt(expr)} d{var}", steps, _fmt(val))
    F = sp.integrate(expr, var)
    steps = [_step("Hàm dưới dấu tích phân", f"{_fmt(expr)}"),
             _step("Tìm nguyên hàm", f"∫ {_fmt(expr)} d{var} = {_fmt(F)} + C")]
    return _pack("Tìm nguyên hàm", f"∫ {_fmt(expr)} d{var}", steps, f"{_fmt(F)} + C")


def _limit(body: str, point: str, direction: str = "+-") -> dict | None:
    expr = _parse(body)
    var = _var_of(expr)
    p = _parse(point)
    try:
        L = sp.limit(expr, var, p, direction if direction in ("+", "-") else "+")
    except Exception:
        L = sp.limit(expr, var, p)
    steps = [_step("Biểu thức", f"lim ({var}→{_fmt(p)}) {_fmt(expr)}"),
             _step("Kết quả", f"= {_fmt(L)}")]
    return _pack("Tính giới hạn", f"lim ({var}→{_fmt(p)}) {_fmt(expr)}", steps, _fmt(L))


def _factor(body: str) -> dict | None:
    expr = _parse(body)
    f = sp.factor(expr)
    steps = [_step("Biểu thức", _fmt(expr)),
             _step("Phân tích thành nhân tử", _fmt(f))]
    return _pack("Phân tích thành nhân tử", _fmt(expr), steps, _fmt(f))


def _expand(body: str) -> dict | None:
    expr = _parse(body)
    e = sp.expand(expr)
    steps = [_step("Biểu thức", _fmt(expr)), _step("Khai triển", _fmt(e))]
    return _pack("Khai triển", _fmt(expr), steps, _fmt(e))


def _simplify(body: str) -> dict | None:
    expr = _parse(body)
    e = sp.simplify(expr)
    steps = [_step("Biểu thức", _fmt(expr)), _step("Rút gọn", _fmt(e))]
    return _pack("Rút gọn biểu thức", _fmt(expr), steps, _fmt(e))


def _evaluate(body: str) -> dict | None:
    if "=" in body or re.search(r"[a-zA-Z]", _normalize(body).replace("sqrt", "").replace("pi", "")):
        return None  # có ẩn -> không phải tính số
    expr = _parse(body)
    val = sp.simplify(expr)
    num = sp.N(val, 10)
    ans = _fmt(val) + (f" ≈ {num}" if val != num and not val.is_Integer else "")
    steps = [_step("Phép tính", _fmt(expr)), _step("Kết quả", ans)]
    return _pack("Tính giá trị biểu thức", _fmt(expr), steps, ans)


def _solve_system(parts: list[str]) -> dict | None:
    eqs = []
    for p in parts:
        if "=" not in p:
            return None
        l, r = p.split("=", 1)
        eqs.append(sp.Eq(_parse(l), _parse(r)))
    syms = sorted({s for e in eqs for s in e.free_symbols}, key=lambda s: s.name)
    if not syms:
        return None
    sol = sp.solve(eqs, syms, dict=True)
    steps = [_step("Hệ phương trình", "\n".join(f"{_fmt(e.lhs)} = {_fmt(e.rhs)}" for e in eqs))]
    if not sol:
        steps.append(_step("Kết luận", "Hệ vô nghiệm."))
        return _pack("Giải hệ phương trình", " ; ".join(_fmt(e.lhs) + "=" + _fmt(e.rhs) for e in eqs), steps, "Vô nghiệm")
    ans = " ; ".join(", ".join(f"{_fmt(k)} = {_fmt(v)}" for k, v in s.items()) for s in sol)
    steps.append(_step("Nghiệm", ans))
    return _pack("Giải hệ phương trình", " ; ".join(_fmt(e.lhs) + "=" + _fmt(e.rhs) for e in eqs), steps, ans)


def _pack(title, recognized, steps, answer) -> dict:
    return {
        "subject": "math",
        "title": title,
        "recognized_problem": recognized,
        "steps": steps,
        "answer": str(answer),
        "notes": ["Giải bằng bộ máy ký hiệu (SymPy) — đáp số được tính chính xác theo luật, không do AI suy đoán."],
        "source": "math-kernel",
    }


# ----------------------------------------------------------------------------
# Bộ phân loại + điều phối
# ----------------------------------------------------------------------------
_CONNECTORS = {
    "cua", "cho", "so", "ham", "sau", "day", "bieu", "thuc", "gia", "tri",
    "cac", "la", "voi", "phai", "theo", "bang", "khi", "ta", "co",
}
_ALLOWED_ALPHA = {
    "x", "y", "z", "t", "n", "a", "b", "c", "k", "m", "e", "pi", "oo", "i",
    "sqrt", "sin", "cos", "tan", "cot", "sec", "csc", "ln", "log", "exp", "abs",
}


def _strip_connectors(body: str) -> str:
    """Bỏ các từ nối tiếng Việt lọt vào biểu thức (của, hàm, cho...)."""
    out = []
    for tok in re.split(r"(\s+)", body):
        core = tok.strip()
        if core and _fold(core) in _CONNECTORS:
            continue
        out.append(tok)
    return "".join(out).strip()


def _looks_mathy(normalized: str) -> bool:
    """Chuỗi chỉ gồm số/toán tử/biến-hàm hợp lệ -> an toàn để tính như biểu thức."""
    if not re.search(r"[0-9]|[+\-*/^]", normalized):
        return False
    for word in re.findall(r"[a-zA-Z]+", normalized):
        if word.lower() not in _ALLOWED_ALPHA:
            return False
    return True


def _strip_command(folded_text: str, original: str) -> str:
    """Bỏ cụm lệnh tiếng Việt ở đầu để lấy biểu thức."""
    patterns = [
        r"^\s*(hay|h[aã]y)?\s*",
        r"(giai|tim|tinh|rut gon|phan tich|khai trien)\s+",
        r"(phuong trinh|bat phuong trinh|he phuong trinh|he|dao ham|nguyen ham|tich phan|gioi han|thanh nhan tu|nhan tu|bieu thuc|gia tri)\s*",
        r"(sau|sau day|cua)?\s*[:：]?\s*",
    ]
    # Cắt theo vị trí tương ứng trên chuỗi gốc bằng độ dài đã khớp trên folded
    cut = 0
    probe = folded_text
    for pat in patterns:
        m = re.match(pat, probe)
        if m:
            cut += m.end()
            probe = probe[m.end():]
    return original[cut:].strip() if cut < len(original) else original.strip()


def solve_math(problem: str, subject: str = "auto") -> dict | None:
    """Thử giải bằng kernel ký hiệu. None nếu không nhận dạng được dạng bài."""
    if sp is None or not (problem or "").strip():
        return None
    if subject not in ("auto", "math"):
        return None

    raw = problem.strip()
    folded = _fold(raw)

    try:
        # --- Giới hạn ---
        if "gioi han" in folded or re.search(r"\blim\b", folded):
            mp = re.search(r"(?:->|→|den|toi|to)\s*([0-9a-zA-Z\.\+\-]+)", folded)
            point = mp.group(1) if mp else "0"
            body = _strip_command(folded, raw)
            body = re.sub(r"(?i)lim", "", body)
            body = re.sub(r"(x|y|t)\s*(->|→|tien den|tien toi|tiến đến|tiến tới|den|đến|toi|tới|to)\s*[0-9a-zA-Z\.\+\-]+",
                          "", body, flags=re.IGNORECASE)
            return _limit(_strip_connectors(body), point)

        # --- Tích phân ---
        if "tich phan" in folded or "∫" in raw or "nguyen ham" in folded:
            body = raw.replace("∫", " ")
            mb = re.search(r"(?:từ|tu)\s+([0-9a-zA-Z\.\-]+)\s+(?:đến|den|tới|toi|->)\s+([0-9a-zA-Z\.\-]+)",
                           body, flags=re.IGNORECASE)
            definite = None
            if mb:
                definite = (mb.group(1), mb.group(2))
                body = (body[:mb.start()] + " " + body[mb.end():])
            body = _strip_command(_fold(body), body)
            body = re.sub(r"(?i)d\s*x\s*$", "", body.strip()).strip()
            body = _strip_connectors(body)
            return _integral(body, definite=definite)

        # --- Đạo hàm ---
        if "dao ham" in folded or "f'(" in raw:
            body = _strip_command(folded, raw)
            body = re.sub(r"(?i)^f\s*\(\s*x\s*\)\s*=\s*", "", body)
            return _derivative(_strip_connectors(body))

        # --- Hệ phương trình ---
        if "he phuong trinh" in folded or re.search(r"\bhe\b", folded):
            body = _strip_command(folded, raw)
            parts = re.split(r"[;\n]|\bva\b", body)
            parts = [p.strip() for p in parts if "=" in p]
            if len(parts) >= 2:
                return _solve_system(parts)

        # --- Phân tích nhân tử / khai triển ---
        if "nhan tu" in folded:
            return _factor(_strip_command(folded, raw))
        if "khai trien" in folded:
            return _expand(_strip_command(folded, raw))

        # --- Rút gọn ---
        if "rut gon" in folded:
            return _simplify(_strip_command(folded, raw))

        body = _strip_command(folded, raw)

        # --- Bất phương trình (có dấu so sánh) ---
        if re.search(r"(<=|>=|<|>|≤|≥)", raw) and "=" not in re.sub(r"(<=|>=)", "", raw):
            return _solve_inequality(_normalize(body))

        # --- Phương trình (có dấu =) ---
        if "=" in body:
            return _solve_equation(body)

        # --- "giải ..." mà không có = nhưng là biểu thức: thử rút gọn/tính ---
        if "giai" in folded or "tinh" in folded:
            # có ẩn -> rút gọn; không ẩn -> tính số
            ev = _evaluate(_strip_connectors(body))
            if ev is not None:
                return ev
            return _simplify(_strip_connectors(body))

        # --- Biểu thức trần (không có từ khoá lệnh) chỉ gồm toán: tính/rút gọn ---
        if _looks_mathy(_normalize(body)):
            ev = _evaluate(body)
            if ev is not None:
                return ev
            return _simplify(body)

        return None
    except Exception:
        # Kernel không chắc -> nhường AI
        return None
