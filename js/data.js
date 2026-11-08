// 바운스 브레이커 — 게임 데이터 (기획자 소유, docs/기획서.md · docs/구조.md 3장)
// 모든 숫자·콘텐츠는 이 파일에만 둔다. 함수는 순수 함수 (DOM·bus 의존 없음).

// ───────────────────────── 1. 상수 ─────────────────────────
export const CONST = {
  W: 375, H: 667,
  BALL_R: 9, GIANT_MUL: 1.5,
  BALLS_PER_RUN: 3, MAX_BALLS: 5, BOSS_BALL: 1,       // 보스 격파 시 공 +1 (최대 MAX_BALLS)
  STAGES: 25, STAGES_PER_WORLD: 5,
  // 물리 (px, 초)
  GRAVITY: 1000, MAX_SPEED: 1800, LAUNCH_MIN: 1150, LAUNCH_MAX: 1650, CHARGE_TIME: 1.0,
  SUBSTEP: 1 / 600,
  WALL_BOUNCE: 0.55, BUMPER_KICK: 560, SLING_KICK: 460,
  FLIPPER_LEN: 62, FLIPPER_SPEED: 26, FLIPPER_REST: 30, FLIPPER_UP: 25,
  // 맵 물체 크기
  TARGET_R: 5, WALL_R: 4, GUARD_R: 10, GUARD_HITS: 2,
  TARGET_RESET: 6,            // 드롭 타깃이 다시 서는 시간(초)
  HIT_CD: 0.12,               // 같은 물체 연속 데미지 최소 간격(초)
  LANE_CD: 0.6,               // 같은 레인 재통과 데미지 간격(초)
  ABIL_WARN: 0.8,             // 주기형 능력 발동 전 예고 시간(초)
  ENTITY_MAX_V: 300,          // 움직이는 적·호위병 순간 속도 상한
  STUCK_TIME: 4,              // 공이 이 시간 동안 거의 안 움직이면 살짝 밀어줌
  CRIT_CAP: 0.6,              // 치명 확률 상한
  MULTI_MAX: 3,               // 판 위 공 최대 수 (쌍둥이 공)
  DIE_TIME: 1.7, DIE_TIME_BOSS: 3.0,   // 적이 쓰러지는 연출 시간(초) → 그 뒤 카드 화면
  // 맵 검사 규칙 (tools/check_maps.py 가 이 값을 읽음)
  MAP_GAP: 30,
  MAP_BOX: [42, 60, 315, 450],      // 물체 외곽이 들어가야 하는 범위 (외벽 x12/x345 와 30px 간격 포함)
  ENTRY_ZONE: [270, 20, 345, 95],   // 발사 레인 → 필드 진입 구역, 물체 금지
  DEFAULT_E: [187, 140, 26],
  // 적 HP 공식: round(HP_BASE * HP_GROWTH^(stage-1) * (boss ? BOSS_HP_MUL : 1))
  HP_BASE: 60, HP_GROWTH: 1.17, BOSS_HP_MUL: 2.3,
  // 점수
  SCORE_PER_DMG: 1, SCORE_STAGE: 100, SCORE_BOSS: 500,
};

// ───────────────────────── 2. 데미지 ─────────────────────────
export const DAMAGE = {
  bumper: 4, lane: 3, target: 8, body: 12,
  bank: 25,                  // 한 맵의 타깃을 전부 쓰러뜨리면 보너스 데미지 + 즉시 재설치
  blast: 30,                 // 폭발 특성 1회
  sonic: 10,                 // 음속 돌파 충격파 1회
  pocket: 10,                // 킥아웃 구멍에 들어감
  guard: 0,                  // 호위병을 맞히면 적 데미지 없음 (호위병 체력만 -1)
  weakMul: 1.8, resistMul: 0.5,
  critChance: 0.05, critMul: 1.8,
  frozenMul: 1.25,           // 빙결 중 받는 피해 배수
  min: 1,                    // 0 이 아닌 피해의 최소값 (갑옷 차감 후)
};

// ───────────────────────── 3. 상태 수치 ─────────────────────────
export const STATUS = {
  burn:   { perHit: 1, max: 8, dur: 3, tick: 0.5, dmg: 0.6, armorCut: 0.5 },   // 스택당 tick마다 dmg
  poison: { perHits: 2, max: 20, tick: 1, dmg: 0.5, healCut: 0.5 },            // 2타마다 1스택, 감소 없음
  freeze: { chance: 0.12, dur: 1.5, cd: 4, takenMul: 1.25 },
  chain:  { every: 4, mul: 2.5 },                    // 4번째 타격마다 번개: DAMAGE.bumper*mul, 호위병 전원 1타
  heavy:  { bodyMul: 1.6, targetMul: 1.6, shieldHits: 2, forceMul: 0.7, speedMul: 0.92 },
  bouncy: { bumperMul: 1.5, kickMul: 1.25 },
  gale:   { laneMul: 2, speedMul: 1.1 },
  shield: {},                                        // 수치는 능력 hits
};

