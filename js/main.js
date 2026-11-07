// 바운스 브레이커 — 게임 상태·루프·입력·데미지·적 능력 (개발자 소유, docs/구조.md · 기획서 8장)
import { CONST as C, DAMAGE, STATUS, MATERIALS, ABIL_LABEL, makeEnemy, rollCards, worldOf, calcStats } from './data.js';
import { bus, store } from './events.js';
import { buildBoard } from './board.js';
import { hitCapsule, hitCircle, clampSpeed, inRect } from './physics.js';

const DEBUG = new URLSearchParams(location.search).has('debug');
const R = await import('./render.js').catch((e) => (console.warn('[render.js 없음]', e.message), null));
const U = await import('./ui.js').catch((e) => (console.warn('[ui.js 없음]', e.message), null));

const SUB = C.SUBSTEP;
const JITTER = 0.09;        // 튕김 방향 무작위 회전 최대치(rad, 약 5°)
const LOOP_R = 70;          // 이 반경 안에서만 맴돌면 루프로 판단
const LOOP_TIME = 3;        // 초
const LOOP_SAFE_Y = 560;    // 이보다 아래(플리퍼 근처)는 루프 감지 제외
const KICK_FREE = 10;       // 플리퍼 없이 이 횟수까지는 튕김 힘 100%
const KICK_DECAY = 0.8;     // 그 뒤 한 번마다 힘 ×0.8
const LANE_STUCK = 2.5;     // 발사 레인에 이 시간(초) 넘게 있으면 발사대로 되돌림
const DIRECT = new Set(['bumper', 'lane', 'target', 'body', 'bank', 'chain']);
const rng = Math.random;

let G = null;
let board = buildBoard(null);
let pendingChain = false;

// ───────────────────────── 상태 ─────────────────────────
function loadBest() {
  const b = store.get('bb.best', null);
  return (b && typeof b === 'object') ? { score: b.score | 0, stage: b.stage | 0 } : { score: 0, stage: 0 };
}
function saveBest() {
  const b = loadBest();
  const nb = { score: Math.max(b.score, G.score), stage: Math.max(b.stage, G.stage) };
  store.set('bb.best', nb);
  G.best = nb.score; G.bestStage = nb.stage;
}

function newRun() {
  const best = loadBest();
  const prevPhase = G ? G.phase : 'title';
  G = {
    phase: prevPhase, stage: 1, world: 0, score: 0, best: best.score, bestStage: best.stage, time: 0,
    ballsLeft: C.BALLS_PER_RUN,
    material: 'normal', traits: [], upgrades: {},
    enemy: null, balls: [],
    plunger: { charge: 0, holding: false },
    flippers: { L: { angle: 0, up: false, av: 0 }, R: { angle: 0, up: false, av: 0 } },
    cards: [], stats: {},
    // 추가 필드 (개발자): render/ui 참고용
    pausedFrom: null, launchT: 0, multiT: 0, chainCount: 0, saveFlash: 0, muted: !!store.get('bb.muted', false),
  };
  G.stats = calcStats(G);
  if (DEBUG) { window.__bb.G = G; }
}

function setPhase(p) {
  const prev = G.phase;
  if (prev === p) return;
  G.phase = p;
  bus.emit('phase', { phase: p, prev });
}

function startStage(n) {
  G.stage = n;
  G.world = worldOf(n);
  G.enemy = makeEnemy(n);
  board = buildBoard(G.enemy);
  if (DEBUG) window.__bb.board = board;
  G.chainCount = 0; G.multiT = 0; G.cards = [];
  G.flippers.L.angle = board.flippers.L.rest; G.flippers.R.angle = board.flippers.R.rest;
  bus.emit('stageStart', { stage: n, world: G.world, enemy: G.enemy });
  toLaunch();
}

function makeBall(x, y, vx = 0, vy = 0, inLane = false) {
  return { x, y, vx, vy, r: inLane ? C.BALL_R : G.stats.ballR, alive: true, inLane, rest: false, slowT: 0, wallT: 0, kicks: 0, laneT: 0 };
}

function toLaunch() {
  const b = makeBall(board.plunger.x, board.plunger.y, 0, 0, true);
  b.rest = true;
  G.balls = [b];
  G.plunger.charge = 0; G.plunger.holding = false;
  setPhase('launch');
}

