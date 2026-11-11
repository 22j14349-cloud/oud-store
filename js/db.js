// طبقة البيانات: Supabase عند توفر الإعدادات، وإلا وضع تجريبي محلي في المتصفح
import { CONFIG } from './config.js';
import { ean13, resizeImage, blobToDataURL } from './util.js';

export const DEMO = !(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);

const err = m => { throw new Error(m); };
const productRow = p => ({ name: p.name, category: p.category, subtype: p.subtype || '', size: p.size || '', description: p.description || '',
  price: Number(p.price), old_price: Number(p.old_price) > Number(p.price) ? Number(p.old_price) : null,
  stock: Number(p.stock) || 0, image_url: p.image_url || '', active: p.active !== false });
const emailFor = role => (role === 'admin' ? CONFIG.ADMIN_EMAIL : CONFIG.EMPLOYEE_EMAIL).toLowerCase();

// ============================== Supabase ==============================
function supabaseBackend() {
  const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  const ok = ({ data, error }) => { if (error) err(error.message); return data; };
  let roleCache = null;

  return {
    async getSettings() { return ok(await sb.from('settings').select('*').eq('id', 1).single()); },
    async saveSettings(s) {
      const { shop_name, transfer_phone, account_name, whatsapp, store_note } = s;
      return ok(await sb.from('settings').update({ shop_name, transfer_phone, account_name, whatsapp, store_note, updated_at: new Date().toISOString() }).eq('id', 1).select().single());
    },

    async listProducts() { return ok(await sb.from('products').select('*').order('created_at', { ascending: false })); },
    async findByBarcode(code) { return ok(await sb.from('products').select('*').eq('barcode', code).maybeSingle()); },
    async saveProduct(p) {
      const row = productRow(p);
      if (p.barcode) row.barcode = p.barcode;
      if (p.id) return ok(await sb.from('products').update(row).eq('id', p.id).select().single());
      return ok(await sb.from('products').insert(row).select().single());
    },
    async deleteProduct(id) { ok(await sb.from('products').delete().eq('id', id)); },
    async importProducts(list) {
      const out = [];
      for (let i = 0; i < list.length; i += 100) out.push(...ok(await sb.from('products').insert(list.slice(i, i + 100).map(productRow)).select()));
      return out;
    },
    async uploadProductImage(file) {
      const blob = await resizeImage(file);
      const path = `${crypto.randomUUID()}.jpg`;
      ok(await sb.storage.from('products').upload(path, blob, { contentType: 'image/jpeg' }));
      return sb.storage.from('products').getPublicUrl(path).data.publicUrl;
    },

    async placeOrder(o) {
      const rows = ok(await sb.rpc('place_order', { p_name: o.name, p_phone: o.phone, p_fulfillment: o.fulfillment, p_address: o.address || '', p_note: o.note || '', p_items: o.items }));
      return rows[0];
    },
    async attachReceipt(orderNo, phone, file) {
      const blob = await resizeImage(file, 1400, 0.85);
      const path = `${orderNo}-${crypto.randomUUID()}.jpg`;
      ok(await sb.storage.from('receipts').upload(path, blob, { contentType: 'image/jpeg' }));
      ok(await sb.rpc('attach_receipt', { p_order_no: orderNo, p_phone: phone, p_path: path }));
    },
    async receiptUrl(path) { return ok(await sb.storage.from('receipts').createSignedUrl(path, 3600)).signedUrl; },
    async listOrders() { return ok(await sb.from('orders').select('*').order('created_at', { ascending: false }).limit(200)); },
    async confirmOrder(id, method) { return ok(await sb.rpc('confirm_order', { p_order: id, p_method: method })); },
    async cancelOrder(id) { ok(await sb.from('orders').update({ status: 'cancelled', handled_at: new Date().toISOString() }).eq('id', id)); },
    onOrdersChange(cb) {
      const ch = sb.channel('orders-live').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, p => cb(p)).subscribe();
      return () => sb.removeChannel(ch);
    },

    async recordSale(items, method) { return ok(await sb.rpc('record_sale', { p_items: items, p_method: method })); },
    async listSales(from, to) {
      const all = []; const size = 1000;
      for (let i = 0; ; i += size) {
        const page = ok(await sb.from('sales').select('*').gte('created_at', from.toISOString()).lt('created_at', to.toISOString()).order('created_at').range(i, i + size - 1));
        all.push(...page); if (page.length < size) break;
      }
      return all;
    },

    async login(role, password) {
      ok(await sb.auth.signInWithPassword({ email: emailFor(role), password }));
      roleCache = null;
      const r = await this.currentRole();
      if (r !== role) { await sb.auth.signOut(); err('الحساب غير مسجّل في جدول الموظفين'); }
      return r;
    },
    async logout() { roleCache = null; await sb.auth.signOut(); },
    async currentRole() {
      if (roleCache) return roleCache;
      const { data } = await sb.auth.getSession();
      if (!data.session) return null;
      roleCache = ok(await sb.rpc('my_role'));
      return roleCache;
    },
    async changePassword(role, password) {
      if (password.length < 6) err('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      const me = await this.currentRole();
      if (role === me) ok(await sb.auth.updateUser({ password }));
      else ok(await sb.rpc('set_employee_password', { p_password: password }));
    },
  };
}

