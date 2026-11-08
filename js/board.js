// 바운스 브레이커 — 판 생성 (docs/구조.md 2·5장)
// 테두리가 완전히 다른 판 5종 + 적 전용 맵(b,l,t,w,e). 판은 스테이지마다 바뀐다 (frameIndexOf).
// 판마다 범퍼가 다른 장애물(gimmick)로 바뀐다: 숨쉬는 범퍼·떠도는 범퍼·회전 막대·부서지는 바위·소용돌이.
// 발사 레인(x 345~375)과 오른쪽 위 진입 곡선만 모든 판이 공유한다.
import { CONST } from './data.js';

const D2R = Math.PI / 180;
const MAP_CX = 178.5, MAP_CY = 255;   // 기획 맵 영역(x 42~315, y 60~450)의 중심

// 공유 부분 실측값
export const FRAME = {
  laneX1: 345, laneX2: 375, laneTop: 100, laneFloor: 650, plunger: [360, 637], drainY: 690,
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
// path: 이어지는 벽 꼭짓점 목록들, slings: 튕기는 선분, extra: 추가 벽 선분
// flip: 플리퍼 피벗·길이, fit: 적 맵을 판 안쪽에 맞추는 축척(s)과 중심(cx, cy)
export const FRAMES = [
  { // 1. 팔각 요새 — 크게 깎인 네 모서리, 모서리 빗면이 슬링샷
    id: 'octagon', name: '팔각 요새', gimmick: 'pulse',
    path: [
      [[327, 20], [116, 20], [12, 124], [12, 440]],
      [[52, 500], [110, 597]],
      [[345, 440], [345, 440]],
      [[305, 500], [265, 597]],
    ],
    slings: [[12, 440, 52, 500, 'L'], [345, 440, 305, 500, 'R']],
    extra: [],
    flip: { L: [112, 600], R: [263, 600], len: 60 },
    fit: { s: 0.82, cx: 192, cy: 272 },
  },
  { // 2. 둥근 돔 — 거대한 반구형 천장, 공중에 뜬 사선 슬링
    id: 'dome', name: '둥근 돔', gimmick: 'orbit',
    path: [
      [[327, 20], [230, 20], ...arcPts(180, 232, 168, -72, -180, 16), [12, 470], [108, 604]],   // 위쪽은 평평한 천장 → 발사한 공이 레인으로 되돌아오지 않게
      [[345, 470], [267, 604]],
    ],
    slings: [[58, 452, 92, 528, 'L'], [312, 452, 278, 528, 'R']],
    extra: [],
    flip: { L: [112, 607], R: [263, 607], len: 60 },
    fit: { s: 0.74, cx: 182, cy: 292 },
  },
  { // 3. 좁은 탑 — 양옆이 안으로 들어온 좁고 긴 통로, 짧은 플리퍼
    id: 'tower', name: '좁은 탑', gimmick: 'spin',
    path: [
      [[327, 20], [88, 20], [46, 62], [46, 466]],
      [[82, 528], [122, 601]],
      [[345, 150], [316, 196], [316, 466]],
      [[280, 528], [253, 601]],
    ],
    slings: [[46, 466, 82, 528, 'L'], [316, 466, 280, 528, 'R']],
    extra: [],
    flip: { L: [124, 604], R: [251, 604], len: 52 },
    fit: { s: 0.8, cx: 182, cy: 276 },
  },
  { // 4. 지그재그 협곡 — 톱니 모양 옆벽, 넓고 긴 플리퍼, 공중 사선 슬링
    id: 'canyon', name: '지그재그 협곡', gimmick: 'crumble',
    path: [
      [[327, 20], [44, 20], [12, 52], [12, 190], [36, 222], [12, 254], [12, 316], [36, 348], [12, 380], [12, 470], [104, 594]],
      [[345, 286], [321, 318], [345, 350]],
      [[345, 470], [271, 594]],
    ],
    slings: [[60, 462, 96, 530, 'L'], [315, 462, 279, 530, 'R']],
    extra: [],
    flip: { L: [106, 597], R: [269, 597], len: 68 },
    fit: { s: 0.8, cx: 188, cy: 270 },
  },
  { // 5. 쌍둥이 깔때기 — 천장에 V자 돌기, 가운데 배수구 위 삼각 기둥
    id: 'twin', name: '쌍둥이 깔때기', gimmick: 'whirl',
    path: [
      [[327, 20], [206, 20], [178, 50], [150, 20], [42, 20], [12, 50], [12, 404], [30, 440]],
      [[62, 503], [110, 598]],
      [[345, 404], [325, 440]],
      [[293, 503], [265, 598]],
      [[187, 516], [170, 552], [204, 552], [187, 516]],
    ],
    slings: [[30, 440, 62, 503, 'L'], [325, 440, 293, 503, 'R']],
    extra: [],
    flip: { L: [112, 601], R: [263, 601], len: 60 },
    fit: { s: 0.78, cx: 182, cy: 282 },
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

/** 판 번호(0~4)를 고른다: 스테이지마다 다른 판, 월드마다 시작 판이 다르다 */
export function frameIndexOf(stage) {
  const s = Math.max(1, stage | 0), per = CONST.STAGES_PER_WORLD || 5;
  const world = Math.floor((s - 1) / per);
  return ((s - 1) % per + world) % FRAMES.length;
}

export function frameOf(idx) {
  return FRAMES[((idx | 0) % FRAMES.length + FRAMES.length) % FRAMES.length];
}

/** 적 인스턴스의 맵·위치·이동 범위를 판 모양에 맞게 축척/이동 (startStage에서 1회) */
export function fitEnemy(enemy, frameIdx) {
  if (!enemy || enemy._fit) return enemy;
  const { s, cx, cy } = frameOf(frameIdx).fit;
  const X = (x) => cx + (x - MAP_CX) * s, Y = (y) => cy + (y - MAP_CY) * s;
  const m = enemy.map || {};
  enemy.map = {
    b: (m.b || []).map(([x, y, r]) => [X(x), Y(y), r * s]),
    l: (m.l || []).map(([x, y, w, h]) => [X(x), Y(y), w * s, h * s]),
    t: (m.t || []).map(([x, y, len, a]) => [X(x), Y(y), len * s, a]),
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

export function buildBoard(enemy, frameIdx = 0) {
  const F = FRAME, WR = CONST.WALL_R, fr = frameOf(frameIdx);
  const walls = [];
  const W = (x1, y1, x2, y2, extra) => walls.push({ x1, y1, x2, y2, r: WR, ...extra });

  // ── 공유: 오른쪽 위 진입 곡선 + 발사 레인 ──
  const ent = arcPts(327, 68, 48, 270, 360, 8);
  for (let i = 1; i < ent.length; i++) W(ent[i - 1][0], ent[i - 1][1], ent[i][0], ent[i][1]);
  W(375, 68, 375, F.laneFloor + 10);                 // 레인 바깥 벽
  W(345, F.laneTop, 345, F.laneFloor + 10);          // 레인 / 필드 칸막이
  W(345, F.laneFloor, 375, F.laneFloor);             // 레인 바닥(플런저)
  W(345, F.laneTop, 345, 26, { gate: true });        // 일방 문: 필드 공이 레인으로 못 들어감

  // ── 판 고유 테두리 ──
  for (const path of fr.path) {
    for (let i = 1; i < path.length; i++) {
      const [x1, y1] = path[i - 1], [x2, y2] = path[i];
      if (x1 === x2 && y1 === y2) continue;
      W(x1, y1, x2, y2);
    }
  }
  for (const [x1, y1, x2, y2] of fr.extra) W(x1, y1, x2, y2);
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

  // ── 플리퍼 (화면 좌표 라디안, 끝점 = 피벗 + len·(cos, sin)) ──
  const len = fr.flip.len || CONST.FLIPPER_LEN;
  const flippers = {
    L: { px: fr.flip.L[0], py: fr.flip.L[1], len, r: 7, rest: CONST.FLIPPER_REST * D2R, up: -CONST.FLIPPER_UP * D2R },
    R: { px: fr.flip.R[0], py: fr.flip.R[1], len, r: 7, rest: Math.PI - CONST.FLIPPER_REST * D2R, up: Math.PI + CONST.FLIPPER_UP * D2R },
  };

  return {
    frame: fr.id, frameName: fr.name, gimmick: gm ? gm.id : '', gimmickName: gm ? gm.name : '', gt: 0,
    walls, bumpers, lanes, targets, slings, flippers,
    lane: { x1: 345, x2: 375, y1: F.laneTop, y2: F.laneFloor },
    plunger: { x: F.plunger[0], y: F.plunger[1] },
    drainY: F.drainY,
  };
}