function launch(power) {
  if (G.phase !== 'launch') return;
  power = Math.max(0, Math.min(1, power ?? G.plunger.charge));
  const b = G.balls.find((x) => x.rest) || G.balls[0];
  if (!b) return;
  b.rest = false;
  b.vy = -(C.LAUNCH_MIN + (C.LAUNCH_MAX - C.LAUNCH_MIN) * power);
  G.plunger.charge = 0; G.plunger.holding = false;
  G.launchT = 0;
  setPhase('play');
  bus.emit('launch', { power });
}

// ───────────────────────── 데미지 (기획서 8장 A) ─────────────────────────
function armorFlat(e) {
  const a = e.abil.find((x) => x.t === 'armor');
  return a ? a.flat : 0;
}

function statusOn(name, on) { bus.emit('status', { status: name, on }); }

function applyMaterial(src) {
  const st = G.enemy.status, S = G.stats;
  const sp = (MATERIALS[G.material] || MATERIALS.normal).special;
  if (sp === 'burn') {
    if (st.burn === 0) statusOn('burn', true);
    st.burn = Math.min(STATUS.burn.max, st.burn + STATUS.burn.perHit);
    st.burnT = STATUS.burn.dur;
  } else if (sp === 'poison') {
    st.poisonHits++;
    if (st.poisonHits >= STATUS.poison.perHits) {
      st.poisonHits = 0;
      if (st.poison === 0) statusOn('poison', true);
      st.poison = Math.min(STATUS.poison.max, st.poison + 1);
    }
  } else if (sp === 'freeze') {
    if (st.freezeCd <= 0 && st.freeze <= 0 && rng() < S.freezeChance) {
      st.freeze = STATUS.freeze.dur; st.freezeCd = STATUS.freeze.cd;
      statusOn('freeze', true);
    }
  } else if (sp === 'chain' && src !== 'chain') {
    G.chainCount++;
    if (G.chainCount % STATUS.chain.every === 0) pendingChain = true;
  }
}

/** hit(src, obj, x, y, amt) — amt: burn/poison 틱 피해 */
function hit(src, obj, x, y, amt = 0) {
  const e = G.enemy;
  if (!e || e.hp <= 0 || G.phase !== 'play') return 0;
  // 1. 재타격 쿨다운
  if (obj) {
    const cd = src === 'lane' ? C.LANE_CD : C.HIT_CD;
    if (G.time - (obj._t ?? -99) < cd) return 0;
    obj._t = G.time;
  }
  const st = e.status, S = G.stats;
  const direct = DIRECT.has(src);
  const dot = src === 'burn' || src === 'poison';
  x = x ?? e.x; y = y ?? e.y;
  // 2. 재질 효과 (막혀도 적용)
  if (direct) applyMaterial(src);
  // 3. 보호막
  if (st.shield > 0 && (direct || src === 'burn')) {
    st.shield = Math.max(0, st.shield - S.shieldHits);
    bus.emit('hit', { x, y, amount: 0, kind: 'shield', src });
    if (st.shield === 0) statusOn('shield', false);
    flushChain();
    return 0;
  }
  // 4~5. 기본 × 출처 배수
  let raw;
  if (src === 'chain') raw = DAMAGE.bumper * S.chainMul;
  else if (dot) raw = amt * S.dotMul;
  else {
    raw = DAMAGE[src] || 0;
    raw *= src === 'bumper' ? S.bumperMul : src === 'lane' ? S.laneMul
         : (src === 'target' || src === 'bank') ? S.targetMul : src === 'body' ? S.bodyMul : 1;
  }
  // 6. 공통 배수
  if (!dot) raw *= S.dmgMul;
  // 7. 원소
  let kind = 'normal';
  if (direct && st.adapt > 0) { raw *= S.resistMul; kind = 'resist'; }
  else if (G.material !== 'normal' && G.material === e.weak) { raw *= S.weakMul; kind = 'weak'; }
  else if (G.material !== 'normal' && G.material === e.resist) { raw *= S.resistMul; kind = 'resist'; }
  // 8. 치명
  if (direct && rng() < S.critChance) { raw *= S.critMul; kind = 'crit'; }
  // 9. 빙결·마무리
  if (st.freeze > 0) raw *= STATUS.freeze.takenMul;
  if (S.finisher && e.hp <= e.maxHp * 0.2) raw *= 1.5;
  // 10. 갑옷
  let dmg;
  if (direct) {
    const a = Math.max(0, armorFlat(e) - S.armorCut) * S.armorMul * (st.burn > 0 ? STATUS.burn.armorCut : 1);
    dmg = Math.max(DAMAGE.min, Math.round(raw - a));
  } else dmg = Math.max(DAMAGE.min, Math.round(raw));
  if (dot) kind = 'dot';
  // 11. 적용
  e.hp = Math.max(0, e.hp - dmg);
  G.score += dmg * C.SCORE_PER_DMG;
  bus.emit('hit', { x, y, amount: dmg, kind, src });
  const rage = e.abil.find((a) => a.t === 'rage');
  if (rage && !st.raged && e.hp > 0 && e.hp <= rage.at * e.maxHp) {
    st.raged = true;
    bus.emit('ability', { t: 'rage', label: ABIL_LABEL.rage, x: e.x, y: e.y });
  }
  if (e.hp <= 0) { pendingChain = false; defeat(); return dmg; }
  flushChain();
  return dmg;
}

