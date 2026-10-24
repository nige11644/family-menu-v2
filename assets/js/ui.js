/** 通用 UI 工具：图标、提示、底部面板、时间格式 */

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

const ICONS = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19c.6-3.1 2.8-5 5.5-5s4.9 1.9 5.5 5"/><path d="M16 6.2c1.6.4 2.7 1.6 2.7 3.2 0 1.1-.5 2-1.4 2.6"/>',
  flame: '<path d="M12 3c3 3.4 5 5.9 5 9a5 5 0 01-10 0c0-1.7.7-2.9 1.7-4.2.6 1.1 1.2 1.7 2 2.1.4-2 .9-3.8 1.3-6z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  bell: '<path d="M6.5 16V11a5.5 5.5 0 0111 0v5l1.5 2H5l1.5-2z"/><path d="M10 20.5h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1.08-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1.08 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.2.62.78 1.06 1.42 1.09H21a2 2 0 110 4h-.09c-.64.03-1.22.47-1.51 1.09z"/>',
  bowl: '<path d="M4 11h16a8 8 0 01-16 0z"/><path d="M8.5 7.5c0-1 1-1.4 1-2.5M12 7c0-1.2 1-1.6 1-3M15.5 7.5c0-.9 1-1.3 1-2.3"/>',
  receipt: '<path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z"/><path d="M9 8h6M9 11.5h6M9 15h4"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.2" fill="currentColor" stroke="none"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/><path d="M10 11v5M14 11v5"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.8M9.5 2.5h5"/>',
  refresh: '<path d="M20 11a8 8 0 10-2.5 6.5"/><path d="M20 5v6h-6"/>',
  edit: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 00-3-3L5 17v3z"/><path d="M14.5 6.5l3 3"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M5 17l4.5-4.5 3 3L16 12l3.5 3.5"/>',
  logout: '<path d="M15 8V4H5v16h10v-4"/><path d="M9 12h11M17 8l4 4-4 4"/>',
  key: '<circle cx="7" cy="13" r="3.5"/><path d="M10.5 13h7.5M15 10.5V13M17 13v2.5"/>',
  wifi: '<path d="M2.5 8.5a15 15 0 0119 0M5.5 12a10.5 10.5 0 0113 0M8.7 15.4a5.5 5.5 0 016.6 0"/><circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none"/>',
  play: '<path d="M8 5.5l11 6.5-11 6.5z"/>',
  star: '<path d="M12 3.6l2.6 5.2 5.8.9-4.2 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.6 9.7l5.8-.9z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>'
};

export function icon(name, size = 20, cls = '') {
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

/* ---------------- 提示 ---------------- */
const toastLayer = () => document.getElementById('toast-layer');

// duration 传 0 表示常驻，返回的 dismiss() 用来手动关掉（配合 loading 提示）
export function toast(msg, opts = {}) {
  const layer = toastLayer();
  if (!layer) return () => {};
  const type = opts.type || '';
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const mark = type === 'loading'
    ? '<span class="t-spin"></span>'
    : icon(type === 'success' ? 'check' : 'bell', 18);
  el.innerHTML = `<span class="t-icon">${mark}</span><span>${esc(msg)}</span>`;
  layer.appendChild(el);

  let done = false;
  let timer = null;
  const dismiss = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    el.classList.add('out');
    setTimeout(() => el.remove(), 240);
  };
  const duration = opts.duration === 0 ? 0 : (opts.duration || 2600);
  if (duration > 0) timer = setTimeout(dismiss, duration);
  return dismiss;
}

/* ---------------- 声音 / 震动 ---------------- */
let audioCtx = null;

export function beep(kind = 'new') {
  if (localStorage.getItem('fm_sound') === 'off') return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const notes = kind === 'new' ? [660, 880] : [880, 660];
    notes.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.12, now + i * 0.16 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.16 + 0.22);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now + i * 0.16);
      osc.stop(now + i * 0.16 + 0.24);
    });
  } catch (_) { /* 静默失败 */ }
}

export function haptic(ms = 8) {
  try { navigator.vibrate?.(ms); } catch (_) { /* ignore */ }
}

/* ---------------- 底部面板 ---------------- */
export function openSheet({ title = '', sub = '', body = '', footer = '', className = '', onMount, onClose } = {}) {
  const root = document.getElementById('sheet-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  const sheet = document.createElement('div');
  sheet.className = `sheet ${className}`;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.innerHTML = `
    <div class="sheet-grip"><i></i></div>
    <div class="sheet-head">
      <div class="grow">
        <h3>${esc(title)}</h3>
        ${sub ? `<div class="sh-sub">${esc(sub)}</div>` : ''}
      </div>
      <button class="icon-btn" data-sheet-close aria-label="关闭">${icon('close', 20)}</button>
    </div>
    <div class="sheet-body">${body}</div>
    ${footer ? `<div class="sheet-foot">${footer}</div>` : ''}
  `;
  root.appendChild(backdrop);
  root.appendChild(sheet);
  document.body.style.overflow = 'hidden';

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.body.style.overflow = '';
    backdrop.remove();
    sheet.classList.add('closing');
    setTimeout(() => sheet.remove(), 210);
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', close);
  sheet.querySelectorAll('[data-sheet-close]').forEach((b) => b.addEventListener('click', close));
  onMount?.({ sheet, body: sheet.querySelector('.sheet-body'), close });
  return { sheet, close };
}

export function confirmSheet({ title, message, confirmText = '确定', danger = false }) {
  return new Promise((resolve) => {
    // 点遮罩/关闭按钮/Esc 也要给出结论，否则调用方会一直 await
    let settled = false;
    const settle = (val) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };
    const { close } = openSheet({
      title,
      body: `<p style="font-size:14px;line-height:1.65;color:var(--ink-2);padding:4px 0 12px">${esc(message)}</p>`,
      footer: `<button class="btn ghost" data-cancel>取消</button>
               <button class="btn ${danger ? '' : ''}" data-ok>${esc(confirmText)}</button>`,
      onMount: ({ sheet }) => {
        sheet.querySelector('[data-cancel]').addEventListener('click', () => { settle(false); close(); });
        sheet.querySelector('[data-ok]').addEventListener('click', () => { settle(true); close(); });
      },
      onClose: () => settle(false)
    });
  });
}

/* ---------------- 时间 ---------------- */
export function fmtTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fmtDate(iso) {
  const d = new Date(iso);
  const week = '日一二三四五六'[d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日 · 周${week}`;
}

export function timeAgo(iso) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return fmtTime(iso);
}

export function isToday(iso) {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

/* ---------------- 其它 ---------------- */
export function resolveImg(src) {
  if (!src) return 'assets/img/hero-table.jpg';
  return src;
}

export function statusMeta(status) {
  return {
    pending: { label: '待接单', cls: 'pending' },
    cooking: { label: '制作中', cls: 'cooking' },
    done: { label: '已完成', cls: 'done' },
    cancelled: { label: '已取消', cls: 'cancelled' }
  }[status] || { label: '待接单', cls: 'pending' };
}

export function debounce(fn, wait = 220) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function formatQty(n) {
  return Number(n) % 1 === 0 ? String(n) : String(n);
}

export function go(path) {
  if (location.hash === `#${path}`) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = path;
  }
}
