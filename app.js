/* ============================================================
   MathVision PRO — app.js
   Phase 1: UI shell logic only (tab routing, transitions,
   drag & drop zone, and local micro-interactions).
   No Three.js / WebRTC / API calls yet.
   ============================================================ */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Tab routing ---------- */
  const TABS = {
    studio: {
      title: 'Smart 3D Geometry Studio',
      sub: 'Dựng & bóc tách hình học không gian theo layer',
    },
    grader: {
      title: 'AI Grader',
      sub: 'Chấm đồ thị & bài giải tự luận mọi dạng bằng AI Vision',
    },
    latex: {
      title: 'Snap to LaTeX',
      sub: 'Số hóa đề bài & công thức toán học thành mã LaTeX',
    },
  };

  const navLinks = $$('.nav-link');
  const panels = $$('.tab-panel');
  const pageTitle = $('#pageTitle');
  const pageSub = $('#pageSub');

  function activateTab(tab, { pushHash = true } = {}) {
    if (!TABS[tab]) tab = 'studio';

    navLinks.forEach((el) => {
      const on = el.dataset.tab === tab;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-current', on ? 'page' : 'false');
    });

    panels.forEach((p) => p.classList.remove('is-active'));
    const panel = $(`#tab-${tab}`);
    if (panel) {
      // Re-trigger entrance animation on switch.
      panel.classList.add('is-active');
      if (!prefersReducedMotion) {
        panel.querySelectorAll(':scope > *').forEach((child, i) => {
          child.style.animation = 'none';
          // Force reflow so the animation restarts.
          void child.offsetWidth;
          child.style.animation = '';
          child.style.animationDelay = `${Math.min(i * 40, 160)}ms`;
        });
      }
    }

    pageTitle.textContent = TABS[tab].title;
    pageSub.textContent = TABS[tab].sub;

    if (pushHash && location.hash.slice(1) !== tab) {
      history.replaceState(null, '', `#${tab}`);
    }
    closeMobileSidebar();
  }

  navLinks.forEach((el) =>
    el.addEventListener('click', () => activateTab(el.dataset.tab))
  );

  window.addEventListener('hashchange', () =>
    activateTab(location.hash.slice(1), { pushHash: false })
  );

  /* ---------- Mobile sidebar ---------- */
  const sidebar = $('aside');
  const backdrop = $('#mobileBackdrop');
  const menuBtn = $('#mobileMenuBtn');

  function openMobileSidebar() {
    sidebar.classList.remove('hidden');
    sidebar.classList.add('flex', 'fixed', 'left-0', 'top-0');
    sidebar.style.zIndex = 'var(--z-modal)'; // above the backdrop
    backdrop.classList.remove('hidden');
  }
  function closeMobileSidebar() {
    if (window.innerWidth >= 1024) return; // lg: sidebar is permanent
    sidebar.classList.add('hidden');
    sidebar.classList.remove('fixed', 'left-0', 'top-0');
    sidebar.style.zIndex = '';
    backdrop.classList.add('hidden');
  }
  menuBtn && menuBtn.addEventListener('click', openMobileSidebar);
  backdrop && backdrop.addEventListener('click', closeMobileSidebar);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeMobileSidebar(); const pm = $('#profileMenu'); pm && pm.classList.add('hidden'); }
  });

  /* ---------- Exclusive toggle groups (pills) ---------- */
  function exclusiveGroup(selector) {
    const items = $$(selector);
    items.forEach((item) =>
      item.addEventListener('click', () => {
        items.forEach((i) => i.classList.remove('is-on'));
        item.classList.add('is-on');
      })
    );
  }
  exclusiveGroup('.quick-angle');
  exclusiveGroup('.problem-chip');
  exclusiveGroup('.latex-view');
  // Layer-toggle pills are rendered & handled dynamically by geometry3d.js
  // (they depend on the scene spec returned by the backend).

  /* ---------- Opacity slider (3D viewport) ---------- */
  const opacity = $('#opacity');
  const opacityVal = $('#opacityVal');
  if (opacity && opacityVal) {
    opacity.addEventListener('input', () => {
      opacityVal.textContent = `${opacity.value}%`;
    });
  }

  /* ---------- Drag & drop zone (Snap to LaTeX) ---------- */
  const dropzone = $('#dropzone');
  const fileInput = $('#fileInput');
  const dropLabel = $('#dropLabel');

  if (dropzone && fileInput) {
    const prevent = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    ['dragenter', 'dragover'].forEach((ev) =>
      dropzone.addEventListener(ev, (e) => {
        prevent(e);
        dropzone.classList.add('is-drag');
      })
    );
    ['dragleave', 'drop'].forEach((ev) =>
      dropzone.addEventListener(ev, (e) => {
        prevent(e);
        dropzone.classList.remove('is-drag');
      })
    );
    dropzone.addEventListener('drop', (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (file) showPickedFile(file);
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files?.[0]) showPickedFile(fileInput.files[0]);
    });

    function showPickedFile(file) {
      if (!file.type.startsWith('image/')) {
        dropLabel.textContent = 'Tệp không hợp lệ — chỉ nhận ảnh';
        return;
      }
      const sizeMB = (file.size / 1024 / 1024).toFixed(1);
      dropLabel.textContent = `Đã chọn: ${file.name} (${sizeMB} MB)`;
      // Phase 4 will POST this to the Cloud OCR endpoint.
    }

    // Paste image from clipboard (Ctrl + V).
    window.addEventListener('paste', (e) => {
      const item = Array.from(e.clipboardData?.items || []).find((i) =>
        i.type.startsWith('image/')
      );
      if (item) {
        const file = item.getAsFile();
        if (file) showPickedFile(file);
      }
    });
  }

  /* ---------- Copy LaTeX to clipboard ---------- */
  const copyBtn = $('#copyLatex');
  const copyLabel = $('#copyLabel');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const code = $('pre code')?.innerText || '';
      try {
        await navigator.clipboard.writeText(code);
        copyLabel.textContent = 'Đã copy!';
      } catch {
        copyLabel.textContent = 'Lỗi copy';
      }
      setTimeout(() => (copyLabel.textContent = 'Copy'), 1600);
    });
  }

  /* ---------- Quét ảnh -> OCR đề bài (dùng chung tab 1 & grader) ---------- */
  async function ocrImageToField(file, targetSel, btn) {
    const target = $(targetSel);
    if (!file || !target) return;
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const orig = btn ? btn.innerHTML : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Đang quét…'; }
      try {
        const res = await fetch('/api/ocr', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: reader.result }),
        });
        const d = await res.json();
        if (d && d.text) {
          target.value = d.text;
          target.dispatchEvent(new Event('input', { bubbles: true }));
          target.focus();
        } else throw new Error((d && d.error) || 'Không đọc được đề');
      } catch (e) {
        if (btn) { btn.innerHTML = orig; }
        alert('Quét ảnh lỗi: ' + e.message + '\n(Cần chạy backend + cấu hình GEMINI_API_KEY để OCR thật.)');
        return;
      }
      if (btn) { btn.disabled = false; btn.innerHTML = orig; }
    };
    reader.readAsDataURL(file);
  }

  const scanP = $('#scanProblem'), scanPFile = $('#scanProblemFile');
  scanP && scanP.addEventListener('click', () => scanPFile.click());
  scanPFile && scanPFile.addEventListener('change', () =>
    scanPFile.files[0] && ocrImageToField(scanPFile.files[0], '#tab-studio textarea', scanP));

  const scanG = $('#scanGradeProblem'), scanGFile = $('#scanGradeFile');
  scanG && scanG.addEventListener('click', () => scanGFile.click());
  scanGFile && scanGFile.addEventListener('change', () =>
    scanGFile.files[0] && ocrImageToField(scanGFile.files[0], '#gradeProblem', scanG));

  /* ---------- Topbar: Tạo bài mới / Lưu giáo án ---------- */
  const newBtn = $('#newLesson');
  newBtn && newBtn.addEventListener('click', () => {
    if (location.hash.slice(1) !== 'studio') location.hash = 'studio';
    const ta = $('#tab-studio textarea');
    if (ta) { ta.value = ''; ta.focus(); }
  });
  const saveBtn = $('#saveLesson');
  saveBtn && saveBtn.addEventListener('click', () => {
    const ta = $('#tab-studio textarea');
    try {
      localStorage.setItem('mathvision_lesson', JSON.stringify({ problem: ta ? ta.value : '', at: new Date().toISOString() }));
      const old = saveBtn.innerHTML;
      saveBtn.innerHTML = '<span class="text-emerald-600">✓ Đã lưu</span>';
      setTimeout(() => (saveBtn.innerHTML = old), 1600);
    } catch { alert('Không lưu được (localStorage bị chặn).'); }
  });

  /* ---------- Hồ sơ giáo viên (lưu localStorage) ---------- */
  const PROFILE_KEY = 'mathvision_profile';
  function initials(name) {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '👤';
    return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase();
  }
  function getProfile() {
    try { const s = localStorage.getItem(PROFILE_KEY); if (s) return JSON.parse(s); } catch {}
    return { name: 'Thầy Hùng', school: 'Amsterdam HN' };
  }
  function applyProfile(p) {
    const ai = $('#avatarInitials'), pn = $('#profileName'), pb = $('#profileNameBig'), pr = $('#profileRole');
    if (ai) ai.textContent = initials(p.name);
    if (pn) pn.textContent = p.name || 'Khách';
    if (pb) pb.textContent = p.name || 'Khách';
    if (pr) pr.textContent = 'Giáo viên Toán' + (p.school ? ' · ' + p.school : '');
  }
  const profileBtn = $('#profileBtn'), profileMenu = $('#profileMenu');
  const closeProfile = () => profileMenu && profileMenu.classList.add('hidden');
  profileBtn && profileBtn.addEventListener('click', (e) => { e.stopPropagation(); profileMenu.classList.toggle('hidden'); });
  profileMenu && profileMenu.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', closeProfile);
  $('#editProfile') && $('#editProfile').addEventListener('click', () => {
    const cur = getProfile();
    const name = prompt('Tên giáo viên:', cur.name || ''); if (name === null) return;
    const school = prompt('Trường:', cur.school || '');
    const p = { name: name.trim() || 'Khách', school: (school || '').trim() };
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch {}
    applyProfile(p); closeProfile();
  });
  $('#viewLessons') && $('#viewLessons').addEventListener('click', () => {
    closeProfile();
    try {
      const s = localStorage.getItem('mathvision_lesson');
      if (s) { const d = JSON.parse(s); alert('Giáo án đã lưu (' + new Date(d.at).toLocaleString('vi-VN') + '):\n\n' + (d.problem || '(trống)')); }
      else alert('Chưa có giáo án nào. Dùng nút "Lưu giáo án" ở thanh trên để lưu đề hiện tại.');
    } catch { alert('Không đọc được giáo án.'); }
  });
  $('#logout') && $('#logout').addEventListener('click', () => {
    try { localStorage.removeItem(PROFILE_KEY); } catch {}
    applyProfile({ name: 'Khách', school: '' }); closeProfile();
  });
  applyProfile(getProfile());

  /* ---------- Init ---------- */
  const initial = location.hash.slice(1);
  activateTab(TABS[initial] ? initial : 'studio', { pushHash: false });
})();