function flushChain() {
  if (!pendingChain) return;
  pendingChain = false;
  const e = G.enemy;
  for (const g of e.guards) g.hp -= 1;
  e.guards = e.guards.filter((g) => g.hp > 0);
  hit('chain', null, e.x, e.y);
}

function hitGuard(g) {
  if (G.time - (g._t ?? -99) < C.HIT_CD) return;
  g._t = G.time;
  g.hp -= G.stats.guardHits;
  bus.emit('hit', { x: g.x, y: g.y, amount: 0, kind: 'shield', src: 'guard' });
  if (g.hp <= 0) G.enemy.guards = G.enemy.guards.filter((x) => x !== g);
}

function defeat() {
  const e = G.enemy;
  bus.emit('enemyDefeated', { stage: G.stage, boss: e.boss });
  G.score += C.SCORE_STAGE * G.stage + (e.boss ? C.SCORE_BOSS : 0);
  if (e.boss) G.ballsLeft = Math.min(C.MAX_BALLS, G.ballsLeft + C.BOSS_BALL);
  G.balls = [];
  for (const k of ['L', 'R']) G.flippers[k].up = false;
  if (G.stage >= C.STAGES) {
    saveBest();
    setPhase('victory');
    bus.emit('victory', { score: G.score, best: G.best });
    return;
  }
  saveBest();
  G.cards = rollCards(G, rng);
  setPhase('cards');
  bus.emit('cards', { cards: G.cards });
}

function chooseCard(i) {
  if (G.phase !== 'cards') return;
  const card = G.cards[i];
  if (!card) return;
  if (card.kind === 'material') G.material = card.id;
  else if (card.kind === 'trait') { if (!G.traits.includes(card.id) && G.traits.length < 4) G.traits.push(card.id); }
  else if (card.kind === 'upgrade') {
    G.upgrades[card.id] = (G.upgrades[card.id] || 0) + 1;
    if (card.id === 'extraBall') G.ballsLeft = Math.min(C.MAX_BALLS, G.ballsLeft + 1);
  }
  G.stats = calcStats(G);
  bus.emit('cardChosen', { card });
  startStage(G.stage + 1);
}

// ───────────────────────── 적 이동·능력 (8장 B) ─────────────────────────
function abilOf(t) { return G.enemy.abil.find((a) => a.t === t); }

function moveEnemy(dt) {
  const e = G.enemy;
  if (!e) return;
  const st = e.status;
  const ox = e.x, oy = e.y;
  const frozen = st.freeze > 0;
  const mv = abilOf('move');
  const rage = abilOf('rage');
  if (mv) {
    if (!frozen) e.t += dt * (st.raged && rage ? rage.spdMul : 1);
    e.x = e.x0 + mv.ax * Math.sin(mv.spd * e.t);
    e.y = e.y0 + mv.ay * Math.sin(2 * mv.spd * e.t);
  } else { e.x = e.x0; e.y = e.y0; }
  const lim = (v) => Math.max(-C.ENTITY_MAX_V, Math.min(C.ENTITY_MAX_V, v));
  e.vx = lim((e.x - ox) / dt); e.vy = lim((e.y - oy) / dt);
  const g = abilOf('guard');
  if (g) {
    for (const q of e.guards) {
      if (!frozen) q.ang += g.spd * dt * (st.raged && rage ? rage.spdMul : 1);
      const nx = e.x + Math.cos(q.ang) * g.orbit, ny = e.y + Math.sin(q.ang) * g.orbit;
      q.vx = lim((nx - q.x) / dt); q.vy = lim((ny - q.y) / dt);
      q.x = nx; q.y = ny;
    }
  }
}

function warnStart(a) {
  const st = G.enemy.status;
  if (a.t === 'tilt') st.tiltDir = rng() < 0.5 ? -1 : 1;
  if (a.t === 'jam') st.jamSide = rng() < 0.5 ? 'L' : 'R';
}

