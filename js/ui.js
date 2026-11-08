// 바운스 브레이커 — DOM 화면 (디자이너 소유, docs/구조.md 6장 · docs/디자인.md)
import { bus, store } from './events.js';
import { MATERIALS, TRAITS, UPGRADES, ENEMIES, WORLDS, CONST, ABIL_LABEL, abilText } from './data.js';

const $ = (id) => document.getElementById(id);
const RAR = { common: '일반', rare: '희귀', epic: '영웅' };
const KIND = { material: '재질', trait: '특성', upgrade: '강화' };
const DEF = { material: MATERIALS, trait: TRAITS, upgrade: UPGRADES };

let api = {};
let el = {};
let lastG = null;
let shownCards = null;            // 지금 화면에 깔린 카드 배열
const cache = new Map();          // 요소별 마지막 값 (값이 바뀔 때만 DOM 갱신)

function put(node, key, html) {
  if (!node) return;
  if (cache.get(node) === key) return;
  cache.set(node, key);
  node.innerHTML = html;
}
function show(node, on) { if (node) node.classList.toggle('hidden', !on); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
const sw = (id) => `<i class="swatch ${esc(id)}"></i>`;
const matName = (id) => (MATERIALS[id] ? MATERIALS[id].name : id || '-');

function bestText(G) {
  let b = G && G.best;
  if (b == null || b === 0) b = store.get('bb.best', null);
  if (b == null || b === 0) return '최고 기록: 없음';
  if (typeof b === 'number') return `최고 기록: ${b.toLocaleString()}점`;
  const parts = [];
  if (b.stage) parts.push(`스테이지 ${b.stage}`);
  if (b.score != null) parts.push(`${Number(b.score).toLocaleString()}점`);
  return '최고 기록: ' + (parts.join(' · ') || '없음');
}

function enemyInfoHtml(e) {
  if (!e) return '';
  const abil = (e.abil || []).map((a) => esc(abilText(a))).join('<br>') || '능력 없음';
  return `<b>${e.boss ? '보스 · ' : ''}${esc(e.name)}</b>
    <div class="row"><span class="weak">약점 ${sw(e.weak)} ${esc(matName(e.weak))}</span> ·
      <span class="resist">저항 ${sw(e.resist)} ${esc(matName(e.resist))}</span></div>
    <div class="row">${abil}</div>`;
}

function guard(node, fn) {
  if (!node) return;
  node.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  node.addEventListener('pointerup', (ev) => ev.stopPropagation());
  node.addEventListener('click', (ev) => { ev.stopPropagation(); if (fn) fn(ev); });
}
const call = (name, ...a) => () => { if (typeof api[name] === 'function') api[name](...a); };

function openCards(cards) {
  const list = Array.isArray(cards) ? cards : [];
  shownCards = list;
  const G = (typeof api.getG === 'function' && api.getG()) || lastG || {};
  if (!el.cardList || !el.scrCards) return;
  const next = ENEMIES[G.stage] || null;              // cards 중 G.stage = 방금 이긴 스테이지
  if (el.nextEnemy) el.nextEnemy.innerHTML = next ? `<div class="row" style="margin:0 0 2px">다음 적 (스테이지 ${G.stage + 1})</div>${enemyInfoHtml(next)}` : '';
  show(el.nextEnemy, !!next);
  el.cardList.innerHTML = list.map((c, i) => {
    const d = (DEF[c.kind] || {})[c.id] || { name: c.id, desc: '' };
    const rar = c.rarity || d.rarity || 'common';
    let extra = '';
    if (c.kind === 'upgrade') extra = ` <span class="badge" style="color:#9aa8a0">Lv ${((G.upgrades || {})[c.id] || 0) + 1}/${d.max || '?'}</span>`;
    if (c.tag === 'weak') extra += ' <span class="badge weak">다음 적 약점</span>';
    if (c.tag === 'resist') extra += ' <span class="badge resist">다음 적 저항</span>';
    const icon = c.kind === 'material' ? sw(c.id) : '';
    return `<button class="card ${esc(rar)}" data-i="${i}">
      <div class="top"><span class="kind ${esc(c.kind)}">${KIND[c.kind] || ''}</span><span class="rar">${RAR[rar] || rar}</span></div>
      <div class="name">${icon}${esc(d.name)}${extra}</div>
      <div class="desc">${esc(d.desc)}</div></button>`;
  }).join('');
  el.cardList.querySelectorAll('.card').forEach((b) => guard(b, () => {
    const i = Number(b.dataset.i);
    if (shownCards && typeof api.chooseCard === 'function') api.chooseCard(i);
  }));
  show(el.scrCards, true);
}
function closeCards() { shownCards = null; if (el.scrCards) show(el.scrCards, false); }

export function initUI(a) {
  api = a || {};
  const ids = ['hud', 'hStage', 'hWorld', 'hBalls', 'hScore', 'hMat', 'hTraits', 'hEnemy', 'hWeak', 'hResist', 'hAbil',
    'btnPause', 'hint', 'scrTitle', 'btnStart', 'titleBest', 'scrCards', 'nextEnemy', 'cardList',
    'scrPause', 'btnResume', 'btnMute', 'btnPauseTitle', 'scrEnd', 'endTitle', 'endInfo', 'btnRestart', 'btnEndTitle'];
  el = {};
  for (const id of ids) el[id] = $(id);

  guard(el.btnPause, call('pause'));
  guard(el.btnStart, call('start'));
  guard(el.btnResume, call('resume'));
  guard(el.btnPauseTitle, call('toTitle'));
  guard(el.btnMute, () => { const G = lastG || {}; if (typeof api.setMuted === 'function') api.setMuted(!G.muted); });
  guard(el.btnRestart, call('restart'));
  guard(el.btnEndTitle, call('toTitle'));
  // 오버레이 화면 전체가 플리퍼 입력을 먹지 않게
  for (const s of [el.scrTitle, el.scrCards, el.scrPause, el.scrEnd, el.hud]) {
    if (s) s.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  }
  // 카드 화면 숫자키 1~4
  window.addEventListener('keydown', (ev) => {
    if (!shownCards) return;
    const n = Number(ev.key);
    if (n >= 1 && n <= shownCards.length && typeof api.chooseCard === 'function') api.chooseCard(n - 1);
  });

  bus.on('cards', (d) => openCards(d && d.cards));
  bus.on('cardChosen', closeCards);
  if (el.titleBest) el.titleBest.textContent = bestText(null);
}

export function updateUI(G) {
  if (!G || !el.hud) return;
  lastG = G;
  const ph = G.phase || 'title';

  // 화면 전환
  show(el.scrTitle, ph === 'title');
  show(el.scrPause, ph === 'paused');
  show(el.scrEnd, ph === 'gameover' || ph === 'victory');
  show(el.hint, ph === 'launch');
  show(el.btnPause, ph === 'launch' || ph === 'play');
  if (ph === 'cards' && !shownCards) openCards(G.cards);
  if (ph !== 'cards' && shownCards) closeCards();

  if (ph === 'paused') put(el.btnMute, 'm' + !!G.muted, G.muted ? '소리 켜기' : '소리 끄기');
  if (ph === 'title') put(el.titleBest, 'b' + JSON.stringify(G.best), esc(bestText(G)));
  if (ph === 'gameover' || ph === 'victory') {
    const k = `${ph}|${G.stage}|${G.score}|${JSON.stringify(G.best)}`;
    put(el.endTitle, ph, ph === 'victory' ? '승리!' : '게임 오버');
    put(el.endInfo, k, `${ph === 'victory' ? '25스테이지 모두 돌파!' : `스테이지 ${G.stage} 에서 쓰러짐`}<br>
      점수 <b>${(G.score || 0).toLocaleString()}</b><br>${esc(bestText(G))}`);
  }

  // HUD
  const w = WORLDS[G.world] || WORLDS[0];
  put(el.hStage, 's' + G.stage, `${G.stage || 1}/${CONST.STAGES}`);
  const bd = (typeof api.getBoard === 'function' && api.getBoard()) || {};
  put(el.hWorld, 'w' + G.world + '|' + (bd.frame || '') + '|' + ph, ph === 'title' || !bd.gimmickName ? esc(w.name)
    : `${esc(w.name)} · ${esc(bd.frameName)} · <span class="hgim">${esc(bd.gimmickName)}</span>`);
  put(el.hBalls, 'b' + G.ballsLeft, String(G.ballsLeft ?? 0));
  put(el.hScore, 'c' + G.score, (G.score || 0).toLocaleString());
  const owned = (G.materials || []).filter((id) => id !== G.material);
  put(el.hMat, 'm' + G.material + '|' + (G.materials || []).join(','),
    `${sw(G.material || 'normal')}${esc(matName(G.material || 'normal'))}` +
    (owned.length ? ` <span style="opacity:.75;font-size:12px">+ ${owned.map((id) => sw(id)).join('')}</span>` : ''));
  const tr = G.traits || [];
  put(el.hTraits, 't' + tr.join(','), [0, 1, 2, 3].map((i) => {
    const t = TRAITS[tr[i]];
    return t ? `<span class="chip ${t.rarity}" title="${esc(t.desc)}">${esc(t.name)}</span>` : '<span class="chip empty">·</span>';
  }).join(''));
  const e = G.enemy;
  const ek = e ? `${e.name}|${e.boss}` : '-';
  put(el.hEnemy, 'e' + ek, e ? `${e.boss ? '보스 ' : ''}${esc(e.name)}` : '');
  if (el.hEnemy) el.hEnemy.classList.toggle('boss', !!(e && e.boss));
  put(el.hWeak, 'k' + ek, e && e.weak ? `약점 ${sw(e.weak)}${esc(matName(e.weak))}` : '');
  put(el.hResist, 'r' + ek, e && e.resist ? `저항 ${sw(e.resist)}${esc(matName(e.resist))}` : '');
  put(el.hAbil, 'a' + ek, e ? esc((e.abil || []).map((a) => ABIL_LABEL[a.t] || a.t).join('·') || '능력 없음') : '');
  if (el.hAbil && e) el.hAbil.title = (e.abil || []).map(abilText).join('\n');
}
