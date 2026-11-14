// الفاتورة كملف PDF: تُرسم الفاتورة كصفحة HTML (حتى تظهر الحروف العربية متصلة) ثم تُحوّل إلى PDF
import { PAY_METHODS, money, esc, fmtDate, openModal, toast, waLink, normPhone } from './util.js';

// inv: { no, label, date, items, total, method, customer_name, customer_phone }
function invoiceHTML(inv, st) {
  const rows = inv.items.map(i => `<tr>
      <td>${esc(i.name)}${i.picks ? `<div class="inv-sub">${esc(i.picks.map(x => x.name).join('، '))}</div>` : ''}</td>
      <td class="n">${i.qty}</td><td class="n">${money(i.price)}</td><td class="n">${money(i.price * i.qty)}</td></tr>`).join('');
  const cust = inv.customer_name || inv.customer_phone
    ? `<div><span>الزبون</span><b>${esc(inv.customer_name || '')}${inv.customer_phone ? ` <span class="n">${esc(normPhone(inv.customer_phone))}</span>` : ''}</b></div>` : '';
  return `<div class="inv-top">
      <div class="inv-shop">${esc(st.shop_name || 'المحل')}</div>
      <div class="inv-tag">عطور · أدهان · بخور · لبان عُماني</div>
      <div class="inv-tag">سمائل - سلطنة عُمان${st.whatsapp ? ` · واتساب <span class="n">${esc(st.whatsapp)}</span>` : ''}</div>
    </div>
    <div class="inv-meta">
      <div><span>${esc(inv.label || 'فاتورة رقم')}</span><b class="n">${esc(inv.no)}</b></div>
      <div><span>التاريخ</span><b class="n">${esc(fmtDate(inv.date))}</b></div>
      ${cust}
    </div>
    <table class="inv-t"><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>المجموع</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="inv-total"><span>الإجمالي</span><b class="n">${money(inv.total)}</b></div>
    <div class="inv-pay">طريقة الدفع: ${esc(PAY_METHODS[inv.method] || inv.method || '')}</div>
    <div class="inv-foot">شكراً لتسوقكم معنا، نسعد بخدمتكم دائماً</div>`;
}

export async function invoicePDF(inv, settings) {
  if (!window.html2canvas || !window.jspdf) throw new Error('مكتبة PDF لم تُحمّل، أعد تحميل الصفحة');
  await document.fonts?.ready;
  const el = document.createElement('div');
  el.className = 'inv'; el.dir = 'rtl';
  el.innerHTML = invoiceHTML(inv, settings);
  document.body.appendChild(el);
  try {
    const canvas = await window.html2canvas(el, { scale: 2, backgroundColor: '#ffffff', logging: false });
    const { jsPDF } = window.jspdf;
    const w = 148, h = Math.max(120, (canvas.height / canvas.width) * w);
    const pdf = new jsPDF({ unit: 'mm', format: [w, h], orientation: 'portrait', compress: true });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, (canvas.height / canvas.width) * w);
    pdf.setProperties({ title: `فاتورة ${inv.no}` });
    const blob = pdf.output('blob');
    return new File([blob], `invoice-${String(inv.no).replace(/[^\w-]/g, '')}.pdf`, { type: 'application/pdf' });
  } finally { el.remove(); }
}

export const invoiceText = (inv, settings) =>
  `مرحباً ${inv.customer_name || ''}، شكراً لتسوقك من ${settings.shop_name || 'محلنا'}.\n${inv.label || 'فاتورة رقم'} ${inv.no} بمبلغ ${money(inv.total)}
الفاتورة مرفقة، نسعد بخدمتك دائماً.`;

function download(file) {
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// نافذة: تجهيز الفاتورة ثم مشاركتها (واتساب وغيره) أو تنزيلها
export async function sendInvoice(inv, settings) {
  const m = openModal(`<h2>فاتورة PDF</h2><p class="muted" data-st>جارٍ تجهيز الفاتورة…</p><div class="inv-acts" data-acts></div>`);
  let file;
  try { file = await invoicePDF(inv, settings); }
  catch (e) { m.el.querySelector('[data-st]').textContent = e.message; return; }
  const phone = normPhone(inv.customer_phone);
  const text = invoiceText(inv, settings);
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  m.el.querySelector('[data-st]').textContent = canShare
    ? 'الفاتورة جاهزة. اضغط «مشاركة» ثم اختر واتساب والزبون.'
    : 'الفاتورة جاهزة. نزّلها ثم أرفقها في محادثة الزبون على واتساب.';
  const acts = m.el.querySelector('[data-acts]');
  acts.innerHTML = `${canShare ? '<button class="btn btn-gold" data-share>مشاركة الفاتورة (واتساب)</button>' : ''}
    <button class="btn ${canShare ? 'btn-ghost' : 'btn-gold'}" data-dl>تنزيل PDF</button>
    ${phone ? `<a class="btn btn-ghost" data-wa target="_blank" rel="noopener" href="${esc(waLink(phone, text))}">فتح محادثة الزبون</a>` : ''}`;
  acts.querySelector('[data-share]')?.addEventListener('click', async () => {
    try { await navigator.share({ files: [file], title: file.name, text }); }
    catch (e) { if (e.name !== 'AbortError') { toast('تعذّرت المشاركة، تم تنزيل الملف بدلاً منها', 'bad'); download(file); } }
  });
  acts.querySelector('[data-dl]').onclick = () => download(file);
}

export const saleInvoice = sale => ({ no: sale.invoice_no, label: 'فاتورة رقم', date: sale.created_at, items: sale.items, total: sale.total,
  method: sale.payment_method, customer_name: sale.customer_name || '', customer_phone: sale.customer_phone || '' });