// ───────────────────────── 4. 재질 (1개 보유) ─────────────────────────
export const MATERIALS = {   // 8종
  normal:  { id:'normal',  name:'보통 공',   rarity:'common', special:null,
             desc:'특별한 효과 없음. 약점도 저항도 없다.', look:'은회색 금속 공' },
  fire:    { id:'fire',    name:'화염 공',   rarity:'common', special:'burn',
             desc:'맞힐 때마다 화상 1스택(최대 8). 화상 중 갑옷 절반.', look:'주황 불꽃 꼬리, 불씨 파티클' },
  frost:   { id:'frost',   name:'서리 공',   rarity:'common', special:'freeze',
             desc:'12% 확률로 적을 1.5초 빙결 (이동·능력 정지, 받는 피해 +25%).', look:'하늘색 반투명, 눈송이 자국' },
  steel:   { id:'steel',   name:'강철 공',   rarity:'common', special:'heavy',
             desc:'몸통·타깃 피해 ×1.6, 보호막 2칸씩 깸, 밀치기·기울임 30% 무시.', look:'짙은 쇳빛, 리벳 무늬, 묵직한 그림자' },
  rubber:  { id:'rubber',  name:'고무 공',   rarity:'common', special:'bouncy',
             desc:'범퍼 피해 ×1.5, 범퍼 튕김 +25%.', look:'분홍 말랑한 공, 맞으면 찌그러짐' },
  venom:   { id:'venom',   name:'맹독 공',   rarity:'rare',   special:'poison',
             desc:'2타마다 독 1스택(최대 20, 안 사라짐). 독은 보호막 무시, 적 회복 -50%.', look:'보라·녹색 거품, 독방울 흔적' },
  volt:    { id:'volt',    name:'번개 공',   rarity:'rare',   special:'chain',
             desc:'4번째 타격마다 번개 추가 피해, 호위병 전부에 1타.', look:'노란 전기 스파크, 지그재그 잔상' },
  wind:    { id:'wind',    name:'질풍 공',   rarity:'rare',   special:'gale',
             desc:'레인 피해 ×2, 공 최고 속도 +10%.', look:'연두 소용돌이 잔상' },
};

// ───────────────────────── 5. 특성 (최대 4종, 같은 특성 3번 = 각성) ─────────────────────────
// 모든 특성은 '공'에만 붙는다 (플리퍼·카드 등에는 영향 없음).
// lv[0] = 기본 (1~2번째 고름), lv[1] = 각성 ★ (3번째 고름). desc / star = 카드 설명.
export const TRAIT_AWAKEN = 3;
export const TRAITS = {
  // ── 일반 ──
  comet:    { id:'comet',    name:'혜성 꼬리',   rarity:'common',
              desc:'공이 빠를 때(속도 600 이상) 주는 피해 ×1.4.',
              star:'속도 450 이상이면 피해 ×1.8.',
              lv:[{ speed:600, mul:1.4 }, { speed:450, mul:1.8 }] },
  slick:    { id:'slick',    name:'미끄러운 공', rarity:'common',
              desc:'벽에 부딪혀도 속도를 덜 잃고(반발 0.55 → 0.82), 세게 부딪힐 때마다 불꽃이 튀어 적에게 피해 1.',
              star:'반발 0.9, 벽에 부딪힐 때마다 3% 빨라지고, 불꽃 피해 2.',
              lv:[{ bounce:0.82, boost:0, spark:1 }, { bounce:0.9, boost:0.03, spark:2 }] },
  accel:    { id:'accel',    name:'가속 페달',   rarity:'common',
              desc:'범퍼·슬링에 튕길 때마다 그 공의 튕김 힘과 범퍼 피해 +6% (최대 +60%, 새 공이면 처음부터).',
              star:'한 번에 +10% (최대 +150%).',
              lv:[{ step:0.06, max:0.6 }, { step:0.1, max:1.5 }] },
  echo:     { id:'echo',     name:'메아리 범퍼', rarity:'common',
              desc:'범퍼를 맞히면 45% 확률로 같은 피해가 한 번 더 울린다.',
              star:'80% 확률, 메아리 피해 ×1.8.',
              lv:[{ chance:0.45, mul:1 }, { chance:0.8, mul:1.8 }] },
  feather:  { id:'feather',  name:'깃털 공',     rarity:'common',
              desc:'공이 올라가는 동안 중력 −30%, 올라가는 중에 맞히면 피해 +25%.',
              star:'중력 −45%, 피해 +70%.',
              lv:[{ cut:0.3, bonus:0.25 }, { cut:0.45, bonus:0.7 }] },
  gambler:  { id:'gambler',  name:'도박사',      rarity:'common',
              desc:'치명 확률 +15%p, 치명 배수 +0.8. 대신 치명이 아니면 피해 −10%.',
              star:'치명 확률 +25%p, 배수 +1.4, 손해 없음.',
              lv:[{ crit:0.15, critMul:0.8, miss:0.9 }, { crit:0.25, critMul:1.4, miss:1 }] },
  // ── 희귀 ──
  sonic:    { id:'sonic',    name:'음속 돌파',   rarity:'rare',
              desc:'공이 음속(속도 1300)을 넘는 순간 충격파가 적을 때린다 (피해 10, 3초마다).',
              star:'속도 1150만 넘어도, 피해 ×1.6, 2초마다.',
              lv:[{ speed:1300, mul:1, cd:3 }, { speed:1150, mul:1.6, cd:2 }] },
  slowmo:   { id:'slowmo',   name:'시간 감속',   rarity:'rare',
              desc:'적 가까이(100px)에 오면 공의 시간이 20% 느려진다. 그동안 주는 모든 피해 +50%.',
              star:'30% 느려지고, 피해 +100%.',
              lv:[{ range:100, slow:0.2, bonus:0.5 }, { range:110, slow:0.3, bonus:1.0 }] },
  blast:    { id:'blast',    name:'폭발',        rarity:'rare',
              desc:'공이 적 주위(60px 안)에 있으면 7.25초마다 한 번 폭발 (피해 30).',
              star:'폭발 피해 ×1.5, 폭발할 때 30% 확률로 연쇄 폭발 (계속 이어질 수 있음).',
              lv:[{ every:7.25, range:60, chain:0, mul:1 }, { every:7.25, range:60, chain:0.3, mul:1.5 }] },
  fury:     { id:'fury',     name:'분노 게이지', rarity:'rare',
              desc:'15번 맞힐 때마다 6초 동안 모든 피해 ×1.5.',
              star:'12번마다 8초 동안 ×2.',
              lv:[{ hits:15, dur:6, mul:1.5 }, { hits:12, dur:8, mul:2 }] },
  reaper:   { id:'reaper',   name:'처형자',      rarity:'rare',
              desc:'적 HP 40% 이하일 때 피해 ×1.8.',
              star:'50% 이하에서 ×2, HP 10% 이하로 떨어지면 즉시 처형.',
              lv:[{ below:0.4, mul:1.8, kill:0 }, { below:0.5, mul:2.0, kill:0.1 }] },
  piggy:    { id:'piggy',    name:'저금통',      rarity:'rare',
              desc:'공이 빠질 때, 그 공으로 준 피해의 40%를 한 번에 되돌려 준다.',
              star:'80%를 되돌려 준다.',
              lv:[{ pct:0.4 }, { pct:0.8 }] },
  giant:    { id:'giant',    name:'거인의 공',   rarity:'rare',
              desc:'공 크기 ×1.3, 몸통·타깃 피해 +20%.',
              star:'공 크기 ×1.5, 몸통·타깃 피해 +40%.',
              lv:[{ size:1.3, add:0.2 }, { size:1.5, add:0.4 }] },
  // ── 영웅 ──
  twin:     { id:'twin',     name:'쌍둥이 공',   rarity:'epic',
              desc:'발사할 때 60% 확률로 공이 하나 더 같이 나간다.',
              star:'항상 1개 더, 50% 확률로 2개 더 (최대 3개).',
              lv:[{ chance:0.6, extra:0 }, { chance:1, extra:0.5 }] },
  cell:     { id:'cell',     name:'세포',        rarity:'epic',
              desc:'공의 체력이 시간이 지날수록 닳고(10초), 다 닳으면 작은 공 2개로 분열. 작은 공은 피해 +40%, 적에게 3번 닿으면 죽고, 12초 동안 적에게 안 닿으면 원래 공으로 성장 (최대 2회).',
              star:'성장 시간 25% 감소 (12초 → 9초), 작은 공 피해 +80%.',
              lv:[{ life:10, grow:12, touches:3, maxGrow:2, smallR:0.6, smallDmg:0.4 }, { life:10, grow:9, touches:3, maxGrow:2, smallR:0.6, smallDmg:0.8 }] },
};

