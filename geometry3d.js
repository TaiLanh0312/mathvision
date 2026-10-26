/* ============================================================
   MathVision PRO — geometry3d.js  (Phase 3)
   Three.js engine for "Smart 3D Geometry".

   Now a DECLARATIVE renderer: it consumes a plain-JSON "scene spec"
   (the exact shape the FastAPI + Gemini backend returns). The same
   format powers the offline sample library. No builder closures — so
   a scene is fully serializable end-to-end.

   Scene spec shape:
   {
     title, meta,                       // strings for the viewport badge
     points: { A:[x,y,z], ... },        // MATH coords (z = height)
     solidEdges: [["A","B"], ...],
     dashedEdges: [["C","D"], ...],
     faces: [["A","B","C","D"], ...],
     labels: { A:[dx,dy,dz], ... },     // optional label offsets (math)
     entities: [ {label, value, detail, tone} ],
     steps:    [ {title, body, tone} ],
     layers: [ {
        key, name, color,               // color: cyan|magenta|amber|blue|...
        points:[...], faces:[...], solidEdges:[...], dashedEdges:[...],
        angles:[{at, from, to, label}],
        rightAngles:[{at, from, to}]
     } ],
     defaultLayers: ["a"]
   }

   Public API: window.MathVision3D
     .buildFromSpec(spec)   -> render any scene spec (e.g. backend JSON)
     .build(sampleName)     -> render a built-in sample
     .toggleLayer(key, on)  -> fade an auxiliary layer in/out
     .setFaceOpacity(0..1)  -> solid face translucency
     .setView(name)         -> tween camera to a preset angle
     .reset() / .fullscreen()
   ============================================================ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { solveProblem } from './geokernel.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const API_BASE = ''; // same origin (FastAPI serves this frontend)

/* ---------- Palette ---------- */
const COLOR = {
  solid: 0x93c5fd, face: 0x38bdf8, ink: 0xe2e8f0, grid: 0x1e293b,
  cyan: 0x22d3ee, magenta: 0xa78bfa, amber: 0xfbbf24,
  blue: 0x60a5fa, emerald: 0x34d399, rose: 0xfb7185,
};
const layerColor = (name) => COLOR[name] ?? COLOR.cyan;

/* math(x,y,z) -> three(x, z, y) : math z (height) becomes three up(y) */
const V = (x, y, z) => new THREE.Vector3(x, z, y);
const toVec = (a) => V(a[0], a[1], a[2]);

/* ============================================================
   Built-in sample specs (declarative JSON, numbers only).
   ============================================================ */
function samplePyramid() {
  const a = 2.4, h = a * Math.SQRT2;
  const P = { A:[0,0,0], B:[a,0,0], C:[a,a,0], D:[0,a,0], S:[0,0,h] };
  // derived points via vector math (foot of ⊥ from A onto SX; plane ⊥ SC through A)
  const sub = (u,v)=>[u[0]-v[0],u[1]-v[1],u[2]-v[2]];
  const dot = (u,v)=>u[0]*v[0]+u[1]*v[1]+u[2]*v[2];
  const add = (u,v,t)=>[u[0]+v[0]*t,u[1]+v[1]*t,u[2]+v[2]*t];
  const n = sub(P.C, P.S); // plane normal = SC
  const foot = (from,to)=>{ const d=sub(to,from); const t=dot(sub(P.A,from),n)/dot(d,n); return add(from,d,t); };
  P.H = foot(P.S,P.C); P.M = foot(P.S,P.B); P.N = foot(P.S,P.D);
  P.O = [ (P.A[0]+P.C[0])/2, (P.A[1]+P.C[1])/2, (P.A[2]+P.C[2])/2 ];

  return {
    title: 'Chóp S.ABCD', meta: 'Oxyz [A = Gốc]',
    points: P,
    solidEdges: [['A','B'],['B','C'],['S','A'],['S','B'],['S','C']],
    dashedEdges: [['C','D'],['D','A'],['S','D']],
    faces: [['A','B','C','D']],
    labels: { A:[-0.28,-0.1,-0.28], B:[0.28,-0.1,-0.28], C:[0.28,-0.1,0.28], D:[-0.25,-0.1,0.28], S:[0,0.3,0] },
    entities: [
      { label:'Đáy ABCD', value:'Vuông cạnh a', detail:'A(0,0,0) → C(a,a,0)', tone:'slate' },
      { label:'Đường cao', value:'SA ⊥ Đáy', detail:'S(0, 0, a√2)', tone:'slate' },
      { label:'Góc mục tiêu', value:'∠(SC, ABCD)', detail:'∠SCA = 45° (π/4)', tone:'amber' },
      { label:'Mặt phẳng (P)', value:'(P) ⊥ SC qua A', detail:'Thiết diện tứ giác AMHN', tone:'blue' },
    ],
    steps: [
      { title:'Xác định hình chiếu SC', body:'SA ⊥ (ABCD) ⇒ hình chiếu vuông góc của SC lên đáy là AC.', tone:'amber' },
      { title:'Tính số đo ∠SCA', body:'Đáy vuông ⇒ AC = a√2. Tam giác SAC vuông cân tại A ⇒ tan∠SCA = 1 ⇒ ∠SCA = 45°.', tone:'blue' },
      { title:'Thiết diện (P) ⊥ SC', body:'Hạ AH ⊥ SC, qua H kẻ // BD cắt SB, SD tại M, N. Thiết diện AMHN, diện tích 2a²/3.', tone:'blue' },
    ],
    layers: [
      { key:'a', name:'Câu a · Góc ∠SCA', color:'cyan',
        faces:[['A','C','S']], dashedEdges:[['A','C']],
        angles:[{at:'C', from:'A', to:'S', label:'45°'}],
        rightAngles:[{at:'A', from:'C', to:'S'}] },
      { key:'b', name:'Câu b · Thiết diện (P)', color:'magenta',
        points:['M','H','N'], faces:[['A','M','H','N']], dashedEdges:[['A','H']],
        rightAngles:[{at:'H', from:'A', to:'M'}] },
      { key:'mp', name:'Mặt chéo (SBD)', color:'amber',
        points:['O'], faces:[['S','B','D']], dashedEdges:[['B','D']], solidEdges:[['S','O']] },
    ],
    defaultLayers: ['a'],
  };
}

