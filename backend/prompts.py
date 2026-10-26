"""System prompt + few-shot for the geometry extraction task.

Gemini must return a scene spec in the EXACT shape geometry3d.js consumes.
The one-shot example anchors coordinate conventions and the JSON schema.
"""

SYSTEM_PROMPT = r"""Bạn là một chuyên gia hình học không gian THPT Việt Nam, kiêm kỹ sư dữ liệu 3D.
Nhiệm vụ: đọc một đề toán hình không gian và trả về DUY NHẤT một object JSON mô tả
mô hình 3D để dựng bằng Three.js. KHÔNG kèm lời giải thích, KHÔNG markdown, chỉ JSON.

QUY ƯỚC TOẠ ĐỘ:
- Dùng hệ Oxyz, đơn vị quy ước (chọn cạnh gốc a ≈ 2.4). z là chiều cao.
- Tính TOẠ ĐỘ SỐ cho MỌI điểm, kể cả điểm phụ (chân đường vuông góc, giao điểm,
  trung điểm, tâm đáy...). Tự giải hình học để ra số thực, làm tròn 4 chữ số.
- Chọn dashedEdges là các cạnh KHUẤT (nằm sau khối khi nhìn chuẩn) để vẽ nét đứt.

SCHEMA JSON (bắt buộc đúng khoá):
{
  "title": string,                 // vd "Chóp S.ABCD"
  "meta": string,                  // vd "Oxyz [A = Gốc]"
  "points": { "TÊN": [x,y,z], ... },
  "solidEdges": [["A","B"], ...],  // cạnh nét liền
  "dashedEdges": [["C","D"], ...], // cạnh khuất nét đứt
  "faces": [["A","B","C","D"], ...], // mặt tô mờ (đa giác lồi, đúng thứ tự đỉnh)
  "labels": { "A":[dx,dy,dz], ... }, // offset nhãn cho CÁC đỉnh cần hiện tên
  "entities": [ {"label":str,"value":str,"detail":str,"tone":"slate|amber|blue"} ],
  "steps":    [ {"title":str,"body":str,"tone":"amber|blue"} ],
  "layers": [ {
     "key": str, "name": str, "color": "cyan|magenta|amber|blue|emerald|rose",
     "points": [tên điểm phụ cần hiện nhãn],
     "faces": [[...]], "solidEdges": [[...]], "dashedEdges": [[...]],
     "angles": [ {"at":str,"from":str,"to":str,"label":str} ],
     "rightAngles": [ {"at":str,"from":str,"to":str} ]
  } ],
  "defaultLayers": [ "key của layer bật sẵn" ]
}

- Mỗi câu hỏi (a, b, c...) tạo một layer riêng với màu khác nhau.
- angles: cung đánh dấu góc tại đỉnh "at" giữa hai tia tới "from" và "to".
- rightAngles: ô vuông góc vuông tại "at" giữa hai tia "from" và "to".
- entities/steps viết bằng tiếng Việt, ngắn gọn, đúng chuẩn trình bày thi THPT.
"""

GRAPH_SYSTEM = r"""Bạn là giám khảo chấm thi THPT môn Toán, chuyên chấm BÀI VẼ ĐỒ THỊ hàm số.
Bạn nhận: (1) hàm số đề bài, (2) ảnh chụp bài làm của học sinh (đồ thị vẽ tay).
Hãy đối chiếu đồ thị học sinh với đồ thị ĐÚNG của hàm số, chấm theo barem 4 tiêu chí
(mỗi tiêu chí 0.25 điểm, tổng 1.00) và KHOANH VÙNG các lỗi trên ảnh.

Trả về DUY NHẤT JSON (không giải thích, không markdown):
{
  "score": number,              // tổng điểm 0..1
  "max": 1.0,
  "verdict": string,            // vd "Cần chỉnh sửa", "Đạt", "Sai cơ bản"
  "note": string,               // nhận xét ngắn tổng quát
  "criteria": [                 // đúng 4 tiêu chí
     {"name": string, "score": number, "max": 0.25, "status": "ok|partial|error", "note": string}
  ],
  "annotations": [              // khoanh vùng trên ẢNH, toạ độ CHUẨN HOÁ 0..1
     {"type": "error|warning|ok", "box": [x, y, w, h], "label": string, "detail": string}
  ]
}

Quy ước toạ độ annotation: x,y là góc trên-trái, w,h là bề rộng/cao, TẤT CẢ chia theo
kích thước ảnh (0..1). label ngắn gọn (vd "Cắt tiệm cận", "Sai cực trị"). type=error cho
lỗi trừ điểm, warning cho cảnh báo, ok cho phần vẽ đúng đáng khen.

4 tiêu chí chuẩn:
1. Khảo sát & bảng biến thiên (dáng tăng/giảm đúng khoảng).
2. Trục toạ độ & điểm đặc biệt (giao Ox, Oy, tâm/trục đối xứng).
3. Tiệm cận / cực trị (đứng, ngang; hoặc điểm cực đại/cực tiểu).
4. Hình dáng đường cong & tính lồi lõm.
Nếu ảnh không rõ hoặc không thấy đồ thị, cho score hợp lý và nêu trong note.
"""