/** 특성 단계: 0 없음, 1 기본, 2 각성 */
export function traitTier(G, id) {
  const n = ((G && G.traitLv) || {})[id] || (((G && G.traits) || []).includes(id) ? 1 : 0);
  return n >= TRAIT_AWAKEN ? 2 : n > 0 ? 1 : 0;
}
/** 지금 단계의 특성 수치 (없으면 null) */
export function traitVal(G, id) {
  const t = traitTier(G, id);
  return t && TRAITS[id] ? TRAITS[id].lv[t - 1] : null;
}

// ───────────────────────── 6. 강화 (중복 가능, max 까지) ─────────────────────────
export const UPGRADES = {
  power:    { id:'power',    name:'공격력',     rarity:'common', max:10, dmgMul:0.10,    desc:'모든 피해 +10%.' },
  critDmg:  { id:'critDmg',  name:'치명 위력',   rarity:'common', max:5,  critMul:0.25,   desc:'치명 배수 +0.25.' },
  critRate: { id:'critRate', name:'치명 확률',   rarity:'common', max:5,  critAdd:0.04,   desc:'치명 확률 +4%p.' },
  bumperUp: { id:'bumperUp', name:'범퍼 강화',   rarity:'common', max:5,  bumperMul:0.2,  desc:'범퍼 피해 +20%.' },
  laneUp:   { id:'laneUp',   name:'레인 강화',   rarity:'common', max:5,  laneMul:0.25,   desc:'레인 피해 +25%.' },
  targetUp: { id:'targetUp', name:'타깃 강화',   rarity:'common', max:5,  targetMul:0.25, desc:'타깃 피해 +25%.' },
  dotUp:    { id:'dotUp',    name:'지속 피해',   rarity:'common', max:5,  dotMul:0.2,     desc:'화상·독 피해 +20%.' },
  special:  { id:'special',  name:'재질 숙련',   rarity:'rare',   max:5,  specialMul:0.15,desc:'재질 효과 수치 +15%.' },
  safety:   { id:'safety',   name:'안전 시간',   rarity:'rare',   max:3,  saveSec:3,      desc:'발사 후 3초×레벨 안에 빠진 공은 되돌림.' },
  extraBall:{ id:'extraBall',name:'여분 공',     rarity:'epic',   max:3,  balls:1,        desc:'즉시 남은 공 +1 (최대 5).' },
};

// ───────────────────────── 7. 카드 뽑기 규칙 ─────────────────────────
export const CARD_RULES = {
  count: 3,
  rarity:     { common: 0.62, rare: 0.30, epic: 0.08 },
  bossRarity: { common: 0.30, rare: 0.48, epic: 0.22 },  // 보스 격파 직후
  stageShift: 0.005, stageShiftMax: 0.12,             // 스테이지당 common→rare 이동
  kind: { material: 0.25, trait: 0.30, upgrade: 0.45 },
  weakHint: 0.4,                                      // 다음 적 약점 재질 카드가 1장 끼어들 확률
  ownedTrait: 0.45,                                   // 가진 특성(각성 전) 카드가 1장 끼어들 확률
};

// ───────────────────────── 8. 월드 ─────────────────────────
// line / bg 색은 디자이너 소유 (임시값)
export const WORLDS = [
  { id:'moss',   name:'초록 이끼숲',   line:'#7be08a', bg:['#0f2a18', '#06140b'] },
  { id:'sand',   name:'붉은 모래협곡', line:'#ffb35c', bg:['#3a1d0c', '#1a0c05'] },
  { id:'ice',    name:'푸른 얼음굴',   line:'#8fe3ff', bg:['#0c2333', '#050f18'] },
  { id:'forge',  name:'용암 대장간',   line:'#ff6a4d', bg:['#33100a', '#140504'] },
  { id:'spire',  name:'번개 첨탑',     line:'#ffe45c', bg:['#1f1a3a', '#0b0918'] },
];

// ───────────────────────── 9. 적 능력 이름·설명 ─────────────────────────
export const ABIL_LABEL = {
  move:'이동', shield:'보호막', heal:'재생', armor:'갑옷', guard:'호위병', tp:'순간이동', push:'밀치기', tilt:'기울임', jam:'마비',
  adapt:'적응', rage:'격노',
};

