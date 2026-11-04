# Kích hoạt đăng nhập đám mây (Supabase)

Ứng dụng đã tích hợp sẵn Supabase. Khi **chưa** dán khóa, app chạy ở chế độ lưu
cục bộ trên thiết bị (vẫn dùng bình thường). Làm 5 bước dưới đây để bật đăng nhập
đám mây + đồng bộ giáo án đa thiết bị.

## 1. Tạo project Supabase
- Vào https://supabase.com → đăng nhập → **New project** (free).
- Đặt tên, chọn region gần (Singapore), đặt Database Password (lưu lại).

## 2. Tạo bảng + bảo mật (RLS)
Mở **SQL Editor** trong dashboard, dán và chạy:

```sql
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  problem text not null check (char_length(problem) between 1 and 20000),
  created_at timestamptz not null default now()
);

create index if not exists lessons_user_idx on public.lessons (user_id, created_at desc);

-- BẮT BUỘC: bật RLS. Đây là lớp bảo vệ dữ liệu (không phải việc giấu anon key).
alter table public.lessons enable row level security;
alter table public.lessons force row level security;

create policy "lessons_select_own" on public.lessons
  for select using (auth.uid() = user_id);
create policy "lessons_insert_own" on public.lessons
  for insert with check (auth.uid() = user_id);
create policy "lessons_update_own" on public.lessons
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "lessons_delete_own" on public.lessons
  for delete using (auth.uid() = user_id);
```

RLS đảm bảo mỗi giáo viên chỉ đọc/ghi giáo án của **chính mình**; CHECK giới hạn
độ dài tránh lạm dụng dung lượng.

**Kiểm tra RLS đã bật** (chạy sau khi tạo bảng — phải trả về `rowsecurity = true`):

```sql
select relname, relrowsecurity as rls_on, relforcerowsecurity as rls_forced
from pg_class where relname = 'lessons';
```
Nếu `rls_on` là `false`, bất kỳ ai có anon key (công khai) đều đọc/ghi được mọi dữ
liệu — PHẢI bật RLS trước khi dùng thật.

## 3. Bật phương thức đăng nhập
**Authentication > Providers:**
- **Email**: bật (mặc định đã bật). **Khuyến nghị GIỮ "Confirm email" BẬT** để tránh
  đăng ký bằng email giả — giáo viên bấm link trong hộp thư rồi mới đăng nhập được.
  (Chỉ tắt nếu bạn chấp nhận đánh đổi tiện lợi lấy an toàn, ví dụ khi chạy thử nội bộ.)
- **Google** (tuỳ chọn, cho nút "Tiếp tục với Google"):
  1. Tạo OAuth client ở https://console.cloud.google.com → *APIs & Services > Credentials*
     → *Create credentials > OAuth client ID > Web application*.
  2. Ở mục **Authorized redirect URIs** thêm:
     `https://<PROJECT-REF>.supabase.co/auth/v1/callback`
     (thay `<PROJECT-REF>` bằng mã project của bạn — thấy trong Project URL).
  3. Copy **Client ID** và **Client Secret** dán vào Supabase (Providers > Google) → Save.

## 4. Cấu hình URL chuyển hướng
**Authentication > URL Configuration:**
- **Site URL**: `https://mathvision-igrb.onrender.com`
- **Redirect URLs**: thêm **chính xác** `https://mathvision-igrb.onrender.com`
  (và `http://localhost:*` nếu test máy). **Không** dùng ký tự đại diện rộng kiểu `*`
  — danh sách quá hở có thể bị lợi dụng chuyển hướng (open redirect).

> Lưu ý: Đăng nhập **Google trên bản web** hoạt động ngay. Đăng nhập Google trong
> **app Android (APK)** cần cấu hình deep-link riêng — email/mật khẩu thì chạy tốt
> trên cả web lẫn APK. Nếu cần Google trên APK, báo tôi làm bước deep-link sau.

## 4b. Tăng cường bảo mật (nên bật)
Trong **Authentication**:
- **Password security**: bật "Leaked password protection" (chặn mật khẩu đã lộ theo
  HaveIBeenPwned) và đặt **độ dài tối thiểu ≥ 8** ký tự.
- **Rate limiting / CAPTCHA**: bật CAPTCHA cho đăng ký/đăng nhập nếu mở công khai
  (chống dò mật khẩu và spam đăng ký). Supabase có sẵn tích hợp hCaptcha/Turnstile.
- **MFA** (tuỳ chọn): có thể bật xác thực 2 lớp nếu cần.
- Giữ các khóa ở **Project Settings > API**; nếu lỡ lộ `service_role` thì bấm
  **Reset** ngay.

## 5. Dán khóa vào ứng dụng
Mở **Project Settings > API**, copy:
- **Project URL**
- **anon public** key (khóa CÔNG KHAI, an toàn để ở client — KHÔNG dùng `service_role`).

Mở file `supabase-config.js` ở gốc repo và điền:

```js
window.MATHVISION_SUPABASE = {
  url: 'https://<PROJECT-REF>.supabase.co',
  anonKey: 'eyJhbGciOi...(anon public)...',
};
```

Commit + push → Render tự deploy, APK build lại. Xong: màn đăng nhập sẽ hiện email/
mật khẩu + nút Google, giáo án lưu lên đám mây và đồng bộ mọi thiết bị.

---
## Tóm tắt bảo mật
- **anon public key là CÔNG KHAI** — nó nằm trong code client ai cũng xem được. Điều
  này an toàn **chỉ khi RLS được bật** (bước 2). RLS mới là thứ bảo vệ dữ liệu, không
  phải việc giấu key. Không bao giờ đưa `service_role` key vào client/repo.
- Mật khẩu do **Supabase băm & lưu** (bcrypt) — ứng dụng không bao giờ thấy/lưu mật khẩu.
- Phiên đăng nhập (JWT) lưu ở localStorage của thiết bị; "Đăng xuất" xoá phiên. Trên
  máy dùng chung, nhớ đăng xuất.
- Ứng dụng chỉ chèn nội dung bằng `textContent`/KaTeX (không dùng innerHTML với dữ liệu
  người dùng) nên tránh được XSS cơ bản.