// ============================== وضع تجريبي ==============================
function demoBackend() {
  const KEY = 'oud_demo_v1', SKEY = 'oud_demo_session';
  const now = () => new Date().toISOString();
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));

  function seed() {
    const s = { seq: 0, orderSeq: 1000, invoiceSeq: 0, passwords: { admin: 'admin123', employee: 'user123' },
      settings: { id: 1, shop_name: 'عطور سمائل', transfer_phone: '', account_name: '', whatsapp: '', store_note: 'نقوم بالتوصيل داخل سمائل والولايات المجاورة.' },
      products: [], orders: [], sales: [] };
    const samples = [
      ['عطر العود الملكي', 'perfume', 'عطر عود', 28.5, 'عطر شرقي فاخر بقاعدة من العود الكمبودي والعنبر.'],
      ['مسك الطهارة الأبيض', 'perfume', 'مسك', 4.5, 'مسك ناعم ونظيف يدوم طويلاً.'],
      ['دهن عود كمبودي (تولة)', 'oil', 'دهن عود', 45, 'دهن عود معتّق، تولة 12 مل.'],
      ['دهن الورد الطائفي', 'oil', 'دهن ورد', 18, 'ورد طائفي أصلي، 3 مل.'],
      ['بخور معمول سمائلي', 'incense', 'بخور معمول', 6.5, 'خلطة بيتية من العود والصندل والمسك.'],
      ['مبخرة نحاسية عُمانية', 'incense', 'مبخرة', 9, 'مبخرة تقليدية مصنوعة يدوياً.'],
      ['لبان حوجري ممتاز (250 غ)', 'frankincense', 'لبان حوجري', 7.5, 'أجود أنواع اللبان من ظفار، حبات بيضاء صافية.'],
      ['ماء اللبان (1 لتر)', 'frankincense', 'ماء اللبان', 2.5, 'لبان منقوع جاهز للشرب.'],
    ];
    s.products = samples.map(([name, category, subtype, price, description], i) => ({
      id: uid(), name, category, subtype, price, description, stock: 20, image_url: '', active: true,
      barcode: ean13('200' + String(++s.seq).padStart(9, '0')), created_at: new Date(Date.now() - i * 1000).toISOString() }));
    // مبيعات تجريبية لآخر سنتين لعرض الإحصائيات
    for (let d = 0; d < 420; d++) {
      const n = Math.floor(Math.random() * 5);
      for (let k = 0; k < n; k++) {
        const p = s.products[Math.floor(Math.random() * s.products.length)], qty = 1 + Math.floor(Math.random() * 2);
        const t = new Date(); t.setDate(t.getDate() - d); t.setHours(10 + Math.floor(Math.random() * 11), Math.floor(Math.random() * 60));
        s.sales.push({ id: uid(), invoice_no: 0, items: [{ id: p.id, name: p.name, barcode: p.barcode, price: p.price, qty }], total: p.price * qty,
          payment_method: ['cash', 'transfer', 'card'][Math.floor(Math.random() * 3)], source: Math.random() < 0.3 ? 'online' : 'pos', seller_email: emailFor('employee'), created_at: t.toISOString() });
      }
    }
    s.sales.sort((a, b) => a.created_at.localeCompare(b.created_at)).forEach(x => (x.invoice_no = ++s.invoiceSeq));
    return s;
  }
  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); if (v) return v; } catch {} const v = seed(); save(v); return v; };
  const save = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { err('مساحة التخزين في المتصفح ممتلئة'); } window.dispatchEvent(new Event('demo-change')); };
  const tx = fn => { const s = load(); const r = fn(s); save(s); return structuredClone(r); };
  const role = () => sessionStorage.getItem(SKEY);
  const need = r => { const me = role(); if (!me || (r === 'admin' && me !== 'admin')) err('غير مصرح'); return me; };
  window.addEventListener('storage', e => e.key === KEY && window.dispatchEvent(new Event('demo-change')));

  return {
    async getSettings() { return structuredClone(load().settings); },
    async saveSettings(v) { need('admin'); return tx(s => Object.assign(s.settings, v)); },

    async listProducts() { const me = role(); return structuredClone(load().products.filter(p => me || p.active)); },
    async findByBarcode(code) { return structuredClone(load().products.find(p => p.barcode === code) || null); },
    async saveProduct(p) {
      need('admin');
      return tx(s => {
        if (p.barcode && s.products.some(x => x.barcode === p.barcode && x.id !== p.id)) err('هذا الباركود مستخدم لمنتج آخر');
        const row = productRow(p);
        if (p.id) { const x = s.products.find(q => q.id === p.id); Object.assign(x, row, p.barcode ? { barcode: p.barcode } : {}); return x; }
        let bc = p.barcode;
        while (!bc || s.products.some(x => x.barcode === bc)) bc = ean13('200' + String(++s.seq).padStart(9, '0'));
        const x = { id: uid(), ...row, barcode: bc, created_at: now() };
        s.products.unshift(x); return x;
      });
    },
    async deleteProduct(id) { need('admin'); tx(s => { s.products = s.products.filter(p => p.id !== id); }); },
    async importProducts(list) {
      need('admin');
      return tx(s => list.map(p => {
        let bc; do bc = ean13('200' + String(++s.seq).padStart(9, '0')); while (s.products.some(x => x.barcode === bc));
        const x = { id: uid(), ...productRow(p), barcode: bc, created_at: now() }; s.products.unshift(x); return x;
      }));
    },
    async uploadProductImage(file) { return blobToDataURL(await resizeImage(file, 600, 0.75)); },

    async placeOrder(o) {
      return tx(s => {
        if ((o.name || '').trim().length < 2) err('الاسم مطلوب');
        if (!/^[0-9+ ]{8,15}$/.test(o.phone)) err('رقم الهاتف غير صحيح');
        if (!o.items.length) err('السلة فارغة');
        let total = 0;
        const items = o.items.map(i => {
          const p = s.products.find(x => x.id === i.id && x.active); if (!p) err('منتج غير متوفر');
          const qty = Math.min(99, Math.max(1, i.qty | 0)); total += p.price * qty;
          return { id: p.id, name: p.name, barcode: p.barcode, price: p.price, qty };
        });
        const order = { id: uid(), order_no: ++s.orderSeq, customer_name: o.name.trim(), customer_phone: o.phone.trim(), fulfillment: o.fulfillment, address: o.address || '', note: o.note || '', items, total, status: 'new', receipt_path: '', created_at: now() };
        s.orders.unshift(order); return { order_no: order.order_no, total };
      });
    },
    async attachReceipt(orderNo, phone, file) {
      const url = await blobToDataURL(await resizeImage(file, 1000, 0.7));
      tx(s => { const o = s.orders.find(x => x.order_no === orderNo && x.customer_phone === phone.trim()); if (o) o.receipt_path = url; });
    },
    async receiptUrl(path) { return path; },
    async listOrders() { need(); return structuredClone(load().orders); },
    async confirmOrder(id, method) {
      const me = need();
      return tx(s => {
        const o = s.orders.find(x => x.id === id); if (!o || o.status !== 'new') err('الطلب غير متاح للتأكيد');
        o.items.forEach(i => { const p = s.products.find(x => x.id === i.id); if (p) p.stock -= i.qty; });
        o.status = 'paid'; o.handled_at = now();
        const sale = { id: uid(), invoice_no: ++s.invoiceSeq, items: o.items, total: o.total, payment_method: method, source: 'online', order_id: o.id, seller_email: emailFor(me), created_at: now() };
        s.sales.push(sale); return sale;
      });
    },
    async cancelOrder(id) { need(); tx(s => { const o = s.orders.find(x => x.id === id); if (o) { o.status = 'cancelled'; o.handled_at = now(); } }); },
    onOrdersChange(cb) { const h = () => cb({}); window.addEventListener('demo-change', h); return () => window.removeEventListener('demo-change', h); },

    async recordSale(items, method) {
      const me = need();
      return tx(s => {
        if (!items.length) err('الفاتورة فارغة');
        let total = 0;
        const rows = items.map(i => {
          const p = s.products.find(x => x.id === i.id); if (!p) err('منتج غير موجود');
          const qty = Math.max(1, i.qty | 0); total += p.price * qty; p.stock -= qty;
          return { id: p.id, name: p.name, barcode: p.barcode, price: p.price, qty };
        });
        const sale = { id: uid(), invoice_no: ++s.invoiceSeq, items: rows, total, payment_method: method, source: 'pos', seller_email: emailFor(me), created_at: now() };
        s.sales.push(sale); return sale;
      });
    },
    async listSales(from, to) {
      const me = need(); const a = from.toISOString(), b = to.toISOString();
      return structuredClone(load().sales.filter(x => x.created_at >= a && x.created_at < b && (me === 'admin' || x.seller_email === emailFor(me))));
    },

    async login(r, password) {
      if (load().passwords[r] !== password) err('كلمة المرور غير صحيحة');
      sessionStorage.setItem(SKEY, r); return r;
    },
    async logout() { sessionStorage.removeItem(SKEY); },
    async currentRole() { return role(); },
    async changePassword(r, password) {
      if (password.length < 6) err('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      need(r === 'admin' || role() === 'admin' ? 'admin' : undefined);
      tx(s => { s.passwords[r] = password; });
    },
    resetDemo() { localStorage.removeItem(KEY); load(); },
  };
}

export const db = DEMO ? demoBackend() : supabaseBackend();
