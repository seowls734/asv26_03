// 바운스 브레이커 — 캔버스 그림, 픽셀 테마 (디자이너 소유, docs/구조.md 6장 · docs/디자인.md)
// 판 전체를 1/PX 해상도 버퍼에 그린 뒤, 반투명·경계 픽셀을 4×4 Bayer 디더링으로 딱 떨어지게 만들고
// 정수 배율로 확대(보간 없음)해서 도트 그림처럼 보이게 한다. 글자만 원래 해상도에 픽셀 글꼴(Galmuri11)로 덧그린다.
// shadowBlur 금지.
import { bus } from './events.js';
import { WORLDS, MATERIALS, TRAITS, CONST } from './data.js';
import { GIMMICKS } from './board.js';

const W = CONST.W || 375, H = CONST.H || 667;
const TAU = Math.PI * 2;
const PX = 2;                                   // 도트 1칸 = 판 좌표 2px
const BW = Math.ceil(W / PX), BH = Math.ceil(H / PX);
const FONT = '"Galmuri11", "Galmuri", system-ui, "Malgun Gothic", sans-serif';

// 재질 외형: fill 몸통 / edge 테두리 / mark 무늬 색 / pat 무늬 종류 (style.css .swatch.<id> 와 같은 색)
export const LOOK = {
  normal: { fill: '#c9ced6', edge: '#4d545e', mark: '#ffffff', pat: 'shine' },
  fire:   { fill: '#ff7a2e', edge: '#8a2a05', mark: '#ffd36b', pat: 'flame' },
  frost:  { fill: '#9fe3ff', edge: '#2a7fb0', mark: '#ffffff', pat: 'flake' },
  steel:  { fill: '#5d6670', edge: '#1e2329', mark: '#c0c7cf', pat: 'rivet' },
  rubber: { fill: '#ff7eb6', edge: '#a3336a', mark: '#ffd0e4', pat: 'band' },
  venom:  { fill: '#9b5de5', edge: '#46207a', mark: '#7dff6a', pat: 'bubble' },
  volt:   { fill: '#ffe14d', edge: '#9a7400', mark: '#5a4500', pat: 'zigzag' },
  wind:   { fill: '#9be564', edge: '#3a7a1e', mark: '#ffffff', pat: 'swirl' },
};

// 월드별 장애물 겉모습 (범퍼·회전 막대·바위·소용돌이 모두 이 색을 씀)
const SKIN = {
  moss:  { body: '#d9534f', dark: '#5e1a18', mark: '#fff3e0', deco: 'mushroom' },
  sand:  { body: '#c98a4b', dark: '#4f2c10', mark: '#f2c98e', deco: 'rock' },
  ice:   { body: '#9fe3ff', dark: '#1f5f88', mark: '#f2fdff', deco: 'crystal' },
  forge: { body: '#8d939c', dark: '#25282e', mark: '#ff8a3d', deco: 'gear' },
  spire: { body: '#7b68ee', dark: '#251d5e', mark: '#fff27a', deco: 'coil' },
};

// 데미지 숫자 색·크기 (kind 별)
const HIT_STYLE = {
  normal: { c: '#ffffff', s: 14 },
  weak:   { c: '#ffd84a', s: 22, suf: '!' },
  resist: { c: '#9aa3ab', s: 12 },
  crit:   { c: '#ff4040', s: 20, pre: '치명 ' },
  shield: { c: '#6cc8ff', s: 12 },
  dot:    { c: '#ffa040', s: 12 },
};

let canvas = null, out = null;          // 화면 캔버스
let fg = null, ctx = null;              // 저해상도 움직이는 층
let stat = { key: '', canvas: null };   // 저해상도 고정 층 (배경 + 벽), 판이 바뀔 때만 다시 그림
let view = { cssW: W, cssH: H, dpr: 1, scale: 1, offX: 0, offY: 0 };
let lastBoard = null;
const floats = [];   // { x, y, text, c, s, life, max }
const banners = [];  // 능력 이름 등 큰 글자
const parts = [];    // 도트 파편 { x, y, vx, vy, c, life }
const texts = [];    // 이번 프레임에 덧그릴 글자·배지
const trails = new WeakMap();

