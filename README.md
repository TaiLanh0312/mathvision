# MathVision PRO

Web App thin-client cho giáo viên Toán THPT. Frontend siêu nhẹ (HTML + Vanilla JS +
Tailwind CDN + Three.js), xử lý hình học nặng đẩy lên backend (FastAPI + Gemini).

## Tính năng
1. **Smart 3D Geometry** — dựng & bóc tách hình học không gian theo layer (Three.js).
2. **Graph AI Grader** — chấm lỗi vẽ đồ thị qua webcam (sắp tới).
3. **Snap to LaTeX** — số hóa công thức toán thành LaTeX (sắp tới).

## Chạy dự án

> ⚠️ Không mở `index.html` bằng `file://` — trình duyệt chặn ES module. Phải chạy qua HTTP.

```bash
cd backend
python -m venv .venv
# Windows:  .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt

# (tuỳ chọn) bật AI thật:
cp .env.example .env      # rồi điền GEMINI_API_KEY

uvicorn main:app --reload --port 8000
```

Mở **http://localhost:8000** — backend phục vụ luôn frontend.

- Smart 3D cần `GEMINI_API_KEY`. Nếu thiếu khóa hoặc AI không trả được scene hợp lệ,
  ứng dụng báo lỗi và không thay đề bằng hình mẫu.

## Kiến trúc dựng hình và giải: AI-first, có kiểm tra
Khi bấm "Dựng & Bóc Tách 3D":

1. Toàn bộ đề được gửi cho Gemini để trích các ý hỏi, dựng scene 2D/3D, và liệt kê giả định
   hoặc dữ kiện chưa xác định.
2. Các scene/lời giải thiếu trường hoặc bỏ sót ý được gửi thêm một lượt để AI tự sửa; backend
   kiểm tra tham chiếu điểm, cạnh, mặt, đa giác, dấu vuông góc, quan hệ tọa độ và mức bao phủ ý hỏi.
3. Lời giải được tạo, kiểm tra cấu trúc, rồi một lượt AI suy luận độc lập giải lại. Nếu chưa
   xác nhận được, giao diện đánh dấu chưa kiểm chứng; không dùng lời giải/hình mẫu thay thế.

Luồng hình học mặc định dùng `gemini-3.8-flash`; đề ngắn dùng suy luận mức vừa, đề dài/nhiều ý
hoặc có cấu trúc chứng minh phức tạp tự nâng lên mức cao. Có thể đặt
`GEMINI_GEOMETRY_MODEL` và `GEMINI_REASONING_MODEL` trên Render để chọn model khác có hỗ trợ
Gemini API. Lời giải vẫn được một lượt độc lập kiểm tra; mức suy luận cao tăng thời gian và lượng token sử dụng. Đây vẫn là hệ thống AI có
kiểm tra cấu trúc/toạ độ, chưa phải bộ chứng minh tổng quát; cần đánh giá trên bộ đề chuẩn trước
khi xem là đáng tin cậy cho mọi dạng bài.

Tất cả đều trả về cùng một *scene spec* JSON khai báo (`points / solidEdges /
dashedEdges / faces / curves / layers / entities / steps`). `geometry3d.js` là renderer
độc lập với GeoGebra; nó nhận scene đã kiểm tra và dựng bằng Three.js.

> Các kiểm tra hiện xác nhận cấu trúc scene và những ràng buộc AI đã khai báo; chúng chưa
> phải bộ chứng minh hình học tổng quát. Với bài toán không xác định duy nhất, cần nêu rõ
> dữ kiện thiếu thay vì xem hình minh họa là đáp án chính xác.

## Cấu trúc
```
index.html, app.js                  # frontend shell (served by FastAPI)
geometry3d.js                       # renderer Three.js (nhận scene spec)
geokernel.js                        # các bộ dựng/vector client-side cũ; Smart 3D hiện gửi AI trước
backend/
  main.py           # FastAPI app + scene/solution validation + static mount
  geometry_validation.py # kiểm tra topology, tọa độ và ràng buộc
  gemini_client.py  # gọi Gemini để dựng và kiểm tra lời giải
  prompts.py        # system prompt + one-shot
  samples.py        # scene mock offline
  requirements.txt
  .env.example
```
