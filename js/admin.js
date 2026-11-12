import { db, DEMO } from './db.js';
import { splash, installButton, rememberShopName } from './pwa.js';
import { CATEGORIES, catById, PAY_METHODS, money, esc, $, $$, toast, beep, icon, productVisual, openModal, fmtDate, ean13, ask, pickOffer } from './util.js';

const S = { role: null, settings: {}, products: [], offers: [], bundles: [], cart: new Map(), pay: 'cash', scanner: null, lastScan: { code: '', t: 0 },
  orders: [], ofilter: 'new', seenNew: null, selected: new Set(), period: 'day', chart: null };

// ------------------------------------------------------------ أدوات
const isEAN13 = c => /^\d{13}$/.test(c) && ean13(c.slice(0, 12)) === c;
function barcodeSVG(code, opts = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try {
    window.JsBarcode(svg, code, { format: isEAN13(code) ? 'EAN13' : 'CODE128', displayValue: true, fontSize: 14, height: 50, margin: 12, background: '#ffffff', lineColor: '#000000', ...opts });
  } catch { return `<span class="num">${esc(code)}</span>`; }
  return svg.outerHTML;
}
const startOf = (unit, d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  if (unit === 'month' || unit === 'year') x.setDate(1);
  if (unit === 'year') x.setMonth(0);
  return x;
};
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const sum = a => a.reduce((s, x) => s + Number(x.total), 0);

function printHTML(html) {
  $('#print-root').innerHTML = html;
  setTimeout(() => window.print(), 250);
}

// ------------------------------------------------------------ الدخول
async function init() {
  splash('admin'); installButton($('#installBtn')); installButton($('#installBtn2'));
  if (DEMO) { $('#demo').classList.remove('hidden'); $('#demoReset').classList.remove('hidden'); }
  $('#loginMark').innerHTML = icon('logo'); $('#appMark').innerHTML = icon('logo');
  setShopName();
  S.settingsReady = loadSettings();
  S.role = await db.currentRole().catch(() => null);
  S.role ? safeStart() : showLogin();
}
// يحمّل إعدادات المحل مع إعادة المحاولة؛ يحدد S.settingsLoaded حتى لا يُحفظ نموذج فارغ فوق البيانات الحقيقية
async function loadSettings() {
  for (let i = 0; i < 3; i++) {
    try {
      const v = await db.getSettings();
      if (v) { S.settings = v; S.settingsLoaded = true; setShopName(); rememberShopName(v.shop_name); return; }
    } catch (e) { if (i === 2) toast('تعذر الاتصال بقاعدة البيانات: ' + e.message, 'bad'); }
    await new Promise(r => setTimeout(r, 1500));
  }
}
function setShopName() {
  const n = (S.settings && S.settings.shop_name) || 'عطور سمائل';
  $('#loginShop').textContent = n; $('#appShop').textContent = n;
}
function safeStart() {
  startApp().catch(e => { console.error(e); toast('حدث خطأ أثناء فتح اللوحة، أعد تحميل الصفحة: ' + e.message, 'bad'); });
}

function showLogin() {
  $('#app').classList.add('hidden'); $('#login').classList.remove('hidden');
  let role = 'employee';
  $$('.role').forEach(b => b.onclick = () => { role = b.dataset.r; $$('.role').forEach(x => x.classList.toggle('on', x === b)); $('#pw').focus(); });
  $('#loginForm').onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try { S.role = await db.login(role, $('#pw').value); $('#pw').value = ''; safeStart(); }
    catch (er) { toast(er.message.includes('Invalid') ? 'كلمة المرور غير صحيحة' : er.message, 'bad'); }
    btn.disabled = false;
  };
}

async function startApp() {
  await S.settingsReady;
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  const admin = S.role === 'admin';
  $('#whoami').textContent = admin ? 'صاحب المحل' : 'الموظف';
  $$('[data-admin]').forEach(el => el.classList.toggle('hidden', !admin));
  $('#logout').onclick = async () => { await stopCamera(); await db.logout(); location.reload(); };
  $$('#tabs button').forEach(b => b.onclick = () => go(b.dataset.t));
  await loadProducts();
  setupPOS(); setupOrders(); setupProducts(); setupSettings();
  $$('#period button').forEach(b => b.onclick = () => { S.period = b.dataset.v; $$('#period button').forEach(x => x.classList.toggle('on', x === b)); renderStats(); });
  go(location.hash.slice(1) || 'pos');
}

function go(tab) {
  if (S.role !== 'admin' && ['products', 'stats', 'settings'].includes(tab)) tab = 'pos';
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
  $$('.view').forEach(v => v.classList.toggle('hidden', v.dataset.view !== tab));
  history.replaceState(null, '', '#' + tab);
  if (tab !== 'pos') stopCamera();
  if (tab === 'orders') renderOrders();
  if (tab === 'products') renderProducts();
  if (tab === 'stats') renderStats();
  if (tab === 'pos') renderMine();
  window.scrollTo({ top: 0 });
}

async function loadProducts() {
  try { [S.products, S.offers] = await Promise.all([db.listProducts(), db.listOffers().catch(() => [])]); } catch (e) { toast(e.message, 'bad'); }
}

// ------------------------------------------------------------ البيع ومسح الباركود
function setupPOS() {
  $('#camBtn').onclick = () => (S.scanner ? stopCamera() : startCamera());
  $('#codeForm').onsubmit = e => { e.preventDefault(); const c = $('#code').value.trim(); if (c) addByCode(c); $('#code').value = ''; };
  $('#psearch').oninput = e => {
    const q = e.target.value.trim().toLowerCase();
    const list = q ? S.products.filter(p => `${p.name} ${p.barcode} ${p.subtype}`.toLowerCase().includes(q)).slice(0, 12) : [];
    $('#presults').innerHTML = list.map(p => `<button class="presult" data-id="${p.id}"><span>${esc(p.name)} <small class="muted">· ${p.stock} متوفر</small></span><b class="num gold">${money(p.price)}</b></button>`).join('');
    $$('#presults .presult').forEach(b => b.onclick = () => { addToCart(S.products.find(p => p.id === b.dataset.id)); $('#psearch').value = ''; $('#presults').innerHTML = ''; });
  };
  $$('#payM button').forEach(b => b.onclick = () => { S.pay = b.dataset.v; $$('#payM button').forEach(x => x.classList.toggle('on', x === b)); });
  $('#clearCart').onclick = () => { S.cart.clear(); S.bundles = []; renderCart(); };
  $('#offerSale').onclick = posOffer;
  $('#checkout').onclick = checkout;
  renderCart();
}

