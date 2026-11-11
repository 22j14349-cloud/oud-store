-- =====================================================================
--  قاعدة بيانات تطبيق المحاسبة ومتجر العطور
--  شغّل هذا الملف مرة واحدة في Supabase: SQL Editor > New query > Run
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- الموظفون والصلاحيات ----------
-- عدّل البريدين إذا غيّرتهما في js/config.js
create table if not exists public.staff (
  email text primary key,
  role  text not null check (role in ('admin','employee'))
);
insert into public.staff(email, role) values
  ('owner@oud.shop', 'admin'),
  ('staff@oud.shop', 'employee')
on conflict (email) do update set role = excluded.role;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.staff where email = lower(coalesce(auth.jwt()->>'email',''));
$$;

-- ---------- إعدادات المحل ----------
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  shop_name      text not null default 'عطور سمائل',
  transfer_phone text not null default '',
  account_name   text not null default '',
  whatsapp       text not null default '',
  store_note     text not null default 'نقوم بالتوصيل داخل سمائل والولايات المجاورة.',
  updated_at timestamptz not null default now()
);
insert into public.settings(id) values (1) on conflict do nothing;

-- ---------- المنتجات ----------
create sequence if not exists public.barcode_seq start 1;

create or replace function public.ean13(p12 text) returns text
language plpgsql immutable as $$
declare s int := 0; i int;
begin
  for i in 1..12 loop
    s := s + substr(p12, i, 1)::int * (case when i % 2 = 0 then 3 else 1 end);
  end loop;
  return p12 || ((10 - s % 10) % 10)::text;
end $$;

create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 1 and 120),
  category    text not null check (category in ('perfume','oil','incense','frankincense')),
  subtype     text not null default '',
  description text not null default '',
  price       numeric(10,3) not null check (price >= 0),
  stock       int not null default 0,
  barcode     text unique,
  image_url   text not null default '',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- أعمدة أضيفت لاحقاً: الحجم وسعر ما قبل العرض
alter table public.products add column if not exists size text not null default '';
alter table public.products add column if not exists old_price numeric(10,3);

-- يولّد باركود EAN-13 تلقائياً (يبدأ بـ 200 وهو نطاق الاستخدام الداخلي للمحلات)
create or replace function public.products_barcode() returns trigger
language plpgsql as $$
begin
  if new.barcode is null or btrim(new.barcode) = '' then
    loop
      new.barcode := public.ean13('200' || lpad(nextval('public.barcode_seq')::text, 9, '0'));
      exit when not exists (select 1 from public.products where barcode = new.barcode);
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists trg_products_barcode on public.products;
create trigger trg_products_barcode before insert on public.products
  for each row execute function public.products_barcode();

-- ---------- طلبات الزبائن ----------
create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  order_no       bigint generated always as identity (start with 1001) unique,
  customer_name  text not null,
  customer_phone text not null,
  fulfillment    text not null default 'pickup' check (fulfillment in ('pickup','delivery')),
  address        text not null default '',
  note           text not null default '',
  items          jsonb not null,
  total          numeric(10,3) not null,
  status         text not null default 'new' check (status in ('new','paid','cancelled')),
  receipt_path   text not null default '',
  created_at     timestamptz not null default now(),
  handled_at     timestamptz
);

-- ---------- المبيعات ----------
create table if not exists public.sales (
  id             uuid primary key default gen_random_uuid(),
  invoice_no     bigint generated always as identity (start with 1) unique,
  items          jsonb not null,
  total          numeric(10,3) not null,
  payment_method text not null check (payment_method in ('cash','transfer','card')),
  source         text not null check (source in ('pos','online')),
  order_id       uuid references public.orders(id),
  seller_email   text not null default '',
  created_at     timestamptz not null default now()
);
create index if not exists sales_created_idx on public.sales(created_at);

-- ---------- الحماية (RLS) ----------
alter table public.staff    enable row level security;
alter table public.settings enable row level security;
alter table public.products enable row level security;
alter table public.orders   enable row level security;
alter table public.sales    enable row level security;

drop policy if exists settings_read  on public.settings;
drop policy if exists settings_write on public.settings;
create policy settings_read  on public.settings for select using (true);
create policy settings_write on public.settings for update using (public.my_role() = 'admin');

drop policy if exists products_read  on public.products;
drop policy if exists products_admin on public.products;
create policy products_read  on public.products for select using (active or public.my_role() is not null);
create policy products_admin on public.products for all using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

drop policy if exists orders_staff_read   on public.orders;
drop policy if exists orders_staff_update on public.orders;
create policy orders_staff_read   on public.orders for select using (public.my_role() is not null);
create policy orders_staff_update on public.orders for update using (public.my_role() is not null);

drop policy if exists sales_read on public.sales;
create policy sales_read on public.sales for select using (
  public.my_role() = 'admin'
  or (public.my_role() = 'employee' and seller_email = lower(auth.jwt()->>'email'))
);

-- ---------- الدوال ----------
-- الزبون يرسل طلباً: الأسعار تُحسب هنا من قاعدة البيانات وليس من جهاز الزبون
create or replace function public.place_order(
  p_name text, p_phone text, p_fulfillment text, p_address text, p_note text, p_items jsonb)
