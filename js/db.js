// طبقة البيانات: Supabase عند توفر الإعدادات، وإلا وضع تجريبي محلي في المتصفح
import { CONFIG } from './config.js';
import { ean13, resizeImage, blobToDataURL, normPhone } from './util.js';

export const DEMO = !(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);

const err = m => { throw new Error(m); };
const offerRow = o => ({ title: o.title, description: o.description || '', image_url: o.image_url || '', price: Number(o.price),
  pick_count: Math.max(1, parseInt(o.pick_count, 10) || 1), product_ids: o.product_ids || [], active: o.active !== false });
const productRow = p => ({ name: p.name, category: p.category, subtype: p.subtype || '', size: p.size || '', description: p.description || '',
  price: Number(p.price), old_price: Number(p.old_price) > Number(p.price) ? Number(p.old_price) : null,
  stock: Number(p.stock) || 0, image_url: p.image_url || '', active: p.active !== false });
const customerRow = c => {
  const phone = normPhone(c.phone);
  if (!/^[0-9]{8,15}$/.test(phone)) err(`رقم غير صحيح: ${c.phone || ''}`);
  return { phone, name: String(c.name || '').trim().slice(0, 80), notes: String(c.notes || '').slice(0, 300), opt_in: c.opt_in !== false };
};
const dedupe = rows => [...new Map(rows.map(r => [r.phone, r])).values()];
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

    async listOffers() { return ok(await sb.from('offers').select('*').order('created_at', { ascending: false })); },
    async saveOffer(o) {
      if (o.id) return ok(await sb.from('offers').update(offerRow(o)).eq('id', o.id).select().single());
      return ok(await sb.from('offers').insert(offerRow(o)).select().single());
    },
    async deleteOffer(id) { ok(await sb.from('offers').delete().eq('id', id)); },
    async placeOrder(o) {
      const args = { p_name: o.name, p_phone: o.phone, p_fulfillment: o.fulfillment, p_address: o.address || '', p_note: o.note || '', p_items: o.items };
      // إن لم تُحدَّث قاعدة البيانات بعد (schema.sql) نرسل الطلب بالصيغة القديمة حتى لا تتوقف الطلبات
      let r = await sb.rpc('place_order', { ...args, p_opt_in: o.optIn !== false });
      if (r.error?.code === 'PGRST202') r = await sb.rpc('place_order', args);
      const rows = ok(r);
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

    async recordSale(items, method, cust = {}) {
      let r = await sb.rpc('record_sale', { p_items: items, p_method: method, p_phone: normPhone(cust.phone), p_name: cust.name || '' });
      if (r.error?.code === 'PGRST202') r = await sb.rpc('record_sale', { p_items: items, p_method: method });
      return ok(r);
    },

    async listCustomers() {
      const all = []; const size = 1000;
      for (let i = 0; ; i += size) {
        const page = ok(await sb.from('customers').select('*').order('created_at', { ascending: false }).range(i, i + size - 1));
        all.push(...page); if (page.length < size) break;
      }
      return all;
    },
    async saveCustomer(c, oldPhone) {
      const row = customerRow(c);
      if (oldPhone) return ok(await sb.from('customers').update(row).eq('phone', oldPhone).select().single());
      if (ok(await sb.from('customers').select('phone').eq('phone', row.phone)).length) throw new Error('هذا الرقم محفوظ مسبقاً');
      return ok(await sb.from('customers').insert({ ...row, source: 'manual' }).select().single());
    },
    async importCustomers(list) {
      const rows = dedupe(list.map(customerRow));
      const have = new Set((await this.listCustomers()).map(c => c.phone));
      const fresh = rows.filter(r => !have.has(r.phone)).map(r => ({ ...r, source: 'manual' }));
      for (let i = 0; i < fresh.length; i += 500) ok(await sb.from('customers').insert(fresh.slice(i, i + 500)));
      return fresh.length;
    },
    async deleteCustomer(phone) { ok(await sb.from('customers').delete().eq('phone', phone)); },
    async markOffered(phones) {
      for (let i = 0; i < phones.length; i += 200) ok(await sb.from('customers').update({ last_offer_at: new Date().toISOString() }).in('phone', phones.slice(i, i + 200)));
    },
    async saleByOrder(orderId) { return ok(await sb.from('sales').select('*').eq('order_id', orderId).maybeSingle()); },
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
      products: [], offers: [], orders: [], sales: [] };
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
    s.offers = [{ id: uid(), title: 'أي 3 حبات بخور بـ 10 ريال', description: 'اختر 3 من البخور العُماني المصنوع بأيدٍ عُمانية', image_url: '', price: 10, pick_count: 3,
      product_ids: s.products.filter(p => p.category === 'incense' || p.category === 'frankincense').map(p => p.id), active: true, created_at: now() }];
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
  // نفس منطق build_items في قاعدة البيانات
  function buildItems(s, list, pub) {
    if (!list || !list.length) err('السلة فارغة');
    let total = 0;
    const items = list.map(i => {
      if (i.offer_id) {
        const o = (s.offers || []).find(x => x.id === i.offer_id && (x.active || !pub)); if (!o) err('العرض غير متوفر');
        if ((i.picks || []).length !== o.pick_count) err(`اختر ${o.pick_count} منتجات للعرض «${o.title}»`);
        const picks = i.picks.map(id => { const p = s.products.find(x => x.id === id && (x.active || !pub)); if (!p || !o.product_ids.includes(id)) err(`منتج غير مشمول في العرض «${o.title}»`); return { id: p.id, name: p.name, barcode: p.barcode }; });
        total += o.price; return { offer_id: o.id, name: o.title, price: o.price, qty: 1, picks };
      }
      const p = s.products.find(x => x.id === i.id && (x.active || !pub)); if (!p) err('منتج غير متوفر');
      const qty = pub ? Math.min(99, Math.max(1, i.qty | 0)) : Math.max(1, i.qty | 0); total += p.price * qty;
      return { id: p.id, name: p.name, barcode: p.barcode, price: p.price, qty };
    });
    return { items, total };
  }
  // نفس منطق touch_customer في قاعدة البيانات
  function touch(s, phone, name, source, amount, optIn) {
    const ph = normPhone(phone); if (!/^[0-9]{8,15}$/.test(ph)) return;
    s.customers = s.customers || [];
    let c = s.customers.find(x => x.phone === ph);
    if (!c) { c = { phone: ph, name: '', source, opt_in: true, notes: '', orders_count: 0, total_spent: 0, last_at: null, last_offer_at: null, created_at: now() }; s.customers.push(c); }
    if ((name || '').trim()) c.name = name.trim().slice(0, 80);
    if (optIn !== null && optIn !== undefined) c.opt_in = optIn;
    if (amount > 0) { c.orders_count++; c.total_spent = Math.round((c.total_spent + amount) * 1000) / 1000; c.last_at = now(); }
  }
  function takeStock(s, items) {
    items.forEach(i => (i.picks ? i.picks.map(x => [x.id, 1]) : [[i.id, i.qty]]).forEach(([id, q]) => { const p = s.products.find(x => x.id === id); if (p) p.stock -= q; }));
  }

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

    async listOffers() { const me = role(); return structuredClone((load().offers || []).filter(o => me || o.active)); },
    async saveOffer(o) {
      need('admin');
      return tx(s => {
        s.offers = s.offers || [];
        if (o.id) { const x = s.offers.find(q => q.id === o.id); Object.assign(x, offerRow(o)); return x; }
        const x = { id: uid(), ...offerRow(o), created_at: now() }; s.offers.unshift(x); return x;
      });
    },
    async deleteOffer(id) { need('admin'); tx(s => { s.offers = (s.offers || []).filter(o => o.id !== id); }); },
    async placeOrder(o) {
      return tx(s => {
        if ((o.name || '').trim().length < 2) err('الاسم مطلوب');
        if (!/^[0-9+ ]{8,15}$/.test(o.phone)) err('رقم الهاتف غير صحيح');
        const { items, total } = buildItems(s, o.items, true);
        const order = { id: uid(), order_no: ++s.orderSeq, customer_name: o.name.trim(), customer_phone: o.phone.trim(), fulfillment: o.fulfillment, address: o.address || '', note: o.note || '', items, total, status: 'new', receipt_path: '', created_at: now() };
        s.orders.unshift(order); touch(s, o.phone, o.name, 'online', 0, o.optIn !== false);
        return { order_no: order.order_no, total };
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
        takeStock(s, o.items);
        o.status = 'paid'; o.handled_at = now();
        const sale = { id: uid(), invoice_no: ++s.invoiceSeq, items: o.items, total: o.total, payment_method: method, source: 'online', order_id: o.id, seller_email: emailFor(me), customer_phone: normPhone(o.customer_phone), customer_name: o.customer_name, created_at: now() };
        s.sales.push(sale); touch(s, o.customer_phone, o.customer_name, 'online', o.total, null); return sale;
      });
    },
    async cancelOrder(id) { need(); tx(s => { const o = s.orders.find(x => x.id === id); if (o) { o.status = 'cancelled'; o.handled_at = now(); } }); },
    onOrdersChange(cb) { const h = () => cb({}); window.addEventListener('demo-change', h); return () => window.removeEventListener('demo-change', h); },

    async recordSale(items, method, cust = {}) {
      const me = need(); const ph = normPhone(cust.phone);
      if (ph && !/^[0-9]{8,15}$/.test(ph)) err('رقم الهاتف غير صحيح');
      return tx(s => {
        const { items: rows, total } = buildItems(s, items, false); takeStock(s, rows);
        const sale = { id: uid(), invoice_no: ++s.invoiceSeq, items: rows, total, payment_method: method, source: 'pos', seller_email: emailFor(me), customer_phone: ph, customer_name: (cust.name || '').trim(), created_at: now() };
        s.sales.push(sale);
        if (ph) touch(s, ph, cust.name, 'pos', total, null);
        return sale;
      });
    },

    async listCustomers() { need(); return structuredClone((load().customers || []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at))); },
    async saveCustomer(c, oldPhone) {
      need(); const row = customerRow(c);
      return tx(s => {
        s.customers = s.customers || [];
        if (oldPhone) {
          if (row.phone !== oldPhone && s.customers.some(x => x.phone === row.phone)) err('هذا الرقم محفوظ مسبقاً');
          const x = s.customers.find(q => q.phone === oldPhone); Object.assign(x, row); return x;
        }
        if (s.customers.some(x => x.phone === row.phone)) err('هذا الرقم محفوظ مسبقاً');
        const x = { ...row, source: 'manual', orders_count: 0, total_spent: 0, last_at: null, last_offer_at: null, created_at: now() };
        s.customers.push(x); return x;
      });
    },
    async importCustomers(list) {
      need(); const rows = dedupe(list.map(customerRow));
      return tx(s => {
        s.customers = s.customers || []; let n = 0;
        rows.forEach(r => { if (!s.customers.some(x => x.phone === r.phone)) { s.customers.push({ ...r, source: 'manual', orders_count: 0, total_spent: 0, last_at: null, last_offer_at: null, created_at: now() }); n++; } });
        return n;
      });
    },
    async deleteCustomer(phone) { need('admin'); tx(s => { s.customers = (s.customers || []).filter(c => c.phone !== phone); }); },
    async markOffered(phones) { need(); tx(s => (s.customers || []).forEach(c => { if (phones.includes(c.phone)) c.last_offer_at = now(); })); },
    async saleByOrder(orderId) { need(); return structuredClone(load().sales.find(x => x.order_id === orderId) || null); },
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
