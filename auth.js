/* ============================================================
   MathVision PRO — auth.js
   Bọc Supabase Auth + bảng "lessons" (đồng bộ đám mây).
   Nạp SAU: supabase-config.js và vendor/supabase.js, TRƯỚC app.js.
   Expose window.MVAuth. Nếu chưa cấu hình khóa -> { configured:false }
   và app.js tự dùng localStorage.
   ============================================================ */
(function () {
  'use strict';
  const cfg = window.MATHVISION_SUPABASE || {};
  const lib = window.supabase; // UMD build expose "supabase"
  const configured = !!(cfg.url && cfg.anonKey && lib && lib.createClient);
  if (!configured) { window.MVAuth = { configured: false }; return; }

  const sb = lib.createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const TABLE = 'lessons';

  async function getUser() {
    const { data } = await sb.auth.getUser();
    return data ? data.user : null;
  }

  window.MVAuth = {
    configured: true,
    client: sb,

    // Theo dõi trạng thái đăng nhập (gọi cb(user|null) mỗi khi đổi).
    onChange(cb) {
      sb.auth.onAuthStateChange((_event, session) => cb(session ? session.user : null));
    },
    async currentUser() { return getUser(); },

    async signUpEmail(email, password, meta) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: meta || {} } });
      if (error) throw error;
      return data;
    },
    async signInEmail(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },
    async signInGoogle() {
      const { data, error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.origin },
      });
      if (error) throw error;
      return data;
    },
    async resetPassword(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
      if (error) throw error;
    },
    async signOut() { await sb.auth.signOut(); },

    // ----- Giáo án (bảng lessons, RLS theo user_id) -----
    async listLessons() {
      const { data, error } = await sb.from(TABLE).select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((r) => ({ id: r.id, title: r.title, problem: r.problem, at: r.created_at }));
    },
    async saveLesson(title, problem) {
      const u = await getUser();
      if (!u) throw new Error('Chưa đăng nhập');
      const { data, error } = await sb.from(TABLE).insert({ user_id: u.id, title, problem }).select().single();
      if (error) throw error;
      return data;
    },
    async deleteLesson(id) {
      const { error } = await sb.from(TABLE).delete().eq('id', id);
      if (error) throw error;
    },
    async clearLessons() {
      const u = await getUser();
      if (!u) return;
      const { error } = await sb.from(TABLE).delete().eq('user_id', u.id);
      if (error) throw error;
    },
  };
})();
