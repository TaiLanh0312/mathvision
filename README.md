# MathVision PRO

Web App cho giáo viên Toán THPT với bản Android cài đặt riêng. Giao diện, renderer 3D và bộ
công thức được đóng gói cục bộ; dựng hình AI, OCR và lời giải gọi backend FastAPI + Gemini.

## Tính năng
1. **Tab Giải bài** — nhập/chụp đề Toán, Lý, Hóa, Sinh, Văn, Anh, Trung giản thể/phồn thể,
   Sử, Địa, GDCD/Kinh tế & Pháp luật, Tin học và môn khác; giải bằng Gemini đồng thời mở Google
   để người học đối chiếu kết quả web.
2. **Tab Dựng hình** — dựng & bóc tách hình học không gian theo layer (Three.js).
3. **Graph AI Grader** — chấm lỗi vẽ đồ thị qua webcam hoặc ảnh.
4. **Snap to LaTeX** — số hóa công thức toán thành LaTeX.

## Chạy dự án

> ⚠️ Không mở `index.html` bằng `file://` — trình duyệt chặn ES module. Phải chạy qua HTTP.

```bash
npm install
npm run build:web
cd backend
python -m venv .venv
# Windows:  .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt

# (tuỳ chọn) bật AI thật:
cp .env.example .env      # điền GEMINI_API_KEY

uvicorn main:app --reload --port 8000
```

Mở **http://localhost:8000** — backend phục vụ luôn frontend.

- Smart 3D cần `GEMINI_API_KEY`. Nếu thiếu khóa hoặc AI không trả được scene hợp lệ,
  ứng dụng báo lỗi và không thay đề bằng hình mẫu.
- Bộ giải đa môn nhận văn bản/ảnh qua `/api/study/solve`; thao tác giải mở tìm kiếm Google song song.
  Kết quả Google hiển thị ở tab riêng để người dùng đọc nguồn; nội dung web không được tự động đưa vào
  Gemini hoặc xác minh chéo trong backend.
- Phản hồi lời giải và phần sửa được lưu cục bộ trong trình duyệt/thiết bị. Chỉ các mẫu người dùng
  đánh dấu sai và nhập lời giải đã kiểm chứng mới được xuất JSONL để đánh giá/tinh chỉnh riêng.
  Việc xuất dữ liệu chưa tự chạy job fine-tuning; model hiện tại dùng Gemini API, còn fine-tuning
  Gemini cần project Google Cloud/Vertex AI, dữ liệu có nhãn và cấu hình thanh toán/quyền truy cập.

## Kiến trúc dựng hình và giải: kernel trước, AI bổ sung

Khi bấm "Dựng & Bóc Tách 3D":

1. Kernel nội bộ dựng nhanh những dạng đã hỗ trợ; dạng khác được gửi cho Gemini để trích dữ kiện,
   dựng scene 2D/3D, và liệt kê giả định hoặc dữ kiện chưa xác định.
2. Các scene/lời giải thiếu trường hoặc bỏ sót ý được gửi thêm một lượt để AI tự sửa; backend
   kiểm tra tham chiếu điểm, cạnh, mặt, đa giác, dấu vuông góc, quan hệ tọa độ và mức bao phủ ý hỏi.
3. Lời giải được tạo, kiểm tra cấu trúc, rồi một lượt AI suy luận độc lập giải lại. Nếu chưa
   xác nhận được, giao diện đánh dấu chưa kiểm chứng. Khi AI dựng hình lỗi, giao diện vẫn thử
   giải riêng bằng văn bản.

Luồng hình học mặc định dùng `gemini-flash-lite-latest` để giảm thời gian phản hồi; mỗi lượt gọi
Gemini có timeout 90 giây và không lặp retry mạng tự động để tránh chờ nhiều phút. Có thể đổi
timeout qua `GEMINI_TIMEOUT_MS`. Cấu hình
`GEMINI_GEOMETRY_MODEL` và `GEMINI_REASONING_MODEL` có thể chọn model khác. Các endpoint gọi
Gemini chạy ngoài event loop để một yêu cầu chậm không chặn các request khác. Lời giải vẫn được
một lượt độc lập kiểm tra, nên cần hai lượt Gemini; nếu lượt kiểm tra lỗi, lời giải đầu được giữ
nhưng đánh dấu chưa xác minh. Đây vẫn là hệ thống AI có kiểm tra cấu trúc/toạ độ, chưa phải bộ
chứng minh tổng quát; cần đánh giá trên bộ đề chuẩn trước
khi xem là đáng tin cậy cho mọi dạng bài.

Tất cả đều trả về cùng một *scene spec* JSON khai báo (`points / solidEdges /
dashedEdges / faces / curves / layers / entities / steps`). `geometry3d.js` là renderer
độc lập với GeoGebra; nó nhận scene đã kiểm tra và dựng bằng Three.js.

### Bản Android

Ứng dụng Android đóng gói giao diện ngay trong APK và dùng Google ML Kit Document Scanner để
quét/cắt/chỉnh nhiều trang đề. OCR, dựng hình và giải vẫn gọi Gemini trên Render nên cần Internet.
Lần đầu mở Scanner có thể cần tải thành phần của Google Play services. Bản APK debug tạo bởi
GitHub Actions nằm trong artifact `MathVision-Android-APK` của workflow **Build Android APK**.

### Đóng gói APK Android

```powershell
npm install
npm run android:apk
```

Máy build cục bộ cần Node.js 22+, JDK 21 và Android SDK API 36. Chạy `npm run android:apk` để
tạo `dist/MathVision.apk`; APK debug cài được bằng cách mở file trên điện thoại Android.

> Các kiểm tra hiện xác nhận cấu trúc scene và những ràng buộc AI đã khai báo; chúng chưa
> phải bộ chứng minh hình học tổng quát. Với bài toán không xác định duy nhất, cần nêu rõ
> dữ kiện thiếu thay vì xem hình minh họa là đáp án chính xác.

## Cấu trúc
```
index.html, app.js                  # frontend shell (served by FastAPI)
geometry3d.js                       # renderer Three.js (nhận scene spec)
geokernel.js                        # kernel client-side cho các dạng hình đã hỗ trợ
backend/
  main.py           # FastAPI app + scene/solution validation + static mount
  geometry_validation.py # kiểm tra topology, tọa độ và ràng buộc
  gemini_client.py  # gọi Gemini để dựng và kiểm tra lời giải
  prompts.py        # system prompt + one-shot
  samples.py        # scene mock offline
  requirements.txt
  .env.example
```
