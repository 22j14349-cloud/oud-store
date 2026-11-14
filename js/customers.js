// الزبائن: سجل الأرقام، الإضافة اليدوية، الاستيراد والتصدير، وإرسال العروض الحصرية عبر واتساب
import { db } from './db.js';
import { money, esc, $, $$, toast, openModal, fmtDate, ask, normPhone, waLink } from './util.js';

let S;
const SRC = { online: 'من المتجر', pos: 'من المحل', manual: 'يدوي' };
const storeLink = () => location.origin + location.pathname.replace(/admin\.html$/, '');

export async function loadCustomers() {
  try { S.customers = await db.listCustomers(); } catch { S.customers = S.customers || []; }
  return S.customers;
}
export const findCustomer = phone => (S.customers || []).find(c => c.phone === normPhone(phone));

export function setupCustomers(state) {
  S = state; S.customers = [];
  $('#custSearch').oninput = drawCustomers;
  $('#custFilter').onchange = drawCustomers;
  $('#addCust').onclick = () => editCustomer();
  $('#custImportBtn').onclick = () => $('#custFile').click();
  $('#custFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); };
  $('#custExport').onclick = exportCustomers;
  $('#campaignBtn').onclick = campaign;
  loadCustomers();
}

export async function renderCustomers() { await loadCustomers(); drawCustomers(); }

function filtered() {
  const q = $('#custSearch').value.trim().toLowerCase(), qd = normPhone(q), f = $('#custFilter').value;
  return S.customers.filter(c =>
    (!q || c.name.toLowerCase().includes(q) || (qd && c.phone.includes(qd))) &&
    (!f || (f === 'opt' ? c.opt_in : f === 'buyers' ? c.orders_count > 0 : c.source === f)));
}

function drawCustomers() {
  const list = filtered(), shown = list.slice(0, 300);
  $('#custCount').textContent = `(${S.customers.length})`;
  $('#clist').innerHTML = shown.length ? shown.map(c => `<article class="card crow" data-p="${esc(c.phone)}">
      <div class="c-top"><b>${esc(c.name || 'بدون اسم')}</b><a class="num gold" href="tel:${esc(c.phone)}">${esc(c.phone)}</a></div>
      <div class="c-info">
        <span>${SRC[c.source] || ''}</span>
        <span>${c.orders_count ? `${c.orders_count} مشتريات · ${money(c.total_spent)}` : 'لم يشترِ بعد'}</span>
        ${c.last_at ? `<span>آخر شراء ${esc(fmtDate(c.last_at, false))}</span>` : ''}
        ${c.opt_in ? '<span class="badge badge-ok">يقبل العروض</span>' : '<span class="badge badge-bad">لا يريد عروضاً</span>'}
        ${c.last_offer_at ? `<span>آخر عرض ${esc(fmtDate(c.last_offer_at, false))}</span>` : ''}
      </div>
      ${c.notes ? `<div class="muted" style="font-size:.85rem">${esc(c.notes)}</div>` : ''}
      <div class="acts">
        <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${esc(waLink(c.phone, `مرحباً ${c.name || ''}، معك ${S.settings.shop_name || ''}.`))}">واتساب</a>
        <button class="btn btn-ghost btn-sm" data-e>تعديل</button>
        ${S.role === 'admin' ? '<button class="btn btn-danger btn-sm" data-x>حذف</button>' : ''}
      </div></article>`).join('')
    + (list.length > shown.length ? `<div class="muted">يُعرض أول 300 من ${list.length}، استخدم البحث للوصول للبقية.</div>` : '')
    : `<div class="empty-s card pad">${S.customers.length ? 'لا توجد نتائج' : 'لا يوجد زبائن بعد. تُحفظ أرقام الزبائن تلقائياً عند الطلب من المتجر أو عند كتابة الرقم في فاتورة البيع، ويمكنك إضافتهم يدوياً.'}</div>`;
  $$('#clist .crow').forEach(r => {
    const c = S.customers.find(x => x.phone === r.dataset.p);
    r.querySelector('[data-e]').onclick = () => editCustomer(c);
    r.querySelector('[data-x]')?.addEventListener('click', async () => {
      if (!(await ask(`حذف الزبون ${c.name || c.phone}؟`, { ok: 'حذف', danger: true }))) return;
      try { await db.deleteCustomer(c.phone); renderCustomers(); } catch (e) { toast(e.message, 'bad'); }
    });
  });
}

function editCustomer(c) {
  const m = openModal(`<h2>${c ? 'تعديل زبون' : 'إضافة زبون'}</h2>
    <form id="cf">
      <div class="field"><label for="cfp">رقم الهاتف</label><input id="cfp" required inputmode="tel" placeholder="9XXXXXXX" value="${esc(c?.phone || '')}"></div>
      <div class="field"><label for="cfn">الاسم</label><input id="cfn" value="${esc(c?.name || '')}"></div>
      <div class="field"><label for="cfo">ملاحظات</label><input id="cfo" placeholder="مثلاً: يحب العود الكمبودي" value="${esc(c?.notes || '')}"></div>
      <label class="check field"><input type="checkbox" id="cfi" ${!c || c.opt_in ? 'checked' : ''}> يقبل استلام العروض على واتساب</label>
      <button class="btn btn-gold btn-block">حفظ</button>
    </form>`);
  m.el.querySelector('#cf').onsubmit = async e => {
    e.preventDefault();
    const row = { phone: m.el.querySelector('#cfp').value, name: m.el.querySelector('#cfn').value, notes: m.el.querySelector('#cfo').value, opt_in: m.el.querySelector('#cfi').checked };
    try { await db.saveCustomer(row, c?.phone); m.close(); toast('تم الحفظ'); renderCustomers(); } catch (er) { toast(er.message, 'bad'); }
  };
}

// ---------- الاستيراد: Excel أو CSV أو ملف جهات اتصال vCard
function parseVcf(text) {
  return text.split(/END:VCARD/i).map(card => {
    const fn = (card.match(/^FN[^:]*:(.*)$/im) || [])[1] || '';
    const tel = (card.match(/^(?:item\d+\.)?TEL[^:]*:(.*)$/im) || [])[1] || '';
    return { name: fn.trim(), phone: tel };
  }).filter(x => x.phone);
}
async function importFile(file) {
  let rows = [];
  try {
    if (/\.vcf$/i.test(file.name)) rows = parseVcf(await file.text());
    else {
      const wb = window.XLSX.read(await file.arrayBuffer());
      const grid = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
      // عمود الرقم: الذي أغلب خلاياه أرقام هواتف. عمود الاسم: أول عمود نصي آخر
      const cols = Math.max(0, ...grid.map(r => r.length));
      const score = i => grid.filter(r => /^[0-9]{8,15}$/.test(normPhone(r[i]))).length;
      let pc = -1, best = 0;
      for (let i = 0; i < cols; i++) { const s = score(i); if (s > best) { best = s; pc = i; } }
      if (pc < 0) { toast('لم أجد عموداً فيه أرقام هواتف', 'bad'); return; }
      let nc = -1;
      for (let i = 0; i < cols && nc < 0; i++) if (i !== pc && grid.some(r => /\p{L}/u.test(String(r[i] || '')))) nc = i;
      rows = grid.map(r => ({ phone: r[pc], name: nc >= 0 ? String(r[nc] || '') : '' }));
    }
  } catch { toast('تعذّرت قراءة الملف', 'bad'); return; }
  const good = rows.filter(r => /^[0-9]{8,15}$/.test(normPhone(r.phone)));
  if (!good.length) { toast('لا توجد أرقام صحيحة في الملف', 'bad'); return; }
  if (!(await ask(`وُجد ${good.length} رقماً في الملف. إضافتها إلى الزبائن؟ (الأرقام المحفوظة مسبقاً لن تتكرر)`, { ok: 'إضافة' }))) return;
  try { const n = await db.importCustomers(good); toast(`تمت إضافة ${n} زبوناً جديداً`); renderCustomers(); }
  catch (e) { toast(e.message, 'bad'); }
}

// ---------- التصدير
function saveFile(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const intl = p => (p.length === 8 ? '+968' + p : '+' + p);
function exportCustomers() {
  const m = openModal(`<h2>تصدير الزبائن</h2>
    <p class="muted">ملف Excel للحفظ والمراجعة، أو ملف جهات اتصال تضيفه إلى جوالك ثم تنشئ منه <b>قائمة بث</b> في واتساب للأعمال لإرسال العرض للجميع دفعة واحدة.</p>
    <div class="inv-acts"><button class="btn btn-ghost" data-csv>ملف Excel (CSV)</button><button class="btn btn-gold" data-vcf>جهات اتصال (vCard)</button></div>
    <label class="check" style="margin-top:12px;justify-content:center"><input type="checkbox" id="xo" checked> فقط من يقبلون العروض</label>`);
  const pick = () => S.customers.filter(c => !m.el.querySelector('#xo').checked || c.opt_in);
  m.el.querySelector('[data-csv]').onclick = () => {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['الاسم', 'الرقم', 'المصدر', 'عدد المشتريات', 'مجموع المشتريات', 'آخر شراء', 'يقبل العروض', 'ملاحظات'].map(q).join(',')]
      .concat(pick().map(c => [c.name, intl(c.phone), SRC[c.source], c.orders_count, Number(c.total_spent).toFixed(3), c.last_at ? fmtDate(c.last_at, false) : '', c.opt_in ? 'نعم' : 'لا', c.notes].map(q).join(',')));
    saveFile('customers.csv', '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  };
  m.el.querySelector('[data-vcf]').onclick = () => {
    const shop = S.settings.shop_name || '';
    const cards = pick().map(c => `BEGIN:VCARD\r\nVERSION:3.0\r\nFN:${(c.name || 'زبون ' + c.phone).replace(/[\r\n;,]/g, ' ')}${shop ? ' - ' + shop.replace(/[\r\n;,]/g, ' ') : ''}\r\nTEL;TYPE=CELL:${intl(c.phone)}\r\nEND:VCARD`);
    saveFile('customers.vcf', cards.join('\r\n') + '\r\n', 'text/vcard;charset=utf-8');
  };
}

// ---------- إرسال عرض حصري عبر واتساب (رسالة لكل زبون، بضغطة لكل واحد)
function offerText(o) {
  const shop = S.settings.shop_name || '';
  if (!o) return `مرحباً {الاسم} 🌿\nعرض حصري لعملاء ${shop}:\n\n\nتسوق الآن: ${storeLink()}`;
  return `مرحباً {الاسم} 🌿\nعرض حصري لعملاء ${shop}:\n✨ ${o.title} بسعر ${money(o.price)}${o.description ? '\n' + o.description : ''}\n\nاطلب الآن: ${storeLink()}`;
}
async function campaign() {
  await loadCustomers();
  const offers = (S.offers || []).filter(o => o.active);
  const m = openModal(`<h2>إرسال عرض حصري</h2>
    ${offers.length ? `<div class="field"><label for="co">اختر عرضاً (اختياري)</label><select id="co"><option value="">رسالة حرة</option>${offers.map(o => `<option value="${o.id}">${esc(o.title)} · ${money(o.price)}</option>`).join('')}</select></div>` : ''}
    <div class="field"><label for="cm">نص الرسالة <small class="muted">({الاسم} يُستبدل باسم كل زبون)</small></label><textarea id="cm" rows="7">${esc(offerText(null))}</textarea></div>
    <label class="check field"><input type="checkbox" id="cskip" checked> تخطّي من أُرسل لهم عرض خلال آخر 7 أيام</label>
    <div class="cart-total"><span id="cleft"></span><button class="btn btn-gold" id="cnext">أرسل للتالي</button></div>
    <p class="muted" style="font-size:.85rem">يفتح واتساب برسالة جاهزة لكل زبون، اضغط «إرسال» هناك ثم ارجع هنا للتالي. لإرسال العرض للجميع دفعة واحدة استخدم «تصدير ← جهات اتصال» وقائمة البث في واتساب للأعمال.</p>
    <div class="camp-list" id="clistc"></div>`, { wide: true });
  const el = m.el, sent = new Set();
  const week = Date.now() - 7 * 864e5;
  const targets = () => S.customers.filter(c => c.opt_in && !(el.querySelector('#cskip').checked && c.last_offer_at && new Date(c.last_offer_at).getTime() > week));
  const msgFor = c => el.querySelector('#cm').value.replace(/\{الاسم\}/g, c.name || '').replace(/ {2,}/g, ' ');
  const draw = () => {
    const list = targets(), left = list.filter(c => !sent.has(c.phone));
    el.querySelector('#cleft').textContent = list.length ? `تم ${list.length - left.length} من ${list.length}` : 'لا يوجد زبائن يقبلون العروض';
    el.querySelector('#cnext').disabled = !left.length;
    el.querySelector('#clistc').innerHTML = list.map(c => `<div class="camp-item ${sent.has(c.phone) ? 'done' : ''}" data-p="${esc(c.phone)}">
      <span>${esc(c.name || 'بدون اسم')} <small class="num">${esc(c.phone)}</small></span>
      <button class="btn btn-ghost btn-sm" data-s>${sent.has(c.phone) ? '✓ أُرسل' : 'إرسال'}</button></div>`).join('');
    $$('.camp-item [data-s]', el).forEach(b => b.onclick = () => send(S.customers.find(c => c.phone === b.closest('.camp-item').dataset.p)));
  };
  const send = c => {
    if (!el.querySelector('#cm').value.trim()) { toast('اكتب نص الرسالة', 'bad'); return; }
    window.open(waLink(c.phone, msgFor(c)), '_blank', 'noopener');
    sent.add(c.phone);
    db.markOffered([c.phone]).catch(() => {});
    draw();
  };
  el.querySelector('#co')?.addEventListener('change', e => { el.querySelector('#cm').value = offerText(offers.find(o => o.id === e.target.value)); });
  el.querySelector('#cskip').onchange = draw;
  el.querySelector('#cnext').onclick = () => { const c = targets().find(x => !sent.has(x.phone)); if (c) send(c); };
  draw();
}