export function abilText(a) {
  if (!a) return '';
  const s = (v) => `${v}초`;
  switch (a.t) {
    case 'move':   return `${ABIL_LABEL.move}: 좌우 ${a.ax}·상하 ${a.ay}px 범위를 움직인다`;
    case 'shield': return `${ABIL_LABEL.shield}: ${s(a.every)}마다 ${a.hits}타를 막는 보호막`;
    case 'heal':   return `${ABIL_LABEL.heal}: ${s(a.every)}마다 최대 HP의 ${Math.round(a.pct * 100)}% 회복`;
    case 'armor':  return `${ABIL_LABEL.armor}: 타격 피해 -${a.flat} (지속 피해는 그대로)`;
    case 'guard':  return `${ABIL_LABEL.guard}: 호위병 ${a.n}기가 주위를 돈다, ${s(a.every)}마다 1기 보충`;
    case 'tp':     return `${ABIL_LABEL.tp}: ${s(a.every)}마다 다른 자리로 이동`;
    case 'push':   return `${ABIL_LABEL.push}: ${s(a.every)}마다 주변 ${a.radius}px 의 공을 밀어냄`;
    case 'tilt':   return `${ABIL_LABEL.tilt}: ${s(a.every)}마다 ${s(a.dur)} 동안 판이 한쪽으로 기움`;
    case 'jam':    return `${ABIL_LABEL.jam}: ${s(a.every)}마다 플리퍼 하나가 ${s(a.dur)} 멈춤`;
    case 'adapt':  return `${ABIL_LABEL.adapt}: ${s(a.every)}마다 ${s(a.dur)} 동안 지금 재질에 저항`;
    case 'rage':   return `${ABIL_LABEL.rage}: HP ${Math.round(a.at * 100)}% 이하에서 능력 간격 ×${a.cdMul}, 이동 ×${a.spdMul}`;
    default:       return ABIL_LABEL[a.t] || a.t;
  }
}