async function startCamera() {
  const lib = window.__Html5QrcodeLibrary__;
  if (!lib) { toast('تعذر تحميل قارئ الباركود', 'bad'); return; }
  const F = lib.Html5QrcodeSupportedFormats;
  $('#reader').classList.remove('hidden');
  S.scanner = new lib.Html5Qrcode('reader', { verbose: false, formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.QR_CODE] });
  try {
    await S.scanner.start({ facingMode: 'environment' }, { fps: 12, qrbox: (w, h) => ({ width: Math.min(w * 0.85, 340), height: Math.min(h * 0.45, 160) }), aspectRatio: 1.6 },
      code => {
        const now = Date.now();
        if (code === S.lastScan.code && now - S.lastScan.t < 1800) return;
        S.lastScan = { code, t: now }; addByCode(code);
      }, () => {});
    $('#camBtn').textContent = 'إيقاف الكاميرا';
  } catch (e) {
    S.scanner = null; $('#reader').classList.add('hidden');
    toast('لا يمكن تشغيل الكاميرا. اسمح للموقع باستخدامها، وتأكد أن الرابط يبدأ بـ https', 'bad');
  }
}
async function stopCamera() {
  if (!S.scanner) return;
  try { await S.scanner.stop(); S.scanner.clear(); } catch {}
  S.scanner = null; $('#reader').classList.add('hidden'); $('#camBtn').textContent = 'تشغيل الكاميرا';
}

async function addByCode(code) {
  let p = S.products.find(x => x.barcode === code);
  if (!p) { try { p = await db.findByBarcode(code); if (p) S.products.push(p); } catch {} }
  if (!p) { beep(false); toast(`لا يوجد منتج بالباركود ${code}`, 'bad'); return; }
  beep(true); addToCart(p);
}
function addToCart(p) {
  if (!p) return;
  S.cart.set(p.id, (S.cart.get(p.id) || 0) + 1);
  if (p.stock - S.cart.get(p.id) < 0) toast(`تنبيه: الكمية في المخزون ${p.stock}`, 'bad');
  renderCart(p.id);
}
function renderCart(flashId) {
  const rows = [...S.cart].map(([id, qty]) => ({ p: S.products.find(x => x.id === id), qty })).filter(x => x.p);
  const bundles = S.bundles.map(b => ({ ...b, o: S.offers.find(o => o.id === b.offer_id) })).filter(b => b.o);
  const bhtml = bundles.map((b, i) => `<div class="line" data-b="${i}">
      <div><b>${esc(b.o.title)}</b><small class="muted">${esc(b.picks.map(id => (S.products.find(p => p.id === id) || {}).name).join('، '))}</small></div>
      <button class="btn btn-ghost btn-sm" data-del>حذف</button>
      <b class="num gold">${money(b.o.price)}</b></div>`).join('');
  $('#lines').innerHTML = (rows.length || bundles.length) ? bhtml + rows.map(({ p, qty }) => `<div class="line ${p.id === flashId ? 'flash' : ''}" data-id="${p.id}">
      <div><b>${esc(p.name)}</b><small class="muted num">${money(p.price)}</small></div>
      <span class="qty"><button data-d="-1">−</button><b>${qty}</b><button data-d="1">+</button></span>
      <b class="num gold">${money(p.price * qty)}</b></div>`).join('')
    : `<div class="empty-s">امسح باركود منتج لإضافته إلى الفاتورة</div>`;
  $$('#lines .line[data-b] [data-del]').forEach(b => b.onclick = () => { S.bundles.splice(Number(b.closest('.line').dataset.b), 1); renderCart(); });
  $$('#lines .line[data-id]').forEach(l => l.querySelectorAll('[data-d]').forEach(b => b.onclick = () => {
    const q = (S.cart.get(l.dataset.id) || 0) + Number(b.dataset.d);
    q > 0 ? S.cart.set(l.dataset.id, q) : S.cart.delete(l.dataset.id); renderCart();
  }));
  $('#posTotal').textContent = money(rows.reduce((s, x) => s + x.p.price * x.qty, 0) + bundles.reduce((s, b) => s + Number(b.o.price), 0));
  $('#checkout').disabled = !rows.length && !bundles.length;
}

async function posOffer() {
  const list = S.offers.filter(o => o.active);
  if (!list.length) { toast(S.role === 'admin' ? 'لا توجد عروض. أضفها من المنتجات ← العروض' : 'لا توجد عروض فعّالة', 'bad'); return; }
  let o = list[0];
  if (list.length > 1) {
    o = await new Promise(res => {
      let done = false;
      const m = openModal(`<h2>اختر العرض</h2><div class="presults">${list.map(x => `<button class="presult" data-id="${x.id}"><span>${esc(x.title)} <small class="muted">· ${x.pick_count} منتجات</small></span><b class="num gold">${money(x.price)}</b></button>`).join('')}</div>`,
        { onClose: () => { if (!done) { done = true; res(null); } } });
      m.el.querySelectorAll('.presult').forEach(b => b.onclick = () => { done = true; res(list.find(x => x.id === b.dataset.id)); m.close(); });
    });
    if (!o) return;
  }
  const picks = await pickOffer(o, S.products, { checkStock: false, okLabel: 'أضف إلى الفاتورة' });
  if (picks) { S.bundles.push({ offer_id: o.id, picks }); beep(true); renderCart(); }
}

async function checkout() {
  const items = [...[...S.cart].map(([id, qty]) => ({ id, qty })), ...S.bundles.map(b => ({ offer_id: b.offer_id, picks: b.picks }))];
  const btn = $('#checkout'); btn.disabled = true;
  try {
    const sale = await db.recordSale(items, S.pay);
    S.cart.clear(); S.bundles = []; renderCart(); await loadProducts(); renderMine();
    const m = openModal(`<div style="text-align:center"><div class="success-ico" style="width:70px;height:70px;margin:0 auto 10px;border-radius:50%;display:grid;place-items:center;background:rgba(111,191,138,.15);color:var(--ok);font-size:2.2rem">✓</div>
      <h2>تم البيع</h2><p>فاتورة رقم <b class="num">${sale.invoice_no}</b> · <b class="num gold">${money(sale.total)}</b> · ${PAY_METHODS[sale.payment_method]}</p>
      <div style="display:flex;gap:8px;justify-content:center"><button class="btn btn-ghost" data-print>طباعة الفاتورة</button><button class="btn btn-gold" data-ok>بيع جديد</button></div></div>`);
    m.el.querySelector('[data-print]').onclick = () => printReceipt(sale);
    m.el.querySelector('[data-ok]').onclick = m.close;
  } catch (e) { toast(e.message, 'bad'); btn.disabled = false; }
}