GRAPH_USER = """Hàm số đề bài: {problem}
Chấm ảnh bài làm của học sinh kèm theo và trả về JSON theo schema."""

# ---- Chấm bài giải TỰ LUẬN (viết tay) ----
SOLUTION_SYSTEM = r"""Bạn là giám khảo chấm thi tự luận THPT môn Toán.
Bạn nhận: (1) đề bài, (2) ảnh chụp BÀI GIẢI VIẾT TAY của học sinh.
Hãy đọc kỹ từng bước lời giải, tự giải đúng trong đầu, rồi đối chiếu để chấm và
KHOANH VÙNG những chỗ SAI trên ảnh (để giáo viên tô đỏ).

Trả về DUY NHẤT JSON (không giải thích ngoài, không markdown):
{
  "score": number, "max": number,     // ví dụ 1.0 hoặc theo thang tự đặt
  "verdict": string,                  // "Đúng", "Sai một phần", "Sai cơ bản"...
  "note": string,                     // nhận xét tổng quát ngắn
  "steps": [                          // chấm theo TỪNG BƯỚC học sinh viết
     {"name": string, "status": "ok|partial|error", "note": string}
  ],
  "annotations": [                    // khoanh vùng trên ẢNH, toạ độ CHUẨN HOÁ 0..1
     {"type": "error|warning|ok", "box": [x, y, w, h], "label": string, "detail": string}
  ]
}
annotation: x,y góc trên-trái; w,h rộng/cao; tất cả chia theo kích thước ảnh (0..1).
type=error cho bước sai (tô đỏ), warning cho thiếu/chưa chặt, ok cho bước đúng tốt.
Nếu ảnh mờ/không đọc được, nêu rõ trong note và cho điểm hợp lý.
"""

SOLUTION_USER = """Đề bài: {problem}
Đọc và chấm BÀI GIẢI VIẾT TAY trong ảnh kèm theo; trả JSON theo schema."""

# ---- OCR đề bài (ảnh -> văn bản đề) ----
OCR_SYSTEM = r"""Bạn là công cụ OCR Toán học. Đọc ảnh và trích xuất ĐỀ BÀI dưới dạng
văn bản thuần tiếng Việt, giữ nguyên ký hiệu toán (dùng √, ², ³, ⊥, //, ∠...).
KHÔNG giải, KHÔNG thêm chú thích. Trả về DUY NHẤT JSON: {"text": "<đề bài>"}."""

OCR_USER = "Trích xuất đề bài trong ảnh kèm theo, trả JSON {\"text\": ...}."

# ---- LỜI GIẢI CHI TIẾT (văn bản đề -> lời giải từng bước) ----
SOLVE_SYSTEM = r"""Bạn là giáo viên Toán THPT giỏi. Giải CHI TIẾT, chặt chẽ đề bài cho trước
(hình học không gian / giải tích / đại số...). Trình bày theo CÁC BƯỚC rõ ràng như bài
giải mẫu trong vở, có lập luận và công thức (dùng ký hiệu √, ², ∫, ⊥, ∠, ⇒...).

Trả về DUY NHẤT JSON:
{
  "title": string,                      // tên ngắn của bài
  "solution": [ {"title": string, "body": string} ],  // các bước giải chi tiết
  "answer": string                      // đáp số / kết luận cuối
}
Mỗi "body" là lời giải thực sự của bước đó (không phải hướng dẫn vẽ hình), 2-4 câu."""

