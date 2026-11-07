// 바운스 브레이커 — 판 생성 (개발자 소유, docs/구조.md 2·5장)
// 공통 틀(벽·발사 레인·슬링샷·플리퍼) + 적 전용 맵(b,l,t,w,e)
import { CONST } from './data.js';

const D2R = Math.PI / 180;

// 공통 틀 실측값 (render·테스트 참고용으로 export)
export const FRAME = {
  left: 12, right: 345, top: 20, laneOuter: 375,
  cornerR: 48, cornerL: [60, 68], cornerR_: [327, 68],
  laneTop: 100, laneFloor: 650, plunger: [360, 637],
  flipL: [112, 600], flipR: [263, 600], funnelY: 540,
  drainY: 690,
};

function arc(walls, cx, cy, R, a0, a1, n, r) {
  let px = cx + Math.cos(a0) * R, py = cy + Math.sin(a0) * R;
  for (let i = 1; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
    walls.push({ x1: px, y1: py, x2: x, y2: y, r });
    px = x; py = y;
  }
}

export function buildBoard(enemy) {
  const F = FRAME, WR = CONST.WALL_R;
  const walls = [];
  const W = (x1, y1, x2, y2, extra) => walls.push({ x1, y1, x2, y2, r: WR, ...extra });

  // ── 바깥 벽 ──
  // 왼쪽 위 모서리 곡선 (12,68) → (60,20)
  arc(walls, F.cornerL[0], F.cornerL[1], F.cornerR, Math.PI, Math.PI * 1.5, 8, WR);
  W(60, 20, 327, 20);                                     // 천장
  // 오른쪽 위 모서리 곡선 (327,20) → (375,68) : 발사 레인 공이 타고 왼쪽으로 진입
  arc(walls, F.cornerR_[0], F.cornerR_[1], F.cornerR, Math.PI * 1.5, Math.PI * 2, 8, WR);
  W(375, 68, 375, F.laneFloor + 10);                      // 발사 레인 바깥 벽
  W(345, F.laneTop, 345, F.laneFloor + 10);               // 레인 / 필드 칸막이
  W(345, F.laneFloor, 375, F.laneFloor);                  // 레인 바닥(플런저)
  // 레인 위쪽 일방 문: 필드로 나간 공(inLane=false)만 막는다 → 필드 공이 레인으로 못 들어감
  W(345, F.laneTop, 345, 26, { gate: true });
  W(12, 68, 12, F.funnelY);                               // 왼쪽 벽
  // 아래 깔때기 (인레인 → 플리퍼 피벗)
  W(12, F.funnelY, F.flipL[0] - 2, F.flipL[1] - 2);
  W(345, F.funnelY, F.flipR[0] + 2, F.flipR[1] - 2);

  // ── 슬링샷 (삼각형: 바깥 세로변·아랫변은 일반 벽, 빗변은 튕김) ──
  const slings = [];
  const mkSling = (side, ax, ay, bx, by, cx, cy) => {
    W(ax, ay, bx, by);                                     // 바깥 세로변 (= 인레인/아웃레인 가이드)
    W(bx, by, cx, cy);                                     // 아랫변
    slings.push({ x1: ax, y1: ay, x2: cx, y2: cy, r: WR, side, flash: 0 });
  };
  mkSling('L', 70, 480, 70, 530, 104, 552);
  mkSling('R', 305, 480, 305, 530, 271, 552);

  // ── 적 맵 ──
  const m = (enemy && enemy.map) || {};
  const bumpers = (m.b || []).map(([x, y, r]) => ({ x, y, r, flash: 0 }));
  const lanes = (m.l || []).map(([x, y, w, h]) => ({ x, y, w, h, lit: 0 }));
  const targets = (m.t || []).map(([x, y, len, ang]) => {
    const c = Math.cos(ang * D2R) * len / 2, s = Math.sin(ang * D2R) * len / 2;
    return { x1: x - c, y1: y - s, x2: x + c, y2: y + s, r: CONST.TARGET_R, down: false, timer: 0, flash: 0 };
  });
  for (const [x1, y1, x2, y2] of (m.w || [])) W(x1, y1, x2, y2, { map: true });

  // ── 플리퍼 (각도는 화면 좌표계 라디안, 끝점 = 피벗 + len·(cos, sin)) ──
  const len = CONST.FLIPPER_LEN;
  const flippers = {
    L: { px: F.flipL[0], py: F.flipL[1], len, r: 7, rest: CONST.FLIPPER_REST * D2R, up: -CONST.FLIPPER_UP * D2R },
    R: { px: F.flipR[0], py: F.flipR[1], len, r: 7, rest: Math.PI - CONST.FLIPPER_REST * D2R, up: Math.PI + CONST.FLIPPER_UP * D2R },
  };

  return {
    walls, bumpers, lanes, targets, slings, flippers,
    lane: { x1: 345, x2: 375, y1: F.laneTop, y2: F.laneFloor },
    plunger: { x: F.plunger[0], y: F.plunger[1] },
    drainY: F.drainY,
  };
}