// ───────────────────────── 10. 적 25종 ─────────────────────────
// map: b 범퍼 [x,y,r] · l 레인 [x,y,w,h] (x,y = 왼쪽 위) · t 타깃 [x,y,len,angleDeg] (x,y = 중심)
//      w 벽 [x1,y1,x2,y2] · e 몸체 [x,y,r]
// 이 블록은 JSON 형식을 지킨다 (tools/check_maps.py 가 그대로 읽음).
export const ENEMIES = /*ENEMIES_JSON_BEGIN*/[
  {"name":"말랑이끼", "shape":"blob", "color":"#6fcf5a", "weak":"fire", "resist":"venom",
   "abil":[],
   "tip":"능력 없음. 범퍼 삼각형 사이로 공을 굴려 연습.",
   "map":{"e":[178,150,26],
    "b":[[118,260,20],[239,260,20],[178,330,20]],
    "l":[[60,120,22,50],[275,120,22,50]],
    "t":[[178,410,36,0]],
    "w":[]}},
  {"name":"껍질굴림벌레", "shape":"box", "color":"#8fb34a", "weak":"steel", "resist":"rubber",
   "abil":[{"t":"shield","every":9,"hits":3}],
   "tip":"보호막은 강철·방패 부수기로 빨리 깬다. 타깃 줄을 노려라.",
   "map":{"e":[178,130,28],
    "b":[[90,380,18],[267,380,18]],
    "l":[[167,360,22,50]],
    "t":[[108,230,30,0],[178,230,30,0],[248,230,30,0],[73,290,30,0],[143,290,30,0],[213,290,30,0],[283,290,30,0]],
    "w":[]}},
  {"name":"덩굴채찍", "shape":"spike", "color":"#3fa05a", "weak":"fire", "resist":"wind",
   "abil":[{"t":"move","ax":50,"ay":0,"spd":1.0}],
   "tip":"좌우로 흔들려 몸통 맞히기 어렵다. 왼쪽 레인 두 줄로 꾸준히.",
   "map":{"e":[200,140,24],
    "b":[[130,260,16],[230,330,22],[140,400,16]],
    "l":[[50,200,22,60],[50,300,22,60]],
    "t":[[250,420,32,-20]],
    "w":[[300,200,250,260]]}},
  {"name":"포자눈알", "shape":"eye", "color":"#b6d94c", "weak":"wind", "resist":"venom",
   "abil":[{"t":"heal","every":8,"pct":0.06}],
   "tip":"재생이 있다. 맹독(독 회복 감소)·저주가 대응, 범퍼 육각 무리에서 연타.",
   "map":{"e":[178,120,26],
    "b":[[178,300,18],[248,300,16],[213,361,16],[143,361,16],[108,300,16],[143,239,16],[213,239,16]],
    "l":[[52,80,22,50],[283,140,22,50]],
    "t":[[70,420,30,60],[287,420,30,-60]],
    "w":[]}},
  {"name":"늪지기 고목왕", "shape":"box", "color":"#4e8a3a", "weak":"fire", "resist":"frost", "boss":true,
   "abil":[{"t":"shield","every":10,"hits":4},{"t":"heal","every":12,"pct":0.05},{"t":"move","ax":30,"ay":0,"spd":0.8}],
   "tip":"보호막+재생 보스. 화염으로 꾸준히 태우고, 보호막이 뜨면 타깃 줄로 빨리 깬다.",
   "map":{"e":[178,140,36],
    "b":[[90,250,20],[267,250,20],[178,290,18]],
    "l":[[52,110,22,50],[283,110,22,50]],
    "t":[[108,380,30,0],[178,380,30,0],[248,380,30,0]],
    "w":[[55,420,85,440],[302,420,272,440]]}},
  {"name":"사막껍데기", "shape":"box", "color":"#d9a05b", "weak":"volt", "resist":"steel",
   "abil":[{"t":"armor","flat":2}],
   "tip":"갑옷 2. 피해가 큰 타깃·몸통·치명타로 갑옷을 무시하듯 때린다. 화염은 갑옷 절반.",
   "map":{"e":[178,130,28],
    "b":[[178,330,20],[118,410,16],[239,410,16]],
    "l":[[51,340,22,50],[284,340,22,50]],
    "t":[[125,240,30,45],[232,240,30,-45]],
    "w":[[62,180,62,300],[295,180,295,300]]}},
  {"name":"모래회오리", "shape":"ghost", "color":"#e8c07a", "weak":"steel", "resist":"wind",
   "abil":[{"t":"tilt","every":9,"dur":3,"ax":260}],
   "tip":"판이 기운다. 강철 공·평정심이면 덜 밀린다. 기울 때는 반대쪽 플리퍼를 준비.",
   "map":{"e":[178,200,26],
    "b":[[242,264,16],[114,264,16],[114,136,16],[242,136,16]],
    "l":[[167,70,22,40]],
    "t":[[178,330,30,0],[178,400,30,0]],
    "w":[[60,330,90,400],[297,330,267,400]]}},
  {"name":"전갈집게", "shape":"spike", "color":"#c9733f", "weak":"frost", "resist":"fire",
   "abil":[{"t":"push","every":7,"radius":150,"power":650},{"t":"move","ax":40,"ay":0,"spd":1.0}],
   "tip":"가까이 가면 밀쳐낸다. 서리로 얼리면 밀치기도 멈춘다. 꼬리 범퍼 줄이 핵심.",
   "map":{"e":[178,150,26],
    "b":[[178,270,16],[178,340,16],[178,410,14],[100,300,18],[257,300,18]],
    "l":[[52,360,22,50],[283,360,22,50]],
    "t":[],
    "w":[[60,140,90,220],[297,140,267,220]]}},
  {"name":"신기루뱀", "shape":"blob", "color":"#f2d27a", "weak":"wind", "resist":"venom",
   "abil":[{"t":"tp","every":6,"pts":[[178,120],[90,200],[266,200]]}],
   "tip":"자리를 옮겨 다닌다. 위치와 상관없는 레인 4줄을 질풍·레인 질주로 키우면 편하다.",
   "map":{"e":[178,120,24],
    "b":[[178,220,18],[178,410,15]],
    "l":[[70,300,22,50],[140,300,22,50],[210,300,22,50],[280,300,22,50]],
    "t":[[110,410,34,0],[247,410,34,0]],
    "w":[]}},
  {"name":"모래성 집게왕", "shape":"box", "color":"#b8552e", "weak":"frost", "resist":"steel", "boss":true,
   "abil":[{"t":"armor","flat":3},{"t":"push","every":8,"radius":170,"power":700},{"t":"tilt","every":11,"dur":3,"ax":280},{"t":"move","ax":25,"ay":0,"spd":0.7}],
   "tip":"갑옷+밀치기+기울임 보스. 서리로 얼려 능력을 끊고, 큰 한 방(타깃·치명)으로 갑옷을 넘긴다.",
   "map":{"e":[178,140,38],
    "b":[[178,260,20],[110,330,18],[247,330,18]],
    "l":[[167,320,22,50]],
    "t":[[108,410,30,0],[178,410,30,0],[248,410,30,0]],
    "w":[[55,110,80,200],[302,110,277,200],[80,200,120,240],[277,200,237,240]]}},
  {"name":"고드름박쥐", "shape":"spike", "color":"#9fd8ff", "weak":"fire", "resist":"frost",
   "abil":[{"t":"move","ax":70,"ay":20,"spd":1.6},{"t":"shield","every":10,"hits":3}],
   "tip":"빠르게 날아다닌다. 자석·거대화로 몸통을 맞히거나 지그재그 범퍼로 꾸준히.",
   "map":{"e":[178,130,22],
    "b":[[75,240,14],[145,260,14],[215,240,14],[285,260,14],[110,340,16],[178,320,16],[247,340,16]],
    "l":[[167,400,22,46]],
    "t":[[80,420,30,30],[277,420,30,-30]],
    "w":[]}},
  {"name":"서리방패병", "shape":"box", "color":"#7fb8e0", "weak":"volt", "resist":"steel",
   "abil":[{"t":"guard","n":2,"orbit":68,"spd":1.2,"every":10},{"t":"shield","every":11,"hits":3}],
   "tip":"호위병 2기가 몸을 가린다. 번개가 호위병을 한꺼번에 친다. 범퍼·타깃은 호위병과 상관없다.",
   "map":{"e":[178,150,26],
    "b":[[110,290,18],[247,290,18],[178,350,20]],
    "l":[[46,100,22,50],[289,100,22,50]],
    "t":[[90,400,30,0],[267,400,30,0],[178,420,30,0]],
    "w":[]}},
  {"name":"얼음거울", "shape":"eye", "color":"#c8f0ff", "weak":"steel", "resist":"frost",
   "abil":[{"t":"tp","every":7,"pts":[[100,130],[257,130]]},{"t":"heal","every":9,"pct":0.05}],
   "tip":"좌우 방을 오가며 회복한다. 맹독·저주로 회복을 줄이고 가운데 벽 양쪽을 번갈아 노린다.",
   "map":{"e":[100,130,24],
    "b":[[178,260,18],[90,250,16],[267,250,16]],
    "l":[[60,330,22,50],[275,330,22,50]],
    "t":[[150,360,30,90],[207,360,30,-90]],
    "w":[[178,90,178,200],[100,430,150,430],[257,430,207,430]]}},
  {"name":"눈보라정령", "shape":"ghost", "color":"#e6f6ff", "weak":"wind", "resist":"venom",
   "abil":[{"t":"tilt","every":8,"dur":3,"ax":280},{"t":"guard","n":1,"orbit":68,"spd":1.6,"every":8}],
   "tip":"기울임+호위병 1기. 강철·평정심으로 버티고 바깥 범퍼 고리를 돈다.",
   "map":{"e":[178,180,26],
    "b":[[70,100,16],[290,300,16],[70,330,16],[178,330,14],[260,380,16]],
    "l":[[290,150,22,50]],
    "t":[[100,420,30,-20],[200,425,30,10]],
    "w":[[50,200,50,260]]}},
  {"name":"빙하 수호자", "shape":"box", "color":"#5aa8d8", "weak":"volt", "resist":"frost", "boss":true,
   "abil":[{"t":"guard","n":3,"orbit":76,"spd":1.0,"every":9},{"t":"shield","every":12,"hits":4},{"t":"tp","every":10,"pts":[[178,150],[178,320]]}],
   "tip":"호위병 3기+보호막+위아래 순간이동 보스. 번개로 호위병을 지우고 네 귀퉁이를 노린다.",
   "map":{"e":[178,150,34],
    "b":[[62,240,16],[295,240,16]],
    "l":[[46,400,22,46],[289,400,22,46]],
    "t":[[60,80,24,90],[302,140,24,90],[130,440,24,0],[227,440,24,0]],
    "w":[]}},
  {"name":"용암방울", "shape":"blob", "color":"#ff8a3d", "weak":"frost", "resist":"fire",
   "abil":[{"t":"move","ax":0,"ay":50,"spd":1.0},{"t":"heal","every":7,"pct":0.05}],
   "tip":"위아래로 출렁이며 회복한다. 서리로 얼리고 맹독으로 회복을 막는다.",
   "map":{"e":[178,170,26],
    "b":[[95,240,20],[262,240,20],[178,320,18],[130,400,16],[227,400,16]],
    "l":[[60,120,22,60],[275,120,22,60]],
    "t":[],
    "w":[[50,290,50,380],[307,290,307,380]]}},
  {"name":"쇠망치골렘", "shape":"box", "color":"#a35a3a", "weak":"volt", "resist":"steel",
   "abil":[{"t":"armor","flat":3},{"t":"rage","at":0.5,"cdMul":0.6,"spdMul":1.4}],
   "tip":"가로 벽이 몸을 막는다. 갑옷 3이라 약한 범퍼는 1씩만 들어간다. 타깃 두 줄이 정답.",
   "map":{"e":[178,130,30],
    "b":[[60,200,14],[297,200,14],[120,420,16],[237,420,16]],
    "l":[],
    "t":[[108,270,30,0],[178,270,30,0],[248,270,30,0],[73,340,30,0],[143,340,30,0],[213,340,30,0],[283,340,30,0]],
    "w":[[110,200,246,200]]}},
  {"name":"불씨날개", "shape":"spike", "color":"#ffb347", "weak":"frost", "resist":"fire",
   "abil":[{"t":"move","ax":80,"ay":30,"spd":1.1},{"t":"rage","at":0.5,"cdMul":0.6,"spdMul":1.4}],
   "tip":"넓게 날고 HP 절반에서 격노. 큰 범퍼 셋과 양쪽 레인으로 꾸준히, 격노 전에 몰아친다.",
   "map":{"e":[178,150,22],
    "b":[[120,280,22],[237,280,22],[178,360,22]],
    "l":[[46,230,22,60],[289,230,22,60]],
    "t":[[80,400,30,-30],[277,400,30,30]],
    "w":[]}},
  {"name":"풀무눈", "shape":"eye", "color":"#ff7043", "weak":"venom", "resist":"wind",
   "abil":[{"t":"adapt","every":10,"dur":4},{"t":"push","every":8,"radius":160,"power":650}],
   "tip":"적응: 지금 재질에 잠시 저항한다. 꿰뚫기가 대응. 적응 중엔 독·화상 같은 지속 피해로 버틴다.",
   "map":{"e":[178,150,28],
    "b":[[178,270,16],[110,370,18],[247,370,18],[178,400,16]],
    "l":[[52,240,22,60],[283,240,22,60],[108,240,22,60],[227,240,22,60]],
    "t":[],
    "w":[[90,100,105,160],[267,100,252,160]]}},
  {"name":"화로거인", "shape":"box", "color":"#d84315", "weak":"frost", "resist":"fire", "boss":true,
   "abil":[{"t":"armor","flat":3},{"t":"rage","at":0.5,"cdMul":0.6,"spdMul":1.4},{"t":"adapt","every":12,"dur":4},{"t":"guard","n":2,"orbit":78,"spd":1.1,"every":10}],
   "tip":"갑옷+격노+적응+호위병 보스. 서리 빙결로 능력을 늦추고 꿰뚫기·마무리로 끝낸다.",
   "map":{"e":[178,150,36],
    "b":[[70,380,18],[287,380,18],[178,390,18]],
    "l":[[46,230,22,46],[289,230,22,46]],
    "t":[[112,300,26,0],[178,300,26,0],[244,300,26,0]],
    "w":[]}},
  {"name":"감전해파리", "shape":"ghost", "color":"#b388ff", "weak":"rubber", "resist":"volt",
   "abil":[{"t":"move","ax":0,"ay":20,"spd":1.2},{"t":"jam","every":9,"dur":1.2}],
   "tip":"마비: 플리퍼 하나가 잠깐 멈춘다(예고 깜빡임). 평정심이면 무효. 촉수 사이 레인을 노려라.",
   "map":{"e":[178,130,26],
    "b":[[70,220,18],[287,220,18],[90,330,18],[267,330,18],[178,330,16]],
    "l":[[167,220,22,50]],
    "t":[[130,420,30,0],[227,420,30,0]],
    "w":[[130,200,130,280],[227,200,227,280]]}},
  {"name":"피뢰침기사", "shape":"box", "color":"#ffd54f", "weak":"rubber", "resist":"volt",
   "abil":[{"t":"guard","n":2,"orbit":68,"spd":1.3,"every":9},{"t":"armor","flat":2}],
   "tip":"호위병+갑옷. 고무 공 범퍼 피해로 갑옷을 넘기고 번개는 저항받으니 피한다.",
   "map":{"e":[178,180,26],
    "b":[[90,320,18],[267,320,18],[178,330,16]],
    "l":[[46,390,22,50],[289,390,22,50]],
    "t":[[140,415,30,0],[217,415,30,0]],
    "w":[[60,100,60,200],[297,100,297,200]]}},
  {"name":"돌풍매", "shape":"spike", "color":"#9ccc65", "weak":"steel", "resist":"wind",
   "abil":[{"t":"move","ax":60,"ay":0,"spd":1.4},{"t":"tilt","every":8,"dur":2.5,"ax":300}],
   "tip":"비대칭 바람길. 기울 때 공이 벽을 따라 흐르니 강철로 버티고 범퍼 넷을 돈다.",
   "map":{"e":[190,120,22],
    "b":[[255,190,16],[170,250,18],[150,340,16],[260,370,16]],
    "l":[[46,250,22,60]],
    "t":[[200,430,30,0]],
    "w":[[60,190,120,225],[237,290,297,255],[60,370,120,405]]}},
  {"name":"회로눈", "shape":"eye", "color":"#4dd0e1", "weak":"venom", "resist":"volt",
   "abil":[{"t":"tp","every":7,"pts":[[178,130],[90,130],[266,130]]},{"t":"jam","every":10,"dur":1.2},{"t":"shield","every":12,"hits":3}],
   "tip":"회로처럼 촘촘한 작은 범퍼 격자. 고무·범퍼 장인과 궁합이 좋다. 보호막은 독이 무시.",
   "map":{"e":[178,130,24],
    "b":[[108,230,14],[178,230,14],[248,230,14],[73,300,14],[143,300,14],[213,300,14],[283,300,14],[108,370,14],[178,370,14],[248,370,14]],
    "l":[[46,420,22,30]],
    "t":[[140,430,26,0],[217,430,26,0]],
    "w":[]}},
  {"name":"천둥 첨탑왕", "shape":"box", "color":"#ffca28", "weak":"rubber", "resist":"volt", "boss":true,
   "abil":[{"t":"jam","every":9,"dur":1.4},{"t":"tilt","every":10,"dur":3,"ax":300},{"t":"guard","n":2,"orbit":78,"spd":1.3,"every":9},{"t":"shield","every":13,"hits":4},{"t":"adapt","every":14,"dur":4},{"t":"rage","at":0.4,"cdMul":0.6,"spdMul":1.4}],
   "tip":"최종 보스. 마비+기울임+호위병+보호막+적응+격노. 평정심으로 마비·기울임을 끄고, 번개는 저항받으니 고무 공+꿰뚫기·마무리로 끝낸다.",
   "map":{"e":[178,170,36],
    "b":[[118,330,18],[239,330,18]],
    "l":[[46,280,22,50],[289,280,22,50]],
    "t":[[105,420,30,0],[178,420,30,0],[251,420,30,0]],
    "w":[[178,300,178,370]]}}
]/*ENEMIES_JSON_END*/;

