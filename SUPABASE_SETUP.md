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
  title text not null,
  problem text not null,
  created_at timestamptz not null default now()
);

alter table public.lessons enable row level security;

create policy "lessons_select_own" on public.lessons
  for select using (auth.uid() = user_id);
create policy "lessons_insert_own" on public.lessons
  for insert with check (auth.uid() = user_id);
create policy "lessons_update_own" on public.lessons
  for update using (auth.uid() = user_id);
create policy "lessons_delete_own" on public.lessons
  for delete using (auth.uid() = user_id);
```

RLS đảm bảo mỗi giáo viên chỉ đọc/ghi giáo án của chính mình.

## 3. Bật phương thức đăng nhập
**Authentication > Providers:**
- **Email**: bật (mặc định đã bật). Để dùng nhanh, có thể tắt "Confirm email"
  trong *Authentication > Sign In / Providers > Email* (giáo viên đăng ký là vào luôn,
  không cần bấm link email). Nếu để bật thì phải xác nhận email trước khi đăng nhập.
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
- **Redirect URLs**: thêm `https://mathvision-igrb.onrender.com` (và `http://localhost` nếu test máy).

> Lưu ý: Đăng nhập **Google trên bản web** hoạt động ngay. Đăng nhập Google trong
> **app Android (APK)** cần cấu hình deep-link riêng — email/mật khẩu thì chạy tốt
> trên cả web lẫn APK. Nếu cần Google trên APK, báo tôi làm bước deep-link sau.

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
**Bảo mật:** chỉ dán `anon public` key. Không bao giờ đưa `service_role` key vào code
client hay repo công khai.
