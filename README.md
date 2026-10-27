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

1. Toàn bộ đề được gửi cho Gemini để trích các ý hỏi, dựng scene 3D, và liệt kê giả định
   hoặc dữ kiện chưa xác định.
2. Backend kiểm tra tham chiếu điểm, cạnh, mặt, đa giác, dấu vuông góc và các ràng buộc
   hình học mà AI khai báo trước khi cho renderer nhận scene.
3. Lời giải được tạo ở một lượt AI rồi một lượt khác giải lại độc lập. Nếu chưa xác nhận
   được, giao diện đánh dấu chưa kiểm chứng; không dùng lời giải/hình mẫu thay thế.

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
