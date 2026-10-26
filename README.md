# MathVision PRO

Web App thin-client cho giáo viên Toán THPT. Frontend siêu nhẹ (HTML + Vanilla JS +
Tailwind CDN + Three.js), xử lý nặng đẩy lên backend Cloud (FastAPI + Gemini 1.5 Pro).

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

- **Chưa cấu hình `GEMINI_API_KEY`** → nút "Dựng & Bóc Tách 3D" trả về **bài mẫu
  offline** (chế độ demo) để toàn bộ luồng vẫn chạy.
- **Đã cấu hình khoá** → đề bài được gửi lên Gemini 1.5 Pro, trả về JSON scene spec
  và dựng hình thật.

## Kiến trúc dựng hình: Kernel-first (nhanh < 50ms)
Dựng hình KHÔNG phụ thuộc LLM. Thứ tự xử lý khi bấm "Dựng & Bóc Tách 3D":

1. **Geometry Kernel nội bộ** (`geokernel.js`, chạy 100% trên trình duyệt) — parser
   nhận diện loại hình + tham số + câu hỏi, rồi giải bằng đại số vector (toạ độ, điểm
   phụ, thiết diện ⊥ đường, góc đường–mặt, mặt chéo). **Tức thì (~1ms), không gọi mạng.**
   Hỗ trợ: chóp đáy vuông/chữ nhật (SA⊥đáy), chóp tam giác đều, lăng trụ tam giác đều,
   lập phương, hộp chữ nhật.
2. **AI tổng quát — Gemini flash-lite** (`/api/geometry/parse`) — gọi khi kernel chưa
   nhận diện được hình. AI đọc hiểu đề BẤT KỲ và sinh scene spec. Dùng model
   `gemini-flash-lite-latest` (KHÔNG "thinking") qua SDK `google-genai` nên ~2-4s.
   (Lưu ý: model pro/thinking chậm 60-90s — tránh dùng.)

Tất cả đều trả về cùng một *scene spec* JSON khai báo (`points / solidEdges /
dashedEdges / faces / layers / entities / steps`). `geometry3d.js` là renderer thuần —
nhận spec và dựng. Kernel, AI và thư viện mẫu dùng chung một định dạng.

> Triết lý thin-client: dựng hình là toán vector nhẹ → làm ngay tại client cho nhanh.
> Chỉ tác vụ thị giác nặng (chấm đồ thị, OCR LaTeX) mới đẩy lên Cloud.

## Cấu trúc
```
index.html, app.js                  # frontend shell (served by FastAPI)
geometry3d.js                       # renderer Three.js (nhận scene spec)
geokernel.js                        # BỘ GIẢI hình học client-side (nhanh < 50ms)
backend/
  main.py           # FastAPI app + static mount
  gemini_client.py  # gọi Gemini 1.5 Pro
  prompts.py        # system prompt + one-shot
  samples.py        # scene mock offline
  requirements.txt
  .env.example
```
