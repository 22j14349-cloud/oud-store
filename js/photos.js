// صور المنتجات الجاهزة (img/products) وربطها بالمنتجات تلقائياً حسب الاسم
import { toast } from './util.js';

// f: رقم الصورة، label: الاسم المكتوب على العلبة، keys: أسماء المنتجات التي تطابقها، draft: يُنشأ كمنتج مخفي إن لم يوجد
export const PHOTOS = [
// الدفعة الثانية (صور أوضح): تحل محل صور الدفعة الأولى للمنتج نفسه
  { f: 'n01', label: 'نوف', v: 2, keys: ['نوف'] },
  { f: 'n02', label: 'عود العاصمة', v: 2, keys: ['عود العاصمة'], draft: 'incense' },
  { f: 'n03', label: 'دقة خاصة', v: 2, keys: ['دقة خاصة'], draft: 'incense' },
  { f: 'n04', label: 'العزة', v: 2, keys: ['العزة'], draft: 'incense' },
  { f: 'n05', label: 'مشحم العطاء', v: 2, keys: ['مشحم العطاء الطيب', 'مشحم العطاء'] },
  { f: 'n06', label: 'التيامن', v: 2, keys: ['التيامن'], draft: 'incense' },
  { f: 'n07', label: 'التيامن (2)', v: 2 },
  { f: 'n08', label: 'أنس', v: 2, keys: ['أنس'] },
  { f: 'n09', label: 'حوافير', v: 2, keys: ['حوافير'] },
  { f: 'n10', label: 'دقة العشاق', v: 2, keys: ['دقة العشاق'] },
  { f: 'n11', label: 'العزة (2)', v: 2 },
  { f: 'n12', label: 'العود الخصوصي', v: 2, keys: ['مشحم العود الخصوصي', 'العود الخصوصي'] },
  { f: 'n13', label: 'عطر نواف (مع العلبة)', v: 2, keys: ['عطر نواف'] },
  { f: 'n14', label: 'عود الجوهرة', v: 2, keys: ['مشحم الجوهرة', 'عود الجوهرة'] },
  { f: 'n15', label: 'مخلط عز الوطن (مرش)', v: 2, keys: ['عطر مخلط عز الوطن', 'مخلط عز الوطن'] },
  { f: 'n16', label: 'عطر نواف (2)', v: 2 },
  { f: 'n17', label: 'مرش جلنار', v: 2, keys: ['مرش جلنار'], draft: 'perfume' },
  { f: 'n18', label: 'قطرة البلوش', v: 2, keys: ['قطرة البلوش'], draft: 'oil' },
  { f: 'n19', label: 'قطرة الصندل', v: 2, keys: ['قطرة الصندل'], draft: 'oil' },
  { f: 'n20', label: 'مرش الأريج', v: 2, keys: ['مرش الأريج'], draft: 'perfume' },
  { f: 'n21', label: 'مرش نواف', v: 2, keys: ['مرش نواف'], draft: 'perfume' },
  { f: 'n22', label: 'ديور أوم انتنس', v: 2, keys: ['ديورأوم انتس', 'ديور أوم انتس', 'ديور أوم انتنس'] },
  { f: 'n23', label: 'ديور أوم انتنس (2)', v: 2 },
  { f: 'n24', label: 'العظماء', v: 2, keys: ['العظماء'] },
  { f: 'n25', label: 'حوافير (2)', v: 2 },
  { f: 'n26', label: 'الحمراء', v: 2, keys: ['مشحم الحمراء'] },
  { f: 'n27', label: 'مرش اللافندر', v: 2, keys: ['مرش اللافندر'], draft: 'perfume' },
  { f: 'n28', label: 'مسك الرمان', v: 2, keys: ['مسك الرمان'] },
  { f: 'n29', label: 'عود العطاء الطيب', v: 2, keys: ['عود العطاء الطيب'] },
  { f: 'n30', label: 'فرزاتشي', v: 2, keys: ['فرزاتشي'] },
  { f: 'n31', label: 'مسك الرمان (زجاجة أخرى)', v: 2 },
  { f: 'n32', label: 'همس', v: 2, keys: ['همس'], draft: 'incense' },
  { f: 'n33', label: 'مسك سنشوال', v: 2, keys: ['مسك السنشوال', 'مسك سنشوال'] },
  { f: 'n34', label: 'دقة ظفران', v: 2, keys: ['دقة ظفران'], draft: 'incense' },
  { f: 'n35', label: 'قطرة العود', v: 2, keys: ['قطرة العود'], draft: 'oil' },
  { f: 'n36', label: 'عطر نواف (3)', v: 2 },
  { f: 'n37', label: 'بودرة جونسون', v: 2, keys: ['بودرة جونسون'] },
  { f: 'n38', label: 'السمو', v: 2, keys: ['مشحم السمو'] },
  { f: 'n39', label: 'مرش اللافندر (2)', v: 2 },
  { f: 'n40', label: 'عبق', v: 2, keys: ['خلطة عبق', 'عبق'] },
  { f: 'n41', label: 'الأطلس', v: 2, keys: ['اطلس', 'الأطلس'] },
  { f: 'n42', label: 'هدسون', v: 2, keys: ['هدسون'] },
  { f: 'n43', label: 'مرش الطموح', v: 2, keys: ['مرش الطموح'], draft: 'perfume' },
  { f: 'n44', label: 'ليالي', v: 2, keys: ['ليالي'] },
  { f: 'n45', label: 'دقة بلوش', v: 2, keys: ['دقة بلوش'] },
  { f: 'n46', label: 'البنفسج', v: 2, keys: ['مشحم البنفسج'] },
  { f: 'n47', label: 'سكاندل', v: 2, keys: ['سكاندل'] },
  { f: 'n48', label: 'قطرة العرائس', v: 2, keys: ['قطرة العرائس'], draft: 'oil' },
  { f: 'n49', label: 'مسك التوت', v: 2, keys: ['مسك التوت'], draft: 'perfume' },
  { f: 'n50', label: 'مسك سنشوال (2)', v: 2 },
  { f: 'n51', label: 'مرش الأريج (2)', v: 2 },
  { f: 'n52', label: 'عود خواطر', v: 2, keys: ['عود خواطر'] },
  { f: 'n53', label: 'هدسون (2)', v: 2 },
  { f: 'n54', label: 'مسك الباتشولي', v: 2, keys: ['مسك الباتشولي'], draft: 'perfume' },
  { f: 'n55', label: 'شانيل بلو', v: 2, keys: ['شانيل بلو'] },
  { f: 'n56', label: 'أفنان', v: 2, keys: ['أفنان'] },
  { f: 'n57', label: 'المدينة', v: 2, keys: ['المدينة'] },
  { f: 'n58', label: 'دقة العروبة', v: 2, keys: ['العروبة', 'دقة العروبة'] },
  { f: 'n59', label: 'مخلط عود العطاء', v: 2, keys: ['مشحم مخلط عود العطاء', 'مخلط عود العطاء'] },
  { f: 'n60', label: 'نوف (2)', v: 2 },
  { f: 'n61', label: 'بودرة جونسون (زجاجة سوداء)', v: 2 },
  { f: 'n62', label: 'أنس (2)', v: 2 },
  { f: 'n63', label: 'دقة السيف', v: 2, keys: ['دقة السيف'] },
  { f: 'n64', label: 'التيامن (3)', v: 2 },
  { f: 'n65', label: 'عود العاصمة (2)', v: 2 },
  { f: '01', label: 'ريسوت', keys: ['ريسوت'] },
  { f: '02', label: 'مشحم العطاء الطيب', keys: ['مشحم العطاء الطيب'] },
  { f: '03', label: 'دقة بلوش', keys: ['دقة بلوش'] },
  { f: '04', label: 'دقة السيف', keys: ['دقة السيف', 'السيف'] },
  { f: '05', label: 'الدقة الصفراء', keys: ['الدقة الصفراء'] },
  { f: '06', label: 'مشحم السمو', keys: ['مشحم السمو'] },
  { f: '07', label: 'مشحم الجوهرة', keys: ['مشحم الجوهرة', 'بخور الجوهرة'] },
  { f: '08', label: 'مخلط عود العطاء', keys: ['مشحم مخلط عود العطاء', 'مخلط عود العطاء'] },
  { f: '09', label: 'مشحم البنفسج', keys: ['مشحم البنفسج'] },
  { f: '10', label: 'دقة أمواج', keys: ['أمواج', 'دقة أمواج'] },
  { f: '11', label: 'مشحم الحمراء', keys: ['مشحم الحمراء'] },
  { f: '12', label: 'الدقة الصفراء (علبة صغيرة)' },
  { f: '13', label: 'الدقة الصفراء (علبة صغيرة 2)' },
  { f: '14', label: 'دقة أمواج (علبة صغيرة)' },
  { f: '15', label: 'العود الخصوصي', keys: ['مشحم العود الخصوصي', 'العود الخصوصي'] },
  { f: '16', label: 'دقة بلوش (علبة صغيرة)' },
  { f: '17', label: 'دقة العروبة', keys: ['العروبة', 'دقة العروبة'] },
  { f: '18', label: 'ريسوت (علبة صغيرة)' },
  { f: '19', label: 'بخور الأريج', keys: ['الأريج', 'بخور الأريج'] },
  { f: '20', label: 'دقة السيف (علبة صغيرة)' },
  { f: '21', label: 'أساور', keys: ['أساور'] },
  { f: '22', label: 'بخور رنس', keys: ['رنس', 'بخور رنس'] },
  { f: '23', label: 'سندس', keys: ['سندس'] },
  { f: '24', label: 'رزن', keys: ['رزن'] },
  { f: '25', label: 'بخور الأريج (2)' },
  { f: '26', label: 'ميار', keys: ['ميار'] },
  { f: '27', label: 'بخور العنبر', keys: ['بخور العنبر'] },
  { f: '28', label: 'قطرة العرائس', keys: ['قطرة العرائس'] },
  { f: '29', label: 'علبة زجاجية بدون ملصق' },
  { f: '30', label: 'دقة غزل', keys: ['دقة غزل'] },
  { f: '31', label: 'قطرة الصندل', keys: ['قطرة الصندل'] },
  { f: '32', label: 'قطرة الملوك', keys: ['قطرة الملوك'], draft: 'oil' },
  { f: '33', label: 'دقة ظفران', keys: ['دقة ظفران'] },
  { f: '34', label: 'دقة ظفران (2)' },
  { f: '35', label: 'قطرة البلوش', keys: ['قطرة البلوش'] },
  { f: '36', label: 'عود 3 سوبر', keys: ['عود 3 سوبر'], draft: 'perfume' },
  { f: '37', label: 'عود المجالس', keys: ['عود المجالس'], draft: 'perfume' },
  { f: '38', label: 'زجاجة الحذاء (داكن)' },
  { f: '39', label: 'زجاجة الحذاء (عسلي)' },
  { f: '40', label: 'طحنون عود الهند', keys: ['طحنون عود الهند'], draft: 'perfume' },
  { f: '41', label: 'زجاجة الحذاء (عسلي 2)' },
  { f: '42', label: 'أنبوب خشبي (1)' },
  { f: '43', label: 'أنبوب خشبي (2)' },
  { f: '44', label: 'زجاجة الحذاء (عسلي 3)' },
  { f: '45', label: 'أنبوب خشبي (3)' },
  { f: '46', label: 'أنبوب خشبي (4)' },
  { f: '47', label: 'أنبوب خشبي (5)' },
];
export const photoUrl = ph => `img/products/${ph.f}.jpg`;

