// 바운스 브레이커 — 판 생성 (docs/구조.md 2·5장)
// 구조 자체가 다른 판 5종 + 적 전용 맵(b,l,t,w,e). 판은 스테이지마다 바뀐다 (frameIndexOf).
//  - 발사 레인 위치(왼쪽/오른쪽), 플리퍼 수·위치, 배수구 모양, 특수 장치(킥아웃 구멍·킥백)가 판마다 다르다.
//  - 판마다 범퍼가 다른 장애물(gimmick)로 바뀐다: 숨쉬는 범퍼·떠도는 범퍼·회전 막대·부서지는 바위·소용돌이.
import { CONST } from './data.js';

const D2R = Math.PI / 180;
const MAP_CX = 178.5, MAP_CY = 255;   // 기획 맵 영역(x 42~315, y 60~450)의 중심

// 발사 레인 (side 'R' = 오른쪽 x 345~375, 'L' = 왼쪽 x 0~30)
export const FRAME = { laneTop: 100, laneFloor: 650, plungerY: 637, drainY: 690 };
const LANES = {
  R: { x1: 345, x2: 375, inner: 345, outer: 375, arc: [327, 68, 48, 270, 360], ceil: [327, 20] },
  L: { x1: 0, x2: 30, inner: 30, outer: 0, arc: [48, 68, 48, 180, 270], ceil: [48, 20] },
};

function arcPts(cx, cy, R, a0, a1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + (a1 - a0) * (i / n)) * D2R;
    pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
  }
  return pts;
}