function triggerAbility(a) {
  const e = G.enemy, st = e.status, S = G.stats;
  switch (a.t) {
    case 'shield':
      if (st.shield <= 0) statusOn('shield', true);
      st.shield = Math.max(st.shield, a.hits); break;
    case 'heal': {
      const amt = e.maxHp * a.pct * (1 - S.healCut) * (st.poison > 0 ? 1 - STATUS.poison.healCut : 1);
      e.hp = Math.min(e.maxHp, e.hp + Math.round(amt)); break;
    }
    case 'guard':
      if (e.guards.length < a.n) {
        const ang = e.guards.length ? e.guards[0].ang + Math.PI : 0;
        e.guards.push({ x: e.x + Math.cos(ang) * a.orbit, y: e.y + Math.sin(ang) * a.orbit,
                        r: C.GUARD_R, vx: 0, vy: 0, ang, hp: C.GUARD_HITS });
      } else return false;   // 보충할 게 없으면 조용히
      break;
    case 'tp': {
      const n = (e.tpIdx + 1) % a.pts.length;
      const [tx, ty] = a.pts[n];
      if (G.balls.some((b) => !b.rest && Math.hypot(b.x - tx, b.y - ty) < e.r + 30)) { a.timer = 0.1; return null; }
      e.tpIdx = n; e.x0 = tx; e.y0 = ty; break;
    }
    case 'push':
      for (const b of G.balls) {
        if (b.rest || b.inLane) continue;
        const dx = b.x - e.x, dy = b.y - e.y, d = Math.hypot(dx, dy);
        if (d < a.radius && d > 0.01) {
          const f = a.power * (1 - d / a.radius) * S.forceMul;
          b.vx += dx / d * f; b.vy += dy / d * f;
        }
      }
      break;
    case 'tilt':
      if (!st.tiltDir) st.tiltDir = rng() < 0.5 ? -1 : 1;
      st.tilt = a.dur; st.tiltAx = a.ax; statusOn('tilt', true); break;
    case 'jam':
      if (!st.jamSide) st.jamSide = rng() < 0.5 ? 'L' : 'R';
      if (!S.jamImmune) { st.jam = a.dur; statusOn('jam', true); }
      break;
    case 'adapt':
      st.adapt = a.dur; statusOn('adapt', true); break;
    default: return false;
  }
  bus.emit('ability', { t: a.t, label: ABIL_LABEL[a.t] || a.t, x: e.x, y: e.y });
  return true;
}

function updateAbilities(dt) {
  const e = G.enemy, st = e.status;
  if (st.freeze > 0) return;            // 빙결 중 타이머 정지
  const rage = abilOf('rage');
  for (const a of e.abil) {
    if (!a.every || a.t === 'move' || a.t === 'armor' || a.t === 'rage') continue;
    const prevWarn = a.warn;
    a.timer -= dt;
    a.warn = a.timer <= C.ABIL_WARN ? 1 : 0;
    if (a.warn && !prevWarn) warnStart(a);
    if (a.timer <= 0) {
      const r = triggerAbility(a);
      if (r === null) continue;         // tp 미룸
      a.timer = a.every * G.stats.cdMul * (st.raged && rage ? rage.cdMul : 1);
      a.warn = 0;
    }
  }
}

function updateStatus(dt) {
  const e = G.enemy, st = e.status, S = G.stats;
  if (st.freeze > 0) { st.freeze -= dt; if (st.freeze <= 0) { st.freeze = 0; statusOn('freeze', false); } }
  if (st.freezeCd > 0) st.freezeCd -= dt;
  if (st.burn > 0) {
    st.burnT -= dt;
    st.burnTick = (st.burnTick || 0) + dt;
    if (st.burnTick >= STATUS.burn.tick) {
      st.burnTick -= STATUS.burn.tick;
      hit('burn', null, e.x, e.y, st.burn * STATUS.burn.dmg * S.specialScale);
      if (G.phase !== 'play') return;
    }
    if (st.burnT <= 0) { st.burn = 0; st.burnTick = 0; statusOn('burn', false); }
  }
  if (st.poison > 0) {
    st.poisonTick = (st.poisonTick || 0) + dt;
    if (st.poisonTick >= STATUS.poison.tick) {
      st.poisonTick -= STATUS.poison.tick;
      hit('poison', null, e.x, e.y, st.poison * STATUS.poison.dmg * S.specialScale);
      if (G.phase !== 'play') return;
    }
  }
  for (const k of ['tilt', 'jam', 'adapt']) {
    if (st[k] > 0) {
      st[k] -= dt;
      if (st[k] <= 0) {
        st[k] = 0; statusOn(k, false);
        if (k === 'tilt') st.tiltDir = 0;
        if (k === 'jam') st.jamSide = '';
      }
    }
  }
}

