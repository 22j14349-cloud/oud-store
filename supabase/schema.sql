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
alter table public.sales add column if not exists customer_phone text not null default '';
alter table public.sales add column if not exists customer_name  text not null default '';

-- ---------- الزبائن (لإرسال العروض الحصرية) ----------
create table if not exists public.customers (
  phone        text primary key check (phone ~ '^[0-9]{8,15}$'),
  name         text not null default '',
  source       text not null default 'manual' check (source in ('online','pos','manual')),
  opt_in       boolean not null default true,
  notes        text not null default '',
  orders_count int not null default 0,
  total_spent  numeric(12,3) not null default 0,
  last_at      timestamptz,
  last_offer_at timestamptz,
  created_at   timestamptz not null default now()
);

-- ---------- الحماية (RLS) ----------
alter table public.staff    enable row level security;
alter table public.settings enable row level security;
alter table public.products enable row level security;
alter table public.orders   enable row level security;
alter table public.sales    enable row level security;
alter table public.customers enable row level security;

drop policy if exists customers_staff  on public.customers;
drop policy if exists customers_insert on public.customers;
drop policy if exists customers_update on public.customers;
drop policy if exists customers_delete on public.customers;
create policy customers_staff  on public.customers for select using (public.my_role() is not null);
create policy customers_insert on public.customers for insert with check (public.my_role() is not null);
create policy customers_update on public.customers for update using (public.my_role() is not null);
create policy customers_delete on public.customers for delete using (public.my_role() = 'admin');

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

-- ---------- العروض (عدة منتجات بسعر واحد) ----------
create table if not exists public.offers (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(title) between 1 and 120),
  description text not null default '',
  image_url   text not null default '',
  price       numeric(10,3) not null check (price >= 0),
  pick_count  int not null default 3 check (pick_count between 1 and 20),
  product_ids uuid[] not null default '{}',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.offers enable row level security;