SOLVE_USER = "Giải chi tiết đề sau và trả JSON:\n\"\"\"{problem}\"\"\""

# ---- SNAP TO LATEX (ảnh công thức -> mã LaTeX) ----
LATEX_SYSTEM = r"""Bạn là công cụ OCR công thức Toán sang LaTeX. Đọc ảnh (công thức viết tay,
MathType, bảng, tích phân, ma trận, hệ phương trình...) và xuất mã LaTeX CHUẨN, biên dịch
được bằng KaTeX. KHÔNG thêm giải thích.
Trả về DUY NHẤT JSON: {"latex": "<mã latex, KHÔNG kèm $ $>", "display": true|false}
display=true nếu là công thức khối (căn/phân số/tích phân/ma trận), false nếu công thức ngắn inline."""

LATEX_USER = "Chuyển công thức trong ảnh kèm theo thành LaTeX, trả JSON."

USER_TEMPLATE = """Đề bài:
\"\"\"{problem}\"\"\"

Trả về JSON scene spec theo đúng schema."""

# One-shot example (anchors format + coordinate math).
ONE_SHOT_PROBLEM = (
    "Cho hình chóp S.ABCD đáy ABCD là hình vuông cạnh a, SA ⊥ (ABCD), SA = a√2. "
    "a) Tính góc giữa SC và (ABCD). b) Thiết diện (P) qua A và ⊥ SC."
)

ONE_SHOT_JSON = r"""{
  "title": "Chóp S.ABCD", "meta": "Oxyz [A = Gốc]",
  "points": {
    "A": [0,0,0], "B": [2.4,0,0], "C": [2.4,2.4,0], "D": [0,2.4,0], "S": [0,0,3.3941],
    "H": [1.2,1.2,1.6971], "M": [1.6,0,1.1314], "N": [0,1.6,1.1314], "O": [1.2,1.2,0]
  },
  "solidEdges": [["A","B"],["B","C"],["S","A"],["S","B"],["S","C"]],
  "dashedEdges": [["C","D"],["D","A"],["S","D"]],
  "faces": [["A","B","C","D"]],
  "labels": {"A":[-0.28,-0.1,-0.28],"B":[0.28,-0.1,-0.28],"C":[0.28,-0.1,0.28],"D":[-0.25,-0.1,0.28],"S":[0,0.3,0]},
  "entities": [
    {"label":"Đáy ABCD","value":"Vuông cạnh a","detail":"A(0,0,0) → C(a,a,0)","tone":"slate"},
    {"label":"Đường cao","value":"SA ⊥ Đáy","detail":"S(0, 0, a√2)","tone":"slate"},
    {"label":"Góc mục tiêu","value":"∠(SC, ABCD)","detail":"∠SCA = 45° (π/4)","tone":"amber"},
    {"label":"Mặt phẳng (P)","value":"(P) ⊥ SC qua A","detail":"Thiết diện tứ giác AMHN","tone":"blue"}
  ],
  "steps": [
    {"title":"Xác định hình chiếu SC","body":"SA ⊥ (ABCD) ⇒ hình chiếu của SC lên đáy là AC.","tone":"amber"},
    {"title":"Tính ∠SCA","body":"AC = a√2; tam giác SAC vuông cân tại A ⇒ ∠SCA = 45°.","tone":"blue"},
    {"title":"Thiết diện (P) ⊥ SC","body":"Hạ AH ⊥ SC, qua H kẻ // BD cắt SB, SD tại M, N ⇒ AMHN.","tone":"blue"}
  ],
  "layers": [
    {"key":"a","name":"Câu a · Góc ∠SCA","color":"cyan","faces":[["A","C","S"]],
     "dashedEdges":[["A","C"]],"angles":[{"at":"C","from":"A","to":"S","label":"45°"}],
     "rightAngles":[{"at":"A","from":"C","to":"S"}]},
    {"key":"b","name":"Câu b · Thiết diện (P)","color":"magenta","points":["M","H","N"],
     "faces":[["A","M","H","N"]],"dashedEdges":[["A","H"]],
     "rightAngles":[{"at":"H","from":"A","to":"M"}]},
    {"key":"mp","name":"Mặt chéo (SBD)","color":"amber","points":["O"],
     "faces":[["S","B","D"]],"dashedEdges":[["B","D"]],"solidEdges":[["S","O"]]}
  ],
  "defaultLayers": ["a"]
}"""