// ───────────────────────── 물리 ─────────────────────────
function emitBump(x, y, type, strength) { bus.emit('bump', { x, y, type, strength: Math.min(1, strength) }); }

function flipperUpdate(dt) {
  const st = G.enemy ? G.enemy.status : null;
  for (const k of ['L', 'R']) {
    const f = G.flippers[k], bf = board.flippers[k];
    let want = f.up;
    if (st && st.jam > 0 && st.jamSide === k) want = false;
    const target = want ? bf.up : bf.rest;
    const step = C.FLIPPER_SPEED * dt;
    const d = target - f.angle;
    const old = f.angle;
    f.angle = Math.abs(d) <= step ? target : f.angle + Math.sign(d) * step;
    f.av = (f.angle - old) / dt;
  }
}

// 무한 튕김 방지: 플리퍼에 닿지 않고 KICK_FREE 회를 넘게 연속으로 튕기면 차내는 힘이 점점 약해진다
function kickFactor(b) {
  const n = (b.kicks || 0) - KICK_FREE;
  return n <= 0 ? 1 : Math.max(0, Math.pow(KICK_DECAY, n));
}

function collideBall(b) {
  const S = G.stats, e = G.enemy;
  // 벽
  for (const w of board.walls) {
    if (w.gate && b.inLane) continue;
    const c = hitCapsule(b, w.x1, w.y1, w.x2, w.y2, w.r, { bounce: C.WALL_BOUNCE, jitter: w.map ? JITTER : 0 });
    if (c && c.vn < -250 && G.time - b.wallT > 0.08) { b.wallT = G.time; emitBump(b.x, b.y, 'wall', -c.vn / 1500); }
  }
  if (b.inLane) return;
  // 슬링샷
  for (const s of board.slings) {
    const c = hitCapsule(b, s.x1, s.y1, s.x2, s.y2, s.r, { bounce: 0.5, kick: C.SLING_KICK * S.kickMul * kickFactor(b), jitter: JITTER });
    if (c) { b.kicks++; s.flash = 1; emitBump(b.x, b.y, 'sling', 0.8); }
  }
  // 범퍼
  for (const p of board.bumpers) {
    const c = hitCircle(b, p.x, p.y, p.r, { bounce: 0.6, kick: C.BUMPER_KICK * S.kickMul * kickFactor(b), jitter: JITTER });
    if (c) { b.kicks++; p.flash = 1; emitBump(p.x, p.y, 'bumper', 1); hit('bumper', p, p.x, p.y); if (G.phase !== 'play') return; }
  }
  // 드롭 타깃
  for (const t of board.targets) {
    if (t.down) continue;
    const c = hitCapsule(b, t.x1, t.y1, t.x2, t.y2, t.r, { bounce: 0.5 });
    if (c) {
      t.down = true; t.timer = S.targetReset; t.flash = 1;
      emitBump((t.x1 + t.x2) / 2, (t.y1 + t.y2) / 2, 'target', 0.9);
      hit('target', t, (t.x1 + t.x2) / 2, (t.y1 + t.y2) / 2);
      if (G.phase !== 'play') return;
      if (board.targets.every((q) => q.down)) {
        hit('bank', null, (t.x1 + t.x2) / 2, (t.y1 + t.y2) / 2);
        if (G.phase !== 'play') return;
        for (const q of board.targets) { q.down = false; q.timer = 0; q.flash = 1; }
      }
    }
  }
  // 적 몸체
  if (e && e.hp > 0) {
    const c = hitCircle(b, e.x, e.y, e.r, { bounce: 0.6, kick: 260 * kickFactor(b), vx: e.vx, vy: e.vy, maxV: C.ENTITY_MAX_V, jitter: JITTER });
    if (c) { b.kicks++; emitBump(b.x, b.y, 'wall', 0.6); hit('body', e, b.x - c.nx * b.r, b.y - c.ny * b.r); if (G.phase !== 'play') return; }
    for (const g of e.guards.slice()) {
      const c2 = hitCircle(b, g.x, g.y, g.r, { bounce: 0.6, kick: 220 * kickFactor(b), vx: g.vx, vy: g.vy, maxV: C.ENTITY_MAX_V, jitter: JITTER });
      if (c2) { b.kicks++; hitGuard(g); }
    }
  }
  // 플리퍼
  for (const k of ['L', 'R']) {
    const f = G.flippers[k], bf = board.flippers[k];
    const tx = bf.px + Math.cos(f.angle) * bf.len, ty = bf.py + Math.sin(f.angle) * bf.len;
    const c = hitCapsule(b, bf.px, bf.py, tx, ty, bf.r, { bounce: 0.3, omega: f.av, px: bf.px, py: bf.py });
    if (c) b.kicks = 0;          // 플리퍼에 닿으면 튕김 힘 원상 복구
    if (c && Math.abs(f.av) > 1 && c.vn < -100) emitBump(b.x, b.y, 'flipper', Math.abs(f.av) / C.FLIPPER_SPEED);
  }
  // 레인 (통과형)
  for (const l of board.lanes) {
    if (inRect(b.x, b.y, l.x, l.y, l.w, l.h) && G.time - (l._t ?? -99) >= C.LANE_CD) {
      l.lit = 1; emitBump(l.x + l.w / 2, l.y + l.h / 2, 'lane', 0.5);
      hit('lane', l, l.x + l.w / 2, l.y + l.h / 2);
      if (G.phase !== 'play') return;
    }
  }
}

