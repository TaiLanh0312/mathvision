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
  const apiBase = () => (window.Capacitor?.isNativePlatform?.() || window.MathVisionNative?.isNativePlatform?.())
    ? 'https://mathvision-igrb.onrender.com' : '';
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Tab routing ---------- */
  const TABS = {
    studio: {
      title: 'Smart 3D Geometry Studio',
      sub: 'Dựng và tương tác hình học 2D / 3D',
    },
    study: {
      title: 'Giải bài đa môn',
      sub: 'Chụp đề, giải bằng AI và đối chiếu tìm kiếm web',
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
  async function ocrImagesToField(images, targetSel, btn) {
    const target = $(targetSel);
    if (!target || !images.length) return;
    const orig = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Đang đọc đề…'; }
    try {
      const res = await fetch(`${apiBase()}/api/ocr`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images }),
      });
      const d = await res.json();
      if (!res.ok || !d?.text) throw new Error(d?.error || `HTTP ${res.status}`);
      target.value = d.text;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.focus();
    } catch (e) {
      alert('Quét ảnh lỗi: ' + e.message + '\n(Cần kết nối mạng và cấu hình GEMINI_API_KEY trên máy chủ.)');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = orig; }
    }
  }

  function fileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Không đọc được ảnh đã chọn.'));
      reader.readAsDataURL(file);
    });
  }

  async function ocrImageToField(file, targetSel, btn) {
    if (!file || !file.type.startsWith('image/')) return;
    try { await ocrImagesToField([await fileAsDataURL(file)], targetSel, btn); }
    catch (e) { alert(e.message); }
  }

  async function scanProblem(targetSel, btn, fallbackInput) {
    const scanner = window.MathVisionScanner || window.Capacitor?.Plugins?.DocumentScanner;
    if (!window.Capacitor?.isNativePlatform?.() || !scanner?.scan) {
      fallbackInput?.click();
      return;
    }
    const original = btn.innerHTML;
    btn.disabled = true; btn.textContent = 'Đang mở Google Scanner…';
    try {
      const result = await scanner.scan();
      if (!result.cancelled && result.images?.length) {
        btn.textContent = 'Đang đọc đề…';
        await ocrImagesToField(result.images, targetSel, null);
      }
    } catch (e) {
      alert('Google Scanner lỗi: ' + e.message);
    } finally {
      btn.disabled = false; btn.innerHTML = original;
    }
  }

  /* ---------- Giải đa môn từ chữ/ảnh, đồng thời mở Google để đối chiếu ---------- */
  const studyInput = $('#studyProblem');
  const studySubject = $('#studySubject');
  const studySolveBtn = $('#studySolve');
  const studyCameraBtn = $('#studyCamera');
  const studyImageFile = $('#studyImageFile');
  const studyPanel = $('#studyAnswer');
  let pendingStudyImages = [];
  let pendingGoogleTab = null;
  let currentStudyResult = null;
  let studyFeedbackRating = '';

  function openStudyGoogle(problem) {
    const url = studyGoogleUrl(problem);
    if (!url || !problem) return false;
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  }

  function studyGoogleUrl(problem) {
    const subject = studySubject?.selectedOptions?.[0]?.textContent || '';
    const query = [subject, problem, 'lời giải'].filter(Boolean).join(' ').trim();
    return query ? `https://www.google.com/search?q=${encodeURIComponent(query)}` : '';
  }

  function renderStudyAnswer(result) {
    currentStudyResult = result;
    studyFeedbackRating = '';
    studyPanel.classList.remove('hidden');
    $('#studyAnswerTitle').textContent = result.title || `Lời giải — ${result.subject || 'Môn học'}`;
    $('#studyAnswerStatus').textContent = `AI đã xử lý đề. Đề nhận dạng: ${result.recognized_problem || 'không có bản chép riêng'}`;
    if (result.recognized_problem && studyInput && !studyInput.value.trim()) {
      studyInput.value = result.recognized_problem;
      studyInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const steps = $('#studyAnswerSteps');
    steps.replaceChildren();
    (Array.isArray(result.steps) ? result.steps : []).forEach((step, index) => {
      const item = document.createElement('div');
      const heading = document.createElement('div');
      heading.className = 'mb-1 font-semibold text-slate-800';
      heading.textContent = step.title || `Bước ${index + 1}`;
      const body = document.createElement('div');
      body.className = 'whitespace-pre-wrap';
      body.textContent = step.explanation || '';
      item.append(heading, body);
      steps.append(item);
    });
    $('#studyAnswerFinal').textContent = result.answer ? `Kết luận: ${result.answer}` : '';
    $('#studyAnswerNotes').textContent = Array.isArray(result.notes) ? result.notes.join(' · ') : '';
    $('#studyCorrectionWrap').classList.add('hidden');
    $('#studyCorrection').value = '';
    $('#studyFeedbackStatus').textContent = '';
  }

  async function solveStudy({ images = [], openWeb = true, googleTab: suppliedGoogleTab = null } = {}) {
    const problem = studyInput?.value?.trim() || '';
    if (!problem && !images.length) {
      studyInput?.focus();
      alert('Nhập đề hoặc chụp/quét ảnh trước nhé.');
      return;
    }
    // Open the search synchronously inside the user gesture so mobile browsers do not block it.
    const googleTab = suppliedGoogleTab || (openWeb ? window.open(problem ? studyGoogleUrl(problem) : 'about:blank', '_blank') : null);
    if (problem && googleTab) googleTab.location.href = studyGoogleUrl(problem);
    const openedGoogle = Boolean(googleTab);
    const oldText = studySolveBtn.innerHTML;
    studySolveBtn.disabled = true;
    studySolveBtn.textContent = 'AI đang giải…';
    studyPanel.classList.remove('hidden');
    $('#studyAnswerTitle').textContent = 'Đang đọc và giải đề';
    $('#studyAnswerStatus').textContent = openedGoogle
      ? 'Đã mở Google để đối chiếu song song. Hãy kiểm tra nguồn và ngày đăng của kết quả web.'
      : (images.length ? 'Đang đọc ảnh và giải bằng AI…' : 'Đang giải bằng AI…');
    $('#studyAnswerSteps').replaceChildren();
    $('#studyAnswerFinal').textContent = '';
    $('#studyAnswerNotes').textContent = '';
    try {
      const response = await fetch(`${apiBase()}/api/study/solve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem, subject: studySubject?.value || 'auto', images }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      renderStudyAnswer(data);
      $('#studyAnswerStatus').textContent = `${data.subject || 'AI'} · ${openedGoogle ? 'Google đã mở để đối chiếu; xem nguồn gốc và ngày cập nhật.' : 'Có thể bấm “Chỉ tìm trên Google” để đối chiếu nguồn.'}`;
      if (openedGoogle && data.recognized_problem && !problem) googleTab.location.href = studyGoogleUrl(data.recognized_problem);
    } catch (error) {
      $('#studyAnswerTitle').textContent = 'Chưa giải được đề';
      $('#studyAnswerStatus').textContent = error.message || 'Có lỗi kết nối.';
      if (openedGoogle) $('#studyAnswerNotes').textContent = 'Google đã mở riêng để bạn tra cứu; kết quả tìm kiếm chưa được AI kiểm chứng tự động.';
      if (googleTab && !problem) googleTab.close();
    } finally {
      studySolveBtn.disabled = false;
      studySolveBtn.innerHTML = oldText;
      pendingStudyImages = [];
    }
  }

  studySolveBtn?.addEventListener('click', () => solveStudy({ images: pendingStudyImages, openWeb: true }));
  $('#studyGood')?.addEventListener('click', () => {
    studyFeedbackRating = 'accepted';
    $('#studyCorrectionWrap').classList.remove('hidden');
    $('#studyFeedbackStatus').textContent = 'Đã đánh dấu hữu ích. Bạn có thể thêm phần đã tự kiểm chứng rồi lưu.';
  });
  $('#studyBad')?.addEventListener('click', () => {
    studyFeedbackRating = 'corrected';
    $('#studyCorrectionWrap').classList.remove('hidden');
    $('#studyCorrection').focus();
    $('#studyFeedbackStatus').textContent = 'Để đưa vào dữ liệu huấn luyện, hãy nhập lời giải đã được bạn kiểm chứng.';
  });
  $('#studySaveFeedback')?.addEventListener('click', () => {
    if (!currentStudyResult || !studyFeedbackRating) return;
    const correction = $('#studyCorrection').value.trim();
    if (studyFeedbackRating === 'corrected' && !correction) {
      $('#studyFeedbackStatus').textContent = 'Cần nhập lời giải sửa đã kiểm chứng trước khi lưu.';
      return;
    }
    try {
      const key = 'mathvision_study_feedback_v1';
      const rows = JSON.parse(localStorage.getItem(key) || '[]');
      rows.push({
        subject: currentStudyResult.subject || studySubject.value || 'auto',
        problem: currentStudyResult.recognized_problem || studyInput.value.trim(),
        rating: studyFeedbackRating,
        correction: correction || '',
        answer: currentStudyResult.answer || '',
        steps: currentStudyResult.steps || [],
        savedAt: new Date().toISOString(),
      });
      localStorage.setItem(key, JSON.stringify(rows.slice(-500)));
      $('#studyFeedbackStatus').textContent = 'Đã lưu trên thiết bị này. Dữ liệu không được tải lên máy chủ.';
    } catch {
      $('#studyFeedbackStatus').textContent = 'Không lưu được dữ liệu phản hồi trên thiết bị.';
    }
  });
  $('#studyExportFeedback')?.addEventListener('click', () => {
    try {
      const rows = JSON.parse(localStorage.getItem('mathvision_study_feedback_v1') || '[]');
      const gold = rows.filter((row) => row.rating === 'corrected' && row.correction);
      if (!gold.length) {
        $('#studyFeedbackStatus').textContent = 'Chưa có lời giải sửa đã kiểm chứng để xuất. Đánh dấu Sai/thiếu và nhập lời giải đúng trước.';
        return;
      }
      const jsonl = gold.map((row) => JSON.stringify({ contents: [
        { role: 'user', parts: [{ text: `Môn: ${row.subject}\nĐề bài:\n${row.problem}` }] },
        { role: 'model', parts: [{ text: row.correction }] },
      ] })).join('\n');
      const blob = new Blob([jsonl], { type: 'application/jsonl;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'mathvision-verified-corrections.jsonl';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      $('#studyFeedbackStatus').textContent = `Đã xuất ${gold.length} lời giải sửa. Chỉ dùng mẫu đã được kiểm tra khi tinh chỉnh/đánh giá model.`;
    } catch {
      $('#studyFeedbackStatus').textContent = 'Không đọc được dữ liệu phản hồi đã lưu.';
    }
  });
  $('#studyGoogle')?.addEventListener('click', () => {
    if (!openStudyGoogle(studyInput?.value?.trim() || '')) alert('Nhập đề bài trước khi tìm Google.');
  });
  studyCameraBtn?.addEventListener('click', async () => {
    pendingGoogleTab = window.open('about:blank', '_blank');
    const scanner = window.MathVisionScanner || window.Capacitor?.Plugins?.DocumentScanner;
    if (!window.Capacitor?.isNativePlatform?.() || !scanner?.scan) {
      studyImageFile?.click();
      return;
    }
    const oldText = studyCameraBtn.textContent;
    studyCameraBtn.disabled = true;
    studyCameraBtn.textContent = 'Đang mở Google Scanner…';
    try {
      const result = await scanner.scan();
      if (result.cancelled || !result.images?.length) {
        pendingGoogleTab?.close();
        pendingGoogleTab = null;
        return;
      }
      pendingStudyImages = result.images;
      studyCameraBtn.textContent = 'Đang gửi ảnh cho AI…';
      await solveStudy({ images: pendingStudyImages, openWeb: true, googleTab: pendingGoogleTab });
      pendingGoogleTab = null;
    } catch (error) {
      alert('Không quét được ảnh: ' + error.message);
      pendingGoogleTab?.close();
      pendingGoogleTab = null;
    } finally {
      studyCameraBtn.disabled = false;
      studyCameraBtn.textContent = oldText;
    }
  });
  studyImageFile?.addEventListener('change', async () => {
    const file = studyImageFile.files?.[0];
    if (!file) return;
    try {
      pendingStudyImages = [await fileAsDataURL(file)];
      await solveStudy({ images: pendingStudyImages, openWeb: true, googleTab: pendingGoogleTab });
      pendingGoogleTab = null;
    } catch (error) {
      alert('Không đọc được ảnh: ' + error.message);
    } finally {
      if (pendingGoogleTab) pendingGoogleTab.close();
      pendingGoogleTab = null;
      studyImageFile.value = '';
    }
  });

  const scanP = $('#scanProblem'), scanPFile = $('#scanProblemFile');
  scanP && scanP.addEventListener('click', () => scanProblem('#geometryProblem', scanP, scanPFile));
  scanPFile && scanPFile.addEventListener('change', () =>
    scanPFile.files[0] && ocrImageToField(scanPFile.files[0], '#geometryProblem', scanP));

  const scanG = $('#scanGradeProblem'), scanGFile = $('#scanGradeFile');
  scanG && scanG.addEventListener('click', () => scanProblem('#gradeProblem', scanG, scanGFile));
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
