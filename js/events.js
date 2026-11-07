// 바운스 브레이커 — 이벤트 버스 (리드 소유, docs/구조.md 4장 참고)
const handlers = new Map();

export const bus = {
  on(name, fn) {
    if (!handlers.has(name)) handlers.set(name, []);
    handlers.get(name).push(fn);
    return () => bus.off(name, fn);
  },
  off(name, fn) {
    const list = handlers.get(name);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  },
  emit(name, data = {}) {
    const list = handlers.get(name);
    if (!list) return;
    for (const fn of list.slice()) {
      try { fn(data); } catch (e) { console.error(`[bus ${name}]`, e); }
    }
  },
};

export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  },
};
