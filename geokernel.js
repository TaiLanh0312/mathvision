/* ============================================================
   MathVision PRO — geokernel.js
   Bộ công cụ vector/template cũ, giữ lại để tham khảo và cho các scene đã biết.
   Smart 3D hiện không gọi solveProblem làm luồng chính: mọi đề được gửi tới AI;
   scene và lời giải đi qua các bước kiểm tra ở backend trước khi hiển thị.

   export solveProblem(text) -> { ok, kind, spec, reason }
   ============================================================ */

/* ---------- vector helpers (math space: z = chiều cao) ---------- */
const sub = (u, v) => [u[0]-v[0], u[1]-v[1], u[2]-v[2]];
const add = (u, v) => [u[0]+v[0], u[1]+v[1], u[2]+v[2]];
const scale = (u, k) => [u[0]*k, u[1]*k, u[2]*k];
const dot = (u, v) => u[0]*v[0]+u[1]*v[1]+u[2]*v[2];
const cross = (u, v) => [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
const len = (u) => Math.sqrt(dot(u, u));
const normalize = (u) => { const l = len(u) || 1; return scale(u, 1/l); };
const mid = (u, v) => scale(add(u, v), 0.5);
const addS = (p, d, t) => [p[0]+d[0]*t, p[1]+d[1]*t, p[2]+d[2]*t];
const r4 = (p) => p.map((c) => Math.round(c * 1e4) / 1e4);
const EPS = 1e-6;

const A_UNIT = 2.4; // đơn vị dựng hình cho "cạnh a"

/* ---------- parse một biểu thức độ dài theo bội của a ---------- */
function lengthToNum(expr, a = A_UNIT) {
  if (!expr) return a;
  let s = String(expr).trim().replace(/\s+/g, '').replace(/·|\*/g, '');
  // căn: √k hoặc sqrt(k)
  let sq = 1;
  const m = s.match(/(?:√|sqrt)\(?(\d+)\)?/i);
  if (m) { sq = Math.sqrt(parseInt(m[1], 10)); s = s.replace(m[0], ''); }
  // phân số /d
  let div = 1;
  const dm = s.match(/\/(\d+(?:\.\d+)?)/);
  if (dm) { div = parseFloat(dm[1]); s = s.replace(dm[0], ''); }
  const hasA = /a/i.test(s);
  s = s.replace(/a/ig, '');
  let coef = s === '' ? 1 : parseFloat(s);
  if (isNaN(coef)) coef = 1;
  // Symbolic lengths are normalized by a; literal numeric lengths stay literal.
  const base = hasA ? a : 1;
  return coef * base * sq / div;
}

/* ============================================================
   TEMPLATE BUILDERS — trả về khối cơ sở (points, edges, faces)
   ============================================================ */
function squarePyramid(a, hExpr) {
  // Đáy vuông ABCD, SA ⊥ đáy, S trên A.
  const h = hExpr ? lengthToNum(hExpr, a) : a * Math.SQRT2;
  const P = { A:[0,0,0], B:[a,0,0], C:[a,a,0], D:[0,a,0], S:[0,0,h] };
  return {
    kind: 'square-pyramid', points: P, apex: 'S', footOfApex: 'A',
    base: ['A','B','C','D'], baseCenter: mid(P.A, P.C),
    solidEdges: [['A','B'],['B','C'],['S','A'],['S','B'],['S','C']],
    dashedEdges: [['C','D'],['D','A'],['S','D']],
    faces: [['A','B','C','D'], ['S','A','B'], ['S','B','C'], ['S','C','D'], ['S','D','A']],
    labels: { A:[-0.28,-0.1,-0.28], B:[0.28,-0.1,-0.28], C:[0.28,-0.1,0.28], D:[-0.25,-0.1,0.28], S:[0,0.3,0] },
    title: 'Chóp S.ABCD', meta: 'Oxyz [A = Gốc]',
    assumptions: hExpr ? [] : ['Chưa có SA/chiều cao; hình sơ đồ dùng SA = a√2.'],
  };
}
function rectPyramid(a, b, hExpr) {
  const h = lengthToNum(hExpr, a);
  const P = { A:[0,0,0], B:[a,0,0], C:[a,b,0], D:[0,b,0], S:[0,0,h] };
  return {
    kind: 'rect-pyramid', points: P, apex: 'S', footOfApex: 'A',
    base: ['A','B','C','D'], baseCenter: mid(P.A, P.C),
    solidEdges: [['A','B'],['B','C'],['S','A'],['S','B'],['S','C']],
    dashedEdges: [['C','D'],['D','A'],['S','D']],
    faces: [['A','B','C','D'], ['S','A','B'], ['S','B','C'], ['S','C','D'], ['S','D','A']],
    labels: { A:[-0.28,-0.1,-0.28], B:[0.28,-0.1,-0.28], C:[0.28,-0.1,0.28], D:[-0.25,-0.1,0.28], S:[0,0.3,0] },
    title: 'Chóp S.ABCD', meta: 'Oxyz [A = Gốc]',
  };
}
function regTriPyramid(a, lateralExpr) {
  // Chóp tam giác đều: đáy ABC đều, S trên tâm O.
  const r = a / Math.sqrt(3);
  const ang = (k) => Math.PI/2 + k*2*Math.PI/3;
  const A = [r*Math.cos(ang(0)), r*Math.sin(ang(0)), 0];
  const B = [r*Math.cos(ang(1)), r*Math.sin(ang(1)), 0];
  const C = [r*Math.cos(ang(2)), r*Math.sin(ang(2)), 0];
  const l = lateralExpr ? lengthToNum(lateralExpr, a) : a * 1.4;
  const h = Math.sqrt(Math.max(l*l - r*r, 0.25*a*a));
  const O = [0,0,0], S = [0,0,h];
  const P = { A, B, C, S, O };
  return {
    kind: 'reg-tri-pyramid', points: P, apex: 'S', footOfApex: 'O',
    base: ['A','B','C'], baseCenter: O,
    solidEdges: [['A','B'],['B','C'],['S','A'],['S','B'],['S','C']],
    dashedEdges: [['C','A']],
    faces: [['A','B','C'], ['S','A','B'], ['S','B','C'], ['S','C','A']],
    labels: { A:[-0.3,-0.1,-0.1], B:[0.3,-0.1,-0.1], C:[0,-0.1,0.38], S:[0,0.32,0] },
    title: 'Chóp đều S.ABC', meta: 'Oxyz [O = tâm đáy]',
    assumptions: lateralExpr ? [] : ['Chưa có cạnh bên; hình sơ đồ dùng cạnh bên = 1.4a.'],
  };
}
function tetrahedron(a) {
  // Tứ diện đều ABCD: đáy ABC đều, D trên tâm O, mọi cạnh = a.
  const r = a / Math.sqrt(3);
  const ang = (k) => Math.PI / 2 + k * 2 * Math.PI / 3;
  const baseK = (k) => [r * Math.cos(ang(k)), r * Math.sin(ang(k)), 0];
  const A = baseK(0), B = baseK(1), C = baseK(2);
  const h = a * Math.sqrt(2 / 3);
  const D = [0, 0, h], O = [0, 0, 0];
  return {
    kind: 'tetrahedron', points: { A, B, C, D, O }, apex: 'D', footOfApex: 'O',
    base: ['A', 'B', 'C'],
    solidEdges: [['A', 'B'], ['B', 'C'], ['D', 'A'], ['D', 'B'], ['D', 'C']],
    dashedEdges: [['C', 'A']],
    faces: [['A', 'B', 'C'], ['D','A','B'], ['D','B','C'], ['D','C','A']],
    labels: { A: [0.05, 0.3, -0.05], B: [-0.32, -0.14, 0], C: [0.32, -0.14, 0], D: [0, 0.32, 0.05] },
    title: 'Tứ diện đều ABCD', meta: 'Oxyz [O = tâm đáy]',
  };
}
/* chân đường vuông góc hạ từ điểm P xuống ĐƯỜNG THẲNG qua A,B (3D) */
function footPointLine(P, A, B) {
  const d = sub(B, A);
  const dd = dot(d, d) || 1;
  const t = dot(sub(P, A), d) / dd;
  return addS(A, d, t);
}

/* Chóp S.ABC, SA⊥đáy, đáy TAM GIÁC VUÔNG bất kỳ (A,B,C cho sẵn toạ độ). */
function saPerpTriFrom(A, B, C, saExpr, a, title, rightAt) {
  const S = [A[0], A[1], lengthToNum(saExpr, a)];
  return {
    kind: 'sa-perp-pyramid', points: { A, B, C, S }, apex: 'S', footOfApex: 'A', base: ['A', 'B', 'C'],
    solidEdges: [['A', 'B'], ['B', 'C'], ['S', 'A'], ['S', 'B'], ['S', 'C']],
    dashedEdges: [['C', 'A']],
    faces: [['A', 'B', 'C']],
    labels: { A: [-0.3, 0.05, -0.05], B: [0.3, 0.05, -0.05], C: [0.15, -0.3, 0.05], S: [-0.1, 0.3, 0] },
    title, meta: 'Oxyz [A = Gốc]',
    rightAngleAt: rightAt && { at: rightAt, from: ({ A: 'B', B: 'A', C: 'A' })[rightAt], to: ({ A: 'C', B: 'C', C: 'B' })[rightAt] },
  };
}
function saPerpTriPyramid(a, saExpr, legLen, baseKind) {
  // Chóp S.ABC, SA ⊥ đáy. baseKind: 'right-iso-B' (vuông cân tại B) | 'right-B'.
  const L = legLen || 2 * a;
  const A = [0,0,0], B = [L,0,0], C = [L, L, 0];     // vuông tại B, BA⊥BC, AB=BC=L
  const SA = lengthToNum(saExpr, a);
  const S = [0,0,SA];
  return {
    kind: 'sa-perp-pyramid', points: { A, B, C, S }, apex: 'S', footOfApex: 'A',
    base: ['A','B','C'],
    solidEdges: [['A','B'],['B','C'],['S','A'],['S','B'],['S','C']],
    dashedEdges: [['C','A']],
    faces: [['A','B','C'], ['S','A','B'], ['S','B','C'], ['S','C','A']],
    labels: { A:[-0.32,-0.1,-0.05], B:[0.3,-0.12,-0.05], C:[0.3,-0.1,0.32], S:[0,0.32,0] },
    title: 'Chóp S.ABC (SA⊥đáy)', meta: 'Oxyz [A = Gốc]',
    assumptions: [
      ...(!saExpr ? ['Chưa có SA; hình sơ đồ dùng SA = a.'] : []),
      ...(!legLen ? ['Chưa có cạnh đáy; hình sơ đồ dùng AB = BC = 2a.'] : []),
    ],
    rightAngleAt: { at: 'B', from: 'A', to: 'C' }, // đáy vuông tại B
  };
}
function triPrism(a, hExpr) {
  const h = hExpr ? lengthToNum(hExpr, a) : a * 1.3;
  const r = a / Math.sqrt(3);
  const ang = (k) => Math.PI/2 + k*2*Math.PI/3;
  const t = (k, z) => [r*Math.cos(ang(k)), r*Math.sin(ang(k)), z];
  const P = { A:t(0,0), B:t(1,0), C:t(2,0), "A'":t(0,h), "B'":t(1,h), "C'":t(2,h) };
  return {
    kind: 'tri-prism', points: P, base: ['A','B','C'], top: ["A'","B'","C'"],
    solidEdges: [['A','B'],['B','C'],["A'","B'"],["B'","C'"],["C'","A'"],['A',"A'"],['B',"B'"]],
    dashedEdges: [['C','A'],['C',"C'"]],
    faces: [['A','B','C'], ["A'","B'","C'"], ['A','B',"B'","A'"], ['B','C',"C'","B'"], ['C','A',"A'","C'"]],
    labels: { A:[-0.3,-0.1,0], B:[0.3,-0.1,0], C:[0,-0.1,0.35], "A'":[-0.3,0.2,0], "B'":[0.3,0.2,0], "C'":[0,0.2,0.35] },
    title: 'Lăng trụ ABC.A′B′C′', meta: 'Oxyz',
    assumptions: hExpr ? [] : ['Chưa có chiều cao lăng trụ; hình sơ đồ dùng h = 1.3a.'],
  };
}
function obliquePrismCircum(a, aaExpr) {
  // Lăng trụ XIÊN: đáy ABC đều tâm O (= trọng tâm = tâm ngoại tiếp),
  // A' chiếu vuông góc xuống O ⇒ A' nằm trên O. Cạnh bên AA' cho trước.
  const r = a / Math.sqrt(3);
  const ang = (k) => Math.PI/2 + k*2*Math.PI/3;
  const baseK = (k) => [r*Math.cos(ang(k)), r*Math.sin(ang(k)), 0];
  const A = baseK(0), B = baseK(1), C = baseK(2), O = [0,0,0];
  const AA = lengthToNum(aaExpr, a);                 // |AA'|
  const h = Math.sqrt(Math.max(AA*AA - r*r, 0.04*a*a)); // AA'² = AO² + h²
  const Ap = [0,0,h];                                 // A' trên O
  const v = sub(Ap, A);                               // vector tịnh tiến cạnh bên
  const Bp = add(B, v), Cp = add(C, v);
  const P = { A, B, C, "A'":Ap, "B'":Bp, "C'":Cp, O };
  return {
    kind: 'oblique-prism', points: P, base: ['A','B','C'], top: ["A'","B'","C'"],
    apex: "A'", footOfApex: 'O',
    solidEdges: [['A','B'],['B','C'],['A',"A'"],['B',"B'"],['C',"C'"],["A'","B'"],["B'","C'"]],
    dashedEdges: [['C','A'],["C'","A'"]],
    faces: [['A','B','C'], ["A'","B'","C'"], ['A','B',"B'","A'"], ['B','C',"C'","B'"], ['C','A',"A'","C'"]],
    labels: { A:[-0.05,0.3,0], B:[-0.32,-0.14,0], C:[0.32,-0.14,0],
              "A'":[-0.05,0.32,0.08], "B'":[-0.34,0.14,0.08], "C'":[0.34,0.14,0.08], O:[0.14,-0.14,0] },
    title: 'Lăng trụ xiên ABC.A′B′C′', meta: 'Oxyz [O = tâm đáy]',
  };
}
function cube(a) {
  const P = {
    A:[0,0,0], B:[a,0,0], C:[a,a,0], D:[0,a,0],
    "A'":[0,0,a], "B'":[a,0,a], "C'":[a,a,a], "D'":[0,a,a],
  };
  return {
    kind: 'cube', points: P, base: ['A','B','C','D'], top: ["A'","B'","C'","D'"],
    solidEdges: [['A','B'],['B','C'],['A',"A'"],['B',"B'"],['C',"C'"],
                 ["A'","B'"],["B'","C'"],["C'","D'"],["D'","A'"]],
    dashedEdges: [['C','D'],['D','A'],['D',"D'"]],
    faces: [['A','B','C','D'], ["A'","B'","C'","D'"], ['A','B',"B'","A'"], ['B','C',"C'","B'"], ['C','D',"D'","C'"], ['D','A',"A'","D'"]],
    labels: { A:[-0.25,-0.1,-0.25], B:[0.28,-0.1,-0.2], C:[0.28,-0.1,0.28], D:[-0.25,-0.1,0.28],
              "A'":[-0.25,0.25,-0.2], "B'":[0.28,0.25,-0.2], "C'":[0.28,0.25,0.25], "D'":[-0.25,0.25,0.25] },
    title: 'Lập phương ABCD.A′B′C′D′', meta: 'Oxyz [A = Gốc]',
  };
}
function box(a, b, c) {
  const P = {
    A:[0,0,0], B:[a,0,0], C:[a,b,0], D:[0,b,0],
    "A'":[0,0,c], "B'":[a,0,c], "C'":[a,b,c], "D'":[0,b,c],
  };
  const t = cube(a); t.points = P; t.kind = 'box'; t.title = 'Hộp chữ nhật ABCD.A′B′C′D′';
  t.assumptions = ['Chưa trích đủ ba kích thước hộp; tỉ lệ hình sơ đồ được ước lượng.'];
  return t;
}

/* ============================================================
   SOLVERS cho câu hỏi — thêm "layers" vào spec
   ============================================================ */
// Góc giữa đường thẳng XY và mặt đáy.
function solveAngleLineBase(F, line) {
  const P = F.points;
  const [x, y] = splitName(line);
  if (!P[x] || !P[y]) return null;
  // điểm nằm trên đáy là chân, điểm còn lại là đỉnh của tia
  const onBase = (n) => F.base.includes(n) || Math.abs(P[n][2]) < EPS;
  if (onBase(x) === onBase(y)) return null;
  let apex = x, baseP = y;
  if (onBase(x) && !onBase(y)) { apex = y; baseP = x; }
  if (F.apex && apex !== F.apex) return null;
  const foot = F.footOfApex ? P[F.footOfApex] : [P[apex][0], P[apex][1], 0];
  // góc tại baseP giữa tia tới apex và tia tới foot (hình chiếu)
  const u = normalize(sub(P[apex], P[baseP]));
  const w = normalize(sub(foot, P[baseP]));
  const deg = Math.acos(Math.max(-1, Math.min(1, dot(u, w)))) * 180 / Math.PI;
  const label = formatDeg(deg);
  // tên điểm chân chiếu (nếu chưa có trong points, thêm)
  const footName = F.footOfApex || null;
  const dashed = footName && footName !== baseP ? [[footName, baseP]] : [];
  return {
    key: 'angle', name: `Góc (${line}, đáy) = ${label}`, color: 'cyan',
    faces: [[apex, baseP, footName].filter(Boolean)],
    dashedEdges: dashed,
    angles: [{ at: baseP, from: apex, to: footName || baseP, label }],
    rightAngles: footName && footName !== baseP ? [{ at: footName, from: baseP, to: apex }] : [],
    _deg: deg,
  };
}

// Tách tên các đỉnh trong một chuỗi, hỗ trợ dấu phẩy phẩy: "A'B" -> ["A'","B"].
function splitName(s) { return (String(s).match(/[A-Z]['′’]?/g) || []).map((x) => x.replace(/[′’]/g, "'")); }

// Khoảng cách từ điểm tới mặt phẳng (base, normal).
function distPointToPlane(Pt, base, normal) {
  return Math.abs(dot(normal, sub(Pt, base))) / (len(normal) || 1);
}

// LÕI: cắt khối bởi mặt phẳng (base, normal) -> đa giác thiết diện.
function sectionByPlane(F, pts, base, normal, { name, color = 'magenta', key = 'section' }) {
  const edges = [...F.solidEdges, ...F.dashedEdges];
  const used = new Set(Object.keys(pts));
  const pool = ['I','J','K','L','H','G','T','U','V','W','X','Y'].filter((n) => !used.has(n));
  let pi = 0;
  const newPts = {};
  const verts = [];                    // {name, pos}
  for (const [p, q] of edges) {
    const A0 = pts[p], B0 = pts[q]; if (!A0 || !B0) continue;
    const d = sub(B0, A0);
    const denom = dot(normal, d);
    if (Math.abs(denom) < EPS) continue;                 // cạnh // mặt
    const t = dot(sub(base, A0), normal) / denom;
    if (t < -EPS || t > 1 + EPS) continue;               // giao ngoài đoạn
    const X = addS(A0, d, t);
    if (verts.some((v) => len(sub(v.pos, X)) < 1e-3)) continue;
    let nm = null;
    for (const [k, pos] of Object.entries(pts)) if (len(sub(pos, X)) < 1e-3) { nm = k; break; }
    if (!nm) { nm = pool[pi++] || `X${pi}`; newPts[nm] = r4(X); }
    verts.push({ name: nm, pos: X });
  }
  if (verts.length < 3) return null;
  const c = scale(verts.reduce((s, v) => add(s, v.pos), [0,0,0]), 1/verts.length);
  const u = normalize(sub(verts[0].pos, c));
  const n = normalize(normal);
  const w = cross(n, u);
  verts.sort((p1, p2) => Math.atan2(dot(sub(p1.pos, c), w), dot(sub(p1.pos, c), u))
                       - Math.atan2(dot(sub(p2.pos, c), w), dot(sub(p2.pos, c), u)));
  const order = verts.map((v) => v.name);
  const poly = order.map((nm, i) => [nm, order[(i+1) % order.length]]);
  return { newPoints: newPts, order,
    layer: { key, name, color, points: Object.keys(newPts), faces: [order], solidEdges: poly } };
}

// Thiết diện qua điểm, VUÔNG GÓC đường thẳng L.
function solveSection(F, pts, pointName, lineName) {
  const [lx, ly] = splitName(lineName);
  if (!pts[pointName] || !pts[lx] || !pts[ly]) return null;
  const normal = sub(pts[ly], pts[lx]);
  return sectionByPlane(F, pts, pts[pointName], normal,
    { name: `Thiết diện ⊥ ${lineName} qua ${pointName}`, color: 'magenta' });
}

// Thiết diện của mp CHỨA đường thẳng line1 và SONG SONG đường thẳng line2.
function solveContainingSection(F, pts, line1, line2) {
  const [a1, b1] = splitName(line1), [a2, b2] = splitName(line2);
  if (![a1, b1, a2, b2].every((n) => pts[n])) return null;
  const normal = cross(sub(pts[b1], pts[a1]), sub(pts[b2], pts[a2]));
  if (len(normal) < EPS) return null;
  const sec = sectionByPlane(F, pts, pts[a1], normal,     // mặt phẳng đi qua điểm trên line1
    { name: `Thiết diện (P) chứa ${line1} // ${line2}`, color: 'magenta' });
  if (sec) { sec.normal = normal; sec.base = pts[a1]; }
  return sec;
}

// Thiết diện qua điểm, SONG SONG hai đường thẳng -> pháp tuyến = tích có hướng.
function solveParallelSection(F, pts, pointName, line1, line2) {
  const [a1, b1] = splitName(line1), [a2, b2] = splitName(line2);
  if (![pointName, a1, b1, a2, b2].every((n) => pts[n])) return null;
  const normal = cross(sub(pts[b1], pts[a1]), sub(pts[b2], pts[a2]));
  if (len(normal) < EPS) return null;                     // hai đường song song nhau
  const sec = sectionByPlane(F, pts, pts[pointName], normal,
    { name: `Thiết diện (Q) // ${line1}, ${line2}`, color: 'magenta' });
  if (sec) { sec.normal = normal; sec.base = pts[pointName]; }
  return sec;
}

// Mặt phẳng chéo đi qua 3 điểm (vd SBD).
function solveDiagonalPlane(F, names) {
  const P = F.points;
  const ns = names.split('');
  if (!ns.every((n) => P[n])) return null;
  const extra = {};
  // tâm đáy nếu là chóp/hộp
  const layer = { key: 'diag', name: `Mặt chéo (${names})`, color: 'amber',
                  faces: [ns], dashedEdges: [], points: [] };
  if (ns.length >= 3) {
    // nối chéo đáy nếu có (vd BD)
    const baseDiag = ns.filter((n) => F.base && F.base.includes(n));
    if (baseDiag.length === 2) layer.dashedEdges.push(baseDiag);
  }
  return { _newPoints: extra, layer };
}

function formatDeg(d) {
  const common = [30, 45, 60, 90];
  for (const c of common) if (Math.abs(d - c) < 0.5) return `${c}°`;
  return `≈${Math.round(d)}°`;
}

/* ============================================================
   PARSER đề bài
   ============================================================ */
/* đường tròn (polyline) trong mặt phẳng span bởi u,v quanh tâm c, bán kính R */
function circle(c, R, u, v, n = 48) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n * 2 * Math.PI, co = Math.cos(t), si = Math.sin(t);
    pts.push([c[0] + R*(u[0]*co + v[0]*si), c[1] + R*(u[1]*co + v[1]*si), c[2] + R*(u[2]*co + v[2]*si)]);
  }
  return pts;
}
const EX = [1,0,0], EY = [0,1,0], EZ = [0,0,1];

function regQuadPyramid(a, hExpr, lateralExpr) {
  // Chóp tứ giác đều S.ABCD: đáy vuông tâm O, S trên O.
  const s = a / 2;
  const lateral = lateralExpr ? lengthToNum(lateralExpr, a) : null;
  const h = hExpr ? lengthToNum(hExpr, a)
    : lateral ? Math.sqrt(Math.max(lateral*lateral - a*a/2, 0)) : a * 1.2;
  const P = { A:[-s,-s,0], B:[s,-s,0], C:[s,s,0], D:[-s,s,0], S:[0,0,h], O:[0,0,0] };
  return {
    kind: 'reg-quad-pyramid', points: P, apex: 'S', footOfApex: 'O', base: ['A','B','C','D'],
    solidEdges: [['A','B'],['B','C'],['S','A'],['S','B'],['S','C']],
    dashedEdges: [['C','D'],['D','A'],['S','D']],
    faces: [['A','B','C','D'], ['S','A','B'], ['S','B','C'], ['S','C','D'], ['S','D','A']],
    labels: { A:[-0.28,-0.1,-0.28], B:[0.28,-0.1,-0.28], C:[0.28,-0.1,0.28], D:[-0.25,-0.1,0.28], S:[0,0.3,0], O:[0.14,-0.12,0.1] },
    title: 'Chóp tứ giác đều S.ABCD', meta: 'Oxyz [O = tâm đáy]',
    assumptions: hExpr || lateralExpr ? [] : ['Chưa có SO/cạnh bên; hình sơ đồ dùng SO = 1.2a.'],
  };
}
function rhombusPyramid(a, hExpr, saPerp) {
  // Chóp đáy hình thoi ABCD (chéo AC, BD), S trên O hoặc SA⊥ đáy.
  const p = a * 0.82, q = a * 0.57, h = lengthToNum(hExpr, a) || a * 1.2;
  const P = { A:[-p,0,0], B:[0,-q,0], C:[p,0,0], D:[0,q,0], O:[0,0,0] };
  P.S = saPerp ? [P.A[0], P.A[1], h] : [0,0,h];
  return {
    kind: 'rhombus-pyramid', points: P, apex: 'S', footOfApex: saPerp ? 'A' : 'O', base: ['A','B','C','D'],
    solidEdges: [['A','B'],['B','C'],['S','A'],['S','B'],['S','C']],
    dashedEdges: [['C','D'],['D','A'],['S','D']],
    faces: [['A','B','C','D'], ['S','A','B'], ['S','B','C'], ['S','C','D'], ['S','D','A']],
    labels: { A:[-0.3,-0.05,0], B:[0,-0.32,0], C:[0.3,-0.05,0], D:[0,0.3,0], S:[0,0.3,0.05], O:[0.14,0.12,0.1] },
    title: 'Chóp đáy hình thoi S.ABCD', meta: 'Oxyz [O = tâm đáy]',
  };
}
function hexPrism(a, hExpr) {
  // Lăng trụ lục giác đều ABCDEF.A'...F'
  const h = lengthToNum(hExpr, a) || a * 1.6;
  const nm = ['A','B','C','D','E','F'];
  const P = {};
  nm.forEach((n, k) => { const t = k * Math.PI / 3; P[n] = [a*Math.cos(t), a*Math.sin(t), 0]; P[n + "'"] = [a*Math.cos(t), a*Math.sin(t), h]; });
  const solid = [], dashed = [], labels = {};
  const faces = [nm.slice(), nm.map((n) => n + "'")];
  nm.forEach((n, k) => {
    const nx = nm[(k+1)%6];
    faces.push([n, nx, nx + "'", n + "'"]);
    const backSet = ['C','D','E'];
    (backSet.includes(n) && backSet.includes(nx) ? dashed : solid).push([n, nx]);
    (backSet.includes(n) && backSet.includes(nx) ? dashed : solid).push([n+"'", nx+"'"]);
    (backSet.includes(n) ? dashed : solid).push([n, n+"'"]);
    labels[n] = [0.1*Math.cos(k*Math.PI/3), -0.1, 0.1*Math.sin(k*Math.PI/3)];
    labels[n+"'"] = [0.1*Math.cos(k*Math.PI/3), 0.2, 0.1*Math.sin(k*Math.PI/3)];
  });
  return {
    kind: 'hex-prism', points: P, base: nm.slice(), top: nm.map((n)=>n+"'"),
    solidEdges: solid, dashedEdges: dashed,
    faces, labels,
    title: 'Lăng trụ lục giác đều', meta: 'Oxyz',
    assumptions: hExpr ? [] : ['Chưa có chiều cao lăng trụ; mặt trên đặt ở cao độ a.'],
  };
}
function cone(a, hExpr) {
  const R = a, h = lengthToNum(hExpr, a) || a * 1.7;
  const P = { O:[0,0,0], S:[0,0,h], A:[R,0,0], B:[-R,0,0] };
  return {
    kind: 'cone', points: P, apex: 'S', footOfApex: 'O', base: [],
    solidEdges: [['S','A'],['S','B']], dashedEdges: [['S','O'],['O','A']],
    faces: [],
    curves: [circle([0,0,0], R, EX, EY)],
    labels: { O:[0.1,-0.12,0.1], S:[0,0.3,0], A:[0.2,-0.1,0], B:[-0.2,-0.1,0] },
    title: 'Hình nón', meta: 'Oxyz [O = tâm đáy]',
    assumptions: hExpr ? [] : ['Chưa có chiều cao; hình sơ đồ dùng h = a.'],
  };
}
function cylinder(a, hExpr) {
  const R = a, h = lengthToNum(hExpr, a) || a * 1.8;
  const P = { O:[0,0,0], "O'":[0,0,h], A:[R,0,0], "A'":[R,0,h], B:[-R,0,0], "B'":[-R,0,h] };
  return {
    kind: 'cylinder', points: P, base: [], top: [],
    solidEdges: [['A',"A'"],['B',"B'"]], dashedEdges: [['O',"O'"]],
    faces: [],
    curves: [circle([0,0,h], R, EX, EY)], curvesDashed: [circle([0,0,0], R, EX, EY)],
    labels: { O:[0.12,-0.12,0], "O'":[0.12,0.2,0], A:[0.18,-0.1,0], "A'":[0.18,0.15,0] },
    title: 'Hình trụ', meta: 'Oxyz',
    assumptions: hExpr ? [] : ['Chưa có chiều cao; hình sơ đồ dùng h = a.'],
  };
}
function sphere(a) {
  const R = a;
  const P = { O:[0,0,0], A:[R,0,0] };
  return {
    kind: 'sphere', points: P, base: [],
    solidEdges: [], dashedEdges: [['O','A']], faces: [],
    curves: [circle([0,0,0], R, EX, EZ)],           // đường viền (đứng)
    curvesDashed: [circle([0,0,0], R, EX, EY)],       // xích đạo (ngang)
    labels: { O:[0.12,0.14,0.1], A:[0.18,-0.1,0] },
    title: 'Mặt cầu', meta: 'Oxyz [O = tâm, R = bán kính]',
  };
}

/* ===== HÌNH PHẲNG 2D (cấp 2) — dựng ở mặt z=0, nhìn từ trên ===== */
function tri2d(a, kind) {
  let A, B, C, title = 'Tam giác ABC';
  if (kind === 'deu') { A = [0, a*0.866, 0]; B = [-a/2, -a*0.289, 0]; C = [a/2, -a*0.289, 0]; title += ' đều'; }
  else if (kind === 'vuong') { A = [0, 0, 0]; B = [a*1.3, 0, 0]; C = [0, a, 0]; title += ' vuông tại A'; }
  else if (kind === 'can') { A = [0, a, 0]; B = [-a*0.7, 0, 0]; C = [a*0.7, 0, 0]; title += ' cân tại A'; }
  else { A = [-a*0.2, a, 0]; B = [-a*0.8, 0, 0]; C = [a*1.1, 0, 0]; }
  return {
    kind: 'tri2d', dim2d: true, points: { A, B, C }, base: ['A','B','C'],
    solidEdges: [['A','B'],['B','C'],['C','A']], dashedEdges: [], faces: [['A','B','C']],
    labels: { A: [0, 0.32, 0], B: [-0.3, -0.26, 0], C: [0.3, -0.26, 0] },
    title, meta: 'Mặt phẳng Oxy',
    rightAngleAt: kind === 'vuong' ? { at: 'A', from: 'B', to: 'C' } : null,
  };
}
function circle2d(a) {
  return {
    kind: 'circle2d', dim2d: true, points: { O: [0,0,0], A: [a,0,0] }, base: [],
    solidEdges: [], dashedEdges: [['O','A']], faces: [],
    curves: [circle([0,0,0], a, EX, EY)],
    labels: { O: [-0.22,-0.14,0], A: [0.2,-0.1,0] },
    title: 'Đường tròn (O; R)', meta: 'Mặt phẳng Oxy',
  };
}
function quad2d(a, type) {
  let P, title = 'Tứ giác ABCD';
  if (type === 'square') { P = { A:[0,0,0], B:[a,0,0], C:[a,a,0], D:[0,a,0] }; title = 'Hình vuông ABCD'; }
  else if (type === 'rect') { P = { A:[0,0,0], B:[a*1.5,0,0], C:[a*1.5,a,0], D:[0,a,0] }; title = 'Hình chữ nhật ABCD'; }
  else if (type === 'para') { P = { A:[0,0,0], B:[a*1.3,0,0], C:[a*1.3+a*0.45,a*0.85,0], D:[a*0.45,a*0.85,0] }; title = 'Hình bình hành ABCD'; }
  else if (type === 'trap') { P = { A:[0,0,0], B:[a*1.7,0,0], C:[a*1.25,a*0.9,0], D:[a*0.4,a*0.9,0] }; title = 'Hình thang ABCD'; }
  else { P = { A:[-a*0.85,0,0], B:[0,-a*0.6,0], C:[a*0.85,0,0], D:[0,a*0.6,0] }; title = 'Hình thoi ABCD'; }
  return {
    kind: 'quad2d', dim2d: true, points: P, base: ['A','B','C','D'],
    solidEdges: [['A','B'],['B','C'],['C','D'],['D','A']], dashedEdges: [], faces: [['A','B','C','D']],
    labels: { A:[-0.26,-0.22,0], B:[0.26,-0.22,0], C:[0.26,0.26,0], D:[-0.26,0.26,0] },
    title, meta: 'Mặt phẳng Oxy',
  };
}

/* Chuẩn hoá chuỗi dán vào: LaTeX -> text thuần để parser đọc được. */
function normalizeText(src) {
  let t = String(src);
  t = t.replace(/\\[()[\]]/g, ' ');       // bỏ delimiter toán \( \) \[ \]  (giữ (ABC) bên trong)
  t = t.replace(/\\left|\\right|\\,|\\;|\\!|\\quad|\\qquad/g, ' ');
  t = t.replace(/\^\s*\{?\s*\\prime\s*\}?/g, "'").replace(/\\prime/g, "'"); // A^{\prime} -> A'
  t = t.replace(/\^\s*\{?\s*'\s*\}?/g, "'");                                 // A^{'} / A^' -> A'
  t = t.replace(/\\d?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2');          // \frac{1}{3} -> 1/3
  t = t.replace(/\\sqrt\s*\{([^{}]*)\}/g, '√$1').replace(/\\sqrt\s*(\w+)/g, '√$1'); // \sqrt{2} -> √2
  t = t.replace(/\\cdot|\\times/g, '·');
  t = t.replace(/\\perp/g, '⊥').replace(/\\parallel/g, '//');
  t = t.replace(/\\[a-zA-Z]+/g, ' ');     // các lệnh latex còn lại
  t = t.replace(/[\\${}]/g, ' ');          // ký hiệu latex còn sót
  t = t.replace(/\(\s*([A-Z])\s*\)/g, '($1)'); // (ABC) giữ nguyên nhưng gọn
  t = t.replace(/[′’]/g, "'");
  t = t.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  return t;
}

/* Parse các điểm phái sinh: trung điểm & điểm chia đoạn theo tỉ lệ. */
const _N = "[A-Z]'?";
function parseDerivedPoints(t, F) { return derivePoints(t, F.points); }
/* Trích điểm phái sinh từ MỘT đoạn văn bản bất kỳ (vd lời giải) + tập điểm đã có. */
export function extractDerived(rawText, pointsMap) { return derivePoints(normalizeText(rawText || ''), pointsMap || {}); }
function derivePoints(t, basePoints) {
  const P = { ...basePoints };
  const added = {};
  const hints = {};
  const segments = [], dashed = [];
  // Trung điểm: "M, N, P (lần lượt) là trung điểm của các cạnh AB, BC, CC'"
  const SEP = '\\s*(?:,|v[aà])\\s*';
  const namesM = t.match(new RegExp(`(${_N}(?:${SEP}${_N})*)\\s+l[aầ]n\\s*l[uượ]+t`, 'i'))
              || t.match(new RegExp(`G[oọ]i\\s+(${_N}(?:${SEP}${_N})*)\\b`, 'i'));
  const segM = t.match(new RegExp(`trung\\s*đi[eể]m[^A-Za-z]*(?:c[uủ]a\\s+)?(?:c[aá]c\\s+)?(?:c[aạ]nh\\s+)?((?:${_N}${_N})(?:${SEP}${_N}${_N})*)`, 'i'));
  if (namesM && segM) {
    const SPL = /\s*(?:,|v[aà])\s*/i;
    const names = namesM[1].split(SPL).map((s) => s.trim()).filter(Boolean);
    const segs = segM[1].split(SPL).map((s) => s.trim()).filter(Boolean);
    for (let i = 0; i < Math.min(names.length, segs.length); i++) {
      const [x, y] = splitName(segs[i]);
      if (P[x] && P[y]) { P[names[i]] = mid(P[x], P[y]); added[names[i]] = P[names[i]]; hints[names[i]] = `Trung điểm của ${segs[i]}.`; }
    }
  }
  // Điểm đối xứng: "M là điểm đối xứng của A qua B"  ->  M = 2B − A
  const reflRe = new RegExp(`(${_N})\\s+l[aà]\\s+đi[eể]m\\s+đ[oố]i\\s*x[uứ]ng\\s+c[uủ]a\\s+(${_N})\\s+qua\\s+(${_N})`, 'gi');
  let rm;
  while ((rm = reflRe.exec(t))) {
    const neu = rm[1], src = rm[2], ctr = rm[3];
    if (P[src] && P[ctr]) { P[neu] = sub(scale(P[ctr], 2), P[src]); added[neu] = P[neu]; hints[neu] = `Đối xứng của ${src} qua ${ctr}.`; }
  }

  // Điểm chia tỉ lệ dạng phân số: "A'E = 1/3 A'N", "SK = 1/3 SI"  ->  E = A' + (1/3)(N−A')
  const ratioRe = new RegExp(`(${_N})(${_N})\\s*=\\s*(\\d+)\\s*/\\s*(\\d+)\\s*(${_N})(${_N})`, 'g');
  let m;
  while ((m = ratioRe.exec(t))) {
    const from = m[1], neu = m[2], num = +m[3], den = +m[4], from2 = m[5], to = m[6];
    if (from === from2 && P[from] && P[to]) { P[neu] = addS(P[from], sub(P[to], P[from]), num / den); added[neu] = P[neu]; hints[neu] = `Trên ${from}${to}: ${from}${neu} = ${num}/${den}·${from}${to}.`; }
  }

  // Điểm chia tỉ lệ dạng bội: "SN = 3NC"  ->  (SN:NC = 3:1)  N = S + 3/4 (C−S)
  const ratio2Re = new RegExp(`(${_N})(${_N})\\s*=\\s*(\\d+)\\s*(${_N})(${_N})(?!\\s*/)`, 'g');
  let m2;
  while ((m2 = ratio2Re.exec(t))) {
    const from = m2[1], neu = m2[2], k = +m2[3], mid1 = m2[4], to = m2[5];
    if (neu === mid1 && P[from] && P[to]) {
      P[neu] = addS(P[from], sub(P[to], P[from]), k / (k + 1)); added[neu] = P[neu];
      hints[neu] = `Trên ${from}${to}: ${from}${neu} = ${k}·${neu}${to}.`;
    }
  }
  // Điểm trên đoạn (di động / tổng quát): "I là điểm (di động) trên cạnh AC" -> vị trí minh hoạ
  const onSegRe = new RegExp(`(${_N})\\s+l[aà]\\s+đi[eể]m\\s+(?:di\\s*đ[oộ]ng\\s+)?(?:n[aằ]m\\s+)?tr[eê]n\\s+(?:c[aạ]nh\\s+|đo[aạ]n\\s+(?:th[aẳ]ng\\s+)?)?(${_N})(${_N})`, 'gi');
  let om;
  while ((om = onSegRe.exec(t))) {
    const neu = om[1], x = om[2], y = om[3];
    if (!added[neu] && !basePoints[neu] && P[x] && P[y]) {
      P[neu] = addS(P[x], sub(P[y], P[x]), 0.45); added[neu] = P[neu];
      hints[neu] = `Điểm trên ${x}${y} (vị trí minh hoạ; đề cho di động).`;
    }
  }
  // Chân vuông góc hạ từ điểm xuống ĐƯỜNG: "J là hình chiếu của S trên/lên BI"
  const footRe = new RegExp(`(${_N})\\s+(?:l[aà]\\s+)?h[iì]nh\\s*chi[eế]u\\s*(?:vu[oô]ng\\s*g[oó]c\\s*)?c[uủ]a\\s+(${_N})\\s+(?:tr[eê]n|l[eê]n)\\s+(${_N})(${_N})`, 'gi');
  let fm;
  while ((fm = footRe.exec(t))) {
    const neu = fm[1], p = fm[2], x = fm[3], y = fm[4];
    if (P[p] && P[x] && P[y]) {
      P[neu] = footPointLine(P[p], P[x], P[y]); added[neu] = P[neu];
      hints[neu] = `Hình chiếu vuông góc của ${p} lên ${x}${y}.`;
      segments.push([x, y]);        // vẽ đường chứa chân vuông góc (vd BI)
      dashed.push([p, neu]);        // đoạn vuông góc (vd SJ)
    }
  }
  return { points: added, hints, segments, dashed };
}

function detectFigure(t) {
  const s = t.toLowerCase();
  const aMatch = s.match(/cạnh(?:\s*đáy)?\s*(?:bằng|là|=)?\s*([0-9]*a(?:√\d+)?|a(?:√\d+)?|\d+(?:\.\d+)?(?:√\d+)?)/);
  const aValue = s.match(/(?:^|\s)a\s*=\s*(\d+(?:\.\d+)?)(?:\s|$)/);
  const a = aValue ? Number(aValue[1]) : aMatch ? lengthToNum(aMatch[1], A_UNIT) : A_UNIT;

  // ===== 2D (cấp 2): hình phẳng, KHÔNG có ngữ cảnh không gian =====
  const is3D = /ch[oó]p|l[aă]ng\s*tr[uụ]|t[uứ]\s*di[eệ]n|h[oộ]p|l[aậ]p\s*ph[uươ]ng|h[iì]nh\s*n[oó]n|h[iì]nh\s*tr[uụ]|h[iì]nh\s*c[aầ]u|m[aặ]t\s*ph[aẳ]ng|kh[oô]ng\s*gian|đ[uư]ờng\s*cao\s*s[a-d]/.test(s);
  if (!is3D) {
    if (/tam\s*giác/.test(s)) {
      const kind = /đều/.test(s) ? 'deu' : /vu[oô]ng/.test(s) ? 'vuong' : /c[aâ]n/.test(s) ? 'can' : 'thuong';
      return tri2d(a, kind);
    }
    if (/đường\s*tr[oò]n/.test(s)) return circle2d(a);
    if (/h[iì]nh\s*vu[oô]ng/.test(s)) return quad2d(a, 'square');
    if (/(?:h[iì]nh\s*)?ch[uữ]\s*nh[aậ]t/.test(s)) return quad2d(a, 'rect');
    if (/b[iì]nh\s*h[aà]nh/.test(s)) return quad2d(a, 'para');
    if (/h[iì]nh\s*thang/.test(s)) return quad2d(a, 'trap');
    if (/h[iì]nh\s*thoi/.test(s)) return quad2d(a, 'rhombus');
  }

  const hCommon = s.match(/(?:chiều\s*cao|đường\s*cao|cao)\s*(?:bằng|là|=)?\s*([0-9]*a(?:√\d+)?|[0-9.]+)/);
  const hE = hCommon ? hCommon[1] : null;
  // mặt tròn xoay
  if (/h[iì]nh\s*n[oó]n|kh[oố]i\s*n[oó]n|n[oó]n\s*(?:tr[oò]n|c[uụ]t)?/.test(s)) return cone(a, hE);
  if (/h[iì]nh\s*tr[uụ]|kh[oố]i\s*tr[uụ]|tr[uụ]\s*tr[oò]n/.test(s)) return cylinder(a, hE);
  if (/h[iì]nh\s*c[aầ]u|kh[oố]i\s*c[aầ]u|m[aặ]t\s*c[aầ]u/.test(s)) return sphere(a);

  if (/lập\s*phương/.test(s)) return cube(a);
  if (/hộp\s*(?:chữ\s*nhật)?/.test(s)) return box(a, a*0.7, a*1.1);
  if (/lăng\s*trụ/.test(s)) {
    if (/l[uụ]c\s*giác/.test(s)) return hexPrism(a, hE);
    // Lăng trụ XIÊN: hình chiếu của A'/đỉnh trên xuống tâm/trọng tâm/tâm ngoại tiếp.
    const oblique = /h[iì]nh\s*chi[eế]u[^.]*?(t[aâ]m|tr[oọ]ng\s*t[aâ]m|ngo[aạ]i\s*ti[eế]p)/.test(s)
                 || /chi[eế]u[^.]*?\btr[uù]ng[^.]*?\bo\b/.test(s);
    if (oblique) {
      const aa = s.match(/aa'?\s*=\s*([0-9]*a(?:√\d+)?|\d+(?:\.\d+)?)/);
      if (!/tam\s*giác\s*đều/.test(s) || !aa) return null;
      return obliquePrismCircum(a, aa[1]);
    }
    if (!/lăng\s*trụ\s*đứng/.test(s) || !/tam\s*giác\s*đều/.test(s)) return null;
    const hM = s.match(/(?:chiều\s*cao|cạnh\s*bên)\s*(?:bằng|là|=)?\s*([0-9]*a(?:√\d+)?|[0-9.]+)/);
    return triPrism(a, hM ? hM[1] : null);
  }
  if (/t[uứ]\s*di[eệ]n/.test(s)) return tetrahedron(a);
  if (/s\.abc\b/.test(s) || (/tam\s*giác/.test(s) && /chóp/.test(s))) {
    const saPerp = /s\s*a\s*(?:vuông\s*góc|⊥)/.test(s) || /(?:vuông\s*góc|⊥)[^.]*\(abc\)/.test(s);
    if (saPerp && /vuông/.test(s)) {
      const saM = s.match(/sa\s*(?:=|bằng)\s*([0-9]*a(?:√\d+)?|\d+(?:\.\d+)?)/);
      const saExpr = saM ? saM[1] : '2a';
      const iso = /vuông\s*c[aâ]n/.test(s);
      const rm = s.match(/vuông\s*t[aạ]i\s*([a-c])/);
      const R = rm ? rm[1].toUpperCase() : (iso ? 'B' : 'C');
      const sideM = s.match(/\b(ab|bc|ca|ac)\s*=\s*([0-9]*a(?:√\d+)?|\d+(?:\.\d+)?)/);
      const angM = s.match(/g[oó]c\s*[a-c]{3}\s*(?:=|bằng)?\s*([0-9]+)/);
      const sideVal = sideM ? lengthToNum(sideM[2], a) : 2 * a;
      let A = [0, 0, 0], B, C;
      if (R === 'C') {                         // vuông tại C: AB là cạnh huyền, góc tại A
        const th = (angM ? +angM[1] : (iso ? 45 : 40)) * Math.PI / 180;
        C = [sideVal * Math.cos(th), 0, 0]; B = [sideVal * Math.cos(th), sideVal * Math.sin(th), 0];
      } else if (R === 'A') {                   // vuông tại A
        const th = (angM ? +angM[1] : 40) * Math.PI / 180;
        B = [sideVal, 0, 0]; C = [0, sideVal * Math.tan(th), 0];
      } else {                                  // vuông tại B (gồm vuông cân)
        const L = sideVal; B = [L, 0, 0]; C = [L, iso ? L : L * 0.7, 0];
      }
      return saPerpTriFrom(A, B, C, saExpr, a, `Chóp S.ABC (SA⊥, vuông tại ${R})`, R);
    }
    if (!/ch[oó]p\s*đều/.test(s)) return null;
    const lat = s.match(/cạnh\s*bên\s*(?:bằng|là|=)?\s*([0-9]*a(?:√\d+)?|\d+(?:\.\d+)?)/);
    return regTriPyramid(a, lat ? lat[1] : null);
  }
  if (/chóp|s\.abcd/.test(s)) {
    if (/thoi/.test(s)) return null; // builder chưa suy đường chéo từ dữ kiện đề
    const regular = /t[uứ]\s*giác\s*đều/.test(s) || /ch[oó]p\s*đều/.test(s);
    if (regular) {
      const hM = s.match(/(?:s\s*o|(?:chiều|đường)\s*cao)\s*(?:=|bằng)?\s*([0-9]*a(?:√\d+)?|\d+(?:\.\d+)?)/);
      const lM = s.match(/(?:cạnh\s*bên\s*(?:bằng|là|=)?|s\s*a\s*(?:=|bằng))\s*([0-9]*a(?:√\d+)?|\d+(?:\.\d+)?)/);
      if (lM && lengthToNum(lM[1], a) + EPS < a / Math.sqrt(2)) return null;
      if (hM && lM) {
        const h = lengthToNum(hM[1], a), side = lengthToNum(lM[1], a);
        if (Math.abs(side*side - (h*h + a*a/2)) > 1e-3 * Math.max(side*side, 1)) return null;
      }
      return regQuadPyramid(a, hM ? hM[1] : null, lM ? lM[1] : null);
    }
    if (/chữ\s*nhật/.test(s)) return null; // chưa trích đủ hai cạnh đáy
    const squareBase = /đáy[^.]*?(?:hình\s*)?vuông|hình\s*vuông\s*abcd|abcd[^.]*hình\s*vuông/.test(s);
    const saPerp = /s\s*a\s*(?:vuông\s*góc|⊥)[^.]*?(?:đáy|\(abcd\))/i.test(s);
    if (!squareBase || !saPerp) return null;
    const hM = s.match(/s\s*a\s*(?:=|bằng)\s*([0-9]*a(?:√\d+)?|\d+(?:\.\d+)?)/)
      || s.match(/(?:đường\s*cao|chiều\s*cao)\s*(?:=|bằng)?\s*([0-9]*a(?:√\d+)?|\d+(?:\.\d+)?)/);
    return squarePyramid(a, hM ? hM[1] : null);
  }
  return null;
}

function detectQuestions(t, F, pts) {
  const s = t;
  const N = _N;
  const layers = [];
  let newPoints = {};
  const defaults = [];
  let distance = null;

  // GÓC giữa đường và (đáy)
  const reAngle = new RegExp(`g[oó]c\\s+(?:gi[uữ]a|c[uủ]a)\\s+(${N}${N})\\s+(?:v[aà]|v[oớ]i)\\s+(\\([A-Za-z']+\\)|m[aặ]t\\s*(?:ph[aẳ]ng|đ[aá]y)|đ[aá]y)`, 'gi');
  let m, angleCount = 0;
  while ((m = reAngle.exec(s)) && angleCount < 2) {
    const line = m[1].toUpperCase();
    if (/đ[aá]y|abc/i.test(m[2])) {
      const L = solveAngleLineBase(F, line);
      if (L) { L.key = `angle${angleCount || ''}`; layers.push(L); defaults.push(L.key); angleCount++; }
    }
  }

  // THIẾT DIỆN: mp CHỨA một đường và // một đường khác  (vd (P) chứa MN // BK)
  const cont = s.match(new RegExp(`m[aặ]t\\s*ph[aẳ]ng\\s*\\(?\\s*[a-z]?\\s*\\)?\\s*ch[uứ]a\\s+(?:đường\\s*th[aẳ]ng\\s+)?(${N}${N})\\s+v[aà]\\s+song\\s*song[^.]*?(?:đường\\s*th[aẳ]ng\\s+)?(${N}${N})`, 'i'));
  // THIẾT DIỆN: mp qua điểm và // hai đường  (vd (Q) qua E // A'B, AC')
  const par = s.match(new RegExp(`m[aặ]t\\s*ph[aẳ]ng\\s*\\(?\\s*q?\\s*\\)?[^.]*?qua\\s+(?:đi[eể]m\\s+)?(${N})[^.]*?song\\s*song[^.]*?(${N}${N})\\s+v[aà]\\s+(${N}${N})`, 'i'));
  let secR = null;
  if (cont) secR = solveContainingSection(F, pts, cont[1].toUpperCase(), cont[2].toUpperCase());
  if (!secR && par) secR = solveParallelSection(F, pts, par[1].toUpperCase(), par[2].toUpperCase(), par[3].toUpperCase());
  if (secR) {
    Object.assign(newPoints, secR.newPoints);
    layers.push(secR.layer); defaults.push(secR.layer.key);
    if (F.apex && pts[F.apex]) {
      const d = distPointToPlane(pts[F.apex], secR.base, secR.normal);
      distance = { from: F.apex, value: d, coef: d / A_UNIT };
    }
  } else {
    // THIẾT DIỆN ⊥ đường, qua điểm
    const reSec = new RegExp(`thi[eế]t\\s*di[eệ]n[^.]*?(?:qua|ch[uứ]a)\\s+(${N})[^.]*?(?:vu[oô]ng\\s*g[oó]c|⊥)\\s+(?:(?:v[oớ]i|đ[eế]n)\\s+)?(${N}${N})`, 'i');
    const reSec2 = new RegExp(`(?:m[aặ]t\\s*ph[aẳ]ng|\\(p\\))[^.]*?(?:vu[oô]ng\\s*g[oó]c|⊥)\\s+(${N}${N})[^.]*?qua\\s+(${N})`, 'i');
    let sm = s.match(reSec), pName, lName;
    if (sm) { pName = sm[1].toUpperCase(); lName = sm[2].toUpperCase(); }
    else { const sm2 = s.match(reSec2); if (sm2) { lName = sm2[1].toUpperCase(); pName = sm2[2].toUpperCase(); } }
    if (pName && lName) {
      const r = solveSection(F, pts, pName, lName);
      if (r) { Object.assign(newPoints, r.newPoints); layers.push(r.layer); defaults.push(r.layer.key); }
    }
  }

  // MẶT CHÉO (SBD)...
  const dm = s.match(/m[aặ]t\s*(?:ph[aẳ]ng\s*)?ch[eé]o[^(]*\(([A-Z]{3})\)/i) || s.match(/\((S[BD]{2}|S[AC]{2})\)/);
  if (dm) {
    const names = (dm[1] || '').toUpperCase();
    if (names.length === 3) {
      const r = solveDiagonalPlane(F, names);
      if (r) { Object.assign(newPoints, r._newPoints || {}); layers.push(r.layer); }
    }
  }

  return { layers, newPoints, defaults, distance };
}

/* ============================================================
   build entities + steps (tóm tắt, hiển thị panel)
   ============================================================ */
function buildEntities(F, Q) {
  const ents = [];
  const baseName = F.base ? F.base.join('') : '';
  ents.push({ label: 'Khối', value: F.title.replace(/^.*?\s/, '') || F.title, detail: `${F.kind}`, tone: 'slate' });
  if (F.base) ents.push({ label: `Đáy ${baseName}`, value: F.top ? 'Lăng trụ/khối' : 'Đa giác đáy', detail: pointStr(F, F.base), tone: 'slate' });
  if (F.apex) ents.push({ label: 'Đỉnh', value: `${F.apex}`, detail: `${F.apex}${coordStr(F.points[F.apex])}`, tone: 'slate' });
  (F.assumptions || []).forEach((text) => ents.push({ label: 'Giả định sơ đồ', value: 'Chưa phải dữ kiện đề', detail: text, tone: 'amber' }));
  Q.layers.forEach((L) => {
    const tone = L.color === 'cyan' ? 'amber' : 'blue';
    ents.push({ label: L.name.split(' ')[0] + '…', value: L._deg != null ? formatDeg(L._deg) : '3D', detail: L.name, tone });
  });
  return ents;
}
function buildSteps(F, Q) {
  const steps = [];
  steps.push({ title: 'Thiết lập hệ trục Oxyz', body: `Gán toạ độ theo ${F.footOfApex || F.base?.[0] || 'A'} làm gốc; dựng ${F.base ? F.base.join('') : 'khối'} và các đỉnh.`, tone: 'amber' });
  Q.layers.forEach((L) => {
    if (L._deg != null) steps.push({ title: L.name, body: `Chiếu vuông góc để tìm góc; tính được ${formatDeg(L._deg)} (bằng tích vô hướng vector).`, tone: 'blue' });
    else if (L.key === 'section') steps.push({ title: L.name, body: 'Giải giao của mặt phẳng pháp tuyến với các cạnh để ra đa giác thiết diện.', tone: 'blue' });
    else steps.push({ title: L.name, body: 'Dựng mặt phẳng qua các đỉnh tương ứng.', tone: 'blue' });
  });
  if (Q.layers.length === 0) steps.push({ title: 'Khối cơ sở', body: 'Đã dựng khối. Thêm câu hỏi (góc/thiết diện/mặt chéo) để bóc tách lớp.', tone: 'blue' });
  return steps;
}
const coordStr = (p) => `(${p.map((c) => Math.round(c*100)/100).join(', ')})`;
const pointStr = (F, names) => names.map((n) => n).join(' → ');

/* ============================================================
   MAIN
   ============================================================ */
export function solveProblem(text) {
  const raw = (text || '').trim();
  if (!raw) return { ok: false, reason: 'empty' };
  const t = normalizeText(raw);

  // Guard: các cấu trúc kernel CHƯA dựng chính xác -> nhường AI (tránh vẽ sai).
  const UNSUPPORTED = [
    /m[aặ]t\s*c[aầ]u/i,                                   // mặt cầu (giao cầu-mặt)
    /giao\s*đi[eể]m\s*c[uủ]a\s+hai/i,                     // giao hai đường
  ];
  if (UNSUPPORTED.some((re) => re.test(t))) return { ok: false, reason: 'complex-construction' };

  const F = detectFigure(t);
  if (!F) return { ok: false, reason: 'unknown-figure' };

  const der = parseDerivedPoints(t, F);
  const working = { ...F.points, ...der.points };
  const Q = detectQuestions(t, F, working);

  // Triết lý: kernel luôn DỰNG HÌNH chính xác khi nhận diện được khối/đáy.
  // Phần giải khó (chứng minh, thể tích, khoảng cách tổng quát...) KHÔNG chặn việc vẽ —
  // người dùng bấm "Giải kỹ (AI)" để có lời giải đầy đủ.
  // Chỉ nhường AI khi chính HÌNH còn phải giả định (không chắc toạ độ).
  if (F.assumptions?.length && (Q.layers.length || Q.distance)) {
    return { ok: false, reason: 'assumptions-needed', assumptions: F.assumptions };
  }

  const points = { ...working, ...Q.newPoints };
  Object.keys(points).forEach((k) => (points[k] = r4(points[k])));

  const labels = { ...(F.labels || {}) };
  [...Object.keys(der.points), ...Object.keys(Q.newPoints)].forEach((n) => {
    if (!labels[n]) labels[n] = [0.14, 0.14, 0.06];
  });

  const layers = Q.layers.map((L) => ({
    key: L.key, name: L.name, color: L.color,
    points: L.points || [], faces: L.faces || [],
    solidEdges: L.solidEdges || [], dashedEdges: L.dashedEdges || [],
    angles: L.angles || [], rightAngles: L.rightAngles || [],
  }));
  const defaultLayers = Q.defaults.length ? Q.defaults : (layers[0] ? [layers[0].key] : []);

  const entities = buildEntities(F, Q);
  const steps = buildSteps(F, Q);
  if (Q.distance) {
    const lbl = `d(${Q.distance.from}, (Q)) ≈ ${Math.round(Q.distance.coef * 1000) / 1000}·a`;
    entities.push({ label: 'Khoảng cách', value: `${Q.distance.from} → (Q)`, detail: lbl, tone: 'blue' });
    steps.push({ title: `Khoảng cách ${Q.distance.from} → (Q)`,
      body: `${lbl}  —  tính bằng |n·(${Q.distance.from}−E)| / |n|, n là pháp tuyến của (Q).`, tone: 'blue' });
  }

  // ---- KẾ HOẠCH DỰNG HÌNH THEO TỪNG BƯỚC ----
  const baseNames = F.base || [];
  const inBaseEdge = (e) => e.every((n) => baseNames.includes(n));
  const topNames = Object.keys(F.points).filter((n) => !baseNames.includes(n));
  const construction = [];
  construction.push({
    title: F.dim2d ? `Dựng hình ${baseNames.join('') || ''}`.trim()
         : (baseNames.length ? `Dựng đáy ${baseNames.join('')}` : 'Dựng đáy / mặt cong'),
    body: F.dim2d ? 'Dựng hình trên mặt phẳng Oxy.' : 'Gắn hệ trục Oxyz và dựng đáy.', color: 'solid',
    points: baseNames, solidEdges: F.solidEdges.filter(inBaseEdge), dashedEdges: F.dashedEdges.filter(inBaseEdge),
    faces: F.faces.filter((f) => f.every((n) => baseNames.includes(n))),
    curves: F.curves || [], curvesDashed: F.curvesDashed || [],
    rightAngles: F.rightAngleAt ? [F.rightAngleAt] : [],
  });
  construction.push({
    title: F.top ? 'Dựng mặt trên & cạnh bên' : 'Dựng đỉnh & cạnh bên',
    body: 'Nối các cạnh bên và phần trên của khối (nét khuất để đứt).', color: 'solid',
    points: topNames, solidEdges: F.solidEdges.filter((e) => !inBaseEdge(e)), dashedEdges: F.dashedEdges.filter((e) => !inBaseEdge(e)),
    faces: F.faces.filter((f) => !f.every((n) => baseNames.includes(n))),
  });
  Object.keys(der.points).forEach((n) => construction.push({
    title: `Dựng điểm ${n}`, body: der.hints[n] || 'Xác định theo dữ kiện đề bài.', color: 'cyan', points: [n],
  }));
  if ((der.segments && der.segments.length) || (der.dashed && der.dashed.length)) {
    construction.push({
      title: 'Dựng đường phụ', body: 'Nối các đoạn theo dữ kiện (đường & đoạn vuông góc).',
      color: 'cyan', solidEdges: der.segments || [], dashedEdges: der.dashed || [],
    });
  }
  layers.forEach((L) => construction.push({
    title: L.name,
    body: L.key === 'section' ? 'Cắt khối bởi mặt phẳng → đa giác thiết diện.'
        : (L.angles && L.angles.length ? 'Dựng tia, đo góc giữa đường và mặt.' : 'Dựng mặt phẳng/đối tượng phụ.'),
    color: L.color, points: L.points, faces: L.faces, solidEdges: L.solidEdges,
    dashedEdges: L.dashedEdges, angles: L.angles, rightAngles: L.rightAngles,
  }));

  const hasContent = (st) => ['points','solidEdges','dashedEdges','faces','curves','curvesDashed','angles','rightAngles']
    .some((k) => st[k] && st[k].length);
  const constructionClean = construction.filter(hasContent);

  const spec = {
    title: F.title, meta: F.meta || 'Oxyz', dim2d: F.dim2d || false,
    points, solidEdges: F.solidEdges, dashedEdges: F.dashedEdges, faces: F.faces,
    labels, entities, steps, layers, defaultLayers, assumptions: F.assumptions || [],
    construction: constructionClean.length ? constructionClean : construction, source: 'kernel',
  };
  return { ok: true, kind: F.kind, spec };
}