function printReceipt(sale) {
  printHTML(`<div class="receipt"><h1>${esc(S.settings.shop_name)}</h1><div class="c">سمائل - سلطنة عُمان</div>
    <div class="c">فاتورة رقم ${sale.invoice_no} · ${fmtDate(sale.created_at)}</div>
    <table>${sale.items.map(i => `<tr><td>${esc(i.name)} × ${i.qty}${i.picks ? `<br><small>${esc(i.picks.map(x => x.name).join('، '))}</small>` : ''}</td><td style="text-align:left">${money(i.price * i.qty)}</td></tr>`).join('')}</table>
    <div class="t"><span>الإجمالي</span><span>${money(sale.total)}</span></div>
    <div>طريقة الدفع: ${PAY_METHODS[sale.payment_method]}</div><p class="c">شكراً لزيارتكم</p></div>`);
}

async function renderMine() {
  try {
    const list = await db.listSales(startOf('day'), addDays(startOf('day'), 1));
    const mine = S.role === 'admin' ? list : list;
    $('#todayMine').textContent = mine.length ? `مبيعات اليوم: ${mine.length} فاتورة · ${money(sum(mine))}` : 'لا توجد مبيعات اليوم بعد';
  } catch { $('#todayMine').textContent = ''; }
}

// ------------------------------------------------------------ طلبات المتجر
function setupOrders() {
  $$('#ofilter button').forEach(b => b.onclick = () => { S.ofilter = b.dataset.v; $$('#ofilter button').forEach(x => x.classList.toggle('on', x === b)); drawOrders(); });
  db.onOrdersChange(() => refreshOrders(true));
  setInterval(() => refreshOrders(true), 30000);
  refreshOrders(false);
}
async function refreshOrders(notify) {
  try { S.orders = await db.listOrders(); } catch { return; }
  const fresh = S.orders.filter(o => o.status === 'new');
  const dot = $('#ordersDot');
  dot.textContent = fresh.length; dot.classList.toggle('hidden', !fresh.length);
  if (notify && S.seenNew && fresh.some(o => !S.seenNew.has(o.id))) { beep(true); setTimeout(() => beep(true), 200); toast('وصل طلب جديد من المتجر'); }
  S.seenNew = new Set(fresh.map(o => o.id));
  if (!$('[data-view="orders"]').classList.contains('hidden')) drawOrders();
}
async function renderOrders() { await refreshOrders(false); drawOrders(); }
function drawOrders() {
  const list = S.orders.filter(o => o.status === S.ofilter);
  const st = { new: '<span class="badge badge-warn">بانتظار التحويل</span>', paid: '<span class="badge badge-ok">مدفوع</span>', cancelled: '<span class="badge badge-bad">ملغى</span>' };
  $('#olist').innerHTML = list.length ? list.map(o => `<article class="card order ${o.status === 'new' ? 'is-new' : ''}" data-id="${o.id}">
    <div class="order-head"><div><h3>طلب <span class="num">#${o.order_no}</span></h3><small class="muted">${fmtDate(o.created_at)}</small></div>${st[o.status]}</div>
    <div><b>${esc(o.customer_name)}</b> · <a class="num" href="tel:${esc(o.customer_phone)}">${esc(o.customer_phone)}</a></div>
    <div class="muted">${o.fulfillment === 'delivery' ? 'توصيل: ' + esc(o.address) : 'استلام من المحل'}</div>
    ${o.note ? `<div class="muted">ملاحظة: ${esc(o.note)}</div>` : ''}
    <ul>${o.items.map(i => `<li><span>${esc(i.name)} × ${i.qty}${i.picks ? `<small class="picks-note">${esc(i.picks.map(x => x.name).join('، '))}</small>` : ''}</span><span class="num">${money(i.price * i.qty)}</span></li>`).join('')}</ul>
    <div class="total-row" style="padding:6px 0;font-size:1.1rem"><span>الإجمالي</span><b class="num" style="font-size:1.3rem">${money(o.total)}</b></div>
    <div class="acts">
      ${o.receipt_path ? '<button class="btn btn-ghost btn-sm" data-rc>عرض الإيصال</button>' : '<span class="muted" style="font-size:.85rem">لم يُرفق إيصال</span>'}
      <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://wa.me/968${esc(o.customer_phone)}?text=${encodeURIComponent(`مرحباً ${o.customer_name}، بخصوص طلبك رقم ${o.order_no} من ${S.settings.shop_name}`)}">واتساب</a>
      ${o.status === 'new' ? '<button class="btn btn-ok btn-sm" data-ok>تأكيد وصول التحويل</button><button class="btn btn-danger btn-sm" data-x>إلغاء</button>' : ''}
    </div></article>`).join('') : `<div class="empty-s card pad">لا توجد طلبات ${S.ofilter === 'new' ? 'جديدة' : ''}</div>`;
  $$('#olist .order').forEach(c => {
    const o = S.orders.find(x => x.id === c.dataset.id);
    c.querySelector('[data-rc]')?.addEventListener('click', async () => {
      try { const url = await db.receiptUrl(o.receipt_path); openModal(`<h2>إيصال طلب #${o.order_no}</h2><img src="${esc(url)}" alt="إيصال التحويل" style="border-radius:12px;margin:auto">`); }
      catch (e) { toast(e.message, 'bad'); }
    });
    c.querySelector('[data-ok]')?.addEventListener('click', async () => {
      if (!(await ask(`تأكيد استلام ${money(o.total)} للطلب #${o.order_no}؟ سيُسجّل كعملية بيع.`, { ok: 'نعم، وصل التحويل' }))) return;
      try { await db.confirmOrder(o.id, 'transfer'); toast('تم تأكيد الطلب وتسجيله في المبيعات'); await loadProducts(); renderOrders(); }
      catch (e) { toast(e.message, 'bad'); }
    });
    c.querySelector('[data-x]')?.addEventListener('click', async () => {
      if (!(await ask(`إلغاء الطلب #${o.order_no}؟`, { ok: 'إلغاء الطلب', danger: true }))) return;
      try { await db.cancelOrder(o.id); renderOrders(); } catch (e) { toast(e.message, 'bad'); }
    });
  });
}