function samplePrism() {
  const a = 2.4, h = 3.0, r = a / Math.sqrt(3);
  const tri = (k) => [r*Math.cos(Math.PI/2 + k*2*Math.PI/3), r*Math.sin(Math.PI/2 + k*2*Math.PI/3)];
  const [ax,ay]=tri(0),[bx,by]=tri(1),[cx,cy]=tri(2);
  return {
    title: 'Lăng trụ ABC.A′B′C′', meta: 'Oxyz',
    points: { A:[ax,ay,0], B:[bx,by,0], C:[cx,cy,0], "A'":[ax,ay,h], "B'":[bx,by,h], "C'":[cx,cy,h] },
    solidEdges: [['A','B'],['B','C'],["A'","B'"],["B'","C'"],["C'","A'"],['A',"A'"],['B',"B'"]],
    dashedEdges: [['C','A'],['C',"C'"]],
    faces: [['A','B','C'], ["A'","B'","C'"]],
    labels: { A:[-0.3,-0.1,0], B:[0.3,-0.1,0], C:[0,-0.1,0.35], "A'":[-0.3,0.2,0], "B'":[0.3,0.2,0], "C'":[0,0.2,0.35] },
    entities: [
      { label:'Đáy ABC', value:'Tam giác đều cạnh a', detail:'Cạnh bên ⊥ đáy', tone:'slate' },
      { label:'Chiều cao', value:"AA' = h", detail:"AA' // BB' // CC'", tone:'slate' },
    ],
    steps: [
      { title:'Lăng trụ đứng', body:'Hai đáy ABC và A′B′C′ là tam giác đều bằng nhau, cạnh bên vuông góc đáy.', tone:'amber' },
    ],
    layers: [],
    defaultLayers: [],
  };
}

const SAMPLES = { pyramid: samplePyramid, prism: samplePrism };

/* ============================================================
   Engine state
   ============================================================ */
let renderer, scene, camera, controls, host;
let lineMaterials = [];
let stepGroups = [];          // [{group, mats:[{m,base,structural}], title, body}]
let structuralFaceMats = [];  // mặt khối (chịu điều khiển "độ mờ mặt")
let currentSpec = null;
let camTween = null;
let currentStep = 0;          // bước đang hiện (hiện tích luỹ 0..currentStep)
let playTimer = null;
let pointMarkers = {};        // name -> {group, mats, step, userVisible}

function init() {
  host = document.getElementById('viewport3d');
  if (!host) return;
  host.innerHTML = '';
  host.classList.remove('place-items-center');
  host.style.position = 'relative';

  const w = host.clientWidth || 640, hgt = host.clientHeight || 480;
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, hgt);
  renderer.setClearColor(0x0b1120, 1);
  Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });
  host.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b1120, 16, 30);
  camera = new THREE.PerspectiveCamera(42, w / hgt, 0.1, 100);
  camera.position.set(6.5, 5.2, 7.5);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.9; controls.minDistance = 3.5; controls.maxDistance = 24;

  buildGrid(); buildAxes();
  buildFromSpec(samplePyramid());

  window.addEventListener('resize', onResize);
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(host);
  renderer.setAnimationLoop(tick);
}

/* ---------- static grid + axes ---------- */
function buildGrid() {
  const grid = new THREE.GridHelper(18, 18, COLOR.grid, COLOR.grid);
  grid.material.transparent = true; grid.material.opacity = 0.55;
  scene.add(grid);
}
function buildAxes() {
  const g = new THREE.Group();
  const mk = (dir, c) => {
    const a = new THREE.ArrowHelper(dir, new THREE.Vector3(), 3.8, c, 0.36, 0.22);
    a.line.material.transparent = true; a.line.material.opacity = 0.75; return a;
  };
  g.add(mk(new THREE.Vector3(1,0,0), 0xf87171));
  g.add(mk(new THREE.Vector3(0,0,1), 0x4ade80));
  g.add(mk(new THREE.Vector3(0,1,0), 0x60a5fa));
  g.add(makeLabel('x', 0xf87171, 0.42).positionTo(V(4.1,0,0)));
  g.add(makeLabel('y', 0x4ade80, 0.42).positionTo(V(0,4.1,0)));
  g.add(makeLabel('z', 0x60a5fa, 0.42).positionTo(V(0,0,4.1)));
  scene.add(g);
}