function physicsStep(dt) {
  flipperUpdate(dt);
  if (G.phase !== 'play') return;
  moveEnemy(dt);
  const S = G.stats, e = G.enemy, st = e.status;
  for (const b of G.balls) {
    if (!b.alive || b.rest) continue;
    b.vy += C.GRAVITY * dt;
    if (!b.inLane) {
      if (st.tilt > 0) b.vx += (st.tiltAx || 0) * st.tiltDir * S.forceMul * dt;
      if (S.magnet && e.hp > 0) {
        const dx = e.x - b.x, dy = e.y - b.y, d = Math.hypot(dx, dy);
        if (d < 150 && d > 1) { b.vx += dx / d * 140 * dt; b.vy += dy / d * 140 * dt; }
      }
    }
    clampSpeed(b, S.maxSpeed);
    b.x += b.vx * dt; b.y += b.vy * dt;
    collideBall(b);
    if (G.phase !== 'play') return;
    if (b.inLane) {
      b.laneT = (b.laneT || 0) + dt;
      if (b.x >= 328 && b.laneT > LANE_STUCK && G.balls.length === 1) { toLaunch(); return; }   // 레인에 갇힘 → 다시 발사대로(공 잃지 않음)
      if (b.x < 328) { b.inLane = false; b.r = S.ballR; }
      else if (b.y > board.plunger.y && b.vy > 0) {   // 레인으로 떨어져 돌아온 공 → 자동 재발사
        b.y = board.plunger.y; b.vx = 0; b.vy = -C.LAUNCH_MAX * 0.9;
      }
    }
    if (b.y > board.drainY || b.x < -50 || b.x > C.W + 50) b.alive = false;
  }
  if (G.balls.some((b) => !b.alive)) {
    G.balls = G.balls.filter((b) => b.alive);
    if (!G.balls.length) lastBallLost();
  }
}

function lastBallLost() {
  const S = G.stats;
  if (S.saveSec > 0 && G.launchT < S.saveSec) {
    G.saveFlash = 1.5;
    bus.emit('ballLost', { left: G.ballsLeft, saved: true });
    toLaunch();
    return;
  }
  if (G.ballsLeft > 0) {
    G.ballsLeft--;
    bus.emit('ballLost', { left: G.ballsLeft });
    toLaunch();
  } else {
    bus.emit('ballLost', { left: -1 });
    saveBest();
    setPhase('gameover');
    bus.emit('gameover', { stage: G.stage, score: G.score, best: G.best });
  }
}

