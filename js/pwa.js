// التثبيت كتطبيق + الشاشة الافتتاحية
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

// الشاشة الافتتاحية: تظهر عند فتح التطبيق المثبت
export function splash(kind) {
  if (!standalone) return;
  let name = 'عطور سمائل';
  try { name = localStorage.getItem('oud_shop_name') || name; } catch {}
  const el = document.createElement('div');
  el.className = 'splash';
  el.innerHTML = `<div class="splash-in"><img src="img/${kind === 'admin' ? 'icon-admin' : 'icon'}-512.png" alt="">
    <h1>${name.replace(/[<>&]/g, '')}</h1><p>${kind === 'admin' ? 'المحاسبة والمبيعات' : 'عطور · أدهان · بخور · لبان عُماني'}</p></div>`;
  document.body.append(el);
  setTimeout(() => el.classList.add('out'), 1300);
  setTimeout(() => el.remove(), 1900);
}
export function rememberShopName(n) { try { if (n) localStorage.setItem('oud_shop_name', n); } catch {} }

// زر «ثبّت التطبيق»
export function installButton(btn) {
  if (!btn || standalone) return;
  let deferred = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; btn.classList.remove('hidden'); });
  addEventListener('appinstalled', () => btn.classList.add('hidden'));
  if (isIOS) btn.classList.remove('hidden');
  btn.addEventListener('click', async () => {
    if (deferred) { deferred.prompt(); await deferred.userChoice; deferred = null; btn.classList.add('hidden'); return; }
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal"><button class="modal-x" aria-label="إغلاق">×</button>
      <h2>ثبّت التطبيق على جوالك</h2>
      ${isIOS ? `<ol class="steps"><li>افتح الرابط في متصفح <b>Safari</b>.</li><li>اضغط زر المشاركة <b>⬆︎</b> في أسفل الشاشة.</li><li>اختر <b>«إضافة إلى الشاشة الرئيسية»</b> ثم <b>«إضافة»</b>.</li></ol>`
      : `<ol class="steps"><li>افتح الرابط في متصفح <b>Chrome</b>.</li><li>اضغط القائمة <b>⋮</b> في أعلى الشاشة.</li><li>اختر <b>«تثبيت التطبيق»</b> أو <b>«إضافة إلى الشاشة الرئيسية»</b>.</li></ol>`}
      <p class="muted">بعدها تظهر الأيقونة على شاشة جوالك ويفتح كتطبيق كامل الشاشة.</p></div>`;
    wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('.modal-x')) wrap.remove(); });
    document.body.append(wrap);
  });
}