// ------------------------------------------------------------ المنتجات والباركود
function setupProducts() {
  $('#prodCat').innerHTML += CATEGORIES.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  $('#prodSearch').oninput = renderProducts; $('#prodCat').onchange = renderProducts;
  $('#addProd').onclick = () => editProduct();
  $('#selAll').onchange = e => { filteredProducts().forEach(p => e.target.checked ? S.selected.add(p.id) : S.selected.delete(p.id)); renderProducts(); };
  $('#printSel').onclick = openPrintLabels;
  $('#offersBtn').onclick = openOffers;
  $('#importBtn').onclick = () => $('#importFile').click();
  $('#importFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) importExcel(f); };
}
function filteredProducts() {
  const q = $('#prodSearch').value.trim().toLowerCase(), c = $('#prodCat').value;
  return S.products.filter(p => (!c || p.category === c) && (!q || `${p.name} ${p.barcode} ${p.subtype}`.toLowerCase().includes(q)));
}
function renderProducts() {
  const list = filteredProducts();
  $('#plist').innerHTML = list.length ? list.map(p => `<div class="card prow ${p.active ? '' : 'off'}" data-id="${p.id}">
      <input type="checkbox" class="sel" ${S.selected.has(p.id) ? 'checked' : ''} aria-label="تحديد للطباعة" style="width:20px;height:20px;accent-color:var(--gold)">
      <div class="thumb">${productVisual(p)}</div>
      <div class="meta"><b>${esc(p.name)}</b>
        <small class="muted">${esc(catById(p.category).name)}${p.subtype ? ' · ' + esc(p.subtype) : ''}${p.size ? ' · ' + esc(p.size) : ''}</small>
        <div><b class="num gold" style="display:inline">${money(p.price)}</b>${p.old_price ? ` <s class="muted num">${money(p.old_price)}</s>` : ''} · <span class="${p.stock <= 3 ? 'down' : 'muted'}">المخزون: ${p.stock}</span>${p.active ? '' : ' · <span class="badge">مخفي</span>'}</div>
        <div class="bc">${barcodeSVG(p.barcode, { height: 34, fontSize: 12 })}</div></div>
      <div class="prow-acts"><button class="btn btn-ghost btn-sm" data-e>تعديل</button></div></div>`).join('')
    : '<div class="empty-s card pad">لا توجد منتجات. اضغط «+ منتج جديد» لإضافة أول منتج.</div>';
  $$('#plist .prow').forEach(r => {
    r.querySelector('.sel').onchange = e => e.target.checked ? S.selected.add(r.dataset.id) : S.selected.delete(r.dataset.id);
    r.querySelector('[data-e]').onclick = () => editProduct(S.products.find(p => p.id === r.dataset.id));
  });
}

function editProduct(p) {
  const isNew = !p;
  p = p || { name: '', category: 'perfume', subtype: '', size: '', old_price: '', description: '', price: '', stock: 0, image_url: '', active: true, barcode: '' };
  const m = openModal(`<h2>${isNew ? 'منتج جديد' : 'تعديل المنتج'}</h2>
    <form id="pf">
      <div class="field"><label for="fn">اسم المنتج</label><input id="fn" required maxlength="120" value="${esc(p.name)}"></div>
      <div class="row">
        <div class="field"><label for="fc">القسم</label><select id="fc">${CATEGORIES.map(c => `<option value="${c.id}" ${c.id === p.category ? 'selected' : ''}>${c.name}</option>`).join('')}</select></div>
        <div class="field"><label for="fs">النوع</label><input id="fs" list="subl" value="${esc(p.subtype)}" placeholder="مثلاً: دهن عود"><datalist id="subl"></datalist></div>
      </div>
      <div class="row">
        <div class="field"><label for="fp">سعر البيع (ر.ع.)</label><input id="fp" type="number" min="0" step="0.001" required inputmode="decimal" value="${p.price}"></div>
        <div class="field"><label for="fo">السعر قبل العرض (اختياري)</label><input id="fo" type="number" min="0" step="0.001" inputmode="decimal" value="${p.old_price ?? ''}" placeholder="يظهر مشطوباً"></div>
      </div>
      <div class="row">
        <div class="field"><label for="fz">الحجم</label><input id="fz" maxlength="40" value="${esc(p.size || '')}" placeholder="مثلاً: 100mL"></div>
        <div class="field"><label for="fq">الكمية في المخزون</label><input id="fq" type="number" step="1" inputmode="numeric" value="${p.stock}"></div>
      </div>
      <div class="field"><label for="fd">الوصف</label><textarea id="fd" maxlength="600">${esc(p.description)}</textarea></div>
      <div class="field"><label>صورة المنتج</label><div class="img-pick"><div class="thumb" id="fimgv">${productVisual(p)}</div><input id="fimg" type="file" accept="image/*"></div></div>
      <div class="field"><label for="fb">الباركود</label>
        <input id="fb" inputmode="numeric" value="${esc(p.barcode || '')}" placeholder="اتركه فارغاً لإنشاء باركود تلقائياً">
        <small class="muted">إذا كان على المنتج باركود من المصنع اكتبه هنا أو امسحه، وإلا سيُنشأ باركود جديد للطباعة.</small>
        ${p.barcode ? `<div class="bc-preview">${barcodeSVG(p.barcode)}</div>` : ''}</div>
      <label class="check field"><input type="checkbox" id="fa" ${p.active ? 'checked' : ''}> يظهر في متجر الزبائن</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-gold" id="fsave">حفظ</button>
        ${isNew ? '' : '<button type="button" class="btn btn-ghost" id="fprint">طباعة ملصقات</button><button type="button" class="btn btn-danger" id="fdel">حذف</button>'}
      </div>
    </form>`);
  const el = m.el, fillSubs = () => el.querySelector('#subl').innerHTML = catById(el.querySelector('#fc').value).subtypes.map(s => `<option value="${s}">`).join('');
  fillSubs(); el.querySelector('#fc').onchange = fillSubs;
  let file = null;
  el.querySelector('#fimg').onchange = e => { file = e.target.files[0]; if (file) el.querySelector('#fimgv').innerHTML = `<img src="${URL.createObjectURL(file)}" alt="">`; };
  el.querySelector('#fprint')?.addEventListener('click', () => { m.close(); S.selected = new Set([p.id]); openPrintLabels(); });
  el.querySelector('#fdel')?.addEventListener('click', async () => {
    if (!(await ask(`حذف «${p.name}» نهائياً؟ يمكنك بدلاً من ذلك إخفاؤه من المتجر.`, { ok: 'حذف', danger: true }))) return;
    try { await db.deleteProduct(p.id); S.selected.delete(p.id); await loadProducts(); renderProducts(); m.close(); toast('تم الحذف'); } catch (e) { toast(e.message, 'bad'); }
  });
  el.querySelector('#pf').onsubmit = async e => {
    e.preventDefault();
    const btn = el.querySelector('#fsave'); btn.disabled = true; btn.textContent = 'جارٍ الحفظ…';
    try {
      let image_url = p.image_url;
      if (file) image_url = await db.uploadProductImage(file);
      const saved = await db.saveProduct({ id: p.id, name: el.querySelector('#fn').value.trim(), category: el.querySelector('#fc').value, subtype: el.querySelector('#fs').value.trim(),
        price: Number(el.querySelector('#fp').value), old_price: el.querySelector('#fo').value, size: el.querySelector('#fz').value.trim(), stock: parseInt(el.querySelector('#fq').value || '0', 10), description: el.querySelector('#fd').value.trim(),
        image_url, active: el.querySelector('#fa').checked, barcode: el.querySelector('#fb').value.trim() });
      await loadProducts(); renderProducts(); m.close();
      toast(isNew ? `تمت الإضافة · الباركود ${saved.barcode}` : 'تم الحفظ');
      if (isNew) { S.selected = new Set([saved.id]); setTimeout(async () => { if (await ask(`تم إنشاء الباركود ${saved.barcode}. هل تريد طباعة ملصقاته الآن؟`, { ok: 'طباعة', cancel: 'لاحقاً' })) openPrintLabels(); }, 300); }
    } catch (er) { toast(er.message.includes('duplicate') ? 'هذا الباركود مستخدم لمنتج آخر' : er.message, 'bad'); btn.disabled = false; btn.textContent = 'حفظ'; }
  };
}

function openPrintLabels() {
  const items = S.products.filter(p => S.selected.has(p.id));
  if (!items.length) { toast('حدد المنتجات المطلوب طباعتها أولاً', 'bad'); return; }
  const m = openModal(`<h2>طباعة ملصقات الباركود</h2>
    <p class="muted">ورق A4 بملصقات 63.5 × 38.1 مم (21 ملصقاً في الصفحة). حدد عدد النسخ لكل منتج:</p>
    <div id="pl">${items.map(p => `<div class="line" style="grid-template-columns:1fr 90px"><b>${esc(p.name)}</b><input type="number" min="0" max="500" value="${Math.max(1, Math.min(p.stock, 21))}" data-id="${p.id}"></div>`).join('')}</div>
    <label class="check" style="margin:12px 0"><input type="checkbox" id="lp" checked> إظهار السعر على الملصق</label>
    <button class="btn btn-gold btn-block" id="go">طباعة</button>`);
  m.el.querySelector('#go').onclick = () => {
    const showPrice = m.el.querySelector('#lp').checked, out = [];
    m.el.querySelectorAll('[data-id]').forEach(inp => {
      const p = items.find(x => x.id === inp.dataset.id), n = Math.min(500, parseInt(inp.value || '0', 10));
      const svg = barcodeSVG(p.barcode, { height: 45, fontSize: 13, margin: 8 });
      for (let i = 0; i < n; i++) out.push(`<div class="label"><div class="l-shop">${esc(S.settings.shop_name)}</div><div class="l-name">${esc(p.name)}${p.size ? ' · ' + esc(p.size) : ''}</div>${svg}${showPrice ? `<div class="l-price">${money(p.price)}</div>` : ''}</div>`);
    });
    if (!out.length) return;
    m.close(); printHTML(`<div class="labels">${out.join('')}</div>`);
  };
}

// ------------------------------------------------------------ الإحصائيات
async function renderStats() {
  const now = new Date(), yearsBack = 4;
  let sales = [];
  try { sales = await db.listSales(startOf('year', new Date(now.getFullYear() - yearsBack, 0, 1)), addDays(startOf('day'), 1)); }
  catch (e) { toast(e.message, 'bad'); return; }
  const at = s => new Date(s.created_at);
  const inRange = (a, b) => sales.filter(s => at(s) >= a && at(s) < b);
  const today = startOf('day'), month = startOf('month'), year = startOf('year');
  const yday = addDays(today, -1);
  const lastMonth = new Date(month); lastMonth.setMonth(lastMonth.getMonth() - 1);
  const lastMonthSame = new Date(lastMonth); lastMonthSame.setDate(Math.min(now.getDate() + 1, 28));
  const lastYear = new Date(year); lastYear.setFullYear(lastYear.getFullYear() - 1);
  const lastYearSame = new Date(now); lastYearSame.setFullYear(now.getFullYear() - 1);

  const T = inRange(today, addDays(today, 1)), Y = inRange(yday, today);
  const M = inRange(month, addDays(today, 1)), LM = inRange(lastMonth, lastMonthSame);
  const A = inRange(year, addDays(today, 1)), LA = inRange(lastYear, lastYearSame);
  const cmp = (a, b, label) => { if (!b) return `<span class="muted">${label}: لا توجد بيانات</span>`; const d = ((a - b) / b) * 100; return `<span class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(0)}%</span> مقارنة بـ${label}`; };
  const kpi = (label, list, prev, plabel) => `<div class="card kpi"><div class="k-label">${label}</div><div class="k-val num">${money(sum(list))}</div>
    <div class="k-sub">${list.length} فاتورة · ${cmp(sum(list), sum(prev), plabel)}</div></div>`;
  $('#kpis').innerHTML = kpi('مبيعات اليوم', T, Y, 'أمس') + kpi('مبيعات هذا الشهر', M, LM, 'نفس الفترة من الشهر الماضي') + kpi('مبيعات هذه السنة', A, LA, 'نفس الفترة من السنة الماضية');

  // الرسم البياني
  let labels = [], data = [], title = '';
  if (S.period === 'day') {
    title = 'المبيعات اليومية · آخر 30 يوماً';
    for (let i = 29; i >= 0; i--) { const d = addDays(today, -i); labels.push(d.toLocaleDateString('ar-OM', { day: 'numeric', month: 'short' })); data.push(sum(inRange(d, addDays(d, 1)))); }
  } else if (S.period === 'month') {
    title = `المبيعات الشهرية · ${now.getFullYear()}`;
    for (let i = 0; i < 12; i++) { const a = new Date(now.getFullYear(), i, 1), b = new Date(now.getFullYear(), i + 1, 1); labels.push(a.toLocaleDateString('ar-OM', { month: 'long' })); data.push(sum(inRange(a, b))); }
  } else {
    title = 'المبيعات السنوية';
    for (let y = now.getFullYear() - yearsBack; y <= now.getFullYear(); y++) { labels.push(String(y)); data.push(sum(inRange(new Date(y, 0, 1), new Date(y + 1, 0, 1)))); }
  }
  $('#chartTitle').textContent = title;
  const Chart = window.Chart;
  if (Chart) {
    Chart.defaults.font.family = 'Tajawal, sans-serif'; Chart.defaults.color = '#bba98f';
    S.chart?.destroy();
    const ctx = $('#chart').getContext('2d'), g = ctx.createLinearGradient(0, 0, 0, 320);
    g.addColorStop(0, '#e9cf8f'); g.addColorStop(1, '#a77d32');
    S.chart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: g, borderRadius: 6, maxBarThickness: 46 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { rtl: true, callbacks: { label: c => money(c.raw) } } },
        scales: { x: { reverse: true, grid: { display: false } }, y: { position: 'right', grid: { color: 'rgba(214,178,106,.12)' }, ticks: { callback: v => Number(v).toLocaleString('en') } } } },
    });
  }

  // الأكثر مبيعاً
  const agg = {};
  M.forEach(s => s.items.forEach(i => { const a = agg[i.name] || (agg[i.name] = { qty: 0, total: 0 }); a.qty += i.qty; a.total += i.price * i.qty; }));
  const top = Object.entries(agg).sort((a, b) => b[1].total - a[1].total).slice(0, 8), max = top[0]?.[1].total || 1;
  $('#top').innerHTML = top.length ? top.map(([n, a]) => `<div class="rank"><span>${esc(n)} <small class="muted">× ${a.qty}</small></span><b class="num gold">${money(a.total)}</b><div class="bar"><i style="width:${(a.total / max) * 100}%"></i></div></div>`).join('') : '<p class="muted">لا توجد مبيعات هذا الشهر</p>';

  const by = (key, names) => Object.entries(names).map(([k, n]) => { const l = M.filter(s => s[key] === k); return { n, v: sum(l), c: l.length }; });
  const split = [...by('source', { pos: 'المحل', online: 'المتجر الإلكتروني' }), ...by('payment_method', PAY_METHODS)], tot = sum(M) || 1;
  $('#split').innerHTML = split.map((x, i) => `${i === 2 ? '<hr class="divider">' : ''}<div class="rank"><span>${x.n} <small class="muted">(${x.c})</small></span><b class="num">${money(x.v)}</b><div class="bar"><i style="width:${(x.v / tot) * 100}%"></i></div></div>`).join('');

  const low = S.products.filter(p => p.active && p.stock <= 3).sort((a, b) => a.stock - b.stock).slice(0, 10);
  $('#low').innerHTML = low.length ? low.map(p => `<div class="rank"><span>${esc(p.name)}</span><b class="${p.stock <= 0 ? 'down' : 'gold'}">${p.stock}</b></div>`).join('') : '<p class="muted">كل المنتجات متوفرة</p>';

  const recent = sales.slice(-8).reverse();
  $('#recent').innerHTML = recent.length ? recent.map(s => `<div class="rank"><span>#${s.invoice_no} · ${s.source === 'online' ? 'أونلاين' : 'المحل'} · <small class="muted">${fmtDate(s.created_at)}</small></span><b class="num gold">${money(s.total)}</b></div>`).join('') : '<p class="muted">لا توجد فواتير</p>';
}