// ── 판 5종 ──
// lane: 발사 레인 쪽 · path: 이어지는 벽 꼭짓점 목록들 · slings: 튕기는 선분 [x1,y1,x2,y2,side]
// flip: 아래 플리퍼 피벗·길이 · flips2: 추가 플리퍼 [{side, px, py, len}] (같은 쪽 버튼으로 함께 움직임)
// pockets: 킥아웃 구멍 [x, y, r] (공을 잡았다가 적을 향해 쏨) · kickbacks: 킥백 [x, y, w, h] (빠지는 공을 위로 쳐 올림)
// fit: 적 맵을 판 안에 맞추는 축척(s)·중심(cx, cy)·좌우 뒤집기(mirror: 레인이 왼쪽이면 입구 자리를 비우려고)
export const FRAMES = [
  { // 1. 거울 요새 — 발사대가 왼쪽, 오른쪽 벽 중간에 세 번째 플리퍼
    id: 'mirror', name: '거울 요새', gimmick: 'pulse', lane: 'L',
    path: [
      [[48, 20], [250, 20], ...arcPts(250, 133, 113, -90, 0, 8), [363, 440]],
      [[323, 500], [283, 597]],
      [[70, 500], [128, 597]],
    ],
    slings: [[30, 440, 70, 500, 'L'], [363, 440, 323, 500, 'R']],
    flip: { L: [130, 600], R: [281, 600], len: 60 },
    flips2: [{ side: 'R', px: 354, py: 300, len: 44 }],
    pockets: [], kickbacks: [],
    fit: { s: 0.72, cx: 190, cy: 268, mirror: true },
  },
  { // 2. 모래시계 — 가운데가 잘록한 두 방, 허리에 작은 플리퍼 2개 (플리퍼 4개)
    id: 'hourglass', name: '모래시계', gimmick: 'orbit', lane: 'R',
    path: [
      [[327, 20], [60, 20], [12, 68], [12, 330], [110, 452]],
      [[345, 330], [247, 452]],
      [[100, 466], [30, 527], [30, 545]],
      [[64, 588], [110, 598]],
      [[257, 466], [327, 527], [327, 545]],
      [[293, 588], [265, 598]],
    ],
    slings: [[30, 545, 64, 588, 'L'], [327, 545, 293, 588, 'R']],
    flip: { L: [112, 600], R: [263, 600], len: 60 },
    flips2: [{ side: 'L', px: 110, py: 452, len: 40 }, { side: 'R', px: 247, py: 452, len: 40 }],
    pockets: [], kickbacks: [],
    fit: { s: 0.66, cx: 178, cy: 200 },
  },
  { // 3. 킥아웃 계곡 — 왼쪽 벽에 킥아웃 구멍, 왼쪽 바깥 통로(아웃레인)에 킥백
    id: 'pocket', name: '킥아웃 계곡', gimmick: 'spin', lane: 'R',
    path: [
      [[327, 20], [60, 20], [12, 68], [12, 660]],
      [[56, 430], [56, 505]],
      [[86, 556], [110, 597]],
      [[305, 490], [265, 597]],
    ],
    slings: [[56, 505, 86, 556, 'L'], [345, 420, 305, 490, 'R']],
    flip: { L: [112, 600], R: [263, 600], len: 60 },
    flips2: [],
    pockets: [[34, 250, 14]],
    kickbacks: [[14, 572, 40, 52]],
    fit: { s: 0.78, cx: 196, cy: 250 },
  },
  { // 4. 두 갈래 섬 — 가운데 섬이 배수구를 둘로 나눔, 플리퍼가 양쪽 벽에 붙음
    id: 'island', name: '두 갈래 섬', gimmick: 'crumble', lane: 'R',
    path: [
      [[327, 20], [100, 20], [12, 108], [12, 470], [40, 588]],
      [[345, 470], [335, 588]],
      [[130, 600], [244, 600]],
    ],
    slings: [[130, 600, 187, 505, 'L'], [244, 600, 187, 505, 'R']],
    flip: { L: [40, 590], R: [335, 590], len: 64 },
    flips2: [],
    pockets: [], kickbacks: [],
    fit: { s: 0.8, cx: 182, cy: 262 },
  },
  { // 5. 쌍둥이 포켓 — 발사대가 왼쪽, 양쪽 벽에 킥아웃 구멍, 넓은 플리퍼
    id: 'twinpocket', name: '쌍둥이 포켓', gimmick: 'whirl', lane: 'L',
    path: [
      [[48, 20], [300, 20], [363, 83], [363, 450]],
      [[330, 505], [290, 596]],
      [[63, 505], [103, 596]],
    ],
    slings: [[30, 450, 63, 505, 'L'], [363, 450, 330, 505, 'R']],
    flip: { L: [105, 600], R: [288, 600], len: 66 },
    flips2: [],
    pockets: [[52, 215, 14], [341, 215, 14]],
    kickbacks: [],
    fit: { s: 0.74, cx: 196, cy: 258, mirror: true },
  },
];

// 장애물 종류 — 범퍼 자리에 놓인다 (수치는 main.js updateGimmicks / collideBall 이 사용)
export const GIMMICKS = {
  pulse:   { id: 'pulse',   name: '숨쉬는 범퍼', desc: '커졌다 작아졌다 한다. 클 때 더 세게 튕긴다.', amp: 0.28, spd: 2.4 },
  orbit:   { id: 'orbit',   name: '떠도는 범퍼', desc: '범퍼들이 함께 작은 원을 그리며 떠다닌다.', rad: 9, spd: 1.3 },
  spin:    { id: 'spin',    name: '회전 막대',   desc: '빙글빙글 도는 막대가 공을 쳐낸다.', spd: 2.6, w: 5, extra: 3 },
  crumble: { id: 'crumble', name: '부서지는 바위', desc: '3번 맞으면 부서지며 큰 피해, 5초 뒤 다시 생긴다.', hits: 3, respawn: 5 },
  whirl:   { id: 'whirl',   name: '소용돌이',     desc: '가까이 온 공을 범퍼 쪽으로 끌어당긴다.', range: 62, pull: 650 },
};
// 판 특수 장치 수치
export const DEVICES = {
  pocket:   { hold: 0.7, speed: 1250, cd: 1.2 },    // 킥아웃 구멍: 잡는 시간, 쏘는 속도, 다시 잡기까지
  kickback: { vy: -1500, cd: 9 },                   // 킥백: 쳐 올리는 속도, 재충전 시간
};

