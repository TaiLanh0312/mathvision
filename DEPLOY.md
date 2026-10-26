# Publish MathVision cho tester

App gồm **frontend tĩnh + backend FastAPI (gọi Gemini)**, nên phải chạy cả backend.
Chọn 1 trong 3 cách dưới.

> ⚠️ Khi publish, **khoá GEMINI_API_KEY của bạn sẽ bị tester dùng chung** (tốn quota).
> Không commit `backend/.env` lên GitHub (đã nằm trong `.gitignore`). Đặt khoá bằng
> biến môi trường của nhà cung cấp.

---

## Cách A — Tunnel nhanh (0 cài đặt, hợp test ngắn)
Máy bạn phải bật + chạy backend. Testers vào qua link công khai tạm thời.

Cửa sổ 1 — chạy app:
```
cd C:\Users\ADMIN\Downloads\GeoPro\backend
py -m uvicorn main:app --port 8000
```
Cửa sổ 2 — mở tunnel (Windows có sẵn `ssh`):
```
ssh -R 80:localhost:8000 nokey@localhost.run
```
Màn hình sẽ in ra một URL dạng `https://xxxx.lhr.life` → gửi link này cho tester.
(Tắt cửa sổ là link ngừng. Máy tắt thì link chết.)

Thay thế: nếu có cài **cloudflared**:
```
cloudflared tunnel --url http://localhost:8000
```

---

## Cách B — Render.com (miễn phí, URL cố định) ✅ khuyến nghị
1. Đưa thư mục `GeoPro` lên GitHub (repo mới).
2. Vào https://render.com → **New +** → **Web Service** → kết nối repo.
3. Render tự nhận `Dockerfile` (Runtime = Docker). Plan **Free**.
4. Mục **Environment** → thêm biến bí mật:
   - `GEMINI_API_KEY` = khoá của bạn
   - `GEMINI_MODEL` = `gemini-flash-lite-latest`
5. **Create Web Service**. Chờ build ~2-3 phút → được link `https://mathvision-xxxx.onrender.com`.

(Có sẵn `render.yaml` nếu dùng Blueprint. Lưu ý: plan Free "ngủ" sau 15 phút không dùng,
lần truy cập đầu sẽ chờ ~30s khởi động lại.)

---

## Cách C — Hugging Face Spaces (Docker)
1. https://huggingface.co/new-space → **Docker** (Blank) → tạo Space.
2. Upload toàn bộ file dự án (hoặc `git push` vào repo của Space).
3. Space Settings → **Variables and secrets** → thêm secret:
   - `GEMINI_API_KEY` = khoá
   - `GEMINI_MODEL` = `gemini-flash-lite-latest`
4. Space tự build `Dockerfile` (cổng 7860 đã cấu hình) → link `https://<user>-<space>.hf.space`.

---

## Kiểm tra sau khi publish
- Mở `/<link>/api/health` → thấy `{"ok":true,"gemini":true}` là backend + khoá OK.
- Dạng hình chuẩn vẫn dựng tức thì (kernel, không cần backend).
- Chấm bài / OCR / lời giải chi tiết cần backend → test trên link.
