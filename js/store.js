import { db, DEMO } from './db.js';
import { splash, installButton, rememberShopName } from './pwa.js';
import { CATEGORIES, catById, money, esc, $, $$, toast, icon, productVisual, openModal } from './util.js';

const HERO_ART = `<svg viewBox="0 0 400 400" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
  <defs><radialGradient id="glow" cx="50%" cy="70%" r="50%"><stop offset="0" stop-color="#d2a855" stop-opacity=".35"/><stop offset="1" stop-color="#d2a855" stop-opacity="0"/></radialGradient></defs>
  <circle cx="200" cy="270" r="190" fill="url(#glow)" stroke="none"/>
  <g stroke-width="2.2" opacity=".95">
    <path d="M130 250h140l-16 46H146z"/><path d="M160 296v26h80v-26"/><path d="M120 340h160"/>
    <path d="M140 250c0-22 26-34 60-34s60 12 60 34"/><path d="M200 216v-10"/><circle cx="200" cy="200" r="6"/>
    <path d="M150 272h100" opacity=".6"/><path d="M158 284l6-12M178 284l4-12M198 284v-12M218 284l-4-12M238 284l-6-12" opacity=".5"/>
  </g>
  <g stroke-width="1.6" opacity=".7">
    <path d="M200 190c-24-24 24-42 0-66s24-42 0-66"><animate attributeName="opacity" values=".2;.8;.2" dur="6s" repeatCount="indefinite"/></path>
    <path d="M222 180c-18-18 18-32 0-50s18-32 0-50"><animate attributeName="opacity" values=".7;.2;.7" dur="7s" repeatCount="indefinite"/></path>
    <path d="M178 182c-18-18 18-32 0-50s18-32 0-50"><animate attributeName="opacity" values=".3;.7;.3" dur="5s" repeatCount="indefinite"/></path>
  </g>
  <g stroke-width="2" opacity=".85" transform="translate(300 200)">
    <path d="M-12 0h24v14h-24z"/><path d="M-8 14v10c-16 6-26 20-26 38v20c0 10 8 16 18 16h32c10 0 18-6 18-16V62c0-18-10-32-26-38V14"/><path d="M-24 66h48" opacity=".6"/>
  </g>
  <g stroke-width="1.8" opacity=".8"><path d="M60 330c-12 4-14 18-6 24s20 2 22-8-6-18-16-16z"/><path d="M90 318c-9 0-14 10-10 17s16 6 18-2-1-15-8-15z"/></g>
</svg>`;

const state = { products: [], cat: 'all', sub: '', q: '', settings: {}, cart: loadCart() };

function loadCart() { try { return JSON.parse(localStorage.getItem('oud_cart')) || {}; } catch { return {}; } }
function saveCart() { try { localStorage.setItem('oud_cart', JSON.stringify(state.cart)); } catch {} renderCartBadge(); }
const cartItems = () => Object.entries(state.cart).map(([id, qty]) => ({ p: state.products.find(x => x.id === id), qty })).filter(x => x.p && x.p.active);
const cartTotal = () => cartItems().reduce((s, x) => s + x.p.price * x.qty, 0);

async function init() {
  splash('store'); installButton($('#installBtn'));
  if (DEMO) $('#demo').classList.remove('hidden');
  $('#brandMark').innerHTML = icon('logo');
  $('#brandMark2').innerHTML = icon('logo');
  $('#heroArt').innerHTML = HERO_ART;
  $('#grid').innerHTML = '<div class="skeleton"></div>'.repeat(6);
  renderCats();
  $('#search').addEventListener('input', e => { state.q = e.target.value.trim(); renderGrid(); });
  $('#cartBtn').addEventListener('click', openCart);
  $('#stickyBtn').addEventListener('click', openCart);
  try {
    [state.settings, state.products] = await Promise.all([db.getSettings(), db.listProducts()]);
  } catch (e) { toast('تعذر تحميل المنتجات: ' + e.message, 'bad'); }
  const name = state.settings.shop_name || 'عطور سمائل';
  $('#shopName').textContent = name; $('#footName').textContent = name; rememberShopName(state.settings.shop_name);
  document.title = `${name} | عطور وبخور ولبان عُماني`;
  $('#storeNote').textContent = state.settings.store_note || '';
  // تنظيف السلة من منتجات لم تعد متوفرة
  for (const id of Object.keys(state.cart)) if (!state.products.some(p => p.id === id && p.active)) delete state.cart[id];
  saveCart(); renderGrid();
  const last = JSON.parse(localStorage.getItem('oud_last_order') || 'null');
  if (last && Date.now() - last.at < 3 * 3600e3 && !last.done) setTimeout(() => showPayment(last), 400);
}

