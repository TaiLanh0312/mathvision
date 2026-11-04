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
    window.dispatchEvent(new CustomEvent('mathvision:tab', { detail: tab }));

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
      const code = ($('#latexCode') || $('pre code'))?.innerText || '';
      const orig = copyLabel.textContent;
      try {
        await navigator.clipboard.writeText(code);
        copyLabel.textContent = 'Đã copy!';
      } catch {
        copyLabel.textContent = 'Lỗi copy';
      }
      setTimeout(() => (copyLabel.textContent = orig), 1600);
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

  // Render chữ có lẫn công thức LaTeX (\( \), \[ \], $…$, $$…$$) bằng KaTeX.
  function renderMathInto(el, text) {
    el.replaceChildren();
    const s = text == null ? '' : String(text);
    if (!s) return;
    if (!window.katex) { el.textContent = s; return; }
    const re = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g;
    let last = 0, m;
    while ((m = re.exec(s))) {
      if (m.index > last) el.appendChild(document.createTextNode(s.slice(last, m.index)));
      const display = (m[1] !== undefined) || (m[2] !== undefined);
      const tex = m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4];
      const span = document.createElement('span');
      try { window.katex.render(tex, span, { displayMode: display, throwOnError: false }); }
      catch { span.textContent = tex; }
      el.appendChild(span);
      last = re.lastIndex;
    }
    if (last < s.length) el.appendChild(document.createTextNode(s.slice(last)));
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
      renderMathInto(body, step.explanation || '');
      item.append(heading, body);
      steps.append(item);
    });
    const fin = $('#studyAnswerFinal');
    if (result.answer) {
      fin.replaceChildren();
      const lbl = document.createElement('span'); lbl.textContent = 'Kết luận: ';
      const val = document.createElement('span'); renderMathInto(val, result.answer);
      fin.append(lbl, val);
    } else fin.textContent = '';
    $('#studyAnswerNotes').textContent = Array.isArray(result.notes) ? result.notes.join(' · ') : '';
    $('#studyCorrectionWrap').classList.add('hidden');
    $('#studyCorrection').value = '';
    $('#studyFeedbackStatus').textContent = '';
  }

  async function solveStudy({ images = [] } = {}) {
    const problem = studyInput?.value?.trim() || '';
    if (!problem && !images.length) {
      studyInput?.focus();
      alert('Nhập đề hoặc chụp/quét ảnh trước nhé.');
      return;
    }
    const oldText = studySolveBtn.innerHTML;
    studySolveBtn.disabled = true;
    studySolveBtn.textContent = 'AI đang giải…';
    studyPanel.classList.remove('hidden');
    $('#studyAnswerTitle').textContent = 'Đang đọc và giải đề…';
    $('#studyAnswerStatus').textContent = images.length ? 'Đang đọc ảnh và giải từng bước…' : 'Đang giải từng bước…';
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
      $('#studyAnswerStatus').textContent = `${data.subject || 'AI'} · Lời giải từng bước. Muốn đối chiếu nguồn thì bấm “Tra cứu trên Google”.`;
    } catch (error) {
      $('#studyAnswerTitle').textContent = 'Chưa giải được đề';
      $('#studyAnswerStatus').textContent = error.message || 'Có lỗi kết nối.';
    } finally {
      studySolveBtn.disabled = false;
      studySolveBtn.innerHTML = oldText;
      pendingStudyImages = [];
    }
  }

  studySolveBtn?.addEventListener('click', () => solveStudy({ images: pendingStudyImages, openWeb: false }));
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
    const scanner = window.MathVisionScanner || window.Capacitor?.Plugins?.DocumentScanner;
    if (!window.Capacitor?.isNativePlatform?.() || !scanner?.scan) {
      studyImageFile?.click();
      return;
    }
    const oldText = studyCameraBtn.textContent;
    studyCameraBtn.disabled = true;
    studyCameraBtn.textContent = 'Đang mở máy quét…';
    try {
      const result = await scanner.scan();
      if (result.cancelled || !result.images?.length) return;
      pendingStudyImages = result.images;
      studyCameraBtn.textContent = 'Đang gửi ảnh cho AI…';
      await solveStudy({ images: pendingStudyImages, openWeb: false });
    } catch (error) {
      alert('Không quét được ảnh: ' + error.message);
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
      await solveStudy({ images: pendingStudyImages, openWeb: false });
    } catch (error) {
      alert('Không đọc được ảnh: ' + error.message);
    } finally {
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

  /* ---------- Topbar: Tạo bài mới ---------- */
  const newBtn = $('#newLesson');
  newBtn && newBtn.addEventListener('click', () => {
    if (location.hash.slice(1) !== 'studio') location.hash = 'studio';
    const ta = $('#tab-studio textarea');
    if (ta) { ta.value = ''; ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus(); }
  });

  /* ============================================================
     TÀI KHOẢN + GIÁO ÁN
     - Có Supabase (window.MVAuth.configured) -> đăng nhập đám mây, đồng bộ đa thiết bị.
     - Chưa cấu hình -> hồ sơ + giáo án lưu CỤC BỘ trên thiết bị (localStorage).
     ============================================================ */
  const cloud = (window.MVAuth && window.MVAuth.configured) ? window.MVAuth : null;
  let cloudUser = null;                 // user đám mây đang đăng nhập (null nếu chưa)
  const useCloud = () => !!(cloud && cloudUser);

  /* --- Lưu trữ giáo án cục bộ --- */
  const LESSONS_KEY = 'mathvision_lessons_v1';
  const PROFILE_KEY = 'mathvision_profile';
  const localGet = () => { try { const a = JSON.parse(localStorage.getItem(LESSONS_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
  const localSet = (list) => { try { localStorage.setItem(LESSONS_KEY, JSON.stringify(list)); return true; } catch { return false; } };
  // Di trú bản cũ chỉ-một-ô (nếu có).
  try {
    const old = localStorage.getItem('mathvision_lesson');
    if (old && !localGet().length) {
      const d = JSON.parse(old);
      if (d && d.problem) localSet([{ id: Date.now(), title: (d.problem.split('\n')[0] || 'Giáo án').slice(0, 60), problem: d.problem, at: d.at || new Date().toISOString() }]);
      localStorage.removeItem('mathvision_lesson');
    }
  } catch {}

  /* --- Store hợp nhất (đám mây hoặc cục bộ) --- */
  const Store = {
    async list() { return useCloud() ? cloud.listLessons() : localGet(); },
    async save(title, problem) {
      if (useCloud()) { await cloud.saveLesson(title, problem); return true; }
      const list = localGet();
      list.unshift({ id: Date.now(), title, problem, at: new Date().toISOString() });
      return localSet(list);
    },
    async del(id) {
      if (useCloud()) return cloud.deleteLesson(id);
      localSet(localGet().filter((x) => x.id !== id));
    },
    async clear() {
      if (useCloud()) return cloud.clearLessons();
      localSet([]);
    },
  };

  /* --- Lưu đề hiện tại thành giáo án --- */
  async function saveCurrentLesson() {
    const ta = $('#tab-studio textarea');
    const problem = (ta ? ta.value : '').trim();
    if (!problem) { alert('Chưa có nội dung để lưu. Hãy nhập đề ở tab "Dựng hình 3D" trước.'); return false; }
    const suggested = problem.split('\n')[0].slice(0, 60);
    const title = (prompt('Tên giáo án:', suggested) || '').trim() || suggested || 'Giáo án';
    try { await Store.save(title, problem); return true; }
    catch (e) { alert('Không lưu được: ' + (e.message || e)); return false; }
  }
  const saveBtn = $('#saveLesson');
  saveBtn && saveBtn.addEventListener('click', async () => {
    const old = saveBtn.innerHTML;
    saveBtn.disabled = true; saveBtn.innerHTML = '<span class="text-slate-400">Đang lưu…</span>';
    const ok = await saveCurrentLesson();
    saveBtn.innerHTML = ok ? '<span class="text-emerald-600">✓ Đã lưu</span>' : old;
    setTimeout(() => { saveBtn.innerHTML = old; saveBtn.disabled = false; }, 1600);
  });

  /* --- Hồ sơ hiển thị --- */
  function initials(name) {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '👤';
    return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase();
  }
  const getLocalProfile = () => { try { const s = localStorage.getItem(PROFILE_KEY); if (s) return JSON.parse(s); } catch {} return null; };
  function profileFromUser(u) {
    const m = (u && u.user_metadata) || {};
    return { name: m.name || m.full_name || (u && u.email ? u.email.split('@')[0] : 'Giáo viên'), school: m.school || '' };
  }
  function applyProfile(p) {
    const prof = p || { name: 'Khách', school: '' };
    const guest = !prof.name || prof.name === 'Khách';
    const ai = $('#avatarInitials'), pn = $('#profileName'), pb = $('#profileNameBig'), pr = $('#profileRole');
    if (ai) ai.textContent = initials(prof.name);
    if (pn) pn.textContent = prof.name || 'Khách';
    if (pb) pb.textContent = prof.name || 'Khách';
    if (pr) pr.textContent = guest ? (cloud ? 'Khách (chưa đăng nhập đám mây)' : 'Chưa đăng nhập')
      : ('Giáo viên Toán' + (prof.school ? ' · ' + prof.school : '') + (useCloud() ? ' · ☁ đồng bộ' : ''));
  }

  /* --- Modal đăng nhập --- */
  const loginModal = $('#loginModal');
  const openModal = (m) => m && (m.classList.remove('hidden'), m.classList.add('flex'));
  const hideModal = (m) => m && (m.classList.add('hidden'), m.classList.remove('flex'));
  const show = (el, on) => el && el.classList.toggle('hidden', !on);
  const showErr = (msg) => { const e = $('#loginError'); if (e) { e.textContent = msg || ''; e.classList.toggle('hidden', !msg); } };
  let authMode = 'signin';              // 'signin' | 'signup' (chỉ ở chế độ đám mây)

  function renderLoginMode() {
    showErr('');
    const isSignup = authMode === 'signup';
    if (cloud) {
      show($('#loginGoogle'), true); $('#loginGoogle') && $('#loginGoogle').classList.add('flex');
      show($('#loginOr'), true); $('#loginOr') && $('#loginOr').classList.add('flex');
      show($('#emailFields'), true);
      show($('#signupFields'), isSignup);
      show($('#loginToggle'), true); show($('#loginForgot'), !isSignup);
      $('#loginTitle') && ($('#loginTitle').textContent = isSignup ? 'Đăng ký' : 'Đăng nhập');
      $('#loginSubtitle') && ($('#loginSubtitle').textContent = 'Đồng bộ giáo án trên mọi thiết bị.');
      $('#loginSubmit') && ($('#loginSubmit').textContent = isSignup ? 'Đăng ký' : 'Đăng nhập');
      $('#loginToggle') && ($('#loginToggle').textContent = isSignup ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký');
    } else {
      // Cục bộ: chỉ tên + trường.
      show($('#loginGoogle'), false); show($('#loginOr'), false);
      show($('#emailFields'), false); show($('#signupFields'), true);
      show($('#loginToggle'), false); show($('#loginForgot'), false);
      const cur = getLocalProfile() || {};
      if ($('#loginName')) $('#loginName').value = cur.name && cur.name !== 'Khách' ? cur.name : '';
      if ($('#loginSchool')) $('#loginSchool').value = cur.school || '';
      $('#loginTitle') && ($('#loginTitle').textContent = 'Đăng nhập');
      $('#loginSubtitle') && ($('#loginSubtitle').textContent = 'Hồ sơ lưu trên thiết bị này.');
      $('#loginSubmit') && ($('#loginSubmit').textContent = 'Vào ứng dụng');
    }
  }
  function showLogin() { renderLoginMode(); openModal(loginModal); setTimeout(() => (cloud ? $('#loginEmail') : $('#loginName'))?.focus(), 50); }

  function doLocalLogin(name, school) {
    const p = { name: (name || '').trim() || 'Khách', school: (school || '').trim() };
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch {}
    applyProfile(p); hideModal(loginModal);
  }
  function viError(e) {
    const m = (e && e.message) || String(e || '');
    if (/Invalid login credentials/i.test(m)) return 'Email hoặc mật khẩu không đúng.';
    if (/already registered/i.test(m)) return 'Email này đã đăng ký. Hãy đăng nhập.';
    if (/Password should be at least/i.test(m)) return 'Mật khẩu tối thiểu 6 ký tự.';
    if (/Email not confirmed/i.test(m)) return 'Email chưa xác nhận. Hãy kiểm tra hộp thư.';
    if (/Unable to validate email|invalid format/i.test(m)) return 'Email không hợp lệ.';
    return m;
  }
  async function submitLogin() {
    if (!cloud) { doLocalLogin($('#loginName')?.value, $('#loginSchool')?.value); return; }
    const email = ($('#loginEmail')?.value || '').trim();
    const pw = $('#loginPassword')?.value || '';
    if (!email || !pw) { showErr('Nhập email và mật khẩu.'); return; }
    const btn = $('#loginSubmit'); const old = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Đang xử lý…'; }
    showErr('');
    try {
      if (authMode === 'signup') {
        await cloud.signUpEmail(email, pw, { name: ($('#loginName')?.value || '').trim(), school: ($('#loginSchool')?.value || '').trim() });
        const { data } = await cloud.client.auth.getSession();
        if (!data || !data.session) { alert('Đã tạo tài khoản. Nếu được yêu cầu, hãy xác nhận email rồi đăng nhập.'); authMode = 'signin'; renderLoginMode(); }
      } else {
        await cloud.signInEmail(email, pw);
      }
      // Thành công -> onChange cập nhật UI và đóng modal.
    } catch (err) { showErr(viError(err)); }
    finally { if (btn) { btn.disabled = false; btn.textContent = old; } }
  }
  $('#loginSubmit') && $('#loginSubmit').addEventListener('click', submitLogin);
  $('#loginGoogle') && $('#loginGoogle').addEventListener('click', async () => {
    if (!cloud) return;
    try { await cloud.signInGoogle(); } catch (e) { showErr(viError(e)); }
  });
  $('#loginToggle') && $('#loginToggle').addEventListener('click', () => { authMode = authMode === 'signup' ? 'signin' : 'signup'; renderLoginMode(); });
  $('#loginForgot') && $('#loginForgot').addEventListener('click', async () => {
    if (!cloud) return;
    const email = prompt('Nhập email để nhận liên kết đặt lại mật khẩu:', ($('#loginEmail')?.value || '').trim());
    if (!email) return;
    try { await cloud.resetPassword(email.trim()); alert('Đã gửi email đặt lại mật khẩu (nếu email tồn tại).'); }
    catch (e) { showErr(viError(e)); }
  });
  $('#loginGuest') && $('#loginGuest').addEventListener('click', () => doLocalLogin('Khách', ''));
  ['#loginName', '#loginSchool', '#loginEmail', '#loginPassword'].forEach((sel) => {
    const el = $(sel); el && el.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitLogin(); });
  });

  /* --- Dropdown hồ sơ --- */
  const profileBtn = $('#profileBtn'), profileMenu = $('#profileMenu');
  const closeProfile = () => profileMenu && profileMenu.classList.add('hidden');
  profileBtn && profileBtn.addEventListener('click', (e) => { e.stopPropagation(); profileMenu.classList.toggle('hidden'); });
  profileMenu && profileMenu.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', closeProfile);
  $('#editProfile') && $('#editProfile').addEventListener('click', () => { closeProfile(); authMode = cloud && !cloudUser ? 'signin' : authMode; showLogin(); });
  $('#logout') && $('#logout').addEventListener('click', async () => {
    closeProfile();
    try { localStorage.removeItem(PROFILE_KEY); } catch {}
    if (cloud && cloudUser) { try { await cloud.signOut(); } catch {} }
    cloudUser = null; applyProfile(null); showLogin();
  });

  /* --- Modal giáo án đã lưu --- */
  const lessonsModal = $('#lessonsModal');
  const fmtDate = (iso) => { try { return new Date(iso).toLocaleString('vi-VN'); } catch { return ''; } };
  function openLesson(it) {
    location.hash = 'studio';
    const ta = $('#tab-studio textarea');
    if (ta) { ta.value = it.problem || ''; ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus(); }
    hideModal(lessonsModal);
  }
  async function renderLessons() {
    const wrap = $('#lessonsList'); if (!wrap) return;
    wrap.replaceChildren();
    const loading = document.createElement('p');
    loading.className = 'px-3 py-10 text-center text-sm text-slate-400';
    loading.textContent = 'Đang tải…';
    wrap.append(loading);
    let list = [];
    try { list = await Store.list(); } catch (e) { loading.textContent = 'Lỗi tải giáo án: ' + (e.message || e); return; }
    wrap.replaceChildren();
    if (!list.length) {
      const p = document.createElement('p');
      p.className = 'px-3 py-10 text-center text-sm text-slate-400';
      p.textContent = 'Chưa có giáo án nào. Nhập đề ở tab "Dựng hình 3D" rồi bấm "Lưu giáo án".';
      wrap.append(p); return;
    }
    list.forEach((it) => {
      const row = document.createElement('div');
      row.className = 'mb-2 flex items-start gap-2 rounded-xl border border-slate-200 p-3 transition hover:border-slate-300';
      const main = document.createElement('button');
      main.className = 'min-w-0 flex-1 text-left';
      const title = document.createElement('div');
      title.className = 'truncate text-sm font-semibold text-slate-800';
      title.textContent = it.title || 'Giáo án';
      const meta = document.createElement('div');
      meta.className = 'truncate text-xs text-slate-400';
      meta.textContent = fmtDate(it.at) + ' · ' + (it.problem || '').replace(/\s+/g, ' ').slice(0, 80);
      main.append(title, meta);
      main.addEventListener('click', () => openLesson(it));
      const del = document.createElement('button');
      del.className = 'shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-rose-500 transition hover:bg-rose-50';
      del.textContent = 'Xoá';
      del.addEventListener('click', async () => { try { await Store.del(it.id); } catch (e) { alert('Không xoá được: ' + (e.message || e)); } renderLessons(); });
      row.append(main, del);
      wrap.append(row);
    });
  }
  $('#saveLessonMenu') && $('#saveLessonMenu').addEventListener('click', async () => { closeProfile(); if (await saveCurrentLesson()) alert('✓ Đã lưu giáo án.'); });
  $('#viewLessons') && $('#viewLessons').addEventListener('click', () => { closeProfile(); openModal(lessonsModal); renderLessons(); });
  $('#lessonsClose') && $('#lessonsClose').addEventListener('click', () => hideModal(lessonsModal));
  $('#lessonsClear') && $('#lessonsClear').addEventListener('click', async () => {
    if (confirm('Xoá tất cả giáo án đã lưu?')) { try { await Store.clear(); } catch (e) { alert('Không xoá được: ' + (e.message || e)); } renderLessons(); }
  });

  // Đóng modal khi bấm nền tối (trừ loginModal) hoặc Escape.
  [loginModal, lessonsModal].forEach((m) => m && m.addEventListener('click', (e) => { if (e.target === m && m !== loginModal) hideModal(m); }));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideModal(lessonsModal); });

  /* --- Init trạng thái đăng nhập --- */
  if (cloud) {
    cloud.onChange((user) => {
      cloudUser = user;
      if (user) { applyProfile(profileFromUser(user)); hideModal(loginModal); }
    });
    cloud.currentUser().then((user) => {
      cloudUser = user;
      if (user) { applyProfile(profileFromUser(user)); hideModal(loginModal); }
      else {
        const local = getLocalProfile();
        if (local) applyProfile(local);   // đang dùng chế độ Khách/cục bộ
        else { applyProfile(null); showLogin(); }
      }
    }).catch(() => { applyProfile(getLocalProfile()); if (!getLocalProfile()) showLogin(); });
  } else {
    const local = getLocalProfile();
    applyProfile(local);
    if (!local) showLogin();
  }

  /* ---------- Init ---------- */
  const initial = location.hash.slice(1);
  activateTab(TABS[initial] ? initial : 'studio', { pushHash: false });
})();
