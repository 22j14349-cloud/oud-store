export const CATEGORIES = [
  { id: 'perfume',      name: 'العطور',        icon: 'bottle', subtypes: ['عطر فرنسي', 'عطر شرقي', 'عطر عود', 'مسك', 'معطر مفارش', 'عطر جسم'] },
  { id: 'oil',          name: 'الأدهان',       icon: 'oil',    subtypes: ['دهن عود', 'دهن ورد', 'دهن مسك', 'دهن عنبر', 'زيت عطري', 'مخمرية'] },
  { id: 'incense',      name: 'البخور',        icon: 'burner', subtypes: ['بخور معمول', 'عود بخور', 'دخون', 'مبخرة', 'فحم بخور'] },
  { id: 'frankincense', name: 'اللبان العُماني', icon: 'resin',  subtypes: ['لبان حوجري', 'لبان نجدي', 'لبان شعبي', 'ماء اللبان', 'زيت اللبان', 'لبان مطحون'] },
];
export const catById = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[0];

export const PAY_METHODS = { cash: 'نقداً', transfer: 'تحويل بنكي', card: 'بطاقة' };

export const money = n => `${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ر.ع.`;

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function ean13(first12) {
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(first12[i]) * (i % 2 ? 3 : 1);
  return first12 + ((10 - (s % 10)) % 10);
}

export function fmtDate(d, withTime = true) {
  const opt = { year: 'numeric', month: 'short', day: 'numeric' };
  if (withTime) Object.assign(opt, { hour: '2-digit', minute: '2-digit' });
  return new Date(d).toLocaleString('ar-OM', opt);
}

export function toast(msg, type = 'ok') {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.append(box); }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  box.append(t);
  setTimeout(() => t.classList.add('out'), 2800);
  setTimeout(() => t.remove(), 3300);
}

export function beep(ok = true) {
  try {
    const ctx = beep.ctx || (beep.ctx = new (window.AudioContext || window.webkitAudioContext)());
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = ok ? 1150 : 300; o.type = 'square';
    g.gain.setValueAtTime(0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.16);
  } catch { /* no audio */ }
}

// تصغير الصورة قبل رفعها (يحافظ على سرعة الموقع)
export function resizeImage(file, max = 900, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => (b ? resolve(b) : reject(new Error('image'))), 'image/jpeg', quality);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error('صيغة الصورة غير مدعومة'));
    img.src = URL.createObjectURL(file);
  });
}
export const blobToDataURL = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });

// أيقونات الأقسام (SVG بخط ذهبي)
const ICONS = {
  bottle: '<path d="M26 8h12v7H26z"/><path d="M28 15v5c-8 3-13 10-13 19v9c0 5 4 8 9 8h16c5 0 9-3 9-8v-9c0-9-5-16-13-19v-5"/><path d="M22 40h20"/><path d="M32 2v6"/>',
  oil: '<path d="M27 4h10l-1 8h-8z"/><path d="M28 12h8v6c6 3 10 9 10 17v15a8 8 0 0 1-8 8H26a8 8 0 0 1-8-8V35c0-8 4-14 10-17z"/><path d="M32 30c-3 5-5 8-5 11a5 5 0 0 0 10 0c0-3-2-6-5-11z"/>',
  burner: '<path d="M20 36h24l-3 10H23z"/><path d="M26 46v6h12v-6"/><path d="M18 56h28"/><path d="M22 36c0-4 4-6 10-6s10 2 10 6"/><path d="M32 26c-4-4 4-7 0-11s4-7 0-11"/><path d="M38 24c-3-3 3-5 0-8"/>',
  resin: '<path d="M20 30c-6 2-8 9-4 13s11 2 12-4-3-11-8-9z"/><path d="M38 22c-5 0-8 6-6 10s9 4 11-1-0-9-5-9z"/><path d="M36 42c-5 1-6 8-2 11s10 0 10-5-3-7-8-6z"/><path d="M14 56h36"/>',
  logo: '<path d="M20 38h24l-3 9H23z"/><path d="M26 47v5h12v-5"/><path d="M19 56h26"/><path d="M23 38c0-4 4-6 9-6s9 2 9 6"/><path d="M32 27c-4-4 4-7 0-11s4-7 0-11"/><path d="M38 25c-3-3 3-5 0-8"/><path d="M26 25c-3-3 3-5 0-8"/>',
};
export const icon = (name, cls = '') =>
  `<svg class="ico ${cls}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

export function productVisual(p) {
  if (p.image_url) return `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy">`;
  return `<div class="ph ph-${esc(p.category)}">${icon(catById(p.category).icon)}</div>`;
}

export function openModal(html, { wide = false, onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <button class="modal-x" aria-label="إغلاق">×</button>${html}</div>`;
  const close = () => { wrap.classList.add('out'); setTimeout(() => wrap.remove(), 200); onClose && onClose(); };
  wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('.modal-x')) close(); });
  document.body.append(wrap);
  return { el: wrap.querySelector('.modal'), close };
}

// نافذة تأكيد داخل الصفحة بدلاً من confirm()
export function ask(message, { ok = 'تأكيد', cancel = 'رجوع', danger = false } = {}) {
  return new Promise(resolve => {
    let done = false;
    const m = openModal(`<p style="font-size:1.1rem;font-weight:700;margin:14px 0 20px">${esc(message)}</p>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-ghost" data-n>${cancel}</button><button class="btn ${danger ? 'btn-danger' : 'btn-gold'}" data-y>${ok}</button></div>`,
      { onClose: () => { if (!done) { done = true; resolve(false); } } });
    m.el.querySelector('[data-y]').onclick = () => { done = true; resolve(true); m.close(); };
    m.el.querySelector('[data-n]').onclick = () => m.close();
  });
}
