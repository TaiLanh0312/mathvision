/* ============================================================
   MathVision PRO — grader.js  (Phase 4: Graph AI Grader)
   WebRTC webcam -> chụp khung hình -> gửi backend (Gemini Vision)
   -> vẽ layer canvas (đỏ/vàng/xanh) khoanh vùng lỗi lên ảnh đã dừng.
   Chạy như script thường (không cần module).
   ============================================================ */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const apiBase = () => (window.Capacitor?.isNativePlatform?.() || window.MathVisionNative?.isNativePlatform?.())
    ? 'https://mathvision-igrb.onrender.com' : '';

  const feed = $('camFeed'), shot = $('camShot'), overlay = $('camOverlay');
  const placeholder = $('camPlaceholder'), stage = $('camStage');
  if (!stage) return; // tab không tồn tại

  const startBtn = $('camStart'), startLabel = $('camStartLabel');
  const uploadBtn = $('camUploadBtn'), fileInput = $('camFile'), gradeBtn = $('camGrade');
  const hint = $('camHint');

  let stream = null;
  let imageDataURL = null;   // ảnh sẽ chấm (đã đóng băng / tải lên)
  let annotations = [];      // để vẽ lại khi resize
  let mode = 'graph';        // 'graph' | 'solution'

  const GRAPH_CRITERIA = `
    <li class="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm"><span class="text-slate-600">1. Khảo sát &amp; bảng biến thiên</span><span class="font-mono text-xs font-medium text-slate-400">0.25đ</span></li>
    <li class="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm"><span class="text-slate-600">2. Trục tọa độ &amp; điểm đặc biệt</span><span class="font-mono text-xs font-medium text-slate-400">0.25đ</span></li>
    <li class="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm"><span class="text-slate-600">3. Đường tiệm cận đứng &amp; ngang</span><span class="font-mono text-xs font-medium text-slate-400">0.25đ</span></li>
    <li class="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm"><span class="text-slate-600">4. Hình dáng đường cong &amp; lồi lõm</span><span class="font-mono text-xs font-medium text-slate-400">0.25đ</span></li>`;
  const SOLUTION_PLACEHOLDER = `<li class="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-xs text-slate-500">Chấm xong, AI sẽ liệt kê <b>nhận xét từng bước</b> và tô đỏ chỗ sai. Hỗ trợ mọi dạng: giải tích, đại số, hình học…</li>`;

  const MODES = {
    graph: {
      title: 'Chấm bài vẽ đồ thị bằng AI Vision',
      sub: 'Soi bài học sinh qua webcam hoặc tải ảnh. AI định vị hệ trục Oxy, so khớp đồ thị chuẩn và khoanh vùng lỗi (tô đỏ).',
      endpoint: '/api/graph/grade', placeholder: 'Nhập hàm số bất kỳ: y = ...', preset: true,
      camTitle: 'Bật camera hoặc tải ảnh bài thi có đồ thị',
      camHint: 'AI định vị hệ trục Oxy và khoanh vùng lỗi (tô đỏ)',
      criteriaHeading: 'Tiêu chí theo barem', criteriaHTML: GRAPH_CRITERIA,
    },
    solution: {
      title: 'Chấm bài giải tự luận bằng AI Vision',
      sub: 'Chụp bài giải viết tay của học sinh (MỌI dạng toán). AI đọc từng bước, đối chiếu lời giải đúng và tô đỏ chỗ sai.',
      endpoint: '/api/solution/grade', placeholder: 'Nhập đề bài bất kỳ (giải tích / đại số / hình học)…', preset: false,
      camTitle: 'Bật camera hoặc tải ảnh bài giải viết tay',
      camHint: 'AI đọc từng bước, đối chiếu lời giải đúng và tô đỏ chỗ sai',
      criteriaHeading: 'Nhận xét từng bước', criteriaHTML: SOLUTION_PLACEHOLDER,
    },
  };

  const show = (el, on) => el && el.classList.toggle('hidden', !on);
  function setHint(msg) { if (hint) hint.textContent = msg; }

  /* ---------- webcam ---------- */
  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      feed.srcObject = stream;
      show(feed, true); show(shot, false); show(placeholder, false);
      clearOverlay();
      startLabel.textContent = 'Tắt camera';
      imageDataURL = null;
    } catch (e) {
      setHint('Không mở được camera (' + e.name + '). Hãy dùng "Tải ảnh bài thi".');
      show(placeholder, true);
    }
  }
  function stopCamera() {
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    feed.srcObject = null; show(feed, false);
    startLabel.textContent = 'Bật camera';
  }
  function toggleCamera() { stream ? stopCamera() : startCamera(); }

  /* ---------- chụp / tải ảnh ---------- */
  function captureFromVideo() {
    const w = feed.videoWidth, h = feed.videoHeight;
    if (!w || !h) return false;
    const scale = Math.min(1, 1280 / w);
    const cv = document.createElement('canvas');
    cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
    cv.getContext('2d').drawImage(feed, 0, 0, cv.width, cv.height);
    imageDataURL = cv.toDataURL('image/jpeg', 0.85);
    shot.src = imageDataURL;
    show(shot, true); show(feed, false); show(placeholder, false);
    stopCamera();
    return true;
  }
  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) { setHint('Tệp không hợp lệ — chỉ nhận ảnh.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      imageDataURL = reader.result;
      shot.src = imageDataURL;
      show(shot, true); show(feed, false); show(placeholder, false);
      stopCamera(); clearOverlay();
    };
    reader.readAsDataURL(file);
  }

  /* ---------- overlay annotations ---------- */
  function clearOverlay() {
    annotations = [];
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
  }
  // rect của ảnh (object-contain) bên trong stage
  function containRect(iw, ih, W, H) {
    const s = Math.min(W / iw, H / ih);
    const w = iw * s, h = ih * s;
    return { x: (W - w) / 2, y: (H - h) / 2, w, h };
  }
  function drawAnnotations() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = stage.clientWidth, H = stage.clientHeight;
    overlay.width = W * dpr; overlay.height = H * dpr;
    const ctx = overlay.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!annotations.length) return;
    const iw = shot.naturalWidth || W, ih = shot.naturalHeight || H;
    const r = containRect(iw, ih, W, H);
    const COL = { error: '#f43f5e', warning: '#f59e0b', ok: '#10b981' };
    ctx.font = '600 12px Inter, sans-serif';
    ctx.lineWidth = 2.5;
    annotations.forEach((a) => {
      const col = COL[a.type] || COL.error;
      const [nx, ny, nw, nh] = a.box || [0, 0, 0, 0];
      const x = r.x + nx * r.w, y = r.y + ny * r.h, w = nw * r.w, h = nh * r.h;
      ctx.strokeStyle = col;
      ctx.setLineDash(a.type === 'warning' ? [6, 4] : []);
      roundRect(ctx, x, y, w, h, 6); ctx.stroke();
      // nhãn
      const label = a.label || '';
      if (label) {
        ctx.setLineDash([]);
        const tw = ctx.measureText(label).width + 12;
        const ly = y - 20 < 2 ? y + h + 4 : y - 20;
        ctx.fillStyle = col;
        roundRect(ctx, x, ly, tw, 18, 4); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(label, x + 6, ly + 13);
      }
    });
  }
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------- kết quả ---------- */
  const STATUS = {
    ok: { card: 'border-emerald-200 bg-emerald-50/60', dot: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
    partial: { card: 'border-amber-200 bg-amber-50/60', dot: 'text-amber-600', badge: 'bg-amber-100 text-amber-700' },
    error: { card: 'border-rose-200 bg-rose-50/60', dot: 'text-rose-600', badge: 'bg-rose-100 text-rose-700' },
  };
  function renderResult(d) {
    const max = d.max || 1;
    $('scoreVal').textContent = (d.score ?? 0).toFixed(2);
    $('scoreVal').className = 'text-4xl font-extrabold tracking-tight ' +
      (d.score >= max * 0.8 ? 'text-emerald-600' : d.score > 0 ? 'text-amber-600' : 'text-rose-600');
    $('scoreMax').textContent = max.toFixed(2);
    $('scoreBar').style.width = Math.max(0, Math.min(100, (d.score / max) * 100)) + '%';
    const v = $('scoreVerdict');
    v.textContent = d.verdict || (d.score >= max ? 'Hoàn hảo' : d.score > 0 ? 'Cần chỉnh sửa' : 'Sai cơ bản');
    v.className = 'rounded-md px-2 py-0.5 text-[11px] font-semibold ' +
      (d.score >= max * 0.8 ? 'bg-emerald-100 text-emerald-700' : d.score > 0 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700');
    const note = $('scoreNote');
    if (d.note) { note.textContent = d.note; note.classList.remove('hidden'); } else note.classList.add('hidden');

    const items = d.criteria || d.steps || [];
    const ul = $('criteriaList');
    ul.innerHTML = items.map((c) => {
      const st = STATUS[c.status] || STATUS.partial;
      const icon = c.status === 'ok' ? '✓' : c.status === 'error' ? '✗' : '!';
      const name = c.name ?? c.title ?? c.step ?? '';
      const hasScore = c.score != null || c.max != null;
      const pts = hasScore ? `${(c.score ?? 0).toFixed(2)}/${(c.max ?? 0.25).toFixed(2)}` : '';
      return `<li class="rounded-lg border ${st.card} px-3 py-2.5 text-sm">
        <div class="flex items-center justify-between gap-2">
          <span class="flex items-center gap-1.5 text-slate-700"><span class="font-bold ${st.dot}">${icon}</span>${esc(name)}</span>
          ${pts ? `<span class="font-mono text-xs font-semibold ${st.dot}">${pts}</span>` : ''}
        </div>
        ${c.note ? `<p class="mt-1 text-xs leading-relaxed text-slate-500">${esc(c.note)}</p>` : ''}
      </li>`;
    }).join('') || '<li class="text-xs text-slate-400">Không có chi tiết.</li>';

    annotations = d.annotations || [];
    drawAnnotations();
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function activeProblem() {
    const el = document.getElementById('gradeProblem');
    return el ? el.value.trim() : '';
  }
  function setMode(m) {
    mode = MODES[m] ? m : 'graph';
    const cfg = MODES[mode];
    $('modeGraph') && $('modeGraph').classList.toggle('is-on', mode === 'graph');
    $('modeSolution') && $('modeSolution').classList.toggle('is-on', mode === 'solution');
    const t = $('gradeTitle'), s = $('gradeSub'), inp = $('gradeProblem'), pr = $('presetRow');
    if (t) t.textContent = cfg.title;
    if (s) s.textContent = cfg.sub;
    if (inp) { inp.placeholder = cfg.placeholder; if (mode === 'solution') inp.value = ''; }
    if (pr) pr.classList.toggle('hidden', !cfg.preset);
    const ct = $('camTitle'), ch = $('camHint'), hd = $('criteriaHeading'), cl = $('criteriaList');
    if (ct) ct.textContent = cfg.camTitle;
    if (ch) ch.textContent = cfg.camHint;
    if (hd) hd.textContent = cfg.criteriaHeading;
    if (cl) cl.innerHTML = cfg.criteriaHTML;
    // reset kết quả khi đổi chế độ
    const sv = $('scoreVal'); if (sv) { sv.textContent = '—'; sv.className = 'text-4xl font-extrabold tracking-tight text-slate-300'; }
    const sb = $('scoreBar'); if (sb) sb.style.width = '0%';
    const vv = $('scoreVerdict'); if (vv) { vv.textContent = 'Chờ quét'; vv.className = 'rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500'; }
    const nt = $('scoreNote'); if (nt) nt.classList.add('hidden');
    clearOverlay();
  }

  /* ---------- chấm điểm ---------- */
  async function grade() {
    if (stream && !imageDataURL) captureFromVideo(); // đang live -> chụp trước
    if (!imageDataURL) { setHint('Hãy bật camera & chụp, hoặc tải ảnh bài thi trước.'); show(placeholder, true); return; }

    busy(true);
    try {
      const res = await fetch(`${apiBase()}${MODES[mode].endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageDataURL, problem: activeProblem(), mode }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      renderResult(d);
    } catch (e) {
      $('scoreVerdict').textContent = 'Lỗi';
      $('scoreVerdict').className = 'rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700';
      const note = $('scoreNote'); note.textContent = 'Không chấm được: ' + e.message; note.classList.remove('hidden');
    } finally { busy(false); }
  }

  function busy(on) {
    gradeBtn.disabled = on;
    gradeBtn.innerHTML = on
      ? '<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.2-8.5" stroke-linecap="round"/></svg> Đang chấm…'
      : '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z"/></svg> Quét & Chấm điểm';
  }

  /* ---------- wire ---------- */
  startBtn && startBtn.addEventListener('click', toggleCamera);
  uploadBtn && uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput && fileInput.addEventListener('change', () => fileInput.files[0] && loadFile(fileInput.files[0]));
  gradeBtn && gradeBtn.addEventListener('click', grade);
  $('modeGraph') && $('modeGraph').addEventListener('click', () => setMode('graph'));
  $('modeSolution') && $('modeSolution').addEventListener('click', () => setMode('solution'));
  document.querySelectorAll('#tab-grader .problem-chip').forEach((ch) =>
    ch.addEventListener('click', () => { const inp = $('gradeProblem'); if (inp) inp.value = ch.textContent.trim(); }));
  // mẫu "Khảo sát hàm bậc 3" ở sidebar -> sang grader, chế độ đồ thị, điền hàm
  document.querySelectorAll('.sample-item[data-graph]').forEach((b) =>
    b.addEventListener('click', () => {
      if (location.hash.slice(1) !== 'grader') location.hash = 'grader';
      setMode('graph');
      const inp = $('gradeProblem'); if (inp) inp.value = b.dataset.graph;
    }));
  window.addEventListener('resize', () => annotations.length && drawAnnotations());
  // dừng camera khi rời tab (đỡ tốn tài nguyên)
  window.addEventListener('hashchange', () => { if (location.hash.slice(1) !== 'grader') stopCamera(); });
})();