function addFloat(f) { floats.push(f); if (floats.length > 50) floats.shift(); }
function addParts(x, y, n, c, spd = 160) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, v = spd * (0.4 + Math.random() * 0.8);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, c, life: 0.35 + Math.random() * 0.3 });
  }
  if (parts.length > 160) parts.splice(0, parts.length - 160);
}
function mk(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

export function initRender(cv) {
  canvas = cv || document.getElementById('board');
  out = canvas ? canvas.getContext('2d') : null;
  fg = mk(BW, BH);
  ctx = fg.getContext('2d', { willReadFrequently: true });
  try { if (document.fonts && document.fonts.load) document.fonts.load(`12px ${FONT}`).catch(() => {}); } catch { /* ignore */ }
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
  bus.on('ballLost', (d) => {
    if (d && (d.saved || d.left < 0)) return;          // SAVE 는 G.saveFlash 로 표시, 게임오버는 UI 화면
    banners.push({ x: W / 2, y: 520, text: '공 소실', c: '#ff7070', s: 18, life: 1.0, max: 1.0 });
  });
  bus.on('bump', (d) => {
    if (!d || d.type === 'wall' || d.type === 'lane') return;
    const c = d.type === 'sling' ? '#ff8a5c' : d.type === 'target' ? '#ffd84a' : '#ffffff';
    addParts(d.x, d.y, d.type === 'flipper' ? 2 : 4, c, 140);
  });
  bus.on('traitAwake', (d) => {
    const t = d && TRAITS[d.id];
    if (!t) return;
    banners.push({ x: W / 2, y: 250, text: `★ ${t.name} 각성! ★`, c: '#ffd84a', s: 22, life: 2.6, max: 2.6 });
    banners.push({ x: W / 2, y: 276, text: t.star, c: '#fff3b0', s: 12, life: 2.6, max: 2.6 });
    for (let i = 0; i < 4; i++) addParts(W / 2 - 90 + i * 60, 260, 6, i % 2 ? '#ffd84a' : '#ffffff', 200);
  });
  bus.on('crumble', (d) => {
    if (!d) return;
    const sk = curSkin;
    addParts(d.x, d.y, 10, sk.body, 220); addParts(d.x, d.y, 6, sk.dark, 180);
    banners.push({ x: d.x, y: d.y - 30, text: '와장창!', c: sk.mark, s: 16, life: 0.9, max: 0.9 });
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
function poly(x, y, r, n, rot, fill) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    i ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
const snap = (v) => Math.round(v / PX) * PX;
function sq(cx, cy, size, color) {          // 도트 칸에 맞춘 정사각형
  const s = Math.max(PX, snap(size));
  ctx.fillStyle = color; ctx.fillRect(snap(cx - s / 2), snap(cy - s / 2), s, s);
}
function rect(x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(snap(x), snap(y), Math.max(PX, snap(w)), Math.max(PX, snap(h))); }
// 글자는 덧그리기 목록에 넣는다
function text(t, x, y, size, color, align = 'center') { texts.push({ k: 't', t, x, y, size, color, align }); }

function rgb(hex) {
  const h = (hex || '#ffffff').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function hexA(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; }
function mix(h1, h2, t) {
  const a = rgb(h1), b = rgb(h2);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const arr = (a) => (Array.isArray(a) ? a : []);
const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);

// 4×4 Bayer: 알파가 문턱보다 크면 불투명, 아니면 투명 → 반투명은 점무늬, 경계는 계단
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => ((v + 0.5) / 16) * 255);
function crisp(c2d, w, h) {
  const img = c2d.getImageData(0, 0, w, h), d = img.data;
  for (let y = 0, i = 0; y < h; y++) {
    const row = (y & 3) << 2;
    for (let x = 0; x < w; x++, i += 4) {
      const a = d[i + 3];
      if (a === 0 || a === 255) continue;
      d[i + 3] = a > BAYER[row | (x & 3)] ? 255 : 0;
    }
  }
  c2d.putImageData(img, 0, 0);
}
function rng(seed) {            // 고정 무늬용 난수
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ───────────── 고정 층: 도트 배경 + 벽 ─────────────
function paintBackground(g, world, wi) {
  const img = g.createImageData(BW, BH), d = img.data;
  const c0 = rgb(world.bg[0]), c1 = rgb(world.bg[1]), N = 7;
  const band = [];
  for (let k = 0; k < N; k++) band.push(c0.map((v, i) => Math.round(v + (c1[i] - v) * (k / (N - 1)))));
  for (let y = 0, i = 0; y < BH; y++) {
    const t = (y / (BH - 1)) * (N - 1), k = Math.floor(t), f = (t - k) * 255;
    for (let x = 0; x < BW; x++, i += 4) {
      const c = band[Math.min(N - 1, f > BAYER[((y & 3) << 2) | (x & 3)] ? k + 1 : k)];
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const R = rng(1234 + wi * 77), L = world.line, base = world.bg[1];
  const dot = (x, y, c) => { g.fillStyle = c; g.fillRect(x | 0, y | 0, 1, 1); };
  const plus = (x, y, c) => { dot(x, y, c); dot(x - 1, y, c); dot(x + 1, y, c); dot(x, y - 1, c); dot(x, y + 1, c); };
  switch (world.id) {
    case 'moss':
      for (let i = 0; i < 160; i++) dot(R() * BW, R() * BH, mix(base, L, 0.18 + R() * 0.12));
      for (let i = 0; i < 34; i++) { const x = R() * BW, y = R() * BH, c = mix(base, L, 0.35); dot(x, y, c); dot(x - 1, y - 1, c); dot(x + 1, y - 1, c); dot(x, y - 2, c); }
      break;
    case 'sand':
      for (let k = 0; k < 16; k++) {
        const by = 12 + k * 21, c = mix(base, L, 0.16);
        for (let x = 0; x < BW; x++) dot(x, by + Math.round(2.5 * Math.sin(x / 9 + k * 1.3)), c);
      }
      for (let i = 0; i < 140; i++) dot(R() * BW, R() * BH, mix(base, L, 0.22));
      break;
    case 'ice':
      for (let i = 0; i < 36; i++) plus(2 + R() * (BW - 4), 2 + R() * (BH - 4), mix(base, L, 0.35));
      for (let i = 0; i < 18; i++) { const x = R() * BW, y = R() * BH, c = mix(base, L, 0.2); for (let j = 0; j < 6; j++) dot(x + j, y + j, c); }
      for (let i = 0; i < 70; i++) dot(R() * BW, R() * BH, mix(base, '#ffffff', 0.25));
      break;
    case 'forge': {
      const c = mix(base, L, 0.13);
      for (let y = 0; y < BH; y += 8) {
        for (let x = 0; x < BW; x++) dot(x, y, c);
        for (let x = ((y / 8) % 2) * 8; x < BW; x += 16) for (let j = 1; j < 8; j++) dot(x, y + j, c);
      }
      for (let i = 0; i < 46; i++) dot(R() * BW, R() * BH, mix(base, '#ff8a3d', 0.5 + R() * 0.3));
      break;
    }
    default: // spire — 별과 회로
      for (let i = 0; i < 130; i++) dot(R() * BW, R() * BH, mix(base, '#ffffff', 0.25 + R() * 0.45));
      for (let i = 0; i < 12; i++) plus(2 + R() * (BW - 4), 2 + R() * (BH - 4), mix(base, L, 0.6));
      for (let i = 0; i < 8; i++) {
        let x = R() * BW | 0, y = R() * BH | 0; const c = mix(base, L, 0.15);
        for (let j = 0; j < 30; j++) { dot(x, y, c); if (R() < 0.15) { if (R() < 0.5) x++; else y++; } else if (j % 10 < 5) x++; else y++; }
      }
  }
}

function buildStatic(b, world, wi) {
  const c = mk(BW, BH), g = c.getContext('2d');
  paintBackground(g, world, wi);
  // 벽: 투명 층에 그린 뒤 도트화해서 얹는다
  const wl = mk(BW, BH), wg = wl.getContext('2d', { willReadFrequently: true });
  const keep = ctx; ctx = wg;
  ctx.setTransform(1 / PX, 0, 0, 1 / PX, 0, 0);
  const line = world.line, dark = mix(line, '#000000', 0.62), lite = mix(line, '#ffffff', 0.55);
  // 발사 레인 바닥
  if (b.lane) {
    const L = b.lane;
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(num(L.x1, 345), num(L.y1, 100), num(L.x2, 375) - num(L.x1, 345), num(L.y2, 650) - num(L.y1, 100));
  }
  const walls = arr(b.walls).filter((w) => !w.gate);
  for (const w of walls) capsule(w.x1, w.y1, w.x2, w.y2, num(w.r, 4) + 1.6, dark);
  for (const w of walls) capsule(w.x1, w.y1, w.x2, w.y2, num(w.r, 4), w.map ? mix(line, world.bg[1], 0.25) : line);
  for (const w of walls) capsule(w.x1 - 1, w.y1 - 1.5, w.x2 - 1, w.y2 - 1.5, 1, w.map ? hexA(lite, 0.6) : lite);
  for (const w of arr(b.walls).filter((q) => q.gate)) {
    ctx.setLineDash([4, 4]); capsule(w.x1, w.y1, w.x2, w.y2, 1.5, hexA(line, 0.6)); ctx.setLineDash([]);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx = keep;
  crisp(wg, BW, BH);
  g.drawImage(wl, 0, 0);
  return c;
}

// ───────────── 움직이는 판 요소 ─────────────
let curSkin = SKIN.moss;

function drawBoard(G, b, world, t) {
  const line = world.line;
  // 발사대·충전 게이지
  if (b.lane) {
    const L = b.lane, x1 = num(L.x1, 348), x2 = num(L.x2, 372), y2 = num(L.y2, 650);
    const ch = num(G.plunger && G.plunger.charge);
    const py = (b.plunger ? num(b.plunger.y, y2 - 13) + 11 : y2 - 22) + ch * 18;
    rect(x1 + 4, py, x2 - x1 - 8, 6, '#c8ccd2');
    rect(x1 + 4, py + 4, x2 - x1 - 8, 2, '#8a9098');
    rect(x1 + (x2 - x1) / 2 - 2, py + 6, 4, Math.max(0, y2 + 30 - py - 6), '#6b7178');
    if (G.phase === 'launch' || ch > 0) {
      const gh = 110, gx = x1 - 12, gy = y2 - gh - 10;
      rect(gx - 2, gy - 2, 10, gh + 4, '#000000');
      const n = 10, filled = Math.round(ch * n);
      for (let i = 0; i < n; i++) {
        const on = i < filled;
        const c = i >= 8 ? '#ff5a4a' : i >= 5 ? '#ffd84a' : '#7be08a';
        rect(gx, gy + gh - (i + 1) * 11 + 2, 6, 8, on ? c : 'rgba(255,255,255,.12)');
      }
    }
  }
  // 레인 (통과형)
  for (const l of arr(b.lanes)) {
    const lit = num(l.lit);
    ctx.fillStyle = hexA(line, 0.14 + lit * 0.6); ctx.fillRect(l.x, l.y, l.w, l.h);
    ctx.strokeStyle = lit > 0.05 ? '#ffffff' : mix(line, '#000000', 0.2); ctx.lineWidth = 2; ctx.strokeRect(l.x, l.y, l.w, l.h);
    const cx = l.x + l.w / 2, cy = l.y + l.h / 2, blink = Math.floor(t * 3) % 2;
    ctx.strokeStyle = lit > 0.05 ? '#ffffff' : hexA(line, blink ? 0.95 : 0.55); ctx.lineWidth = 2.5; ctx.lineCap = 'butt'; ctx.beginPath();
    ctx.moveTo(cx - 5, cy + 4); ctx.lineTo(cx, cy - 2); ctx.lineTo(cx + 5, cy + 4); ctx.stroke();
  }
  // 슬링샷
  for (const s of arr(b.slings)) {
    const f = num(s.flash), r = num(s.r, 5);
    capsule(s.x1, s.y1, s.x2, s.y2, r + 1.6, '#5a1e0a');
    capsule(s.x1, s.y1, s.x2, s.y2, r, f > 0.05 ? '#ffffff' : '#ff8a5c');
  }
  // 드롭 타깃
  for (const tg of arr(b.targets)) {
    if (tg.down) { capsule(tg.x1, tg.y1, tg.x2, tg.y2, 1.5, hexA(line, 0.4)); continue; }
    const r = num(tg.r, 5);
    capsule(tg.x1, tg.y1, tg.x2, tg.y2, r + 1.6, '#4a3a00');
    capsule(tg.x1, tg.y1, tg.x2, tg.y2, r, num(tg.flash) > 0.05 ? '#ffffff' : '#ffd84a');
    capsule(tg.x1, tg.y1 - 1.5, tg.x2, tg.y2 - 1.5, 1, '#fff3b0');
  }
  // 장애물
  for (const p of arr(b.bumpers)) drawObstacle(p, b.gimmick, t);
}

function drawBumperBody(x, y, r, f, t, sk) {
  const body = f > 0.05 ? '#ffffff' : sk.body;
  switch (sk.deco) {
    case 'rock':
      poly(x, y, r + 1.8, 8, Math.PI / 8, sk.dark);
      poly(x, y, r, 8, Math.PI / 8, body);
      poly(x - r * 0.2, y - r * 0.25, r * 0.55, 8, Math.PI / 8, mix(body, '#ffffff', 0.25));
      capsule(x - r * 0.1, y + r * 0.1, x + r * 0.45, y + r * 0.5, 0.9, sk.dark);
      break;
    case 'crystal':
      poly(x, y, r + 2, 6, Math.PI / 6, sk.dark);
      poly(x, y, r, 6, Math.PI / 6, body);
      poly(x - r * 0.15, y - r * 0.15, r * 0.5, 6, Math.PI / 6, sk.mark);
      capsule(x + r * 0.2, y - r * 0.6, x + r * 0.55, y - r * 0.1, 0.9, sk.mark);
      break;
    case 'gear': {
      const n = 8, rot = t * 0.8;
      for (let i = 0; i < n; i++) {
        const a = rot + (i / n) * TAU;
        capsule(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, x + Math.cos(a) * (r + 3), y + Math.sin(a) * (r + 3), 3.4, sk.dark);
      }
      circle(x, y, r + 0.5, sk.dark);
      circle(x, y, r - 1.5, body);
      circle(x, y, r * 0.45, sk.dark);
      circle(x, y, r * 0.28, f > 0.05 ? '#ffffff' : sk.mark);
      break;
    }
    case 'coil':
      circle(x, y, r + 1.8, sk.dark);
      circle(x, y, r, body);
      circle(x, y, r * 0.68, sk.dark);
      circle(x, y, r * 0.48, f > 0.05 ? '#ffffff' : sk.mark);
      if (Math.floor(t * 6) % 3 === 0) {
        const a = Math.floor(t * 6) * 1.9;
        ctx.strokeStyle = sk.mark; ctx.lineWidth = 2; ctx.lineCap = 'butt'; ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        ctx.lineTo(x + Math.cos(a + 0.3) * (r + 6), y + Math.sin(a + 0.3) * (r + 6));
        ctx.lineTo(x + Math.cos(a - 0.1) * (r + 10), y + Math.sin(a - 0.1) * (r + 10)); ctx.stroke();
      }
      break;
    default: // mushroom — 위에서 본 버섯 갓
      circle(x, y, r + 1.8, sk.dark);
      circle(x, y, r, body);
      circle(x - r * 0.2, y - r * 0.2, r * 0.7, mix(body, '#ffffff', 0.18));
      for (const [dx, dy, k] of [[-0.35, -0.3, 0.22], [0.38, -0.05, 0.18], [-0.05, 0.42, 0.2], [0.1, -0.55, 0.12]]) {
        sq(x + dx * r, y + dy * r, Math.max(PX * 2, r * k * 2), sk.mark);
      }
  }
}

function drawObstacle(p, kind, t) {
  const sk = curSkin, f = num(p.flash), x = p.x, y = p.y, r = num(p.r, 18);
  switch (kind) {
    case 'spin': {
      const gm = GIMMICKS.spin, L = num(p.r0, r) + gm.extra, ca = Math.cos(num(p.ang)) * L, sa = Math.sin(num(p.ang)) * L;
      circle(x, y, L + gm.w, null, hexA(sk.body, 0.22), 2);                       // 회전 범위
      capsule(x - ca, y - sa, x + ca, y + sa, gm.w + 1.8, sk.dark);
      capsule(x - ca, y - sa, x + ca, y + sa, gm.w, f > 0.05 ? '#ffffff' : sk.body);
      capsule(x - ca * 0.9, y - sa * 0.9 - 1.5, x + ca * 0.9, y + sa * 0.9 - 1.5, 1, mix(sk.body, '#ffffff', 0.5));
      sq(x - ca, y - sa, 4, sk.mark); sq(x + ca, y + sa, 4, sk.mark);
      circle(x, y, 7.5, sk.dark); circle(x, y, 5.5, sk.mark); sq(x, y, 2, sk.dark);
      return;
    }
    case 'crumble': {
      if (p.broken > 0) {                   // 잔해 + 다시 생기는 진행 표시
        const k = 1 - p.broken / GIMMICKS.crumble.respawn;
        for (let i = 0; i < 6; i++) { const a = i * 1.05 + p.i; sq(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, 4, mix(sk.body, '#000000', 0.45)); }
        ctx.strokeStyle = hexA(sk.mark, 0.5); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
        return;
      }
      const sk2 = { ...sk, deco: 'rock', body: sk.deco === 'rock' ? sk.body : mix(sk.body, '#9a8a7a', 0.5) };
      drawBumperBody(x, y, r, f, t, sk2);
      const hp = num(p.hp, 3);
      ctx.strokeStyle = sk.dark; ctx.lineWidth = 2; ctx.lineCap = 'butt'; ctx.beginPath();
      if (hp <= 2) { ctx.moveTo(x - r * 0.7, y - r * 0.2); ctx.lineTo(x - r * 0.15, y + r * 0.05); ctx.lineTo(x + r * 0.1, y - r * 0.5); }
      if (hp <= 1) { ctx.moveTo(x + r * 0.7, y + r * 0.1); ctx.lineTo(x + r * 0.1, y + r * 0.25); ctx.lineTo(x - r * 0.1, y + r * 0.75); }
      ctx.stroke();
      for (let i = 0; i < hp; i++) sq(x - (hp - 1) * 3 + i * 6, y + r + 6, 4, sk.mark);   // 남은 타수
      return;
    }
    case 'whirl': {
      const rot = -t * 2.2;
      for (let k = 0; k < 3; k++) {
        const a0 = rot + k * (TAU / 3);
        ctx.strokeStyle = hexA(sk.body, 0.55); ctx.lineWidth = 3; ctx.lineCap = 'butt';
        ctx.beginPath();
        for (let i = 0; i <= 14; i++) {
          const u = i / 14, a = a0 + u * 2.4, rr = r + 6 + u * (GIMMICKS.whirl.range - 10);
          i ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.stroke();
      }
      drawBumperBody(x, y, r, f, t, sk);
      return;
    }
    case 'orbit':
      circle(num(p.x0, x), num(p.y0, y), GIMMICKS.orbit.rad, null, hexA(sk.body, 0.35), 2);
      drawBumperBody(x, y, r, f, t, sk);
      return;
    case 'pulse': {
      const k = r / Math.max(1, num(p.r0, r));
      if (k > 1.08) circle(x, y, r + 5, null, hexA(sk.mark, Math.min(0.7, (k - 1) * 3)), 2);
      drawBumperBody(x, y, r, f, t, sk);
      return;
    }
    default:
      drawBumperBody(x, y, r, f, t, sk);
  }
}

function flipperTip(side, fb, gf) {
  if (fb && typeof fb.x2 === 'number') return [fb.x2, fb.y2];
  const len = num(fb.len, 62);
  let a = gf && typeof gf.angle === 'number' ? gf.angle : null;
  if (a == null && typeof fb.rest === 'number') a = fb.rest;
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
    capsule(fb.px, fb.py, tx, ty, r + 1.6, '#1a1e22');
    capsule(fb.px, fb.py, tx, ty, r, jam === side ? '#7a3a3a' : '#e8edf2');
    capsule(fb.px, fb.py, tx, ty, Math.max(1, r - 3), jam === side ? '#b04848' : '#ff6a4d');
    sq(fb.px, fb.py, 4, '#20262c');
    if (jam === side) text('마비', (fb.px + tx) / 2, fb.py - 22, 13, '#ff6a6a');
  }
}

// ───────────── 적 ─────────────
function drawShape(e, t, lookAt) {
  const { x, y } = e, r = num(e.r, 26), col = e.color || '#aaaaaa';
  const dark = mix(col, '#000000', 0.6);
  ctx.beginPath();
  switch (e.shape) {
    case 'box': {
      const s = r * 0.92, k = PX * 2;               // 도트 계단 모서리
      ctx.moveTo(x - s + k, y - s); ctx.lineTo(x + s - k, y - s); ctx.lineTo(x + s - k, y - s + k); ctx.lineTo(x + s, y - s + k);
      ctx.lineTo(x + s, y + s - k); ctx.lineTo(x + s - k, y + s - k); ctx.lineTo(x + s - k, y + s); ctx.lineTo(x - s + k, y + s);
      ctx.lineTo(x - s + k, y + s - k); ctx.lineTo(x - s, y + s - k); ctx.lineTo(x - s, y - s + k); ctx.lineTo(x - s + k, y - s + k);
      break;
    }
    case 'spike': {
      const n = 8, rot = Math.floor(t * 4) * (TAU / 32);   // 한 칸씩 끊어 도는 도트 애니메이션
      for (let i = 0; i <= n * 2; i++) {
        const a = (i / (n * 2)) * TAU + rot, rr = i % 2 ? r * 0.72 : r * 1.1;
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      break;
    }
    case 'ghost': {
      ctx.arc(x, y - r * 0.15, r * 0.9, Math.PI, 0);
      const by = y + r * 0.85, fr = Math.floor(t * 4) % 2;
      ctx.lineTo(x + r * 0.9, by);
      for (let i = 0; i <= 6; i++) ctx.lineTo(x + r * 0.9 - (i / 6) * r * 1.8, by + ((i + fr) % 2 ? -4 : 3));
      break;
    }
    case 'eye':
      ctx.arc(x, y, r, 0, TAU);
      break;
    default: { // blob — 두 장짜리 출렁임
      const n = 24, fr = Math.floor(t * 4) % 2;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * TAU, rr = r * (1 + 0.07 * Math.sin(a * 3 + fr * Math.PI));
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * (fr ? 0.9 : 0.95);
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
    }
  }
  ctx.closePath();
  ctx.strokeStyle = dark; ctx.lineWidth = 4; ctx.stroke();
  ctx.fillStyle = col; ctx.fill();
  // 아래쪽 그림자, 위쪽 빛
  ctx.save(); ctx.clip();
  ctx.fillStyle = mix(col, '#000000', 0.28); ctx.fillRect(x - r * 1.3, y + r * 0.45, r * 2.6, r);
  ctx.restore();
  sq(x - r * 0.45, y - r * 0.5, Math.max(4, r * 0.28), mix(col, '#ffffff', 0.55));

  // 눈 (도트 사각형)
  let dx = 0, dy = 0;
  if (lookAt) { const L = Math.hypot(lookAt.x - x, lookAt.y - y) || 1; dx = (lookAt.x - x) / L; dy = (lookAt.y - y) / L; }
  const blinkNow = (t % 3.2) < 0.12;
  if (e.shape === 'eye') {
    circle(x, y, r * 0.62, '#ffffff');
    circle(x + dx * r * 0.22, y + dy * r * 0.22, r * 0.32, col);
    sq(x + dx * r * 0.28, y + dy * r * 0.28, Math.max(4, r * 0.3), '#111111');
    if (blinkNow) rect(x - r * 0.65, y - 2, r * 1.3, 4, dark);
  } else {
    const ey = y - r * 0.12, ex = r * 0.34, es = Math.max(6, snap(r * 0.36));
    for (const s of [-1, 1]) {
      if (blinkNow) { rect(x + s * ex - es / 2, ey, es, PX, '#111111'); continue; }
      sq(x + s * ex, ey, es, '#ffffff');
      sq(x + s * ex + dx * es * 0.25, ey + dy * es * 0.25, Math.max(PX * 2, es / 2), '#111111');
    }
  }
  // 보스 왕관
  if (e.boss) {
    const cy = y - r - 4, cw = r * 0.6;
    ctx.fillStyle = '#7a5a00'; ctx.beginPath();
    ctx.moveTo(x - cw - 2, cy + 2); ctx.lineTo(x - cw - 2, cy - 12); ctx.lineTo(x - cw / 2, cy - 6); ctx.lineTo(x, cy - 15);
    ctx.lineTo(x + cw / 2, cy - 6); ctx.lineTo(x + cw + 2, cy - 12); ctx.lineTo(x + cw + 2, cy + 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffcf3a'; ctx.beginPath();
    ctx.moveTo(x - cw, cy); ctx.lineTo(x - cw, cy - 9); ctx.lineTo(x - cw / 2, cy - 3); ctx.lineTo(x, cy - 12);
    ctx.lineTo(x + cw / 2, cy - 3); ctx.lineTo(x + cw, cy - 9); ctx.lineTo(x + cw, cy); ctx.closePath(); ctx.fill();
    sq(x, cy - 4, 4, '#ff4a6a');
  }
}

function drawEnemy(G, t) {
  const e = G.enemy; if (!e || typeof e.x !== 'number') return;
  const st = e.status || {}, r = num(e.r, 26);
  const ball = arr(G.balls).find((b) => b && b.alive !== false);

  // 그림자
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(e.x, e.y + r * 0.95, r * 0.8, r * 0.25, 0, 0, TAU); ctx.fill();

  // 호위병
  for (const g of arr(e.guards)) {
    const gr = num(g.r, 10);
    circle(g.x, g.y, gr + 1.6, '#1d2228'); circle(g.x, g.y, gr, '#5b6470');
    circle(g.x - 2, g.y - 2, gr * 0.5, '#8a94a0');
    const hp = num(g.hp, 2);
    for (let i = 0; i < hp; i++) sq(g.x - (hp - 1) * 3 + i * 6, g.y + 1, 2, '#ffffff');
  }

  drawShape(e, t, ball);

  // 상태 외형
  if (num(st.freeze) > 0) { circle(e.x, e.y, r + 2, 'rgba(190,235,255,.5)', '#e8fbff', 3); }
  if (num(st.shield) > 0) circle(e.x, e.y, r + 8, 'rgba(108,200,255,.2)', '#6cc8ff', 3);
  if (num(st.adapt) > 0) {
    ctx.setLineDash([6, 5]); circle(e.x, e.y, r + 13, null, (LOOK[G.material] || LOOK.normal).fill, 3); ctx.setLineDash([]);
  }
  if (st.raged) circle(e.x, e.y, r + 4, null, 'rgba(255,60,60,.85)', 2);
  if (num(st.burn) > 0) circle(e.x, e.y, r + 1, null, 'rgba(255,140,40,.9)', 2);
  if (num(st.poison) > 0) { ctx.setLineDash([3, 4]); circle(e.x, e.y, r + 4, null, '#8dff6a', 2); ctx.setLineDash([]); }

  // 이름표 + HP 바 (도트 칸 단위)
  const bw = snap(Math.max(72, r * 2.6)), bx = snap(e.x - bw / 2), by = snap(e.y - r - (e.boss ? 34 : 22));
  const p = Math.max(0, Math.min(1, num(e.hp) / Math.max(1, num(e.maxHp, 1))));
  rect(bx - 2, by - 2, bw + 4, 10, e.boss ? '#ffcf3a' : '#000000');
  rect(bx, by, bw, 6, '#2a0f0f');
  const segs = Math.round(bw / 4), on = Math.ceil(segs * p), hc = p > 0.5 ? '#5ee06a' : p > 0.2 ? '#ffd84a' : '#ff4a4a';
  if (on > 0) rect(bx, by, Math.min(bw, on * 4), 6, hc);
  if (on > 0) rect(bx, by, Math.min(bw, on * 4), 2, mix(hc, '#ffffff', 0.45));
  if (num(st.shield) > 0) rect(bx, by - 6, bw, 2, '#6cc8ff');
  const nameY = by - 12;
  texts.push({ k: 'name', t: e.name || '', hp: String(Math.max(0, Math.ceil(num(e.hp)))), x: e.x, y: nameY, boss: !!e.boss });

  // 상태 배지 (몸 아래)
  const badges = [];
  if (num(st.shield) > 0) badges.push(['보호' + Math.ceil(st.shield), '#6cc8ff']);
  if (num(st.freeze) > 0) badges.push(['빙결', '#bfefff']);
  if (num(st.burn) > 0) badges.push(['화상' + st.burn, '#ff9a40']);
  if (num(st.poison) > 0) badges.push(['독' + st.poison, '#8dff6a']);
  if (num(st.adapt) > 0) badges.push(['적응', '#d0a0ff']);
  if (st.raged) badges.push(['격노', '#ff5a5a']);
  if (badges.length) texts.push({ k: 'badges', list: badges, x: e.x, y: e.y + r + 14 });

  // 능력 예고 (깜빡이는 !)
  const warn = arr(e.abil).find((a) => a && a.warn);
  if (warn && Math.floor(t * 8) % 2 === 0) text('!', e.x + r + 10, e.y - r, 22, '#ffd84a');

  // 기울임: 화살표
  const tiltDir = num(st.tiltDir);
  if ((num(st.tilt) > 0 || (warn && warn.t === 'tilt')) && tiltDir) {
    const a = num(st.tilt) > 0 ? 0.9 : 0.45;
    for (const yy of [250, 380, 500]) {
      const cx = W / 2 + tiltDir * 40;
      ctx.strokeStyle = `rgba(255,216,74,${a})`; ctx.lineWidth = 4; ctx.lineCap = 'butt'; ctx.beginPath();
      ctx.moveTo(cx - tiltDir * 30, yy); ctx.lineTo(cx + tiltDir * 30, yy);
      ctx.moveTo(cx + tiltDir * 18, yy - 10); ctx.lineTo(cx + tiltDir * 30, yy); ctx.lineTo(cx + tiltDir * 18, yy + 10);
      ctx.stroke();
    }
  }
}

// ───────────── 공 ─────────────
const RAINBOW = ['#ff4a4a', '#ff9a40', '#ffe14d', '#7be08a', '#4fa8ff', '#9b5de5', '#ff7eb6', '#ffffff'];
function drawBall(b, mat, G) {
  const L = LOOK[mat] || LOOK.normal, r = num(b.r, 9), { x, y } = b;
  if (G && num(G.furyT) > 0) circle(x, y, r + 4, Math.floor(num(G.time) * 10) % 2 ? '#ff3030' : '#ffb030');   // 분노
  // 잔상
  let tr = trails.get(b);
  if (!tr) { tr = []; trails.set(b, tr); }
  tr.push([x, y]); if (tr.length > 4) tr.shift();
  for (let i = 0; i < tr.length - 1; i++) circle(tr[i][0], tr[i][1], r * (0.45 + i * 0.12), hexA(L.fill, 0.18 + i * 0.12));
  circle(x + 2, y + 3, r, 'rgba(0,0,0,.4)');
  circle(x, y, r + 1.4, L.edge);
  circle(x, y, r, L.fill);
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
  ctx.fillStyle = mix(L.fill, '#000000', 0.25); ctx.fillRect(x - r, y + r * 0.35, r * 2, r);
  ctx.restore();
  ctx.strokeStyle = L.mark; ctx.fillStyle = L.mark; ctx.lineWidth = 2; ctx.lineCap = 'butt';
  const k = r * 0.55;
  switch (L.pat) {
    case 'flame':
      ctx.beginPath(); ctx.moveTo(x - k * 0.7, y + k * 0.5); ctx.lineTo(x, y - k * 1.1); ctx.lineTo(x + k * 0.7, y + k * 0.5); ctx.closePath(); ctx.fill();
      break;
    case 'flake':
      sq(x, y, 2, L.mark); sq(x - k, y, 2, L.mark); sq(x + k, y, 2, L.mark); sq(x, y - k, 2, L.mark); sq(x, y + k, 2, L.mark);
      break;
    case 'rivet':
      for (const [a, c] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) sq(x + a * k * 0.7, y + c * k * 0.7, 2, L.mark);
      break;
    case 'band':
      rect(x - r * 0.85, y - 2, r * 1.7, 4, L.mark);
      break;
    case 'bubble':
      sq(x + k * 0.4, y - k * 0.3, 4, L.mark); sq(x - k * 0.5, y + k * 0.45, 2, L.mark);
      break;
    case 'zigzag':
      ctx.beginPath(); ctx.moveTo(x - k, y - k * 0.4); ctx.lineTo(x - k * 0.2, y + k * 0.4); ctx.lineTo(x + k * 0.2, y - k * 0.4); ctx.lineTo(x + k, y + k * 0.4); ctx.stroke();
      break;
    case 'swirl':
      ctx.beginPath(); ctx.arc(x, y, k, 0.2, Math.PI * 1.4); ctx.stroke();
      break;
    default: // shine
      sq(x - r * 0.35, y - r * 0.38, 4, '#ffffff');
  }
  const rb = num(b.rb);                       // 무지개 충전 칸
  for (let i = 0; i < rb; i++) {
    const a = num(G && G.time) * 3 + (i / Math.max(1, rb)) * TAU;
    sq(x + Math.cos(a) * (r + 6), y + Math.sin(a) * (r + 6), 4, RAINBOW[i % RAINBOW.length]);
  }
}

function drawParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i];
    q.life -= dt; if (q.life <= 0) { parts.splice(i, 1); continue; }
    q.vy += 500 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
    sq(q.x, q.y, q.life > 0.25 ? 4 : 2, q.c);
  }
}

// ───────────── 덧그리기: 픽셀 글꼴 ─────────────
function fontPx(size) {
  // 판이 작게 보일 때(가로 화면) 글자가 12px 아래로 줄지 않게 보정 (최대 1.8배)
  return Math.round(size * Math.min(1.8, Math.max(1, 0.85 / num(view.scale, 1))));
}
function otext(g, t, x, y, size, color, align = 'center') {
  const s = fontPx(size), o = Math.max(1, Math.round(s / 12));
  g.font = `${s}px ${FONT}`;
  g.textAlign = align; g.textBaseline = 'middle';
  g.fillStyle = '#000000';
  for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o], [o, o]]) g.fillText(t, x + dx, y + dy);
  g.fillStyle = color; g.fillText(t, x, y);
}
function flushTexts(g) {
  for (const q of texts) {
    if (q.k === 't') otext(g, q.t, q.x, q.y, q.size, q.color, q.align);
    else if (q.k === 'name') {
      const s = fontPx(12);
      g.font = `${s}px ${FONT}`;
      const label = (q.boss ? '보스 ' : '') + q.t, hp = q.hp;
      const wN = g.measureText(label).width, wH = g.measureText(hp).width, gap = 6, total = wN + gap + wH + 12;
      let x0 = Math.max(4, Math.min(W - 4 - total, q.x - total / 2));
      g.fillStyle = 'rgba(0,0,0,.72)'; g.fillRect(Math.round(x0), Math.round(q.y - s / 2 - 3), Math.round(total), s + 6);
      g.fillStyle = q.boss ? '#ffcf3a' : '#5a6a60';
      g.fillRect(Math.round(x0), Math.round(q.y + s / 2 + 1), Math.round(total), 2);
      otext(g, label, x0 + 6, q.y, 12, q.boss ? '#ffcf3a' : '#ffffff', 'left');
      otext(g, hp, x0 + 6 + wN + gap, q.y, 12, '#9dffa8', 'left');
    } else if (q.k === 'badges') {
      const fs = fontPx(12), bh = fs + 4;
      g.font = `${fs}px ${FONT}`;
      const ws = q.list.map(([s]) => Math.round(g.measureText(s).width + 10));
      let bx = Math.round(q.x - (ws.reduce((a, b) => a + b, 0) + (q.list.length - 1) * 3) / 2);
      const by = Math.round(q.y);
      q.list.forEach(([s, c], i) => {
        g.fillStyle = '#000000'; g.fillRect(bx - 1, by - bh / 2 - 1, ws[i] + 2, bh + 2);
        g.fillStyle = c; g.fillRect(bx, by - bh / 2, ws[i], bh);
        g.fillStyle = '#0b0f0d'; g.fillRect(bx + 1, by - bh / 2 + 1, ws[i] - 2, bh - 2);
        g.fillStyle = c; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(s, bx + 5, by + 1);
        bx += ws[i] + 3;
      });
    }
  }
  texts.length = 0;
}

function drawFloats(dt) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.life -= dt; f.y -= 42 * dt;
    if (f.life <= 0) { floats.splice(i, 1); continue; }
    if (f.life < f.max * 0.3 && Math.floor(f.life * 20) % 2) continue;   // 사라질 때 깜빡임
    text(f.text, Math.round(f.x), Math.round(f.y / PX) * PX, f.s, f.c);
  }
  for (let i = banners.length - 1; i >= 0; i--) {
    const f = banners[i]; f.life -= dt; f.y -= 14 * dt;
    if (f.life <= 0) { banners.splice(i, 1); continue; }
    if (f.life < f.max * 0.25 && Math.floor(f.life * 16) % 2) continue;
    text(f.text, Math.max(60, Math.min(W - 60, f.x)), Math.round(f.y / PX) * PX, f.s, f.c);
  }
}

export function drawFrame(G, board, dt) {
  if (!out || !canvas || !ctx) return;
  G = G || {}; board = board || {};
  dt = Math.min(0.1, Math.max(0, num(dt, 1 / 60)));
  const wi = Math.max(0, Math.min(WORLDS.length - 1, num(G.world))), world = WORLDS[wi] || WORLDS[0];
  curSkin = SKIN[world.id] || SKIN.moss;
  const t = num(G.time);

  // 판이 바뀌면: 고정 층 다시 그림 + 판 이름·장애물 안내
  if (board !== lastBoard) {
    lastBoard = board;
    stat = { key: '', canvas: null };
    if (G.phase !== 'title' && board.gimmickName) {
      const gm = GIMMICKS[board.gimmick];
      banners.push({ x: W / 2, y: 292, text: board.frameName || '', c: world.line, s: 16, life: 2.4, max: 2.4 });
      banners.push({ x: W / 2, y: 316, text: `장애물: ${board.gimmickName}`, c: curSkin.mark, s: 14, life: 2.4, max: 2.4 });
      if (gm && gm.desc) banners.push({ x: W / 2, y: 338, text: gm.desc, c: '#d8e0da', s: 11, life: 2.4, max: 2.4 });
    }
  }
  const key = wi + '|' + (board.frame || '');
  if (stat.key !== key || !stat.canvas) stat = { key, canvas: buildStatic(board, world, wi) };

  // 저해상도 층
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, BW, BH);
  ctx.setTransform(1 / PX, 0, 0, 1 / PX, 0, 0);
  drawBoard(G, board, world, t);
  drawEnemy(G, t);
  for (const b of arr(G.balls)) if (b && b.alive !== false && typeof b.x === 'number') drawBall(b, G.material, G);
  drawFlippers(G, board);
  drawParts(dt);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  crisp(ctx, BW, BH);

  // 화면에 정수 배율로 확대
  const v = view, dpr = num(v.dpr, 1), dev = num(v.scale, 1) * dpr;      // 판 1px 당 기기 픽셀
  const k = Math.max(1, Math.floor(PX * dev + 0.08));                    // 도트 1칸 = 기기 픽셀 k개 (정수)
  const s = k / PX;                                                       // 실제 판 1px 당 기기 픽셀
  const ox = Math.round(num(v.offX) * dpr + (W * dev - W * s) / 2), oy = Math.round(num(v.offY) * dpr + (H * dev - H * s) / 2);
  out.setTransform(1, 0, 0, 1, 0, 0);
  out.imageSmoothingEnabled = false;
  out.fillStyle = world.bg[1]; out.fillRect(0, 0, canvas.width, canvas.height);
  out.drawImage(stat.canvas, ox, oy, BW * k, BH * k);
  out.drawImage(fg, ox, oy, BW * k, BH * k);

  // 글자
  drawFloats(dt);
  if (num(G.saveFlash) > 0 && Math.floor(num(G.saveFlash) * 6) % 2 === 0) text('SAVE', W / 2, 470, 30, '#7be08a');
  out.setTransform(s, 0, 0, s, ox, oy);
  flushTexts(out);
  out.setTransform(1, 0, 0, 1, 0, 0);
}
