// 바운스 브레이커 — 공 충돌 (개발자 소유, docs/구조.md)
// 공 b = { x, y, vx, vy, r }. 모든 함수는 공을 밀어내고 속도를 바꾼 뒤 접촉 정보를 돌려준다(없으면 null).

/**
 * 공 – 캡슐(선분 + 반지름) 충돌.
 * o = { bounce, kick, vx, vy (움직이는 물체 속도), omega, px, py (회전 물체: 각속도·피벗), maxV }
 * 반환: { nx, ny, cx, cy, vn } — vn 은 충돌 직전 상대 법선 속도(음수 = 들어오는 중)
 */
export function hitCapsule(b, x1, y1, x2, y2, r, o = {}) {
  const dx = x2 - x1, dy = y2 - y1;
  const L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? ((b.x - x1) * dx + (b.y - y1) * dy) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = x1 + dx * t, cy = y1 + dy * t;
  let nx = b.x - cx, ny = b.y - cy;
  const R = r + b.r;
  const d2 = nx * nx + ny * ny;
  if (d2 >= R * R) return null;
  const d = Math.sqrt(d2);
  if (d < 1e-6) {           // 정확히 겹침: 선분 수직 방향(위쪽 우선)
    const L = Math.sqrt(L2) || 1;
    nx = -dy / L; ny = dx / L;
    if (ny > 0) { nx = -nx; ny = -ny; }
    if (L2 === 0) { nx = 0; ny = -1; }
  } else { nx /= d; ny /= d; }
  // 밀어내기
  b.x = cx + nx * R; b.y = cy + ny * R;
  // 접촉면 속도 (이동 + 회전)
  let svx = o.vx || 0, svy = o.vy || 0;
  if (o.maxV) {
    const s = Math.hypot(svx, svy);
    if (s > o.maxV) { svx *= o.maxV / s; svy *= o.maxV / s; }
  }
  if (o.omega) { svx += -o.omega * (cy - o.py); svy += o.omega * (cx - o.px); }
  let rvx = b.vx - svx, rvy = b.vy - svy;
  const vn = rvx * nx + rvy * ny;
  if (vn < 0) {
    const e = o.bounce ?? 0.55;
    rvx -= (1 + e) * vn * nx; rvy -= (1 + e) * vn * ny;
  }
  if (o.kick) {             // 법선 방향 최소 튕김 속도 보장
    const out = rvx * nx + rvy * ny;
    if (out < o.kick) { rvx += (o.kick - out) * nx; rvy += (o.kick - out) * ny; }
  }
  if (o.jitter && vn < 0) { // 무한 왕복 방지: 튕긴 방향을 아주 조금 무작위로 회전
    const a = (Math.random() * 2 - 1) * o.jitter;
    const c = Math.cos(a), s = Math.sin(a);
    const tx = rvx * c - rvy * s; rvy = rvx * s + rvy * c; rvx = tx;
  }
  b.vx = rvx + svx; b.vy = rvy + svy;
  return { nx, ny, cx, cy, vn };
}

/** 공 – 원 충돌 (범퍼·적 몸체·호위병) */
export function hitCircle(b, x, y, r, o) {
  return hitCapsule(b, x, y, x, y, r, o);
}

/** 속도 상한 */
export function clampSpeed(b, max) {
  const s = Math.hypot(b.vx, b.vy);
  if (s > max) { b.vx *= max / s; b.vy *= max / s; }
}

/** 점이 사각형(레인) 안에 있는지 — 공 중심 기준 */
export function inRect(px, py, x, y, w, h) {
  return px >= x && px <= x + w && py >= y && py <= y + h;
}