// ───────────────────────── 프레임 갱신 ─────────────────────────
let acc = 0;
function update(dt) {
  if (!G) return;
  if (G.phase !== 'launch' && G.phase !== 'play') return;
  G.time += dt;
  readInput();
  if (G.phase === 'launch' && G.plunger.holding) G.plunger.charge = Math.min(1, G.plunger.charge + dt / C.CHARGE_TIME);
  acc += dt;
  while (acc >= SUB) {
    acc -= SUB;
    physicsStep(SUB);
    if (G.phase !== 'play' && G.phase !== 'launch') { acc = 0; break; }
  }
  // 감쇠
  for (const p of board.bumpers) p.flash = Math.max(0, p.flash - dt * 4);
  for (const s of board.slings) s.flash = Math.max(0, s.flash - dt * 4);
  for (const l of board.lanes) l.lit = Math.max(0, l.lit - dt * 2);
  for (const t of board.targets) {
    t.flash = Math.max(0, t.flash - dt * 4);
    if (t.down) { t.timer -= dt; if (t.timer <= 0) { t.down = false; t.timer = 0; } }
  }
  if (G.saveFlash > 0) G.saveFlash = Math.max(0, G.saveFlash - dt);
  if (G.phase !== 'play') return;
  G.launchT += dt;
  updateStatus(dt);
  if (G.phase !== 'play') return;
  updateAbilities(dt);
  // 분신
  if (G.stats.multiEvery > 0) {
    G.multiT += dt;
    if (G.multiT >= G.stats.multiEvery) {
      G.multiT = 0;
      if (G.balls.length < C.MULTI_MAX) G.balls.push(makeBall(178, 80, rng() < 0.5 ? -200 : 200, 0));
    }
  }
  // 끼임 방지
  for (const b of G.balls) {
    if (b.rest) continue;
    // 무한 튕김 방지: 빠르게 튕기더라도 좁은 구역(반경 LOOP_R)에 LOOP_TIME 이상 머물면 옆으로 빼낸다
    if (!b.inLane) {
      if (b.loopT === undefined || Math.hypot(b.x - b.loopX, b.y - b.loopY) > LOOP_R) {
        b.loopX = b.x; b.loopY = b.y; b.loopT = 0;
      } else if (b.y < LOOP_SAFE_Y) {          // 플리퍼 위에 공을 잡아 둔 경우는 제외
        b.loopT += dt;
        if (b.loopT > LOOP_TIME) {
          const dir = b.x < C.W / 2 - 20 ? 1 : -1;   // 판 가운데 쪽으로
          b.vx = dir * (220 + rng() * 120);
          b.vy = 120 + rng() * 80;                   // 아래로 빠지게
          b.loopT = 0; b.loopX = b.x; b.loopY = b.y;
        }
      } else b.loopT = 0;
    }
    if (Math.hypot(b.vx, b.vy) < 30) {
      b.slowT += dt;
      if (b.slowT > C.STUCK_TIME) {
        const a = rng() * Math.PI * 2;
        b.vx += Math.cos(a) * 200; b.vy += Math.sin(a) * 200 - 100; b.slowT = 0;
      }
    } else b.slowT = 0;
  }
}

// ───────────────────────── 입력 (구조.md 7장) ─────────────────────────
const pointers = new Map();   // pointerId → 'L' | 'R' | 'launch'
const keys = new Set();

function readInput() {
  let L = keys.has('L'), Rr = keys.has('R');
  for (const v of pointers.values()) { if (v === 'L') L = true; if (v === 'R') Rr = true; }
  G.flippers.L.up = L; G.flippers.R.up = Rr;
  if (G.phase === 'launch') {
    G.plunger.holding = keys.has('launch') || [...pointers.values()].includes('launch');
  }
}

let view = { cssW: C.W, cssH: C.H, dpr: 1, scale: 1, offX: 0, offY: 0 };
const stageEl = document.getElementById('stage');
const canvas = document.getElementById('board');

function boardX(clientX) {
  const rect = (stageEl || document.body).getBoundingClientRect();
  return (clientX - rect.left - view.offX) / view.scale;
}

function isUiTarget(t) {
  return t && t.closest && t.closest('button, a, input, select, label, [data-ui], .ui-block');
}

