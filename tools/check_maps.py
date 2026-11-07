# -*- coding: utf-8 -*-
"""바운스 브레이커 — 적 맵 자동 검사 (기획자 작성, 테스터 재사용)

사용법:  python tools/check_maps.py [js/data.js 경로] [-v]
- js/data.js 안의 /*ENEMIES_JSON_BEGIN*/ ... /*ENEMIES_JSON_END*/ 사이 JSON 을 읽는다.
- CONST 의 MAP_GAP, MAP_BOX, ENTRY_ZONE, TARGET_R, WALL_R, GUARD_R, DEFAULT_E 를 텍스트에서 읽는다.
검사 항목 (위반 1개 이상이면 종료 코드 1):
 1. 적 수 = CONST.STAGES, 5번째마다 boss:true, shape/weak/resist/abil 형식
 2. 모든 물체(범퍼·레인·타깃·벽·적 몸체 이동 범위·호위병 궤도·순간이동 지점)가 MAP_BOX 안
    (MAP_BOX 는 외벽과의 간격까지 반영한 범위)
 3. 발사 진입 구역(ENTRY_ZONE)에 물체 없음
 4. 서로 다른 물체(끝점이 이어진 벽은 한 물체) 사이 가장자리 간격 >= MAP_GAP
 5. 호위병 궤도와 적 몸체 사이 간격 >= MAP_GAP, 범퍼 반지름 14~24
"""
import json, math, re, sys, os
try: sys.stdout.reconfigure(encoding=os.environ.get('PYTHONIOENCODING') or sys.stdout.encoding, errors='replace')
except Exception: pass

HERE = os.path.dirname(os.path.abspath(__file__))
path = os.path.join(HERE, '..', 'js', 'data.js')
verbose = False
for a in sys.argv[1:]:
    if a == '-v': verbose = True
    else: path = a

src = open(path, encoding='utf-8').read()
m = re.search(r'/\*ENEMIES_JSON_BEGIN\*/(.*?)/\*ENEMIES_JSON_END\*/', src, re.S)
if not m:
    print('ENEMIES_JSON 블록을 찾지 못함'); sys.exit(2)
enemies = json.loads(m.group(1))

def const_num(name):
    mm = re.search(r'\b' + name + r'\s*:\s*([-\d.]+)', src)
    if not mm: raise SystemExit('CONST.%s 없음' % name)
    return float(mm.group(1))

def const_arr(name):
    mm = re.search(r'\b' + name + r'\s*:\s*\[([^\]]*)\]', src)
    if not mm: raise SystemExit('CONST.%s 없음' % name)
    return [float(v) for v in mm.group(1).split(',')]

GAP = const_num('MAP_GAP')
BOX = const_arr('MAP_BOX')          # [x0, y0, x1, y1]
ENTRY = const_arr('ENTRY_ZONE')     # [x0, y0, x1, y1] 이 사각형과 겹치면 안 됨
TR = const_num('TARGET_R'); WR = const_num('WALL_R'); GR = const_num('GUARD_R')
DEF_E = const_arr('DEFAULT_E')
_mb = re.search(r'export const MATERIALS\s*=\s*\{(.*?)\n\};', src, re.S)
MAT_IDS = set(re.findall(r"\bid\s*:\s*'(\w+)'", _mb.group(1))) if _mb else set()
if not MAT_IDS: raise SystemExit('MATERIALS 블록을 찾지 못함')
SHAPES = {'blob', 'box', 'spike', 'ghost', 'eye'}
_ab = re.search(r'export const ABIL_LABEL\s*=\s*\{(.*?)\};', src, re.S)
ABILS = set(re.findall(r'(\w+)\s*:\s*\'', _ab.group(1))) if _ab else set()
if not ABILS: raise SystemExit('ABIL_LABEL 블록을 찾지 못함')