// ------------------------------------------------------------ الإعدادات
function setupSettings() {
  if (S.role !== 'admin') return;
  const s = S.settings;
  $('#sName').value = s.shop_name || ''; $('#sPhone').value = s.transfer_phone || ''; $('#sAcc').value = s.account_name || '';
  $('#sWa').value = s.whatsapp || ''; $('#sNote').value = s.store_note || '';
  $('#setForm').onsubmit = async e => {
    e.preventDefault();
    if (!S.settingsLoaded) { toast('لم تُحمّل الإعدادات الحالية بعد، أعد تحميل الصفحة ثم حاول مرة أخرى', 'bad'); return; }
    const phone = $('#sPhone').value.replace(/\D/g, '').replace(/^968(?=\d{8}$)/, '');
    if (phone && !/^[79]\d{7}$/.test(phone)) { toast('رقم الهاتف يجب أن يكون 8 أرقام ويبدأ بـ 7 أو 9', 'bad'); return; }
    try {
      S.settings = await db.saveSettings({ shop_name: $('#sName').value.trim(), transfer_phone: phone, account_name: $('#sAcc').value.trim(), whatsapp: $('#sWa').value.replace(/\D/g, '').replace(/^968(?=\d{8}$)/, ''), store_note: $('#sNote').value.trim() });
      setShopName(); toast('تم حفظ الإعدادات');
    } catch (er) { toast(er.message, 'bad'); }
  };
  const pw = (form, role) => $(form).onsubmit = async e => {
    e.preventDefault(); const inp = e.target.querySelector('input');
    try { await db.changePassword(role, inp.value); inp.value = ''; toast('تم تغيير كلمة المرور'); } catch (er) { toast(er.message, 'bad'); }
  };
  pw('#pwAdmin', 'admin'); pw('#pwEmp', 'employee');
  $('#resetBtn').onclick = async () => { if (await ask('إعادة البيانات التجريبية إلى وضعها الأول؟', { danger: true })) { db.resetDemo(); location.reload(); } };
}