function renderCats() {
  const all = [{ id: 'all', name: 'الكل', icon: 'logo' }, ...CATEGORIES];
  $('#cats').innerHTML = all.map(c => `<button class="cat ${state.cat === c.id ? 'on' : ''}" data-c="${c.id}">${icon(c.icon)}<span>${c.name}</span></button>`).join('');
  $$('#cats .cat').forEach(b => b.onclick = () => { state.cat = b.dataset.c; state.sub = ''; renderCats(); renderGrid(); });
}

function renderSubs(list) {
  if (state.cat === 'all') { $('#subs').innerHTML = ''; return; }
  const subs = [...new Set(list.filter(p => p.category === state.cat).map(p => p.subtype).filter(Boolean))];
  $('#subs').innerHTML = subs.length > 1 ? [`<button class="sub ${!state.sub ? 'on' : ''}" data-s="">الكل</button>`, ...subs.map(s => `<button class="sub ${state.sub === s ? 'on' : ''}" data-s="${esc(s)}">${esc(s)}</button>`)].join('') : '';
  $$('#subs .sub').forEach(b => b.onclick = () => { state.sub = b.dataset.s; renderGrid(); });
}

function renderGrid() {
  const active = state.products.filter(p => p.active);
  renderSubs(active);
  const q = state.q.toLowerCase();
  const list = active.filter(p => (state.cat === 'all' || p.category === state.cat) && (!state.sub || p.subtype === state.sub)
    && (!q || `${p.name} ${p.subtype} ${p.description}`.toLowerCase().includes(q)));
  $('#empty').classList.toggle('hidden', list.length > 0);
  $('#grid').innerHTML = list.map(p => {
    const inCart = state.cart[p.id] || 0, out = p.stock <= 0;
    return `<article class="pcard" data-id="${p.id}">
      <div class="pimg" data-open>${productVisual(p)}${out ? '<span class="badge badge-bad">نفدت الكمية</span>' : p.old_price ? `<span class="badge sale">خصم ${Math.round((1 - p.price / p.old_price) * 100)}%</span>` : ''}</div>
      <div class="pbody">
        <div class="pname" data-open>${esc(p.name)}</div>
        <div class="psub">${esc(catById(p.category).name)}${p.subtype ? ' · ' + esc(p.subtype) : ''}${p.size ? ' · ' + esc(p.size) : ''}</div>
        <div class="pfoot"><span class="price num">${money(p.price)}${p.old_price ? `<s class="old num">${money(p.old_price)}</s>` : ''}</span>
          ${out ? '' : inCart ? `<span class="qty"><button data-dec>−</button><b>${inCart}</b><button data-inc>+</button></span>` : `<button class="btn btn-gold add" data-inc aria-label="أضف للسلة">+</button>`}
        </div>
      </div></article>`;
  }).join('');
  $$('#grid .pcard').forEach(card => {
    const id = card.dataset.id;
    card.querySelectorAll('[data-open]').forEach(el => el.onclick = () => openProduct(id));
    card.querySelector('[data-inc]')?.addEventListener('click', () => changeQty(id, 1));
    card.querySelector('[data-dec]')?.addEventListener('click', () => changeQty(id, -1));
  });
}