drop policy if exists offers_read  on public.offers;
drop policy if exists offers_admin on public.offers;
create policy offers_read  on public.offers for select using (active or public.my_role() is not null);
create policy offers_admin on public.offers for all using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- ---------- الدوال ----------
-- يحوّل السلة إلى بنود بأسعار قاعدة البيانات. البند إما {id, qty} لمنتج، أو {offer_id, picks:[ids]} لعرض
drop function if exists public.build_items(jsonb, boolean);
create or replace function public.build_items(p_items jsonb, p_public boolean, out items jsonb, out total numeric)
language plpgsql stable security definer set search_path = public as $$
declare x jsonb; p public.products; o public.offers; pk jsonb; picks jsonb; q int;
begin
  items := '[]'; total := 0;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'السلة فارغة'; end if;
  if jsonb_array_length(p_items) > 60 then raise exception 'عدد البنود كبير'; end if;
  for x in select * from jsonb_array_elements(p_items) loop
    if x ? 'offer_id' then
      select * into o from public.offers where id = (x->>'offer_id')::uuid and (active or not p_public);
      if not found then raise exception 'العرض غير متوفر'; end if;
      if jsonb_array_length(coalesce(x->'picks','[]')) <> o.pick_count then raise exception 'اختر % منتجات للعرض «%»', o.pick_count, o.title; end if;
      picks := '[]';
      for pk in select * from jsonb_array_elements(x->'picks') loop
        select * into p from public.products where id = (pk #>> '{}')::uuid and (active or not p_public);
        if not found or not (p.id = any(o.product_ids)) then raise exception 'منتج غير مشمول في العرض «%»', o.title; end if;
        picks := picks || jsonb_build_object('id', p.id, 'name', p.name, 'barcode', p.barcode);
      end loop;
      items := items || jsonb_build_object('offer_id', o.id, 'name', o.title, 'price', o.price, 'qty', 1, 'picks', picks);
      total := total + o.price;
    else
      q := greatest((x->>'qty')::int, 1);
      if p_public then q := least(q, 99); end if;
      select * into p from public.products where id = (x->>'id')::uuid and (active or not p_public);
      if not found then raise exception 'منتج غير متوفر'; end if;
      items := items || jsonb_build_object('id', p.id, 'name', p.name, 'barcode', p.barcode, 'price', p.price, 'qty', q);
      total := total + p.price * q;
    end if;
  end loop;
end $$;
revoke all on function public.build_items(jsonb, boolean) from public, anon, authenticated;

-- ينقص المخزون حسب البنود (منتجات العروض تُنقص حبة لكل اختيار)
create or replace function public.take_stock(p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare x jsonb; pk jsonb;
begin
  for x in select * from jsonb_array_elements(p_items) loop
    if x ? 'picks' then
      for pk in select * from jsonb_array_elements(x->'picks') loop
        update public.products set stock = stock - 1 where id = (pk->>'id')::uuid;
      end loop;
    else
      update public.products set stock = stock - (x->>'qty')::int where id = (x->>'id')::uuid;
    end if;
  end loop;
end $$;
revoke all on function public.take_stock(jsonb) from public, anon, authenticated;

-- يوحّد رقم الهاتف: أرقام فقط، ويحذف مفتاح عُمان 968 من الأرقام المحلية
create or replace function public.norm_phone(p text) returns text
language sql immutable set search_path = public as $$
  select case when d ~ '^968[0-9]{8}$' then substr(d, 4) when d ~ '^00968[0-9]{8}$' then substr(d, 6) else d end
  from (select regexp_replace(coalesce(p,''), '[^0-9]', '', 'g') as d) t;
$$;

-- يحفظ الزبون أو يحدّث بياناته. p_amount > 0 يعني عملية شراء مكتملة
create or replace function public.touch_customer(p_phone text, p_name text, p_source text, p_amount numeric, p_opt_in boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare ph text := public.norm_phone(p_phone);
begin
  if ph !~ '^[0-9]{8,15}$' then return; end if;
  insert into public.customers as c(phone, name, source, opt_in, orders_count, total_spent, last_at)
  values (ph, left(btrim(coalesce(p_name,'')),80), p_source, coalesce(p_opt_in, true),
          case when p_amount > 0 then 1 else 0 end, greatest(coalesce(p_amount,0),0),
          case when p_amount > 0 then now() end)
  on conflict (phone) do update set
    name = case when btrim(coalesce(p_name,'')) <> '' then left(btrim(p_name),80) else c.name end,
    opt_in = coalesce(p_opt_in, c.opt_in),
    orders_count = c.orders_count + case when p_amount > 0 then 1 else 0 end,
    total_spent = c.total_spent + greatest(coalesce(p_amount,0),0),
    last_at = case when p_amount > 0 then now() else c.last_at end;
end $$;
revoke all on function public.touch_customer(text, text, text, numeric, boolean) from public, anon, authenticated;

-- الزبون يرسل طلباً: الأسعار تُحسب هنا من قاعدة البيانات وليس من جهاز الزبون
drop function if exists public.place_order(text, text, text, text, text, jsonb);
create or replace function public.place_order(
  p_name text, p_phone text, p_fulfillment text, p_address text, p_note text, p_items jsonb, p_opt_in boolean default true)
returns table(order_no bigint, total numeric)
language plpgsql security definer set search_path = public as $$
declare b record; v_no bigint;
begin
  if length(btrim(coalesce(p_name,''))) < 2 then raise exception 'الاسم مطلوب'; end if;
  if p_phone !~ '^[0-9+ ]{8,15}$' then raise exception 'رقم الهاتف غير صحيح'; end if;
  select * into b from public.build_items(p_items, true);
  perform public.touch_customer(p_phone, p_name, 'online', 0, coalesce(p_opt_in, true));
  insert into public.orders(customer_name, customer_phone, fulfillment, address, note, items, total)
  values (left(btrim(p_name),80), btrim(p_phone),
          case when p_fulfillment = 'delivery' then 'delivery' else 'pickup' end,
          left(coalesce(p_address,''),300), left(coalesce(p_note,''),300), b.items, b.total)
  returning orders.order_no into v_no;
  return query select v_no, b.total;
end $$;

create or replace function public.attach_receipt(p_order_no bigint, p_phone text, p_path text)
returns void language sql security definer set search_path = public as $$
  update public.orders set receipt_path = p_path
  where order_no = p_order_no and customer_phone = btrim(p_phone) and status = 'new';
$$;

-- بيع من المحل (مسح الباركود)
drop function if exists public.record_sale(jsonb, text);
create or replace function public.record_sale(p_items jsonb, p_method text, p_phone text default '', p_name text default '')
returns public.sales language plpgsql security definer set search_path = public as $$
declare b record; v public.sales; ph text := public.norm_phone(p_phone);
begin
  if public.my_role() is null then raise exception 'غير مصرح'; end if;
  if ph <> '' and ph !~ '^[0-9]{8,15}$' then raise exception 'رقم الهاتف غير صحيح'; end if;
  select * into b from public.build_items(p_items, false);
  perform public.take_stock(b.items);
  insert into public.sales(items, total, payment_method, source, seller_email, customer_phone, customer_name)
  values (b.items, b.total, p_method, 'pos', lower(auth.jwt()->>'email'), ph, left(btrim(coalesce(p_name,'')),80))
  returning * into v;
  if ph <> '' then perform public.touch_customer(ph, p_name, 'pos', b.total, null); end if;
  return v;
end $$;

-- تأكيد وصول التحويل لطلب أونلاين: يتحول الطلب إلى عملية بيع
create or replace function public.confirm_order(p_order uuid, p_method text default 'transfer')
returns public.sales language plpgsql security definer set search_path = public as $$
declare o public.orders; v public.sales;
begin
  if public.my_role() is null then raise exception 'غير مصرح'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found or o.status <> 'new' then raise exception 'الطلب غير متاح للتأكيد'; end if;
  perform public.take_stock(o.items);
  insert into public.sales(items, total, payment_method, source, order_id, seller_email, customer_phone, customer_name)
  values (o.items, o.total, p_method, 'online', o.id, lower(auth.jwt()->>'email'),
          public.norm_phone(o.customer_phone), o.customer_name)
  returning * into v;
  update public.orders set status = 'paid', handled_at = now() where id = o.id;
  perform public.touch_customer(o.customer_phone, o.customer_name, 'online', o.total, null);
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

revoke all on function public.record_sale(jsonb, text, text, text) from public, anon;
revoke all on function public.confirm_order(uuid, text) from public, anon;
revoke all on function public.set_employee_password(text) from public, anon;
grant execute on function public.record_sale(jsonb, text, text, text) to authenticated;
grant execute on function public.confirm_order(uuid, text) to authenticated;
grant execute on function public.set_employee_password(text) to authenticated;
revoke all on function public.place_order(text, text, text, text, text, jsonb, boolean) from public;
grant execute on function public.place_order(text, text, text, text, text, jsonb, boolean) to anon, authenticated;
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