/* ---------- factories ---------- */
function makeLine(pts, { color, width = 3, dashed = false, opacity = 1 }) {
  const positions = []; pts.forEach((p) => positions.push(p.x, p.y, p.z));
  const geo = new LineGeometry(); geo.setPositions(positions);
  const mat = new LineMaterial({ color, linewidth: width, dashed, dashSize: 0.18, gapSize: 0.12, transparent: true, opacity });
  mat.resolution.set(host.clientWidth || 1, host.clientHeight || 1);
  lineMaterials.push(mat);
  const line = new Line2(geo, mat);
  if (dashed) line.computeLineDistances();
  line.renderOrder = 2; return line;
}
function makeLabel(text, color = COLOR.ink, size = 0.5) {
  const pr = Math.min(window.devicePixelRatio, 2), px = 128 * pr;
  const cv = document.createElement('canvas'); cv.width = cv.height = px;
  const ctx = cv.getContext('2d');
  ctx.font = `700 ${72 * pr}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 10 * pr;
  ctx.fillText(text, px/2, px/2);
  const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sp = new THREE.Sprite(mat); sp.scale.set(size, size, size); sp.renderOrder = 5;
  sp.positionTo = (v) => { sp.position.copy(v); return sp; }; sp._fadeMat = mat; return sp;
}
function makeFace(pts, color, opacity) {
  const geo = new THREE.BufferGeometry();
  const idx = []; for (let i = 1; i < pts.length - 1; i++) idx.push(0, i, i + 1);
  const pos = new Float32Array(pts.length * 3);
  pts.forEach((p, i) => { pos[i*3]=p.x; pos[i*3+1]=p.y; pos[i*3+2]=p.z; });
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 1; return { mesh, mat };
}
function makeArc(c, u, w, radius, color, steps = 24) {
  const q = new THREE.Quaternion().setFromUnitVectors(u, w), pts = [];
  for (let i = 0; i <= steps; i++) {
    const qi = new THREE.Quaternion().slerp(q, i / steps);
    pts.push(c.clone().addScaledVector(u.clone().applyQuaternion(qi), radius));
  }
  return makeLine(pts, { color, width: 2.4 });
}
function makeRightAngle(c, u, w, s, color) {
  const p1 = c.clone().addScaledVector(u, s), p3 = c.clone().addScaledVector(w, s);
  const p2 = p1.clone().addScaledVector(w, s);
  return makeLine([p1, p2, p3], { color, width: 2 });
}
function makePointMarker(pos, name, offset) {
  const g = new THREE.Group();
  const dotMat = new THREE.MeshBasicMaterial({ color: COLOR.blue, transparent: true, opacity: 0, depthTest: false });
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), dotMat);
  dot.position.copy(pos); dot.renderOrder = 4; g.add(dot);
  const lbl = makeLabel(name, COLOR.ink, 0.5).positionTo(pos.clone().add(V(offset[0], offset[1], offset[2])));
  lbl._fadeMat.opacity = 0; g.add(lbl);
  scene.add(g);
  return { group: g, mats: [{ m: dotMat, base: 1 }, { m: lbl._fadeMat, base: 1 }] };
}

/* ============================================================
   Build a scene from a declarative spec
   ============================================================ */
function buildFromSpec(spec) {
  if (!spec || !spec.points) return;
  currentSpec = spec;
  stopPlay();

  // dispose previous step groups + điểm
  stepGroups.forEach((s) => disposeGroup(s.group));
  Object.values(pointMarkers).forEach((pm) => disposeGroup(pm.group));
  stepGroups = []; pointMarkers = {}; lineMaterials = []; structuralFaceMats = [];

  // resolve name -> three vector
  const P = {}; Object.entries(spec.points).forEach(([k, v]) => (P[k] = toVec(v)));

  // kế hoạch dựng hình theo BƯỚC (từ spec.construction, hoặc tự suy ra)
  const plan = (spec.construction && spec.construction.length)
    ? spec.construction : deriveConstruction(spec);

  plan.forEach((st) => stepGroups.push(buildStepGroup(st, P, spec.labels || {})));

  // ĐIỂM -> marker (ẩn/hiện được); bước xuất hiện lấy từ plan
  const pointStep = {};
  plan.forEach((st, i) => (st.points || []).forEach((n) => { if (pointStep[n] == null) pointStep[n] = i; }));
  const labelOff = spec.labels || {};
  Object.keys(spec.points).forEach((n) => {
    const off = labelOff[n] || [0.16, 0.16, 0.06];
    const pm = makePointMarker(P[n], n, off);
    pm.step = pointStep[n] != null ? pointStep[n] : 0;
    pm.userVisible = true;
    pointMarkers[n] = pm;
  });
  renderPointPanel();

  renderEntities(spec.entities || []);
  renderStepList(plan);
  renderSolution(spec.steps || []);
  buildStepPlayer(plan.length);
  updateBadge(spec);

  currentStep = plan.length - 1;         // mặc định hiện TOÀN BỘ hình
  applyStep(currentStep, { animate: true });
  frameCamera(P);
}

/* một bước dựng -> một THREE.Group (ẩn, fade khi hiện) */
function buildStepGroup(st, P, labelOffsets) {
  const structural = !st.color || st.color === 'solid';
  const col = structural ? COLOR.solid : layerColor(st.color);
  const faceCol = structural ? COLOR.face : layerColor(st.color);
  const vg = (n) => P[n];
  const g = new THREE.Group();
  const mats = [];

  (st.faces || []).forEach((f) => {
    if (!f.every((n) => P[n])) return;
    const op = structural ? getSliderOpacity() : 0.24;
    const { mesh, mat } = makeFace(f.map(vg), faceCol, op);
    if (structural) structuralFaceMats.push(mat);
    g.add(mesh); mats.push({ m: mat, base: op, structural });
  });
  (st.solidEdges || []).forEach(([p, q]) => {
    if (P[p] && P[q]) g.add(makeLine([vg(p), vg(q)], { color: col, width: structural ? 3.3 : 3 }));
  });
  (st.dashedEdges || []).forEach(([p, q]) => {
    if (P[p] && P[q]) g.add(makeLine([vg(p), vg(q)], { color: col, width: 2.5, dashed: true }));
  });
  // đường cong (mặt tròn xoay): mảng polyline toạ độ thô
  (st.curves || []).forEach((cv) => { if (cv && cv.length >= 2) g.add(makeLine(cv.map(toVec), { color: col, width: structural ? 2.8 : 2.4 })); });
  (st.curvesDashed || []).forEach((cv) => { if (cv && cv.length >= 2) g.add(makeLine(cv.map(toVec), { color: col, width: 2.2, dashed: true })); });
  (st.angles || []).forEach((an) => {
    if (!(P[an.at] && P[an.from] && P[an.to])) return;
    const c = vg(an.at);
    const u = new THREE.Vector3().subVectors(vg(an.from), c).normalize();
    const w = new THREE.Vector3().subVectors(vg(an.to), c).normalize();
    g.add(makeArc(c, u, w, 0.75, col));
    if (an.label) {
      const bis = new THREE.Vector3().addVectors(u, w).normalize();
      g.add(makeLabel(an.label, col, 0.4).positionTo(c.clone().addScaledVector(bis, 1.05)));
    }
  });
  (st.rightAngles || []).forEach((ra) => {
    if (!(P[ra.at] && P[ra.from] && P[ra.to])) return;
    const c = vg(ra.at);
    const u = new THREE.Vector3().subVectors(vg(ra.from), c).normalize();
    const w = new THREE.Vector3().subVectors(vg(ra.to), c).normalize();
    g.add(makeRightAngle(c, u, w, 0.34, col));
  });
  // (nhãn các đỉnh do point-marker đảm nhiệm, có thể ẩn/hiện riêng)

  scene.add(g);
  g.traverse((o) => { const m = o.material || o._fadeMat; if (m && !mats.some((x) => x.m === m)) mats.push({ m, base: m.opacity, structural: false }); });
  mats.forEach(({ m }) => (m.opacity = 0));
  g.visible = false;
  return { group: g, mats, title: st.title || 'Bước', body: st.body || '' };
}

/* tự suy construction khi spec không cung cấp (vd kết quả AI) */
function deriveConstruction(spec) {
  const pts = spec.points || {}, labels = spec.labels || {};
  const atBase = (n) => Math.abs((pts[n] || [0, 0, 0])[2]) < 1e-3;
  const baseNames = Object.keys(pts).filter(atBase);
  const inBase = (e) => e.every((n) => baseNames.includes(n));
  const plan = [];
  plan.push({ title: 'Dựng đáy', body: 'Vẽ đa giác đáy trên hệ trục Oxyz.', color: 'solid',
    points: baseNames.filter((n) => labels[n] || true),
    solidEdges: (spec.solidEdges || []).filter(inBase),
    dashedEdges: (spec.dashedEdges || []).filter(inBase),
    faces: (spec.faces || []).filter((f) => f.every((n) => baseNames.includes(n))) });
  plan.push({ title: 'Dựng cạnh bên & đỉnh trên', body: 'Vẽ các đỉnh trên và cạnh bên.', color: 'solid',
    points: Object.keys(pts).filter((n) => !baseNames.includes(n)),
    solidEdges: (spec.solidEdges || []).filter((e) => !inBase(e)),
    dashedEdges: (spec.dashedEdges || []).filter((e) => !inBase(e)),
    faces: (spec.faces || []).filter((f) => !f.every((n) => baseNames.includes(n))) });
  (spec.layers || []).forEach((L) => plan.push({
    title: L.name, body: '', color: L.color, points: L.points,
    faces: L.faces, solidEdges: L.solidEdges, dashedEdges: L.dashedEdges,
    angles: L.angles, rightAngles: L.rightAngles,
  }));
  return plan.filter((s) => (s.points && s.points.length) || (s.solidEdges && s.solidEdges.length)
    || (s.dashedEdges && s.dashedEdges.length) || (s.faces && s.faces.length)
    || (s.angles && s.angles.length) || (s.rightAngles && s.rightAngles.length));
}

/* ---------- DOM: entities / steps / pills ---------- */
const TONE = {
  slate: { card: 'border-slate-200 bg-slate-50/60', lab: 'text-slate-500', val: 'text-slate-700', det: 'text-blue-600' },
  amber: { card: 'border-amber-200 bg-amber-50/70', lab: 'text-amber-700', val: 'text-amber-800', det: 'text-amber-700' },
  blue:  { card: 'border-blue-200 bg-blue-50/70', lab: 'text-blue-700', val: 'text-blue-800', det: 'text-blue-700' },
};
function renderEntities(items) {
  const el = document.getElementById('entityList'); if (!el) return;
  el.innerHTML = (items || []).map((e) => {
    const t = TONE[e.tone] || TONE.slate;
    const label = e.label ?? e.name ?? '';
    const value = e.value ?? e.val ?? '';
    const detail = e.detail ?? e.content ?? e.note ?? '';
    return `<div class="rounded-xl border ${t.card} p-3">
      <div class="flex items-center justify-between gap-2 text-xs"><span class="font-medium ${t.lab}">${esc(label)}</span><span class="font-semibold ${t.val}">${esc(value)}</span></div>
      ${detail ? `<p class="mt-1 font-mono text-xs ${t.det}">${esc(detail)}</p>` : ''}
    </div>`;
  }).join('');
}
/* danh sách BƯỚC ở panel phải — bấm để tua tới bước đó */
function renderStepList(plan) {
  const el = document.getElementById('stepList'); if (!el) return;
  el.innerHTML = (plan || []).map((s, i) => `
    <li data-step="${i}" class="step-item cursor-pointer rounded-xl border p-3.5 transition">
      <div class="flex items-center gap-2">
        <span class="step-badge grid h-6 w-6 place-items-center rounded-full text-xs font-bold text-white">${i + 1}</span>
        <span class="text-sm font-semibold text-slate-900">${esc(s.title || 'Bước ' + (i + 1))}</span>
      </div>
      ${s.body ? `<p class="mt-2 text-xs leading-relaxed text-slate-600">${esc(s.body)}</p>` : ''}
    </li>`).join('');
  el.querySelectorAll('.step-item').forEach((li) =>
    li.addEventListener('click', () => setStep(+li.dataset.step)));
}

/* lời giải chi tiết ở panel phải */
function renderSolution(items) {
  const el = document.getElementById('solutionList'); if (!el) return;
  el.innerHTML = (items || []).map((s, i) => {
    const title = s.title ?? s.name ?? `Bước ${i + 1}`;
    const body = s.body ?? s.content ?? s.detail ?? s.text ?? '';
    return `<li class="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div class="flex items-center gap-2">
        <span class="grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">${i + 1}</span>
        <span class="text-xs font-semibold text-slate-800">${esc(title)}</span>
      </div>
      ${body ? `<p class="mt-1 text-xs leading-relaxed text-slate-600">${esc(body)}</p>` : ''}
    </li>`;
  }).join('') || '<li class="text-xs text-slate-400">Đề chưa có câu hỏi để giải.</li>';
}

/* ---------- điểm: panel ẩn/hiện (kiểu GeoGebra) ---------- */
const EYE_ON = '<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c6.5 0 10 7 10 7a18 18 0 0 1-2.2 3.2M6.6 6.6A18 18 0 0 0 2 11s3.5 7 10 7a10.9 10.9 0 0 0 4-.8"/><path d="m2 2 20 20"/></svg>';
function renderPointPanel() {
  const panel = document.getElementById('pointPanel'), list = document.getElementById('pointList');
  if (!panel || !list) return;
  const names = Object.keys(pointMarkers);
  panel.classList.toggle('hidden', names.length === 0);
  list.innerHTML = names.map((n) => `<button data-pt="${esc(n)}" title="Ẩn/hiện điểm ${esc(n)}" class="pt-chip inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold transition">
      <span class="pt-ico"></span>${esc(n)}</button>`).join('');
  list.querySelectorAll('.pt-chip').forEach((b) => b.addEventListener('click', () => togglePoint(b.dataset.pt)));
  updatePointChips();
}
function updatePointChips() {
  document.querySelectorAll('#pointList .pt-chip').forEach((b) => {
    const pm = pointMarkers[b.dataset.pt]; if (!pm) return;
    const on = pm.userVisible;
    b.className = 'pt-chip inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold transition '
      + (on ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-400');
    const ico = b.querySelector('.pt-ico'); if (ico) ico.innerHTML = on ? EYE_ON : EYE_OFF;
  });
}
function togglePoint(n) { const pm = pointMarkers[n]; if (pm) { pm.userVisible = !pm.userVisible; updatePointChips(); } }
function toggleAllPoints() {
  const any = Object.values(pointMarkers).some((pm) => pm.userVisible);
  Object.values(pointMarkers).forEach((pm) => (pm.userVisible = !any));
  updatePointChips();
  const btn = document.getElementById('pointToggleAll'); if (btn) btn.textContent = any ? 'Hiện tất cả' : 'Ẩn tất cả';
}

/* ---------- step player ---------- */
function buildStepPlayer(count) {
  const slider = document.getElementById('stepSlider');
  if (slider) { slider.min = 0; slider.max = Math.max(0, count - 1); slider.value = count - 1; }
}
function updateStepUI() {
  const n = stepGroups.length;
  const slider = document.getElementById('stepSlider');
  if (slider) slider.value = currentStep;
  const lbl = document.getElementById('stepLabel');
  if (lbl) lbl.textContent = n ? `${currentStep + 1}/${n} · ${stepGroups[currentStep]?.title || ''}` : '—';
  document.querySelectorAll('#stepList .step-item').forEach((li) => {
    const i = +li.dataset.step;
    const done = i <= currentStep, cur = i === currentStep;
    li.classList.toggle('border-blue-300', cur);
    li.classList.toggle('bg-blue-50/70', cur);
    li.classList.toggle('border-slate-200', !cur && done);
    li.classList.toggle('bg-slate-50/60', !cur && done);
    li.classList.toggle('border-slate-100', !done);
    li.classList.toggle('bg-white', !done);
    li.classList.toggle('opacity-50', !done);
    const badge = li.querySelector('.step-badge');
    if (badge) badge.className = 'step-badge grid h-6 w-6 place-items-center rounded-full text-xs font-bold text-white ' + (done ? (cur ? 'bg-blue-600' : 'bg-blue-500') : 'bg-slate-300');
  });
}
function applyStep(k, { animate = true } = {}) {
  if (!stepGroups.length) return;
  currentStep = Math.max(0, Math.min(k, stepGroups.length - 1));
  if (!animate || REDUCED) {
    stepGroups.forEach((s, i) => {
      const reveal = i <= currentStep; s.group.visible = reveal;
      s.mats.forEach((mt) => (mt.m.opacity = reveal ? (mt.structural ? getSliderOpacity() : mt.base) : 0));
    });
  } else {
    stepGroups.forEach((s, i) => { if (i <= currentStep) s.group.visible = true; });
  }
  Object.values(pointMarkers).forEach((pm) => {
    const reveal = pm.step <= currentStep && pm.userVisible;
    if (!animate || REDUCED) { pm.group.visible = reveal; pm.mats.forEach((mt) => (mt.m.opacity = reveal ? mt.base : 0)); }
    else if (reveal) pm.group.visible = true;
  });
  updateStepUI();
}
function setStep(k) { stopPlay(); applyStep(k); }
function stepBy(d) { setStep(currentStep + d); }
function play() {
  if (playTimer) { stopPlay(); return; }
  if (currentStep >= stepGroups.length - 1) applyStep(0);
  setPlayIcon(true);
  playTimer = setInterval(() => {
    if (currentStep >= stepGroups.length - 1) { stopPlay(); return; }
    applyStep(currentStep + 1);
  }, 950);
}
function stopPlay() { if (playTimer) { clearInterval(playTimer); playTimer = null; } setPlayIcon(false); }
function setPlayIcon(on) {
  const b = document.getElementById('stepPlay'); if (!b) return;
  b.innerHTML = on
    ? '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'
    : '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
}
function updateBadge(spec) {
  const badge = document.getElementById('viewportBadge');
  if (badge && spec.meta) badge.textContent = spec.meta;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

/* ---------- camera ---------- */
function frameCamera(P) {
  const box = new THREE.Box3();
  Object.values(P).forEach((v) => box.expandByPoint(v));
  const center = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() * 0.5 || 3;
  currentSpec._center = center; currentSpec._radius = radius;
  const flat = !!currentSpec.dim2d;
  if (controls) controls.enableRotate = !flat;              // 2D: khoá xoay
  const off = flat ? new THREE.Vector3(0.001, radius*3.4, 0.001)   // nhìn từ trên
                   : new THREE.Vector3(radius*1.9, radius*1.5, radius*2.1);
  tweenCamera(center.clone().add(off), center);
}
const VIEW_OFFSETS = {
  'Chuẩn': (r) => new THREE.Vector3(r*1.9, r*1.5, r*2.1),
  'Đáy':   (r) => new THREE.Vector3(0.001, r*3.2, 0.001),
  'Đứng':  (r) => new THREE.Vector3(0.001, r*0.4, r*3.4),
  'Cắt (P)': (r) => new THREE.Vector3(r*2.6, r*0.9, -r*1.2),
};
function setView(name) {
  if (!currentSpec) return;
  const off = VIEW_OFFSETS[name] || VIEW_OFFSETS['Chuẩn'];
  const c = currentSpec._center, r = currentSpec._radius;
  tweenCamera(c.clone().add(off(r)), c.clone());
}
function tweenCamera(toPos, toTarget) {
  if (REDUCED) { camera.position.copy(toPos); controls.target.copy(toTarget); controls.update(); camTween = null; return; }
  camTween = { fromPos: camera.position.clone(), toPos: toPos.clone(), fromTarget: controls.target.clone(), toTarget: toTarget.clone(), t: 0, dur: 0.75 };
}

/* ---------- opacity ---------- */
function getSliderOpacity() { const el = document.getElementById('opacity'); return el ? Number(el.value) / 100 : 0.45; }

/* ---------- loop / resize / dispose ---------- */
function onResize() {
  if (!renderer || !host) return;
  const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  lineMaterials.forEach((m) => m.resolution.set(w, h));
}
const EASE = (t) => 1 - Math.pow(1 - t, 4);
let lastT = performance.now();
function tick(now) {
  const dt = Math.min((now - lastT) / 1000, 0.05); lastT = now;
  if (camTween) {
    camTween.t += dt / camTween.dur; const k = EASE(Math.min(camTween.t, 1));
    camera.position.lerpVectors(camTween.fromPos, camTween.toPos, k);
    controls.target.lerpVectors(camTween.fromTarget, camTween.toTarget, k);
    if (camTween.t >= 1) camTween = null;
  }
  stepGroups.forEach((s, i) => {
    const reveal = i <= currentStep;
    let active = false;
    s.mats.forEach((mt) => {
      const base = mt.structural ? getSliderOpacity() : mt.base;
      const goal = reveal ? base : 0;
      if (Math.abs(mt.m.opacity - goal) > 0.004) { mt.m.opacity += (goal - mt.m.opacity) * Math.min(dt * 9, 1); active = true; }
      else mt.m.opacity = goal;
    });
    if (reveal) s.group.visible = true;
    else if (!active) s.group.visible = false;
  });
  Object.values(pointMarkers).forEach((pm) => {
    const reveal = pm.step <= currentStep && pm.userVisible;
    let active = false;
    pm.mats.forEach((mt) => {
      const goal = reveal ? mt.base : 0;
      if (Math.abs(mt.m.opacity - goal) > 0.004) { mt.m.opacity += (goal - mt.m.opacity) * Math.min(dt * 9, 1); active = true; }
      else mt.m.opacity = goal;
    });
    if (reveal) pm.group.visible = true;
    else if (!active) pm.group.visible = false;
  });
  controls.update(); renderer.render(scene, camera);
}
function disposeGroup(g) {
  g.traverse((o) => { if (o.geometry) o.geometry.dispose(); const m = o.material || o._fadeMat; if (m) { if (m.map) m.map.dispose(); m.dispose(); } });
  scene.remove(g);
}

/* ============================================================
   Backend integration — POST problem text to Gemini parser
   ============================================================ */
function setStatus(msg, kind = 'info') {
  const el = document.getElementById('buildStatus'); if (!el) return;
  const map = { info:'text-slate-500', ok:'text-emerald-600', warn:'text-amber-600', err:'text-rose-600' };
  el.className = `mt-2 flex items-center gap-1.5 text-xs font-medium ${map[kind] || map.info}`;
  el.textContent = msg; el.classList.remove('hidden');
}
function clearStatus() { const el = document.getElementById('buildStatus'); el && el.classList.add('hidden'); }

async function parseAndBuild() {
  const ta = document.querySelector('#tab-studio textarea');
  const problem = (ta?.value || '').trim();
  if (!problem) { setStatus('Hãy nhập đề bài trước khi dựng hình.', 'warn'); return; }

  // 1) KERNEL NỘI BỘ — tức thì, không mạng.
  const t0 = performance.now();
  let solved;
  try { solved = solveProblem(problem); } catch (e) { solved = { ok: false, reason: e.message }; }
  if (solved && solved.ok) {
    buildFromSpec(solved.spec);
    const ms = Math.max(1, Math.round(performance.now() - t0));
    setStatus(`⚡ Dựng tức thì bằng kernel nội bộ · ${ms}ms`, 'ok');
    fetchDetailedSolution(problem);   // lời giải chi tiết (AI, nền)
    return;
  }

  // 2) FALLBACK AI — chỉ khi kernel chưa nhận diện được hình.
  setStatus('Hình chưa có mẫu kernel — đang nhờ AI phân tích…', 'info');
  busy(true);
  try {
    const res = await fetch(`${API_BASE}/api/geometry/parse`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problem }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    buildFromSpec(data);
    setStatus(`✓ Đã dựng "${data.title || 'mô hình'}" từ AI.` + (data.source === 'mock' ? ' (demo)' : ''), 'ok');
    fetchDetailedSolution(problem);
  } catch (err) {
    buildFromSpec(samplePyramid());
    setStatus(`Không gọi được AI (${err.message}). Đang hiển thị bài mẫu.`, 'warn');
  } finally { busy(false); }
}

async function fetchDetailedSolution(problem) {
  const el = document.getElementById('solutionList'); if (!el || !currentSpec) return;
  const baseSpec = currentSpec;
  const figureConstr = (baseSpec.construction && baseSpec.construction.length)
    ? baseSpec.construction : deriveConstruction(baseSpec);
  const fallback = baseSpec.steps || [];
  el.innerHTML = '<li class="animate-pulse text-xs text-slate-400">Đang soạn lời giải chi tiết…</li>';
  try {
    const res = await fetch(`${API_BASE}/api/geometry/solve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problem, points: baseSpec.points }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    if (d.error) throw new Error(d.error);

    const sol = d.solution || [];
    const newPoints = {}, newLabels = {}, drawSteps = [], solMeta = [];
    sol.forEach((st) => {
      const dr = st.draw || {};
      Object.assign(newPoints, dr.points || {});
      Object.assign(newLabels, dr.labels || {});
      const drawn = [['points', 'o'], ['segments', 'a'], ['dashed', 'a']]
        .some(([k]) => dr[k] && (Array.isArray(dr[k]) ? dr[k].length : Object.keys(dr[k]).length));
      if (drawn) {
        drawSteps.push({
          title: st.title || 'Vẽ thêm', body: st.body || '', color: 'emerald',
          points: Object.keys(dr.points || {}), solidEdges: dr.segments || [], dashedEdges: dr.dashed || [],
        });
        solMeta.push({ title: st.title, body: st.body, stepIndex: figureConstr.length + drawSteps.length - 1 });
      } else {
        solMeta.push({ title: st.title, body: st.body, stepIndex: null });
      }
    });
    if (d.answer) solMeta.push({ title: 'Đáp số', body: d.answer, stepIndex: null });

    if (drawSteps.length) {
      buildFromSpec({
        ...baseSpec,
        points: { ...baseSpec.points, ...newPoints },
        labels: { ...(baseSpec.labels || {}), ...newLabels },
        construction: [...figureConstr, ...drawSteps],
        steps: solMeta.map((m) => ({ title: m.title, body: m.body })),
      });
    } else {
      renderSolution(solMeta.length ? solMeta.map((m) => ({ title: m.title, body: m.body })) : fallback);
    }
    wireSolutionClicks(solMeta);
  } catch (e) {
    renderSolution(fallback);
    const note = document.createElement('li');
    note.className = 'text-xs text-amber-600';
    note.textContent = 'Lời giải chi tiết cần backend + GEMINI_API_KEY (' + e.message + ').';
    el.appendChild(note);
  }
}
function wireSolutionClicks(solMeta) {
  const el = document.getElementById('solutionList'); if (!el) return;
  [...el.children].forEach((li, i) => {
    const m = solMeta[i]; if (!m) return;
    if (m.stepIndex != null) {
      li.classList.add('cursor-pointer', 'ring-1', 'ring-emerald-200');
      li.title = 'Bấm để xem phần vẽ thêm của bước này trên hình';
      li.addEventListener('click', () => setStep(m.stepIndex));
    }
  });
}