function changeQty(id, d) {
  const p = state.products.find(x => x.id === id);
  const q = Math.max(0, Math.min(99, (state.cart[id] || 0) + d));
  if (d > 0 && p && q > p.stock) { toast('الكمية المتوفرة لا تكفي', 'bad'); return; }
  if (q) state.cart[id] = q; else delete state.cart[id];
  saveCart(); renderGrid();
  if (d > 0) { const c = $('#cartCount'); c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
}

function renderCartBadge() {
  const n = Object.values(state.cart).reduce((a, b) => a + b, 0);
  $('#cartCount').textContent = n;
  $('#stickyCart').classList.toggle('hidden', n === 0);
  $('#stickyTotal').textContent = money(cartTotal());
}

function openProduct(id) {
  const p = state.products.find(x => x.id === id); if (!p) return;
  const m = openModal(`<div class="pd-img">${productVisual(p)}</div>
    <span class="badge">${esc(catById(p.category).name)}${p.subtype ? ' · ' + esc(p.subtype) : ''}</span>
    <h2 style="margin-top:10px">${esc(p.name)}</h2>
    <p class="muted">${esc(p.description) || ''}</p>
    ${p.size ? `<p>الحجم: <b>${esc(p.size)}</b></p>` : ''}
    <div class="cart-total"><span class="price num">${money(p.price)}${p.old_price ? `<s class="old num">${money(p.old_price)}</s>` : ''}</span>
    ${p.stock > 0 ? '<button class="btn btn-gold" data-add>أضف إلى السلة</button>' : '<span class="badge badge-bad">نفدت الكمية</span>'}</div>`);
  m.el.querySelector('[data-add]')?.addEventListener('click', () => { changeQty(id, 1); m.close(); toast('أُضيف إلى السلة'); });
}

function openCart() {
  const items = cartItems();
  if (!items.length) { toast('السلة فارغة'); return; }
  const m = openModal(`<h2>سلة المشتريات</h2><div id="lines"></div>
    <div class="cart-total"><span>الإجمالي</span><span class="price num" id="ct"></span></div>
    <button class="btn btn-gold btn-block" id="go">إتمام الطلب</button>`);
  const draw = () => {
    const it = cartItems();
    if (!it.length) { m.close(); return; }
    m.el.querySelector('#lines').innerHTML = it.map(({ p, qty }) => `<div class="cart-line" data-id="${p.id}">
      <div class="thumb">${productVisual(p)}</div>
      <div><b>${esc(p.name)}</b><div class="muted num">${money(p.price)}</div></div>
      <span class="qty"><button data-dec>−</button><b>${qty}</b><button data-inc>+</button></span></div>`).join('');
    m.el.querySelector('#ct').textContent = money(cartTotal());
    m.el.querySelectorAll('.cart-line').forEach(l => {
      l.querySelector('[data-inc]').onclick = () => { changeQty(l.dataset.id, 1); draw(); };
      l.querySelector('[data-dec]').onclick = () => { changeQty(l.dataset.id, -1); draw(); };
    });
  };
  draw();
  m.el.querySelector('#go').onclick = () => { m.close(); openCheckout(); };
}

function normPhone(v) {
  let d = v.replace(/[^\d]/g, '').replace(/^00/, '');
  if (d.startsWith('968') && d.length === 11) d = d.slice(3);
  return d;
}

function openCheckout() {
  const saved = JSON.parse(localStorage.getItem('oud_customer') || '{}');
  const m = openModal(`<h2>بيانات الطلب</h2>
    <form id="f">
      <div class="field"><label for="n">الاسم</label><input id="n" required minlength="2" autocomplete="name" value="${esc(saved.name || '')}"></div>
      <div class="field"><label for="ph">رقم الهاتف</label><input id="ph" required inputmode="tel" autocomplete="tel" placeholder="9XXXXXXX" value="${esc(saved.phone || '')}"></div>
      <div class="field"><label>طريقة الاستلام</label><div class="seg" id="ful"><button type="button" class="on" data-v="pickup">استلام من المحل</button><button type="button" data-v="delivery">توصيل</button></div></div>
      <div class="field hidden" id="addrF"><label for="ad">العنوان</label><textarea id="ad" placeholder="الولاية، المنطقة، أقرب معلم">${esc(saved.address || '')}</textarea></div>
      <div class="field"><label for="nt">ملاحظات (اختياري)</label><input id="nt" placeholder="مثلاً: تغليف هدية"></div>
      <div class="cart-total"><span>المبلغ</span><span class="price num">${money(cartTotal())}</span></div>
      <button class="btn btn-gold btn-block" id="send">إرسال الطلب</button>
    </form>`);
  let ful = 'pickup';
  m.el.querySelectorAll('#ful button').forEach(b => b.onclick = () => {
    ful = b.dataset.v; m.el.querySelectorAll('#ful button').forEach(x => x.classList.toggle('on', x === b));
    m.el.querySelector('#addrF').classList.toggle('hidden', ful !== 'delivery');
  });
  m.el.querySelector('#f').onsubmit = async e => {
    e.preventDefault();
    const name = m.el.querySelector('#n').value.trim(), phone = normPhone(m.el.querySelector('#ph').value);
    const address = m.el.querySelector('#ad').value.trim(), note = m.el.querySelector('#nt').value.trim();
    if (!/^[79]\d{7}$/.test(phone)) { toast('أدخل رقم هاتف عُماني صحيح من 8 أرقام', 'bad'); return; }
    if (ful === 'delivery' && address.length < 4) { toast('أدخل عنوان التوصيل', 'bad'); return; }
    const btn = m.el.querySelector('#send'); btn.disabled = true; btn.textContent = 'جارٍ الإرسال…';
    try {
      const items = cartItems().map(({ p, qty }) => ({ id: p.id, qty }));
      const lines = cartItems().map(({ p, qty }) => `${p.name} × ${qty}`);
      const r = await db.placeOrder({ name, phone, fulfillment: ful, address, note, items });
      localStorage.setItem('oud_customer', JSON.stringify({ name, phone, address }));
      const order = { order_no: Number(r.order_no), total: Number(r.total), phone, name, lines, at: Date.now() };
      localStorage.setItem('oud_last_order', JSON.stringify(order));
      state.cart = {}; saveCart(); renderGrid(); m.close(); showPayment(order);
    } catch (er) { toast(er.message, 'bad'); btn.disabled = false; btn.textContent = 'إرسال الطلب'; }
  };
}

function showPayment(order) {
  const s = state.settings, phone = s.transfer_phone;
  const wa = s.whatsapp ? `https://wa.me/968${normPhone(s.whatsapp)}?text=${encodeURIComponent(`السلام عليكم، أرسلت طلب رقم ${order.order_no} بمبلغ ${money(order.total)} باسم ${order.name}.\n${(order.lines || []).join('\n')}`)}` : '';
  const m = openModal(`<div style="text-align:center"><div class="success-ico">✓</div>
      <h2>تم استلام طلبك رقم <span class="num">${order.order_no}</span></h2>
      <p class="muted">لإكمال الطلب حوّل المبلغ عبر خدمة التحويل برقم الهاتف من تطبيق بنكك.</p></div>
    <div class="pay-box">
      <div class="muted">المبلغ المطلوب</div><div class="pay-amount num">${money(order.total)}</div>
      <hr class="divider">
      ${phone ? `<div class="muted">حوّل إلى رقم الهاتف</div><div class="pay-phone num">${esc(phone)}</div>
        ${s.account_name ? `<div>باسم: <b>${esc(s.account_name)}</b></div>` : ''}
        <button class="btn btn-ghost btn-sm" id="cp" style="margin-top:10px">نسخ الرقم</button>`
      : '<div class="badge badge-warn">سيتواصل معك المحل لتزويدك برقم التحويل</div>'}
    </div>
    <ol class="steps">
      <li>افتح تطبيق البنك واختر «التحويل عبر رقم الهاتف».</li>
      <li>أدخل الرقم أعلاه والمبلغ، واكتب رقم الطلب <b class="num">${order.order_no}</b> في الملاحظة.</li>
      <li>أرفق صورة الإيصال هنا ليتم تأكيد طلبك بسرعة.</li>
    </ol>
    <div class="field"><label for="rc">صورة إيصال التحويل (اختياري)</label><input id="rc" type="file" accept="image/*"></div>
    <button class="btn btn-gold btn-block" id="done">تم التحويل</button>
    ${wa ? `<a class="btn btn-ghost btn-block" style="margin-top:10px" target="_blank" rel="noopener" href="${wa}">تواصل عبر واتساب</a>` : ''}`);
  m.el.querySelector('#cp')?.addEventListener('click', () => navigator.clipboard?.writeText(phone).then(() => toast('تم نسخ الرقم')));
  m.el.querySelector('#done').onclick = async () => {
    const f = m.el.querySelector('#rc').files[0], btn = m.el.querySelector('#done');
    btn.disabled = true;
    try {
      if (f) { btn.textContent = 'جارٍ رفع الإيصال…'; await db.attachReceipt(order.order_no, order.phone, f); }
      localStorage.setItem('oud_last_order', JSON.stringify({ ...order, done: true }));
      m.el.innerHTML = `<div style="text-align:center;padding:10px 0"><div class="success-ico">✓</div><h2>شكراً لك</h2>
        <p class="muted">سيؤكد المحل وصول التحويل ويتواصل معك على الرقم <b class="num">${esc(order.phone)}</b>.</p>
        <button class="btn btn-gold" onclick="this.closest('.modal-wrap').click()">العودة للمتجر</button></div>`;
      m.el.querySelector('.btn').onclick = m.close;
    } catch (e) { toast(e.message, 'bad'); btn.disabled = false; btn.textContent = 'تم التحويل'; }
  };
}

init();