init();


// ------------------------------------------------------------ استيراد المنتجات من Excel
function guessCategory(name) {
  if (/لبان|مستك/.test(name)) return 'frankincense';
  if (/بخور|دقة|خلطة|دخون|مبخر/.test(name)) return 'incense';
  if (/مشحم|مخمري|دهن|زيت/.test(name)) return 'oil';
  return 'perfume';
}
function parseNum(v) {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[^\d.]/g, ''));
  return isNaN(n) ? null : n;
}
async function importExcel(file) {
  if (!window.XLSX) { toast('تعذر تحميل قارئ ملفات Excel', 'bad'); return; }
  let rows;
  try {
    const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
    rows = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  } catch { toast('لا يمكن قراءة الملف. استخدم ملف Excel (.xlsx) أو CSV', 'bad'); return; }
  const head = (rows.shift() || []).map(h => String(h).trim());
  const col = re => head.findIndex(h => re.test(h));
  const iName = col(/اسم|المنتج|name/i), iSize = col(/حجم|الحجم|size/i), iCat = col(/قسم|القسم|category/i);
  const iOffer = col(/عرض|offer|sale/i), iOrig = col(/الأصلي|الاصلي|original/i), iPrice = col(/سعر|price/i);
  if (iName < 0 || (iOffer < 0 && iPrice < 0)) { toast('يجب أن يحتوي الملف على عمود لاسم المنتج وعمود للسعر', 'bad'); return; }
  const catNames = Object.fromEntries(CATEGORIES.map(c => [c.name.replace(/ُ/g, ''), c.id]));
  const existing = new Set(S.products.map(p => `${p.name.trim()}|${(p.size || '').trim()}`));
  const items = rows.map(r => {
    const name = String(r[iName] ?? '').replace(/\s+/g, ' ').trim(); if (!name) return null;
    const size = iSize >= 0 ? String(r[iSize] ?? '').trim() : '';
    const orig = iOrig >= 0 ? parseNum(r[iOrig]) : null;
    const offer = iOffer >= 0 && iOffer !== iOrig ? parseNum(r[iOffer]) : null;
    const price = offer ?? orig ?? parseNum(r[iPrice]);
    const catTxt = iCat >= 0 ? String(r[iCat]).replace(/ُ/g, '').trim() : '';
    const warn = [];
    if (price == null) warn.push('بدون سعر');
    if (orig != null && offer != null && offer > orig) warn.push('سعر العرض أكبر من الأصلي');
    if (existing.has(`${name}|${size}`)) warn.push('موجود مسبقاً');
    return { name, size, price, old_price: orig && offer != null && orig > offer ? orig : null, category: catNames[catTxt] || guessCategory(name), warn, on: !warn.length };
  }).filter(Boolean);
  if (!items.length) { toast('لا توجد منتجات في الملف', 'bad'); return; }

  const m = openModal(`<h2>استيراد ${items.length} منتجاً</h2>
    <p class="muted">راجع القسم والسعر لكل منتج. القسم مقترح تلقائياً من الاسم، ويمكنك تغييره. سيُنشأ باركود لكل منتج.</p>
    <div class="row" style="margin-bottom:10px">
      <div class="field"><label for="ist">الكمية الافتراضية في المخزون</label><input id="ist" type="number" min="0" value="10"></div>
      <div class="field"><label for="iall">تغيير قسم المحدد إلى</label><select id="iall"><option value="">—</option>${CATEGORIES.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select></div>
    </div>
    <div class="imp-wrap"><table class="imp"><thead><tr><th><input type="checkbox" id="ichk" checked aria-label="تحديد الكل"></th><th>المنتج</th><th>القسم</th><th>السعر</th><th>الحجم</th><th>قبل العرض</th></tr></thead>
    <tbody>${items.map((it, i) => `<tr data-i="${i}" class="${it.warn.length ? 'warn' : ''}">
      <td><input type="checkbox" class="ion" ${it.on ? 'checked' : ''}></td>
      <td><b>${esc(it.name)}</b>${it.warn.length ? `<div class="down" style="font-size:.8rem">${it.warn.join('، ')}</div>` : ''}</td>
      <td><select class="icat">${CATEGORIES.map(c => `<option value="${c.id}" ${c.id === it.category ? 'selected' : ''}>${c.name}</option>`).join('')}</select></td>
      <td><input class="ipr" type="number" min="0" step="0.001" value="${it.price ?? ''}"></td>
      <td>${esc(it.size)}</td>
      <td class="num muted">${it.old_price ? money(it.old_price) : ''}</td>
      </tr>`).join('')}</tbody></table></div>
    <button class="btn btn-gold btn-block" id="igo" style="margin-top:14px">استيراد المحدد</button>`, { wide: true });
  const el = m.el, trs = [...el.querySelectorAll('tbody tr')];
  const count = () => { el.querySelector('#igo').textContent = `استيراد ${trs.filter(t => t.querySelector('.ion').checked).length} منتجاً`; };
  count();
  trs.forEach(t => t.querySelector('.ion').onchange = count);
  el.querySelector('#ichk').onchange = e => { trs.forEach(t => (t.querySelector('.ion').checked = e.target.checked)); count(); };
  el.querySelector('#iall').onchange = e => { if (e.target.value) trs.filter(t => t.querySelector('.ion').checked).forEach(t => (t.querySelector('.icat').value = e.target.value)); e.target.value = ''; };
  el.querySelector('#igo').onclick = async () => {
    const stock = parseInt(el.querySelector('#ist').value || '0', 10);
    const list = trs.filter(t => t.querySelector('.ion').checked).map(t => {
      const it = items[t.dataset.i], price = Number(t.querySelector('.ipr').value);
      return { name: it.name, size: it.size, price, old_price: it.old_price && it.old_price > price ? it.old_price : null, category: t.querySelector('.icat').value, stock, active: true };
    });
    const bad = list.find(x => !(x.price >= 0) || isNaN(x.price));
    if (!list.length) { toast('لم تحدد أي منتج', 'bad'); return; }
    if (bad) { toast(`أدخل سعراً صحيحاً للمنتج «${bad.name}»`, 'bad'); return; }
    const btn = el.querySelector('#igo'); btn.disabled = true; btn.textContent = 'جارٍ الاستيراد…';
    try {
      const saved = await db.importProducts(list);
      await loadProducts(); S.selected = new Set(saved.map(x => x.id)); renderProducts(); m.close();
      toast(`تم استيراد ${saved.length} منتجاً وإنشاء باركود لكل منها`);
    } catch (e) { toast(e.message, 'bad'); btn.disabled = false; count(); }
  };
}