returns table(order_no bigint, total numeric)
language plpgsql security definer set search_path = public as $$
declare v_items jsonb := '[]'; v_total numeric := 0; r record; p public.products; v_no bigint;
begin
  if length(btrim(coalesce(p_name,''))) < 2 then raise exception 'الاسم مطلوب'; end if;
  if p_phone !~ '^[0-9+ ]{8,15}$' then raise exception 'رقم الهاتف غير صحيح'; end if;
  if jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then raise exception 'السلة فارغة'; end if;
  for r in select (x->>'id')::uuid as id, least(greatest((x->>'qty')::int, 1), 99) as qty
           from jsonb_array_elements(p_items) x loop
    select * into p from public.products where id = r.id and active;
    if not found then raise exception 'منتج غير متوفر'; end if;
    v_items := v_items || jsonb_build_object('id', p.id, 'name', p.name, 'barcode', p.barcode, 'price', p.price, 'qty', r.qty);
    v_total := v_total + p.price * r.qty;
  end loop;
  insert into public.orders(customer_name, customer_phone, fulfillment, address, note, items, total)
  values (left(btrim(p_name),80), btrim(p_phone),
          case when p_fulfillment = 'delivery' then 'delivery' else 'pickup' end,
          left(coalesce(p_address,''),300), left(coalesce(p_note,''),300), v_items, v_total)
  returning orders.order_no into v_no;
  return query select v_no, v_total;
end $$;

create or replace function public.attach_receipt(p_order_no bigint, p_phone text, p_path text)
returns void language sql security definer set search_path = public as $$
  update public.orders set receipt_path = p_path
  where order_no = p_order_no and customer_phone = btrim(p_phone) and status = 'new';
$$;

-- بيع من المحل (مسح الباركود)
create or replace function public.record_sale(p_items jsonb, p_method text)
returns public.sales language plpgsql security definer set search_path = public as $$
declare v_items jsonb := '[]'; v_total numeric := 0; r record; p public.products; v public.sales;
begin
  if public.my_role() is null then raise exception 'غير مصرح'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'الفاتورة فارغة'; end if;
  for r in select (x->>'id')::uuid as id, greatest((x->>'qty')::int, 1) as qty
           from jsonb_array_elements(p_items) x loop
    select * into p from public.products where id = r.id;
    if not found then raise exception 'منتج غير موجود'; end if;
    v_items := v_items || jsonb_build_object('id', p.id, 'name', p.name, 'barcode', p.barcode, 'price', p.price, 'qty', r.qty);
    v_total := v_total + p.price * r.qty;
    update public.products set stock = stock - r.qty where id = p.id;
  end loop;
  insert into public.sales(items, total, payment_method, source, seller_email)
  values (v_items, v_total, p_method, 'pos', lower(auth.jwt()->>'email'))
  returning * into v;
  return v;
end $$;

-- تأكيد وصول التحويل لطلب أونلاين: يتحول الطلب إلى عملية بيع
create or replace function public.confirm_order(p_order uuid, p_method text default 'transfer')
returns public.sales language plpgsql security definer set search_path = public as $$
declare o public.orders; x jsonb; v public.sales;
begin
  if public.my_role() is null then raise exception 'غير مصرح'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found or o.status <> 'new' then raise exception 'الطلب غير متاح للتأكيد'; end if;
  for x in select * from jsonb_array_elements(o.items) loop
    update public.products set stock = stock - (x->>'qty')::int where id = (x->>'id')::uuid;
  end loop;
  insert into public.sales(items, total, payment_method, source, order_id, seller_email)
  values (o.items, o.total, p_method, 'online', o.id, lower(auth.jwt()->>'email'))
  returning * into v;
  update public.orders set status = 'paid', handled_at = now() where id = o.id;
  return v;
end $$;

-- صاحب المحل يغيّر كلمة مرور الموظف
create or replace function public.set_employee_password(p_password text)
returns void language plpgsql security definer set search_path = public, extensions, auth as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'غير مصرح'; end if;
  if length(p_password) < 6 then raise exception 'كلمة المرور قصيرة'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf'))
  where lower(email) in (select email from public.staff where role = 'employee');
end $$;

revoke all on function public.record_sale(jsonb, text) from public, anon;
revoke all on function public.confirm_order(uuid, text) from public, anon;
revoke all on function public.set_employee_password(text) from public, anon;
grant execute on function public.record_sale(jsonb, text) to authenticated;
grant execute on function public.confirm_order(uuid, text) to authenticated;
grant execute on function public.set_employee_password(text) to authenticated;
grant execute on function public.place_order(text, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.attach_receipt(bigint, text, text) to anon, authenticated;

-- ---------- التخزين (صور المنتجات وإيصالات التحويل) ----------
insert into storage.buckets(id, name, public) values
  ('products', 'products', true),
  ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists "product images admin write" on storage.objects;
drop policy if exists "receipts upload"            on storage.objects;
drop policy if exists "receipts staff read"        on storage.objects;
create policy "product images admin write" on storage.objects for all to authenticated
  using (bucket_id = 'products' and public.my_role() = 'admin')
  with check (bucket_id = 'products' and public.my_role() = 'admin');
create policy "receipts upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'receipts' and name ~ '^[0-9]{4,12}-[0-9a-f-]{36}\.jpg$');
-- حد أقصى 3 ميغابايت للإيصال، وصور فقط
update storage.buckets set file_size_limit = 3145728, allowed_mime_types = array['image/jpeg','image/png','image/webp']
  where id = 'receipts';
update storage.buckets set file_size_limit = 3145728, allowed_mime_types = array['image/jpeg','image/png','image/webp']
  where id = 'products';
create policy "receipts staff read" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.my_role() is not null);

-- ---------- التحديث الفوري للطلبات ----------
do $$ begin
  alter publication supabase_realtime add table public.orders;
exception when others then null; end $$;