/** 판 번호(0~4)를 고른다: 스테이지마다 다른 판, 월드마다 시작 판이 다르다 */
export function frameIndexOf(stage) {
  const s = Math.max(1, stage | 0), per = CONST.STAGES_PER_WORLD || 5;
  const world = Math.floor((s - 1) / per);
  return ((s - 1) % per + world) % FRAMES.length;
}

export function frameOf(idx) {
  return FRAMES[((idx | 0) % FRAMES.length + FRAMES.length) % FRAMES.length];
}

/** 적 인스턴스의 맵·위치·이동 범위를 판 모양에 맞게 축척/이동/뒤집기 (startStage에서 1회) */
export function fitEnemy(enemy, frameIdx) {
  if (!enemy || enemy._fit) return enemy;
  const { s, cx, cy, mirror } = frameOf(frameIdx).fit;
  const sx = mirror ? -s : s;
  const X = (x) => cx + (x - MAP_CX) * sx, Y = (y) => cy + (y - MAP_CY) * s;
  const m = enemy.map || {};
  enemy.map = {
    b: (m.b || []).map(([x, y, r]) => [X(x), Y(y), r * s]),
    l: (m.l || []).map(([x, y, w, h]) => [mirror ? X(x + w) : X(x), Y(y), w * s, h * s]),
    t: (m.t || []).map(([x, y, len, a]) => [X(x), Y(y), len * s, mirror ? 180 - a : a]),
    w: (m.w || []).map(([x1, y1, x2, y2]) => [X(x1), Y(y1), X(x2), Y(y2)]),
    e: m.e ? [X(m.e[0]), Y(m.e[1]), m.e[2] * s] : undefined,
  };
  enemy.x = X(enemy.x); enemy.y = Y(enemy.y);
  enemy.x0 = X(enemy.x0); enemy.y0 = Y(enemy.y0);
  enemy.r *= s;
  for (const a of enemy.abil || []) {
    if (typeof a.ax === 'number') a.ax *= s;
    if (typeof a.ay === 'number') a.ay *= s;
    if (typeof a.orbit === 'number') a.orbit *= s;
    if (Array.isArray(a.pts)) a.pts = a.pts.map(([x, y]) => [X(x), Y(y)]);
  }
  for (const g of enemy.guards || []) { g.x = X(g.x); g.y = Y(g.y); }
  enemy._fit = true;
  return enemy;
}

function flipperOf(side, px, py, len) {
  const rest = CONST.FLIPPER_REST * D2R, up = CONST.FLIPPER_UP * D2R;
  return side === 'L'
    ? { side, px, py, len, r: 7, rest, up: -up }
    : { side, px, py, len, r: 7, rest: Math.PI - rest, up: Math.PI + up };
}

