/* ============================================================
   MathVision PRO — cấu hình Supabase (ĐĂNG NHẬP ĐÁM MÂY)
   ------------------------------------------------------------
   Dán 2 khóa của bạn vào đây. Lấy tại:
     Supabase Dashboard > Project Settings > API
   - url     : "Project URL"   (vd: https://abcdxyz.supabase.co)
   - anonKey : "anon public"   (khóa CÔNG KHAI — an toàn để ở client)
   TUYỆT ĐỐI KHÔNG dán "service_role" key vào đây.

   Để TRỐNG hai khóa => ứng dụng tự chạy ở chế độ lưu CỤC BỘ trên thiết bị
   (không đồng bộ đám mây), vẫn dùng bình thường.
   ============================================================ */
window.MATHVISION_SUPABASE = {
  url: '',
  anonKey: '',
};
