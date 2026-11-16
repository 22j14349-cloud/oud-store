// صور المنتجات الجاهزة (img/products) وربطها بالمنتجات تلقائياً حسب الاسم
import { toast } from './util.js';

// f: رقم الصورة، label: الاسم المكتوب على العلبة، keys: أسماء المنتجات التي تطابقها، draft: يُنشأ كمنتج مخفي إن لم يوجد
export const PHOTOS = [
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
  { f: '28', label: 'قطرة العرائس', keys: ['قطرة العرائس'], draft: 'oil' },
  { f: '29', label: 'علبة زجاجية بدون ملصق' },
  { f: '30', label: 'دقة غزل', keys: ['دقة غزل'] },
  { f: '31', label: 'قطرة الصندل', keys: ['قطرة الصندل'], draft: 'oil' },
  { f: '32', label: 'قطرة الملوك', keys: ['قطرة الملوك'], draft: 'oil' },
  { f: '33', label: 'دقة ظفران', keys: ['دقة ظفران'], draft: 'incense' },
  { f: '34', label: 'دقة ظفران (2)' },
  { f: '35', label: 'قطرة البلوش', keys: ['قطرة البلوش'], draft: 'oil' },
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

// يربط الصور بالمنتجات التي ليس لها صورة، وينشئ (مرة واحدة) منتجات مخفية للعلب التي لا يوجد لها منتج
export async function autoLinkPhotos(db, products) {
  if (!products || !products.length) return 0;
  let linked = 0, drafts = 0;
  const DKEY = 'oud_photo_drafts_v1';
  let draftsDone = true; try { draftsDone = !!localStorage.getItem(DKEY); } catch {}
  for (const ph of PHOTOS) {
    if (!ph.keys) continue;
    const keys = ph.keys.map(norm);
    let hits = products.filter(p => keys.includes(norm(p.name)));
    if (!hits.length) { const c = products.filter(p => ph.keys.some(k => core(k) === core(p.name))); if (c.length === 1) hits = c; }
    for (const p of hits) {
      if (p.image_url) continue;
      try { await db.saveProduct({ ...p, image_url: photoUrl(ph) }); p.image_url = photoUrl(ph); linked++; } catch { /* نتابع الباقي */ }
    }
    if (!hits.length && ph.draft && !draftsDone) {
      try { await db.saveProduct({ name: ph.label, category: ph.draft, price: 0, stock: 0, active: false, image_url: photoUrl(ph), description: '' }); drafts++; } catch { /* نتابع */ }
    }
  }
  if (!draftsDone) { try { localStorage.setItem(DKEY, '1'); } catch {} }
  if (linked || drafts) toast(`تمت إضافة صور ${linked} منتجاً${drafts ? `، وإنشاء ${drafts} منتجات جديدة مخفية تحتاج السعر` : ''}`);
  return linked + drafts;
}