const norm = s => String(s || '').replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim();
// الاسم بدون الكلمة الأولى الوصفية وبدون «ال»
const core = s => norm(s).replace(/^(دقه|بخور|مشحم|عطر|الدقه)\s+/, '').replace(/^ال/, '');

// يربط الصور بالمنتجات: المنتج بدون صورة يأخذ صورته، وصور الدفعة الثانية تحل محل صور الدفعة الأولى.
// الصور التي رفعها صاحب المحل بنفسه لا تُستبدل أبداً. وينشئ (مرة واحدة لكل دفعة) منتجات مخفية للعلب التي لا يوجد لها منتج.
const isReady = url => /^img\/products\//.test(url || '');
const isV2 = url => /^img\/products\/n\d+\.jpg$/.test(url || '');
export async function autoLinkPhotos(db, products) {
  if (!products || !products.length) return 0;
  let linked = 0, drafts = 0;
  const done = v => { try { return !!localStorage.getItem('oud_photo_drafts_v' + v); } catch { return true; } };
  const draftsDone = { 1: done(1), 2: done(2) };
  const names = new Set(products.map(p => norm(p.name)));
  const order = [...PHOTOS].sort((a, b) => (b.v || 1) - (a.v || 1));
  for (const ph of order) {
    if (!ph.keys) continue;
    const v = ph.v || 1, url = photoUrl(ph);
    const keys = ph.keys.map(norm);
    let hits = products.filter(p => keys.includes(norm(p.name)));
    if (!hits.length) { const c = products.filter(p => ph.keys.some(k => core(k) === core(p.name))); if (c.length === 1) hits = c; }
    for (const p of hits) {
      const can = !p.image_url || (v === 2 && isReady(p.image_url) && !isV2(p.image_url));
      if (!can || p.image_url === url) continue;
      try { await db.saveProduct({ ...p, image_url: url }); p.image_url = url; linked++; } catch { /* نتابع الباقي */ }
    }
    if (!hits.length && ph.draft && !draftsDone[v] && !names.has(norm(ph.label))) {
      try { await db.saveProduct({ name: ph.label, category: ph.draft, price: 0, stock: 0, active: false, image_url: url, description: '' }); names.add(norm(ph.label)); drafts++; } catch { /* نتابع */ }
    }
  }
  for (const v of [1, 2]) if (!draftsDone[v]) { try { localStorage.setItem('oud_photo_drafts_v' + v, '1'); } catch {} }
  if (linked || drafts) toast(`تمت إضافة صور ${linked} منتجاً${drafts ? `، وإنشاء ${drafts} منتجات جديدة مخفية تحتاج السعر` : ''}`);
  return linked + drafts;
}
