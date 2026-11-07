// 바운스 브레이커 — 캔버스 그림 (디자이너 소유, docs/구조.md 6장 · docs/디자인.md)
// 단순한 도형·단색·가벼운 그라데이션. shadowBlur 금지.
import { bus } from './events.js';
import { WORLDS, MATERIALS, CONST } from './data.js';

const W = CONST.W || 375, H = CONST.H || 667;
const TAU = Math.PI * 2;

// 재질 외형: fill 몸통 / edge 테두리 / mark 무늬 색 / pat 무늬 종류 (style.css .swatch.<id> 와 같은 색)
export const LOOK = {
  normal: { fill: '#c9ced6', edge: '#7d8590', mark: '#ffffff', pat: 'shine' },
  fire:   { fill: '#ff7a2e', edge: '#b83a0a', mark: '#ffd36b', pat: 'flame' },
  frost:  { fill: '#9fe3ff', edge: '#3a9fd0', mark: '#ffffff', pat: 'flake' },
  steel:  { fill: '#5d6670', edge: '#2b3138', mark: '#c0c7cf', pat: 'rivet' },
  rubber: { fill: '#ff7eb6', edge: '#c2457e', mark: '#ffd0e4', pat: 'band' },
  venom:  { fill: '#9b5de5', edge: '#5a2d91', mark: '#7dff6a', pat: 'bubble' },
  volt:   { fill: '#ffe14d', edge: '#c99a00', mark: '#5a4500', pat: 'zigzag' },
  wind:   { fill: '#9be564', edge: '#4c9a2a', mark: '#ffffff', pat: 'swirl' },
};

// 데미지 숫자 색·크기 (kind 별)
const HIT_STYLE = {
  normal: { c: '#ffffff', s: 15 },
  weak:   { c: '#ffd84a', s: 24, suf: '!' },
  resist: { c: '#9aa3ab', s: 13 },
  crit:   { c: '#ff4040', s: 21, pre: '치명 ' },
  shield: { c: '#6cc8ff', s: 13 },
  dot:    { c: '#ffa040', s: 12 },
};

let canvas = null, ctx = null;
let view = { cssW: W, cssH: H, dpr: 1, scale: 1, offX: 0, offY: 0 };
let bgCache = { key: '', grad: null };
const floats = [];   // { x, y, text, c, s, life, max }
const banners = [];  // 능력 이름 등 큰 글자

function addFloat(f) { floats.push(f); if (floats.length > 50) floats.shift(); }

export function initRender(cv) {
  canvas = cv || document.getElementById('board');
  ctx = canvas ? canvas.getContext('2d') : null;
  bus.on('hit', (d) => {
    if (!d) return;
    const st = HIT_STYLE[d.kind] || HIT_STYLE.normal;
    let c = st.c;
    if (d.kind === 'dot' && d.src === 'poison') c = '#8dff6a';
    const text = d.kind === 'shield' ? '막음' : `${st.pre || ''}${Math.round(d.amount || 0)}${st.suf || ''}`;
    addFloat({ x: (d.x ?? W / 2) + (Math.random() * 16 - 8), y: (d.y ?? 150) - 6, text, c, s: st.s, life: 0.85, max: 0.85 });
  });
  bus.on('ability', (d) => {
    if (!d) return;
    banners.push({ x: d.x ?? W / 2, y: (d.y ?? 140) - 50, text: d.label || d.t || '', c: '#ff9f5a', s: 18, life: 1.3, max: 1.3 });
  });
  bus.on('enemyDefeated', (d) => {
    banners.push({ x: W / 2, y: 300, text: d && d.boss ? '보스 격파!' : '격파!', c: '#ffe45c', s: 30, life: 1.4, max: 1.4 });
  });
  bus.on('ballLost', () => {
    banners.push({ x: W / 2, y: 520, text: '공 소실', c: '#ff7070', s: 18, life: 1.0, max: 1.0 });
  });
}

export function resizeRender(v) {
  if (v) view = { ...view, ...v };
}