function onPointerDown(ev) {
  if (isUiTarget(ev.target)) return;
  if (!G) return;
  if (G.phase === 'title' && !U) { api.start(); return; }
  if (G.phase === 'launch') { pointers.set(ev.pointerId, 'launch'); G.plunger.holding = true; }
  else if (G.phase === 'play') pointers.set(ev.pointerId, boardX(ev.clientX) < C.W / 2 ? 'L' : 'R');
  else return;
  try { ev.currentTarget.setPointerCapture && ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
  ev.preventDefault();
}
function onPointerUp(ev) {
  const v = pointers.get(ev.pointerId);
  pointers.delete(ev.pointerId);
  if (v === 'launch' && G.phase === 'launch' && ev.type === 'pointerup') launch(G.plunger.charge);
}

const KEYMAP = { ArrowLeft: 'L', KeyZ: 'L', ArrowRight: 'R', KeyM: 'R', Space: 'launch' };
function onKeyDown(ev) {
  if (!G) return;
  if (ev.code === 'KeyP' || ev.code === 'Escape') { G.phase === 'paused' ? api.resume() : api.pause(); ev.preventDefault(); return; }
  if ((ev.code === 'Space' || ev.code === 'Enter') && G.phase === 'title' && !U) { api.start(); ev.preventDefault(); return; }
  const k = KEYMAP[ev.code];
  if (!k) return;
  ev.preventDefault();
  if (ev.repeat) return;
  if (k === 'launch') { if (G.phase === 'launch') keys.add('launch'); }
  else keys.add(k);
}
function onKeyUp(ev) {
  const k = KEYMAP[ev.code];
  if (!k) return;
  keys.delete(k);
  if (k === 'launch' && G && G.phase === 'launch') { launch(G.plunger.charge); }
}

// ───────────────────────── API (ui.js) ─────────────────────────
const api = {
  start() { if (G.phase === 'title' || G.phase === 'gameover' || G.phase === 'victory') { newRun(); startStage(1); } },
  pause() { if (G.phase === 'launch' || G.phase === 'play') { G.pausedFrom = G.phase; pointers.clear(); keys.clear(); setPhase('paused'); } },
  resume() { if (G.phase === 'paused') setPhase(G.pausedFrom || 'launch'); },
  chooseCard,
  restart() { newRun(); startStage(1); },
  toTitle() { newRun(); G.enemy = null; board = buildBoard(null); setPhase('title'); },
  setMuted(m) { G.muted = !!m; store.set('bb.muted', G.muted); },
  getG: () => G,
  getBoard: () => board,
};

// ───────────────────────── view·부트스트랩 ─────────────────────────
function computeView() {
  const el = stageEl || document.body;
  const rect = el.getBoundingClientRect();
  const cssW = Math.max(1, rect.width || C.W), cssH = Math.max(1, rect.height || C.H);
  const scale = Math.min(cssW / C.W, cssH / C.H);
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  view = { cssW, cssH, dpr, scale, offX: (cssW - C.W * scale) / 2, offY: (cssH - C.H * scale) / 2 };
  if (canvas) {
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
  }
  if (R && R.resizeRender) { try { R.resizeRender(view); } catch (e) { console.error(e); } }
}

let renderErr = false;
function frame(dt) {
  if (R && R.drawFrame) {
    try { R.drawFrame(G, board, dt); } catch (e) { if (!renderErr) { renderErr = true; console.error('[drawFrame]', e); } }
  }
  if (U && U.updateUI) {
    try { U.updateUI(G); } catch (e) { if (!renderErr) { renderErr = true; console.error('[updateUI]', e); } }
  }
}

if (DEBUG) {
  window.__bb = {
    goto(n) { if (!G) newRun(); n = Math.max(1, Math.min(C.STAGES, n | 0)); pointers.clear(); keys.clear(); G.balls = []; startStage(n); return G.enemy.name; },
    launch(p = 1) { if (G.phase !== 'launch') return false; launch(p); return true; },
    damage(n) { const e = G.enemy; if (!e || G.phase !== 'play') return 0; e.hp = Math.max(0, e.hp - n); bus.emit('hit', { x: e.x, y: e.y, amount: n, kind: 'normal', src: 'debug' }); if (e.hp <= 0) defeat(); return e.hp; },
    step(sec = 1) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { update(1 / 60); } return G.phase; },
    flip(side, down = true) { if (down) keys.add(side); else keys.delete(side); },
    api, hit: (src) => hit(src, null), trigger: (t) => { const a = G.enemy.abil.find((x) => x.t === t); return a ? triggerAbility(a) : false; },
    get G() { return G; }, set G(v) { /* 읽기 전용 */ },
    get board() { return board; }, set board(v) { /* 읽기 전용 */ },
    view: () => view,
  };
}

newRun();
G.phase = 'title';
if (R && R.initRender && canvas) { try { R.initRender(canvas); } catch (e) { console.error(e); } }
computeView();
if (typeof ResizeObserver !== 'undefined' && stageEl) new ResizeObserver(computeView).observe(stageEl);
window.addEventListener('resize', computeView);
if (U && U.initUI) { try { U.initUI(api); } catch (e) { console.error(e); } }

const inputEl = stageEl || window;
inputEl.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointerup', onPointerUp);
window.addEventListener('pointercancel', onPointerUp);
window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);
window.addEventListener('blur', () => { pointers.clear(); keys.clear(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) api.pause(); });
bus.emit('phase', { phase: 'title', prev: null });

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  update(dt);
  frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