function busy(on) {
  if (!host) return;
  let o = host.querySelector('.v-busy');
  if (on) {
    if (o) return;
    o = document.createElement('div'); o.className = 'v-busy';
    o.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;background:rgba(11,17,32,.55);backdrop-filter:blur(2px);color:#93c5fd;font:600 13px Inter,sans-serif;z-index:3;';
    o.textContent = 'Đang bóc tách hình học…'; host.appendChild(o);
  } else if (o) o.remove();
}

/* ============================================================
   Wire DOM controls
   ============================================================ */
function wire() {
  // step player
  const prev = document.getElementById('stepPrev');
  prev && prev.addEventListener('click', () => stepBy(-1));
  const next = document.getElementById('stepNext');
  next && next.addEventListener('click', () => stepBy(1));
  const playBtn = document.getElementById('stepPlay');
  playBtn && playBtn.addEventListener('click', play);
  const slider = document.getElementById('stepSlider');
  slider && slider.addEventListener('input', () => setStep(+slider.value));
  const togAll = document.getElementById('pointToggleAll');
  togAll && togAll.addEventListener('click', toggleAllPoints);
  const img = document.getElementById('img4k');
  img && img.addEventListener('click', exportImage);
  const tz = document.getElementById('tikz');
  tz && tz.addEventListener('click', exportTikz);

  document.querySelectorAll('.quick-angle').forEach((btn) =>
    btn.addEventListener('click', () => setView(btn.textContent.trim())));

  const rb = document.getElementById('view-reset');
  rb && rb.addEventListener('click', () => currentSpec && frameCamera(
    Object.fromEntries(Object.entries(currentSpec.points).map(([k, v]) => [k, toVec(v)]))));
  const fb = document.getElementById('view-full');
  fb && fb.addEventListener('click', fullscreen);

  const build3d = document.getElementById('build3d');
  build3d && build3d.addEventListener('click', parseAndBuild);

  document.querySelectorAll('.sample-item[data-scene]').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (location.hash.slice(1) !== 'studio') location.hash = 'studio';
      clearStatus();
      busy(true);
      setTimeout(() => { buildFromSpec((SAMPLES[btn.dataset.scene] || samplePyramid)()); busy(false); }, REDUCED ? 0 : 320);
    }));
}