// ───────────────────────── 11. 함수 ─────────────────────────
export function worldOf(stage) {
  return Math.max(0, Math.min(WORLDS.length - 1, Math.floor((stage - 1) / CONST.STAGES_PER_WORLD)));
}

export function enemyHp(stage, boss) {
  return Math.round(CONST.HP_BASE * Math.pow(CONST.HP_GROWTH, stage - 1) * (boss ? CONST.BOSS_HP_MUL : 1));
}

export function makeEnemy(stage) {
  const s = Math.max(1, Math.min(CONST.STAGES, stage | 0));
  const base = JSON.parse(JSON.stringify(ENEMIES[s - 1]));
  const [x, y, r] = base.map.e || CONST.DEFAULT_E;
  const hp = enemyHp(s, !!base.boss);
  const abil = base.abil.map((a) => ({ ...a, timer: a.every || 0, warn: 0, done: false }));
  const guards = [];
  const g = abil.find((a) => a.t === 'guard');
  if (g) {
    for (let i = 0; i < g.n; i++) {
      const ang = (Math.PI * 2 * i) / g.n;
      guards.push({ x: x + Math.cos(ang) * g.orbit, y: y + Math.sin(ang) * g.orbit,
                    r: CONST.GUARD_R, vx: 0, vy: 0, ang, hp: CONST.GUARD_HITS });
    }
  }
  return {
    name: base.name, shape: base.shape, color: base.color, weak: base.weak, resist: base.resist,
    boss: !!base.boss, tip: base.tip || '', stage: s,
    hp, maxHp: hp, x, y, r, x0: x, y0: y, vx: 0, vy: 0, t: 0, tpIdx: 0,
    status: { shield: 0, freeze: 0, freezeCd: 0, burn: 0, burnT: 0, poison: 0, poisonHits: 0,
              tilt: 0, tiltDir: 0, jam: 0, jamSide: '', adapt: 0,
              raged: false },
    abil, guards, map: base.map,
  };
}