export function buildBoard(enemy, frameIdx = 0) {
  const F = FRAME, WR = CONST.WALL_R, fr = frameOf(frameIdx);
  const LN = LANES[fr.lane] || LANES.R;
  const walls = [];
  const W = (x1, y1, x2, y2, extra) => walls.push({ x1, y1, x2, y2, r: WR, ...extra });

  // ── 발사 레인 + 진입 곡선 ──
  const [ax, ay, ar, a0, a1] = LN.arc;
  const ent = arcPts(ax, ay, ar, a0, a1, 8);
  for (let i = 1; i < ent.length; i++) W(ent[i - 1][0], ent[i - 1][1], ent[i][0], ent[i][1]);
  W(LN.outer, 68, LN.outer, F.laneFloor + 10);                 // 레인 바깥 벽
  W(LN.inner, F.laneTop, LN.inner, F.laneFloor + 10);          // 레인 / 필드 칸막이
  W(LN.x1, F.laneFloor, LN.x2, F.laneFloor);                   // 레인 바닥(플런저)
  W(LN.inner, F.laneTop, LN.inner, 26, { gate: true });        // 일방 문: 필드 공이 레인으로 못 들어감

  // ── 판 고유 테두리 ──
  for (const path of fr.path) {
    for (let i = 1; i < path.length; i++) {
      const [x1, y1] = path[i - 1], [x2, y2] = path[i];
      if (x1 === x2 && y1 === y2) continue;
      W(x1, y1, x2, y2);
    }
  }
  const slings = fr.slings.map(([x1, y1, x2, y2, side]) => ({ x1, y1, x2, y2, r: WR, side, flash: 0 }));

  // ── 적 맵 (fitEnemy로 이미 판에 맞춰진 좌표) ──
  const m = (enemy && enemy.map) || {};
  const gm = GIMMICKS[fr.gimmick] || null;
  const bumpers = (m.b || []).map(([x, y, r], i) => ({
    x, y, r, flash: 0,
    kind: gm ? gm.id : 'bumper', x0: x, y0: y, r0: r, vx: 0, vy: 0, i,
    ph: i * 1.7,                                   // 숨쉬기·회전 위상
    ang: (i * 47) % 180 * D2R,                     // 회전 막대 시작 각도
    hp: gm && gm.id === 'crumble' ? gm.hits : 0, broken: 0,
  }));
  const lanes = (m.l || []).map(([x, y, w, h]) => ({ x, y, w, h, lit: 0 }));
  const targets = (m.t || []).map(([x, y, len, ang]) => {
    const c = Math.cos(ang * D2R) * len / 2, s = Math.sin(ang * D2R) * len / 2;
    return { x1: x - c, y1: y - s, x2: x + c, y2: y + s, r: CONST.TARGET_R, down: false, timer: 0, flash: 0 };
  });
  for (const [x1, y1, x2, y2] of (m.w || [])) W(x1, y1, x2, y2, { map: true });

  // ── 플리퍼: 아래 두 개 + 추가 플리퍼 (같은 쪽은 각도를 함께 씀: G.flippers[side]) ──
  const len = fr.flip.len || CONST.FLIPPER_LEN;
  const flippers = { L: flipperOf('L', fr.flip.L[0], fr.flip.L[1], len), R: flipperOf('R', fr.flip.R[0], fr.flip.R[1], len) };
  const flipperList = [flippers.L, flippers.R, ...(fr.flips2 || []).map((f) => flipperOf(f.side, f.px, f.py, f.len))];

  // ── 특수 장치 ──
  const pockets = (fr.pockets || []).map(([x, y, r]) => ({ x, y, r, cd: 0, lit: 0 }));
  const kickbacks = (fr.kickbacks || []).map(([x, y, w, h]) => ({ x, y, w, h, cd: 0, lit: 0 }));

  const midX = fr.lane === 'L' ? 196 : 178;
  return {
    frame: fr.id, frameName: fr.name, gimmick: gm ? gm.id : '', gimmickName: gm ? gm.name : '', gt: 0,
    walls, bumpers, lanes, targets, slings, flippers, flipperList, pockets, kickbacks,
    lane: { x1: LN.x1, x2: LN.x2, y1: F.laneTop, y2: F.laneFloor, side: fr.lane === 'L' ? 'L' : 'R' },
    plunger: { x: (LN.x1 + LN.x2) / 2, y: F.plungerY },
    spawn: [midX, 80],
    drainY: F.drainY,
  };
}

/** 공이 발사 레인 띠 안에 있는지 (레인을 벗어나면 필드 공) */
export function inLaneBand(board, x) {
  const L = board.lane;
  return L.side === 'L' ? x <= L.x2 + 17 : x >= L.x1 - 17;
}