// ------------------------------------------------------------ إدارة العروض
function openOffers() {
  const m = openModal(`<div class="view-head" style="margin-top:4px"><h2 style="padding-inline-start:44px">العروض</h2><button class="btn btn-gold btn-sm" id="newOffer">+ عرض جديد</button></div>
    <p class="muted">العرض يسمح للزبون باختيار عدد معيّن من المنتجات بسعر واحد، مثل «أي 3 حبات بـ 10 ريال».</p>
    <div id="olist2"></div>`, { wide: true });
  const draw = () => {
    m.el.querySelector('#olist2').innerHTML = S.offers.length ? S.offers.map(o => `<div class="card prow ${o.active ? '' : 'off'}" data-id="${o.id}" style="grid-template-columns:72px 1fr auto;margin-bottom:10px">
      <div class="thumb">${o.image_url ? `<img src="${esc(o.image_url)}" alt="">` : `<div class="ph ph-incense">${icon('burner')}</div>`}</div>
      <div class="meta"><b>${esc(o.title)}</b><small class="muted">اختر ${o.pick_count} من ${o.product_ids.length} منتجاً</small>
        <div><b class="num gold">${money(o.price)}</b>${o.active ? '' : ' · <span class="badge">مخفي</span>'}</div></div>
      <button class="btn btn-ghost btn-sm" data-e>تعديل</button></div>`).join('') : '<div class="empty-s">لا توجد عروض بعد.</div>';
    m.el.querySelectorAll('#olist2 [data-e]').forEach(b => b.onclick = () => { m.close(); editOffer(S.offers.find(o => o.id === b.closest('.prow').dataset.id)); });
  };
  draw();
  m.el.querySelector('#newOffer').onclick = () => { m.close(); editOffer(); };
}