function pickWeighted(table, rng) {
  const keys = Object.keys(table).filter((k) => table[k] > 0);
  const total = keys.reduce((s, k) => s + table[k], 0);
  let v = rng() * total;
  for (const k of keys) { v -= table[k]; if (v < 0) return k; }
  return keys[keys.length - 1];
}

export function rarityTable(G) {
  const R = CARD_RULES;
  const t = { ...((G.enemy && G.enemy.boss) ? R.bossRarity : R.rarity) };
  const shift = Math.min(R.stageShiftMax, R.stageShift * Math.max(0, (G.stage || 1) - 1));
  const take = Math.min(t.common - 0.05, shift);
  const fromShift = Math.min(shift, take);
  t.common -= take;
  t.rare += fromShift + (take - fromShift) / 2;
  t.epic += (take - fromShift) / 2;
  return t;
}

export function rollCards(G, rng = Math.random) {
  const traits = G.traits || [];
  const ups = G.upgrades || {};
  const n = CARD_RULES.count;
  const tlv = G.traitLv || {};
  const next = ENEMIES[G.stage] || null;              // G.stage = 방금 이긴 스테이지 → 다음 적
  const pools = {
    material: Object.keys(MATERIALS).filter((id) => id !== 'normal' && id !== G.material && !(G.materials || []).includes(id)),
    // 가진 특성은 각성 전까지 다시 나옴, 새 특성은 4종까지
    trait: Object.keys(TRAITS).filter((id) => traits.includes(id) ? (tlv[id] || 1) < TRAIT_AWAKEN : traits.length < 4),
    upgrade: Object.keys(UPGRADES).filter((id) => (ups[id] || 0) < UPGRADES[id].max &&
      !(id === 'extraBall' && (G.ballsLeft || 0) >= CONST.MAX_BALLS)),
  };
  const DEF = { material: MATERIALS, trait: TRAITS, upgrade: UPGRADES };
  const cards = [];
  const taken = (kind, id) => cards.some((c) => c.kind === kind && c.id === id);
  const tagOf = (kind, id) => (kind === 'material' && next) ?
    (id === next.weak ? 'weak' : id === next.resist ? 'resist' : undefined) : undefined;
  const push = (kind, id) => {
    const c = { kind, id, rarity: DEF[kind][id].rarity };
    const tag = tagOf(kind, id);
    if (tag) c.tag = tag;
    if (kind === 'trait' && traits.includes(id)) c.stack = (tlv[id] || 1) + 1;   // 고르면 몇 번째가 되는지
    cards.push(c);
  };

  if (next && pools.material.includes(next.weak) && rng() < CARD_RULES.weakHint) push('material', next.weak);
  const own = pools.trait.filter((id) => traits.includes(id));
  if (own.length && rng() < CARD_RULES.ownedTrait) push('trait', own[Math.floor(rng() * own.length) % own.length]);

  const rt = rarityTable(G);
  let guard = 0;
  while (cards.length < n && guard++ < 50) {
    const kinds = {};
    for (const k of Object.keys(CARD_RULES.kind)) {
      if (pools[k].some((id) => !taken(k, id))) kinds[k] = CARD_RULES.kind[k];
    }
    if (!Object.keys(kinds).length) break;
    const kind = pickWeighted(kinds, rng);
    const rarity = pickWeighted(rt, rng);
    const free = pools[kind].filter((id) => !taken(kind, id));
    const same = free.filter((id) => DEF[kind][id].rarity === rarity);
    const list = same.length ? same : free;
    push(kind, list[Math.floor(rng() * list.length) % list.length]);
  }
  return cards;
}