# ---------- 기하 ----------
def seg_seg(p1, p2, q1, q2):
    def dot(a, b): return a[0]*b[0] + a[1]*b[1]
    def sub(a, b): return (a[0]-b[0], a[1]-b[1])
    def pt_seg(p, a, b):
        ab = sub(b, a); l2 = dot(ab, ab)
        t = 0 if l2 == 0 else max(0, min(1, dot(sub(p, a), ab) / l2))
        c = (a[0] + ab[0]*t, a[1] + ab[1]*t)
        return math.hypot(p[0]-c[0], p[1]-c[1])
    def cross(o, a, b): return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])
    d1, d2 = cross(q1, q2, p1), cross(q1, q2, p2)
    d3, d4 = cross(p1, p2, q1), cross(p1, p2, q2)
    if ((d1 > 0) != (d2 > 0)) and ((d3 > 0) != (d4 > 0)) and d1 and d2 and d3 and d4:
        return 0.0
    return min(pt_seg(p1, q1, q2), pt_seg(p2, q1, q2), pt_seg(q1, p1, p2), pt_seg(q2, p1, p2))

def inside(p, poly):
    if len(poly) < 3: return False
    s = None
    for i in range(len(poly)):
        a, b = poly[i], poly[(i+1) % len(poly)]
        c = (b[0]-a[0])*(p[1]-a[1]) - (b[1]-a[1])*(p[0]-a[0])
        if c == 0: continue
        if s is None: s = c > 0
        elif s != (c > 0): return False
    return True

def edges(poly):
    if len(poly) == 1: return [(poly[0], poly[0])]
    if len(poly) == 2: return [(poly[0], poly[1])]
    return [(poly[i], poly[(i+1) % len(poly)]) for i in range(len(poly))]

def core_dist(P, Q):
    if any(inside(p, Q) for p in P) or any(inside(q, P) for q in Q): return 0.0
    return min(seg_seg(a, b, c, d) for a, b in edges(P) for c, d in edges(Q))

def rect(x0, y0, x1, y1): return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]

class Obj:
    def __init__(s, label, core, rad, group):
        s.label, s.core, s.rad, s.group = label, core, rad, group
    def bbox(s):
        xs = [p[0] for p in s.core]; ys = [p[1] for p in s.core]
        return (min(xs)-s.rad, min(ys)-s.rad, max(xs)+s.rad, max(ys)+s.rad)

def objects_of(e):
    mp = e['map']; out = []
    for i, (x, y, r) in enumerate(mp.get('b', [])):
        out.append(Obj('범퍼%d' % i, [(x, y)], r, 'b%d' % i))
    for i, (x, y, w, h) in enumerate(mp.get('l', [])):
        out.append(Obj('레인%d' % i, rect(x, y, x+w, y+h), 0, 'l%d' % i))
    for i, (x, y, ln, ang) in enumerate(mp.get('t', [])):
        dx = math.cos(math.radians(ang)) * ln / 2; dy = math.sin(math.radians(ang)) * ln / 2
        out.append(Obj('타깃%d' % i, [(x-dx, y-dy), (x+dx, y+dy)], TR, 't%d' % i))
    # 끝점을 공유하는 벽(꺾인 벽 한 줄)은 같은 물체로 본다
    ws = mp.get('w', []); grp = list(range(len(ws)))
    def find(a):
        while grp[a] != a: a = grp[a]
        return a
    for a in range(len(ws)):
        for b in range(a+1, len(ws)):
            pa = {(ws[a][0], ws[a][1]), (ws[a][2], ws[a][3])}
            pb = {(ws[b][0], ws[b][1]), (ws[b][2], ws[b][3])}
            if pa & pb: grp[find(b)] = find(a)
    for i, (x1, y1, x2, y2) in enumerate(ws):
        out.append(Obj('벽%d' % i, [(x1, y1), (x2, y2)], WR, 'w%d' % find(i)))
    ex, ey, er = mp.get('e', DEF_E)
    mv = next((a for a in e['abil'] if a['t'] == 'move'), None)
    ax, ay = (mv['ax'], mv['ay']) if mv else (0, 0)
    gd = next((a for a in e['abil'] if a['t'] == 'guard'), None)
    tp = next((a for a in e['abil'] if a['t'] == 'tp'), None)
    centers = [(ex, ey)] + ([tuple(p) for p in tp['pts']] if tp else [])
    for k, (cx, cy) in enumerate(centers):
        core = rect(cx-ax, cy-ay, cx+ax, cy+ay) if (ax or ay) else [(cx, cy)]
        if ax and not ay: core = [(cx-ax, cy), (cx+ax, cy)]
        if ay and not ax: core = [(cx, cy-ay), (cx, cy+ay)]
        rad = (gd['orbit'] + GR) if gd else er
        out.append(Obj('적몸체' + ('(호위궤도)' if gd else '') + ('@%d' % k if k else ''), core, rad, 'e'))
    return out

