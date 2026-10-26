/* ============================================================
   MathVision PRO — latex.js  (Snap to LaTeX)
   Ảnh công thức (tải/kéo-thả/dán/chụp) -> /api/latex/ocr -> LaTeX
   -> render KaTeX + hiện mã + copy. Chạy như script thường.
   ============================================================ */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const codeEl = $('latexCode'), renderEl = $('latexRender');
  if (!renderEl) return;

  const dropzone = $('dropzone'), fileInput = $('fileInput');
  const pickBtn = $('latexPick'), pasteBtn = $('latexPaste');

  function renderLatex(code, display) {
    if (codeEl) codeEl.textContent = code;
    if (!renderEl) return;
    if (window.katex) {
      try {
        renderEl.innerHTML = '';
        window.katex.render(code, renderEl, { displayMode: display !== false, throwOnError: false });
        return;
      } catch (e) { /* rơi xuống hiển thị thô */ }
    }
    renderEl.innerHTML = '<span class="font-mono text-sm text-slate-600"></span>';
    renderEl.firstChild.textContent = code;
  }

  function setBusy(on) {
    if (on) renderEl.innerHTML = '<span class="animate-pulse text-sm text-slate-400">Đang số hoá công thức…</span>';
  }

  async function ocrLatexFromDataURL(dataURL) {
    setBusy(true);
    try {
      const res = await fetch('/api/latex/ocr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataURL }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      renderLatex(d.latex || '', d.display);
    } catch (e) {
      renderEl.innerHTML = '<span class="text-sm text-rose-600"></span>';
      renderEl.firstChild.textContent = 'Số hoá lỗi: ' + e.message + ' (cần backend + GEMINI_API_KEY).';
    }
  }

  function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => ocrLatexFromDataURL(reader.result);
    reader.readAsDataURL(file);
  }

  /* triggers */
  pickBtn && pickBtn.addEventListener('click', () => fileInput && fileInput.click());
  dropzone && dropzone.addEventListener('click', () => fileInput && fileInput.click());
  fileInput && fileInput.addEventListener('change', () => fileInput.files[0] && handleFile(fileInput.files[0]));

  // kéo-thả
  if (dropzone) {
    ['dragenter', 'dragover'].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); }));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation();
      const f = e.dataTransfer?.files?.[0]; if (f) handleFile(f);
    });
  }

  // dán Ctrl+V khi đang ở tab latex
  window.addEventListener('paste', (e) => {
    if (location.hash.slice(1) !== 'latex') return;
    const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith('image/'));
    if (item) { const f = item.getAsFile(); if (f) handleFile(f); }
  });

  // nút Dán Clipboard
  pasteBtn && pasteBtn.addEventListener('click', async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const type = it.types.find((t) => t.startsWith('image/'));
        if (type) { const blob = await it.getType(type); const r = new FileReader(); r.onload = () => ocrLatexFromDataURL(r.result); r.readAsDataURL(blob); return; }
      }
      alert('Không có ảnh trong clipboard. Hãy copy ảnh công thức rồi bấm lại, hoặc nhấn Ctrl+V.');
    } catch {
      alert('Trình duyệt chặn đọc clipboard. Hãy dùng Ctrl+V để dán ảnh.');
    }
  });

  /* latex-view: Song song / Render / Mã gốc */
  const renderCard = renderEl.closest('.rounded-xl');
  const codeCard = codeEl ? codeEl.closest('.rounded-xl') : null;
  document.querySelectorAll('#tab-latex .latex-view').forEach((btn) =>
    btn.addEventListener('click', () => {
      const t = btn.textContent.trim();
      if (renderCard) renderCard.classList.toggle('hidden', t === 'Mã gốc');
      if (codeCard) codeCard.classList.toggle('hidden', t === 'Render');
    }));

  // render mẫu sẵn có khi KaTeX đã tải
  const boot = () => { if (codeEl && codeEl.textContent.trim()) renderLatex(codeEl.textContent.trim(), true); };
  if (window.katex) boot(); else window.addEventListener('load', boot);
})();