function editOffer(o) {
  const isNew = !o;
  o = o || { title: '', description: '', price: '', pick_count: 3, product_ids: [], image_url: '', active: true };
  const chosen = new Set(o.product_ids);
  const m = openModal(`<h2>${isNew ? 'عرض جديد' : 'تعديل العرض'}</h2>
    <form id="of">
      <div class="field"><label for="ot">اسم العرض</label><input id="ot" required maxlength="120" value="${esc(o.title)}" placeholder="مثلاً: أي 3 حبات بخور بـ 10 ريال"></div>
      <div class="row">
        <div class="field"><label for="on">عدد المنتجات التي يختارها الزبون</label><input id="on" type="number" min="1" max="20" required value="${o.pick_count}"></div>
        <div class="field"><label for="op">سعر العرض (ر.ع.)</label><input id="op" type="number" min="0" step="0.001" required inputmode="decimal" value="${o.price}"></div>
      </div>
      <div class="field"><label for="od">وصف قصير (اختياري)</label><input id="od" maxlength="200" value="${esc(o.description)}" placeholder="مثلاً: صُنع بأيدٍ عُمانية"></div>
      <div class="field"><label>صورة العرض</label><div class="img-pick"><div class="thumb" id="oimgv">${o.image_url ? `<img src="${esc(o.image_url)}" alt="">` : `<div class="ph ph-incense">${icon('burner')}</div>`}</div><input id="oimg" type="file" accept="image/*"></div></div>
      <div class="field"><label>المنتجات المشمولة في العرض <span class="muted" id="ocount"></span></label>
        <div class="row" style="margin-bottom:8px"><input id="oq" type="search" placeholder="بحث"><select id="oc"><option value="">كل الأقسام</option>${CATEGORIES.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select></div>
        <div style="display:flex;gap:8px;margin-bottom:8px"><button type="button" class="btn btn-ghost btn-sm" id="oall">تحديد الظاهر</button><button type="button" class="btn btn-ghost btn-sm" id="onone">إلغاء الظاهر</button></div>
        <div class="pick-list" id="oprods" style="max-height:34vh"></div></div>
      <label class="check field"><input type="checkbox" id="oa" ${o.active ? 'checked' : ''}> يظهر في المتجر</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-gold" id="osave">حفظ العرض</button>${isNew ? '' : '<button type="button" class="btn btn-danger" id="odel">حذف</button>'}</div>
    </form>`, { wide: true });
  const el = m.el;
  const visible = () => {
    const q = el.querySelector('#oq').value.trim().toLowerCase(), c = el.querySelector('#oc').value;
    return S.products.filter(p => (!c || p.category === c) && (!q || `${p.name} ${p.size || ''}`.toLowerCase().includes(q))).sort((x, y) => chosen.has(y.id) - chosen.has(x.id));
  };
  const draw = () => {
    el.querySelector('#ocount').textContent = `(${chosen.size} محدد)`;
    el.querySelector('#oprods').innerHTML = visible().map(p => `<label class="pick ${chosen.has(p.id) ? 'on' : ''}" style="cursor:pointer"><div class="pick-thumb">${productVisual(p)}</div>
      <div class="pick-meta"><b>${esc(p.name)}</b><small class="muted">${esc(catById(p.category).name)}${p.size ? ' · ' + esc(p.size) : ''} · ${money(p.price)}</small></div>
      <input type="checkbox" data-id="${p.id}" ${chosen.has(p.id) ? 'checked' : ''} style="width:22px;height:22px;accent-color:var(--gold)"></label>`).join('');
    el.querySelectorAll('#oprods input').forEach(i => i.onchange = () => { i.checked ? chosen.add(i.dataset.id) : chosen.delete(i.dataset.id); i.closest('.pick').classList.toggle('on', i.checked); el.querySelector('#ocount').textContent = `(${chosen.size} محدد)`; });
  };
  draw();
  el.querySelector('#oq').oninput = draw; el.querySelector('#oc').onchange = draw;
  el.querySelector('#oall').onclick = () => { visible().forEach(p => chosen.add(p.id)); draw(); };
  el.querySelector('#onone').onclick = () => { visible().forEach(p => chosen.delete(p.id)); draw(); };
  let file = null;
  el.querySelector('#oimg').onchange = e => { file = e.target.files[0]; if (file) el.querySelector('#oimgv').innerHTML = `<img src="${URL.createObjectURL(file)}" alt="">`; };
  el.querySelector('#odel')?.addEventListener('click', async () => {
    if (!(await ask(`حذف العرض «${o.title}»؟`, { ok: 'حذف', danger: true }))) return;
    try { await db.deleteOffer(o.id); await loadProducts(); m.close(); toast('تم حذف العرض'); } catch (e) { toast(e.message, 'bad'); }
  });
  el.querySelector('#of').onsubmit = async e => {
    e.preventDefault();
    if (!chosen.size) { toast('حدد المنتجات المشمولة في العرض', 'bad'); return; }
    const btn = el.querySelector('#osave'); btn.disabled = true; btn.textContent = 'جارٍ الحفظ…';
    try {
      let image_url = o.image_url;
      if (file) image_url = await db.uploadProductImage(file);
      await db.saveOffer({ id: o.id, title: el.querySelector('#ot').value.trim(), description: el.querySelector('#od').value.trim(), price: Number(el.querySelector('#op').value),
        pick_count: parseInt(el.querySelector('#on').value, 10), product_ids: [...chosen], image_url, active: el.querySelector('#oa').checked });
      await loadProducts(); m.close(); toast('تم حفظ العرض، ويظهر الآن في المتجر'); openOffers();
    } catch (er) { toast(er.message, 'bad'); btn.disabled = false; btn.textContent = 'حفظ العرض'; }
  };
}