errors = []
def err(i, msg): errors.append('[%02d %s] %s' % (i+1, enemies[i]['name'] if i < len(enemies) else '?', msg))

STAGES = int(const_num('STAGES'))
if len(enemies) != STAGES: errors.append('적 수 %d (CONST.STAGES=%d 필요)' % (len(enemies), STAGES))
for i, e in enumerate(enemies):
    if e.get('shape') not in SHAPES: err(i, 'shape 이상: %s' % e.get('shape'))
    if MAT_IDS:
        for k in ('weak', 'resist'):
            if e.get(k) not in MAT_IDS or e.get(k) == 'normal': err(i, '%s 재질 이상: %s' % (k, e.get(k)))
    if e.get('weak') == e.get('resist'): err(i, 'weak == resist')
    if bool(e.get('boss')) != ((i+1) % 5 == 0): err(i, 'boss 플래그 위치 이상')
    for a in e['abil']:
        if a.get('t') not in ABILS: err(i, '알 수 없는 능력 %s' % a.get('t'))
    mp = e['map']
    for k in mp:
        if k not in ('b', 'l', 't', 'w', 'e'): err(i, '맵 키 이상 %s' % k)
    for (x, y, r) in mp.get('b', []):
        if not (14 <= r <= 24): err(i, '범퍼 반지름 %s (14~24)' % r)
    er = mp.get('e', DEF_E)[2]
    gd = next((a for a in e['abil'] if a['t'] == 'guard'), None)
    if gd and gd['orbit'] - GR - er < GAP: err(i, '호위병-몸체 간격 %.1f < %d' % (gd['orbit']-GR-er, GAP))
    objs = objects_of(e)
    for o in objs:
        x0, y0, x1, y1 = o.bbox()
        if x0 < BOX[0]-1e-6 or y0 < BOX[1]-1e-6 or x1 > BOX[2]+1e-6 or y1 > BOX[3]+1e-6:
            err(i, '%s 영역 밖 (%.0f,%.0f)-(%.0f,%.0f)' % (o.label, x0, y0, x1, y1))
        if x1 > ENTRY[0] and x0 < ENTRY[2] and y1 > ENTRY[1] and y0 < ENTRY[3]:
            err(i, '%s 발사 진입 구역 침범' % o.label)
    mind = 1e9
    for a in range(len(objs)):
        for b in range(a+1, len(objs)):
            A, B = objs[a], objs[b]
            if A.group == B.group: continue
            d = core_dist(A.core, B.core) - A.rad - B.rad
            mind = min(mind, d)
            if d < GAP - 1e-6: err(i, '%s - %s 간격 %.1f' % (A.label, B.label, d))
    if verbose:
        print('%02d %-10s 물체 %2d  최소간격 %.1f' % (i+1, e['name'], len(objs), mind))

if errors:
    print('위반 %d건' % len(errors))
    for x in errors: print(' ', x)
    sys.exit(1)
print('맵 검사 통과: 적 %d개, 위반 0 (최소 간격 %dpx)' % (len(enemies), GAP))