// 특성·강화·재질을 합친 최종 수치 → main.js 가 카드 선택 후 G.stats = calcStats(G)
export function calcStats(G) {
  const up = G.upgrades || {};
  const lv = (id) => up[id] || 0;
  const V = (id) => traitVal(G, id);
  const mat = MATERIALS[G.material] || MATERIALS.normal;
  const sp = mat.special;
  const gm = V('gambler'), gi = V('giant'), sl = V('slick');
  const specialScale = 1 + lv('special') * UPGRADES.special.specialMul;
  const mm = (mul) => 1 + (mul - 1) * specialScale;           // 재질 배수에 숙련 반영
  return {
    specialScale,
    dmgMul: 1 + lv('power') * UPGRADES.power.dmgMul,
    critChance: Math.min(CONST.CRIT_CAP, DAMAGE.critChance + (gm ? gm.crit : 0) + lv('critRate') * UPGRADES.critRate.critAdd),
    critMul: DAMAGE.critMul + (gm ? gm.critMul : 0) + lv('critDmg') * UPGRADES.critDmg.critMul,
    missMul: gm ? gm.miss : 1,                                   // 치명이 아닐 때 배수 (도박사)
    bumperMul: (1 + lv('bumperUp') * UPGRADES.bumperUp.bumperMul) * (sp === 'bouncy' ? mm(STATUS.bouncy.bumperMul) : 1),
    laneMul: (1 + lv('laneUp') * UPGRADES.laneUp.laneMul) * (sp === 'gale' ? mm(STATUS.gale.laneMul) : 1),
    targetMul: (1 + (gi ? gi.add : 0) + lv('targetUp') * UPGRADES.targetUp.targetMul) * (sp === 'heavy' ? mm(STATUS.heavy.targetMul) : 1),
    bodyMul: (1 + (gi ? gi.add : 0)) * (sp === 'heavy' ? mm(STATUS.heavy.bodyMul) : 1),
    dotMul: 1 + lv('dotUp') * UPGRADES.dotUp.dotMul,
    weakMul: DAMAGE.weakMul,
    resistMul: DAMAGE.resistMul,
    armorCut: 0,
    armorMul: 1,
    shieldHits: 1 + (sp === 'heavy' ? STATUS.heavy.shieldHits - 1 : 0),
    guardHits: sp === 'heavy' ? 2 : 1,
    forceMul: sp === 'heavy' ? STATUS.heavy.forceMul : 1,
    jamImmune: false,
    cdMul: 1,
    healCut: 0,                // 회복량 ×(1-healCut); 독 스택>0 이면 추가로 ×(1-STATUS.poison.healCut)
    ballR: CONST.BALL_R * (gi ? gi.size : 1),
    maxSpeed: CONST.MAX_SPEED * (sp === 'heavy' ? STATUS.heavy.speedMul : 1) * (sp === 'gale' ? STATUS.gale.speedMul : 1),
    kickMul: sp === 'bouncy' ? mm(STATUS.bouncy.kickMul) : 1,
    wallBounce: sl ? sl.bounce : CONST.WALL_BOUNCE,
    targetReset: CONST.TARGET_RESET,
    freezeChance: sp === 'freeze' ? STATUS.freeze.chance * specialScale : 0,
    chainMul: sp === 'chain' ? STATUS.chain.mul * specialScale : 0,
    saveSec: lv('safety') * UPGRADES.safety.saveSec,
    // 특성 수치 (null = 없음) — 쓰는 곳: main.js
    comet: V('comet'), slick: sl, accel: V('accel'), echo: V('echo'), feather: V('feather'),
    sonic: V('sonic'), slowmo: V('slowmo'), blast: V('blast'), fury: V('fury'), reaper: V('reaper'),
    piggy: V('piggy'), twin: V('twin'), cell: V('cell'),
  };
}