// ───────────── 작은 도구 ─────────────
function capsule(x1, y1, x2, y2, r, color) {
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, (r || 3) * 2); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function circle(x, y, r, fill, stroke, lw) {
  ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, r), 0, TAU);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); }
}
function text(t, x, y, size, color, align = 'center') {
  // 판이 작게 보일 때(가로 화면) 글자가 12px 아래로 줄지 않게 보정 (최대 1.8배)
  size = Math.round(size * Math.min(1.8, Math.max(1, 0.85 / num(view.scale, 1))));
  ctx.font = `700 ${size}px system-ui, "Malgun Gothic", sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.lineJoin = 'round';
  ctx.strokeText(t, x, y); ctx.fillStyle = color; ctx.fillText(t, x, y);
}
function hexA(hex, a) {   // '#rrggbb' + 알파 → rgba
  const h = (hex || '#ffffff').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16) || 0;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
const arr = (a) => (Array.isArray(a) ? a : []);
const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);

// ───────────── 판 ─────────────
function drawBackground(world) {
  const key = String(world.id);
  if (bgCache.key !== key) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, world.bg[0]); g.addColorStop(1, world.bg[1]);
    bgCache = { key, grad: g };
  }
  ctx.fillStyle = bgCache.grad; ctx.fillRect(0, 0, W, H);
  // 가벼운 격자
  ctx.strokeStyle = hexA(world.line, 0.05); ctx.lineWidth = 1; ctx.beginPath();
  for (let y = 40; y < H; y += 40) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
}

function drawBoard(G, b, world) {
  const line = world.line;
  // 발사 레인
  if (b.lane) {
    const L = b.lane, x1 = num(L.x1, 348), x2 = num(L.x2, 372), y1 = num(L.y1, 60), y2 = num(L.y2, 650);
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    const ch = num(G.plunger && G.plunger.charge);
    const py = y2 - 22 + ch * 18;
    ctx.fillStyle = '#c8ccd2'; ctx.fillRect(x1 + 3, py, x2 - x1 - 6, 6);
    ctx.fillStyle = '#6b7178'; ctx.fillRect(x1 + (x2 - x1) / 2 - 2, py + 6, 4, Math.max(0, y2 - py - 6));
    if (G.phase === 'launch' || ch > 0) {   // 충전 게이지
      const gh = 110, gx = x1 - 10, gy = y2 - gh - 10;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(gx, gy, 6, gh);
      ctx.fillStyle = ch > 0.85 ? '#ff5a4a' : ch > 0.5 ? '#ffd84a' : '#7be08a';
      ctx.fillRect(gx, gy + gh * (1 - ch), 6, gh * ch);
    }
  }
  // 레인 (통과형)
  for (const l of arr(b.lanes)) {
    const lit = num(l.lit);
    ctx.fillStyle = hexA(line, 0.12 + lit * 0.5); ctx.fillRect(l.x, l.y, l.w, l.h);
    ctx.strokeStyle = hexA(line, 0.5 + lit * 0.5); ctx.lineWidth = 1.5; ctx.strokeRect(l.x, l.y, l.w, l.h);
    // 위쪽 화살표
    const cx = l.x + l.w / 2, cy = l.y + l.h / 2;
    ctx.strokeStyle = lit > 0.05 ? '#ffffff' : hexA(line, 0.7); ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(cx - 5, cy + 3); ctx.lineTo(cx, cy - 3); ctx.lineTo(cx + 5, cy + 3); ctx.stroke();
  }
  // 벽
  for (const w of arr(b.walls)) capsule(w.x1, w.y1, w.x2, w.y2, num(w.r, 4), line);
  // 슬링샷
  for (const s of arr(b.slings)) {
    const f = num(s.flash);
    capsule(s.x1, s.y1, s.x2, s.y2, num(s.r, 5), f > 0.05 ? '#ffffff' : '#ff8a5c');
  }
  // 드롭 타깃
  for (const t of arr(b.targets)) {
    if (t.down) capsule(t.x1, t.y1, t.x2, t.y2, 1.5, hexA(line, 0.35));
    else capsule(t.x1, t.y1, t.x2, t.y2, num(t.r, 5), '#ffd84a');
  }
  // 범퍼
  for (const bp of arr(b.bumpers)) {
    const f = num(bp.flash), r = num(bp.r, 18);
    circle(bp.x, bp.y, r + f * 3, f > 0.05 ? '#ffffff' : hexA(line, 0.85), '#ffffff', 2);
    circle(bp.x, bp.y, r * 0.55, f > 0.05 ? line : 'rgba(0,0,0,.35)');
  }
}

function flipperTip(side, fb, gf) {
  if (fb && typeof fb.x2 === 'number') return [fb.x2, fb.y2];
  const len = num(fb.len, 62);
  let a = gf && typeof gf.angle === 'number' ? gf.angle : null;
  if (a == null) { const rest = (30 * Math.PI) / 180; a = side === 'L' ? rest : Math.PI - rest; }
  return [fb.px + Math.cos(a) * len, fb.py + Math.sin(a) * len];
}

function drawFlippers(G, b) {
  const F = b.flippers; if (!F) return;
  const jam = G.enemy && G.enemy.status && num(G.enemy.status.jam) > 0 ? G.enemy.status.jamSide : '';
  for (const side of ['L', 'R']) {
    const fb = F[side]; if (!fb || typeof fb.px !== 'number') continue;
    const gf = G.flippers && G.flippers[side];
    const [tx, ty] = flipperTip(side, fb, gf);
    const r = num(fb.r, 8);
    capsule(fb.px, fb.py, tx, ty, r, jam === side ? '#7a3a3a' : '#e8edf2');
    capsule(fb.px, fb.py, tx, ty, Math.max(1, r - 3), jam === side ? '#b04848' : '#ff6a4d');
    circle(fb.px, fb.py, 3, '#20262c');
    if (jam === side) text('마비', (fb.px + tx) / 2, fb.py - 22, 13, '#ff6a6a');
  }
}

// ───────────── 적 ─────────────
function drawShape(e, t, lookAt) {
  const { x, y } = e, r = num(e.r, 26), col = e.color || '#aaaaaa';
  ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 2;
  ctx.beginPath();
  switch (e.shape) {
    case 'box': {
      const s = r * 0.92, k = r * 0.3;
      ctx.moveTo(x - s + k, y - s); ctx.arcTo(x + s, y - s, x + s, y + s, k); ctx.arcTo(x + s, y + s, x - s, y + s, k);
      ctx.arcTo(x - s, y + s, x - s, y - s, k); ctx.arcTo(x - s, y - s, x + s, y - s, k);
      break;
    }
    case 'spike': {
      const n = 10;
      for (let i = 0; i <= n * 2; i++) {
        const a = (i / (n * 2)) * TAU + t * 0.5, rr = i % 2 ? r * 0.72 : r * 1.08;
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      break;
    }
    case 'ghost': {
      ctx.arc(x, y - r * 0.15, r * 0.9, Math.PI, 0);
      const by = y + r * 0.85, wv = 4;
      ctx.lineTo(x + r * 0.9, by);
      for (let i = 0; i <= 6; i++) {
        const px = x + r * 0.9 - (i / 6) * r * 1.8;
        ctx.lineTo(px, by + (i % 2 ? -wv : wv) * Math.sin(t * 3 + i));
      }
      break;
    }
    case 'eye':
      ctx.arc(x, y, r, 0, TAU);
      break;
    default: { // blob
      const n = 24;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * TAU, rr = r * (1 + 0.07 * Math.sin(a * 3 + t * 2.2));
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.92;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
    }
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // 가벼운 하이라이트
  circle(x - r * 0.35, y - r * 0.4, r * 0.18, 'rgba(255,255,255,.28)');

  // 눈
  let dx = 0, dy = 0;
  if (lookAt) { const L = Math.hypot(lookAt.x - x, lookAt.y - y) || 1; dx = (lookAt.x - x) / L; dy = (lookAt.y - y) / L; }
  if (e.shape === 'eye') {
    circle(x, y, r * 0.62, '#ffffff');
    circle(x + dx * r * 0.22, y + dy * r * 0.22, r * 0.32, col);
    circle(x + dx * r * 0.28, y + dy * r * 0.28, r * 0.15, '#111');
  } else {
    const ey = y - r * 0.12, ex = r * 0.32, er = Math.max(3, r * 0.17);
    for (const s of [-1, 1]) {
      circle(x + s * ex, ey, er, '#ffffff');
      circle(x + s * ex + dx * er * 0.45, ey + dy * er * 0.45, er * 0.5, '#111');
    }
  }
  // 보스 왕관
  if (e.boss) {
    const cy = y - r - 4, cw = r * 0.6;
    ctx.fillStyle = '#ffcf3a'; ctx.beginPath();
    ctx.moveTo(x - cw, cy); ctx.lineTo(x - cw, cy - 10); ctx.lineTo(x - cw / 2, cy - 4); ctx.lineTo(x, cy - 13);
    ctx.lineTo(x + cw / 2, cy - 4); ctx.lineTo(x + cw, cy - 10); ctx.lineTo(x + cw, cy); ctx.closePath(); ctx.fill();
  }
}

function drawEnemy(G, t) {
  const e = G.enemy; if (!e || typeof e.x !== 'number') return;
  const st = e.status || {}, r = num(e.r, 26);
  const ball = arr(G.balls).find((b) => b && b.alive !== false);

  // 호위병
  for (const g of arr(e.guards)) {
    circle(g.x, g.y, num(g.r, 10), '#5b6470', '#d8dee6', 2);
    const hp = num(g.hp, 2);
    for (let i = 0; i < hp; i++) circle(g.x - (hp - 1) * 3 + i * 6, g.y, 2, '#ffffff');
  }

  drawShape(e, t, ball);

  // 상태 외형
  if (num(st.freeze) > 0) { circle(e.x, e.y, r + 2, 'rgba(190,235,255,.45)', '#e8fbff', 3); }
  if (num(st.shield) > 0) {
    circle(e.x, e.y, r + 8, 'rgba(108,200,255,.12)', '#6cc8ff', 3);
  }
  if (num(st.adapt) > 0) {
    ctx.setLineDash([6, 5]); circle(e.x, e.y, r + 13, null, (LOOK[G.material] || LOOK.normal).fill, 3); ctx.setLineDash([]);
  }
  if (st.raged) circle(e.x, e.y, r + 4, null, 'rgba(255,60,60,.8)', 2);
  if (num(st.burn) > 0) circle(e.x, e.y, r + 1, null, 'rgba(255,140,40,.9)', 2);
  if (num(st.poison) > 0) { ctx.setLineDash([3, 4]); circle(e.x, e.y, r + 4, null, '#8dff6a', 2); ctx.setLineDash([]); }

  // HP 바
  const bw = Math.max(70, r * 2.6), bx = e.x - bw / 2, by = e.y - r - (e.boss ? 34 : 22);
  const p = Math.max(0, Math.min(1, num(e.hp) / Math.max(1, num(e.maxHp, 1))));
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(bx - 1, by - 1, bw + 2, 9);
  ctx.fillStyle = p > 0.5 ? '#5ee06a' : p > 0.2 ? '#ffd84a' : '#ff4a4a'; ctx.fillRect(bx, by, bw * p, 7);
  if (num(st.shield) > 0) { ctx.fillStyle = '#6cc8ff'; ctx.fillRect(bx, by - 4, bw, 3); }
  if (e.boss) { ctx.strokeStyle = '#ffcf3a'; ctx.lineWidth = 1; ctx.strokeRect(bx - 1, by - 1, bw + 2, 9); }
  text(String(Math.max(0, Math.ceil(num(e.hp)))), e.x, by - 10, 12, '#ffffff');

  // 상태 배지 (몸 아래)
  const badges = [];
  if (num(st.shield) > 0) badges.push(['보호' + Math.ceil(st.shield), '#6cc8ff']);
  if (num(st.freeze) > 0) badges.push(['빙결', '#bfefff']);
  if (num(st.burn) > 0) badges.push(['화상' + st.burn, '#ff9a40']);
  if (num(st.poison) > 0) badges.push(['독' + st.poison, '#8dff6a']);
  if (num(st.adapt) > 0) badges.push(['적응', '#d0a0ff']);
  if (st.raged) badges.push(['격노', '#ff5a5a']);
  if (badges.length) {
    const fs = Math.round(12 * Math.min(1.8, Math.max(1, 0.85 / num(view.scale, 1)))), bh = fs + 4;
    ctx.font = `700 ${fs}px system-ui, "Malgun Gothic", sans-serif`;
    const ws = badges.map(([s]) => ctx.measureText(s).width + 10);
    let bx2 = e.x - (ws.reduce((a, b) => a + b, 0) + (badges.length - 1) * 3) / 2;
    const by2 = e.y + r + 14;
    badges.forEach(([s, c], i) => {
      ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(bx2, by2 - bh / 2, ws[i], bh);
      ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.strokeRect(bx2 + 0.5, by2 - bh / 2 + 0.5, ws[i] - 1, bh - 1);
      ctx.fillStyle = c; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(s, bx2 + 5, by2 + 1);
      bx2 += ws[i] + 3;
    });
  }

  // 능력 예고 (깜빡이는 !)
  const warn = arr(e.abil).find((a) => a && a.warn);
  if (warn && Math.floor(t * 8) % 2 === 0) text('!', e.x + r + 10, e.y - r, 22, '#ffd84a');

  // 기울임: 화살표
  const tiltDir = num(st.tiltDir);
  if ((num(st.tilt) > 0 || (warn && warn.t === 'tilt')) && tiltDir) {
    const a = num(st.tilt) > 0 ? 0.85 : 0.4;
    for (const yy of [250, 380, 500]) {
      const cx = W / 2 + tiltDir * 40;
      ctx.strokeStyle = `rgba(255,216,74,${a})`; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath();
      ctx.moveTo(cx - tiltDir * 30, yy); ctx.lineTo(cx + tiltDir * 30, yy);
      ctx.moveTo(cx + tiltDir * 18, yy - 10); ctx.lineTo(cx + tiltDir * 30, yy); ctx.lineTo(cx + tiltDir * 18, yy + 10);
      ctx.stroke();
    }
  }
}

// ───────────── 공 ─────────────
function drawBall(b, mat) {
  const L = LOOK[mat] || LOOK.normal, r = num(b.r, 9), { x, y } = b;
  circle(x + 1.5, y + 2, r, 'rgba(0,0,0,.3)');
  circle(x, y, r, L.fill, L.edge, 2);
  ctx.strokeStyle = L.mark; ctx.fillStyle = L.mark; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  const k = r * 0.55;
  switch (L.pat) {
    case 'flame':
      ctx.beginPath(); ctx.moveTo(x - k * 0.7, y + k * 0.5); ctx.lineTo(x, y - k * 1.1); ctx.lineTo(x + k * 0.7, y + k * 0.5); ctx.closePath(); ctx.fill();
      break;
    case 'flake':
      ctx.beginPath();
      for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; ctx.moveTo(x - Math.cos(a) * k, y - Math.sin(a) * k); ctx.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k); }
      ctx.stroke();
      break;
    case 'rivet':
      for (const [a, c] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) circle(x + a * k * 0.7, y + c * k * 0.7, 1.4, L.mark);
      break;
    case 'band':
      ctx.fillRect(x - r * 0.85, y - r * 0.22, r * 1.7, r * 0.44);
      break;
    case 'bubble':
      circle(x + k * 0.4, y - k * 0.3, r * 0.22, L.mark); circle(x - k * 0.5, y + k * 0.45, r * 0.14, L.mark);
      break;
    case 'zigzag':
      ctx.beginPath(); ctx.moveTo(x - k, y - k * 0.4); ctx.lineTo(x - k * 0.2, y + k * 0.4); ctx.lineTo(x + k * 0.2, y - k * 0.4); ctx.lineTo(x + k, y + k * 0.4); ctx.stroke();
      break;
    case 'swirl':
      ctx.beginPath(); ctx.arc(x, y, k, 0.2, Math.PI * 1.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, k * 0.45, Math.PI, Math.PI * 2.4); ctx.stroke();
      break;
    default: // shine
      circle(x - r * 0.33, y - r * 0.35, r * 0.28, 'rgba(255,255,255,.9)');
  }
}

// ───────────── 떠오르는 글자 ─────────────
function drawFloats(dt) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.life -= dt; f.y -= 42 * dt;
    if (f.life <= 0) { floats.splice(i, 1); continue; }
    ctx.globalAlpha = Math.min(1, f.life / (f.max * 0.5));
    text(f.text, f.x, f.y, f.s, f.c);
  }
  for (let i = banners.length - 1; i >= 0; i--) {
    const f = banners[i]; f.life -= dt; f.y -= 14 * dt;
    if (f.life <= 0) { banners.splice(i, 1); continue; }
    ctx.globalAlpha = Math.min(1, f.life / (f.max * 0.4));
    text(f.text, Math.max(50, Math.min(W - 50, f.x)), f.y, f.s, f.c);
  }
  ctx.globalAlpha = 1;
}

export function drawFrame(G, board, dt) {
  if (!ctx || !canvas) return;
  G = G || {}; board = board || {};
  dt = Math.min(0.1, Math.max(0, num(dt, 1 / 60)));
  const world = WORLDS[G.world] || WORLDS[0];
  const v = view, s = num(v.scale, 1) * num(v.dpr, 1);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = world.bg[1]; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(s, 0, 0, s, num(v.offX) * num(v.dpr, 1), num(v.offY) * num(v.dpr, 1));

  drawBackground(world);
  drawBoard(G, board, world);
  drawEnemy(G, num(G.time));
  for (const b of arr(G.balls)) if (b && b.alive !== false && typeof b.x === 'number') drawBall(b, G.material);
  drawFlippers(G, board);
  drawFloats(dt);
}