function fullscreen() {
  const el = host?.closest('.rounded-2xl') || host;
  if (!document.fullscreenElement) el?.requestFullscreen?.().then(onResize);
  else document.exitFullscreen?.();
}

function exportImage() {
  if (!renderer) return;
  renderer.render(scene, camera);
  const a = document.createElement('a');
  a.href = renderer.domElement.toDataURL('image/png');
  a.download = ((currentSpec && currentSpec.title) || 'mathvision-3d').replace(/\s+/g, '_') + '.png';
  a.click();
  setStatus('✓ Đã xuất ảnh PNG.', 'ok');
}
function exportTikz() {
  if (!currentSpec) return;
  const P = currentSpec.points || {};
  let s = '% MathVision — TikZ (cần \\usepackage{tikz-3dplot})\n\\begin{tikzpicture}[scale=1]\n';
  Object.entries(P).forEach(([n, v]) => { s += `  \\coordinate (${n}) at (${(+v[0]).toFixed(2)},${(+v[1]).toFixed(2)},${(+v[2]).toFixed(2)});\n`; });
  (currentSpec.solidEdges || []).forEach(([a, b]) => (s += `  \\draw (${a})--(${b});\n`));
  (currentSpec.dashedEdges || []).forEach(([a, b]) => (s += `  \\draw[dashed] (${a})--(${b});\n`));
  Object.keys(P).forEach((n) => (s += `  \\fill (${n}) circle (1.3pt) node[above right] {$${n}$};\n`));
  s += '\\end{tikzpicture}\n';
  if (navigator.clipboard) navigator.clipboard.writeText(s).then(
    () => setStatus('✓ Đã copy mã TikZ vào clipboard.', 'ok'),
    () => setStatus('Không copy được — mở Console xem mã.', 'warn'));
  else setStatus('Trình duyệt không hỗ trợ clipboard.', 'warn');
}

/* ---------- boot ---------- */
window.MathVision3D = { buildFromSpec, build: (n) => buildFromSpec((SAMPLES[n] || samplePyramid)()), setStep, play, setView, reset: () => setView('Chuẩn'), fullscreen };

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { init(); wire(); });
else { init(); wire(); }
