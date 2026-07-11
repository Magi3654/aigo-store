# Fase 1 — Fundación de Base de Datos (Supabase) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear el esquema relacional de Supabase (8 tablas), sus políticas RLS y la función `is_admin()`, con tests pgTAP y datos sembrados desde el catálogo actual — todo verificable en Supabase local sin necesidad de un proyecto en la nube.

**Architecture:** Migraciones SQL versionadas bajo `supabase/migrations/`, ejecutadas contra una instancia local de Supabase (Docker) vía la CLI. Cada tabla y política se prueba con pgTAP (`supabase test db`) siguiendo TDD: primero el test que falla, luego la migración que lo pasa. El seed vive en `supabase/seed.sql`.

**Tech Stack:** Supabase CLI, PostgreSQL 15, pgTAP, SQL. Sin dependencias de la app Vue en esta fase.

## Global Constraints

- **Moneda:** todos los precios/montos son `integer` en **centavos** MXN. Nunca `numeric`/`float`.
- **Llaves primarias:** `uuid` con `default gen_random_uuid()` en todas las tablas (excepto `profiles.id`, que es FK a `auth.users`).
- **Nombres de columnas:** `snake_case`.
- **Timestamps:** `timestamptz`, `default now()`.
- **RLS:** habilitado en TODAS las tablas. El rol `anon` solo puede leer catálogo activo; jamás accede a `orders`, `order_items`, `order_status_history`, `profiles` ni `settings`.
- **Estados válidos** (CHECK):
  - `payment_status`: `pending | paid | failed | refunded`
  - `fulfillment_status`: `pending | preparing | shipped | delivered | cancelled`
  - `products.category`: `Albums | Lightsticks | Ropa | Photocards | Posters`
- Cada migración es idempotente donde sea razonable (`create ... if not exists`, `create or replace`).

---

## Estructura de archivos

```
supabase/
  config.toml                         # generado por `supabase init`
  migrations/
    <ts>_extensions.sql               # citext, pgcrypto
    <ts>_products.sql                 # products + product_variants
    <ts>_orders.sql                   # orders + order_items + order_status_history
    <ts>_profiles_settings.sql        # profiles + settings + is_admin()
    <ts>_order_number.sql             # generador de order_number + triggers updated_at
    <ts>_rls_catalog.sql              # RLS products/variants
    <ts>_rls_orders.sql               # RLS orders/items/history
    <ts>_rls_profiles_settings.sql    # RLS profiles/settings
  tests/
    01_schema_products_test.sql
    02_schema_orders_test.sql
    03_schema_profiles_settings_test.sql
    04_rls_catalog_test.sql
    05_rls_orders_test.sql
    06_rls_profiles_settings_test.sql
  seed.sql                            # catálogo inicial + fila de settings
```

---

### Task 1: Inicializar Supabase local

**Files:**
- Create: `supabase/config.toml` (vía CLI)
- Modify: `.gitignore`

**Interfaces:**
- Produces: una instancia local de Supabase corriendo; comandos `supabase test db` y `supabase db reset` disponibles.

- [ ] **Step 1: Verificar que la CLI está instalada**

Run: `supabase --version`
Expected: imprime una versión (ej. `2.x.x`). Si falla, instalar: `npm install -D supabase` y usar `npx supabase`.

- [ ] **Step 2: Inicializar el proyecto Supabase**

Run: `supabase init`
Expected: crea `supabase/config.toml` y la carpeta `supabase/`. Responde "N" si pregunta por generar settings de VS Code.

- [ ] **Step 3: Arrancar el stack local**

Run: `supabase start`
Expected: descarga imágenes Docker (primera vez tarda) y termina imprimiendo `API URL`, `DB URL`, `anon key`, `service_role key`. Anota la `DB URL`.

- [ ] **Step 4: Ignorar artefactos locales en git**

Añadir al final de `.gitignore`:

```
# Supabase
supabase/.branches
supabase/.temp
```

- [ ] **Step 5: Commit**

```bash
git add supabase/config.toml .gitignore
git commit -m "chore: initialize Supabase local project"
```

---

### Task 2: Extensiones de Postgres

**Files:**
- Create: `supabase/migrations/<ts>_extensions.sql`

**Interfaces:**
- Produces: extensiones `citext` (email case-insensitive) y `pgcrypto` (`gen_random_uuid`) disponibles.

- [ ] **Step 1: Crear la migración**

Run: `supabase migration new extensions`
Expected: crea `supabase/migrations/<ts>_extensions.sql` vacío.

- [ ] **Step 2: Escribir la migración**

Contenido de `supabase/migrations/<ts>_extensions.sql`:

```sql
create extension if not exists pgcrypto;
create extension if not exists citext;
```

- [ ] **Step 3: Aplicar y verificar**

Run: `supabase db reset`
Expected: reaplica todas las migraciones sin error y termina en `Finished supabase db reset`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations
git commit -m "feat(db): enable pgcrypto and citext extensions"
```

---

### Task 3: Tablas `products` y `product_variants`

**Files:**
- Create: `supabase/migrations/<ts>_products.sql`
- Test: `supabase/tests/01_schema_products_test.sql`

**Interfaces:**
- Produces:
  - `public.products(id uuid, name text, "group" text, category text, description text, image_url text, is_active boolean, created_at, updated_at)`
  - `public.product_variants(id uuid, product_id uuid, label text, sku text, price_cents int, stock int, weight_grams int, length_cm int, width_cm int, height_cm int, image_url text, is_active boolean, created_at, updated_at)`

- [ ] **Step 1: Escribir el test pgTAP (falla)**

Crear `supabase/tests/01_schema_products_test.sql`:

```sql
begin;
select plan(11);

select has_table('public', 'products', 'products existe');
select has_table('public', 'product_variants', 'product_variants existe');

select col_type_is('public', 'products', 'id', 'uuid', 'products.id es uuid');
select col_is_pk('public', 'products', 'id', 'products.id es PK');
select col_not_null('public', 'products', 'name', 'products.name NOT NULL');

select col_type_is('public', 'product_variants', 'price_cents', 'integer', 'price_cents es integer');
select col_type_is('public', 'product_variants', 'stock', 'integer', 'stock es integer');
select col_type_is('public', 'product_variants', 'weight_grams', 'integer', 'weight_grams es integer');

-- category CHECK
select throws_ok(
  $$ insert into public.products (name, "group", category) values ('x','y','Invalida') $$,
  '23514',
  null,
  'category invalida es rechazada'
);

-- stock negativo rechazado
select throws_ok(
  $$ insert into public.product_variants (product_id, label, price_cents, stock, weight_grams)
     values (gen_random_uuid(), 'M', 100, -1, 50) $$,
  null, null,
  'stock negativo es rechazado'
);

-- FK cascade: variante requiere producto existente
select throws_ok(
  $$ insert into public.product_variants (product_id, label, price_cents, stock, weight_grams)
     values (gen_random_uuid(), 'M', 100, 1, 50) $$,
  '23503',
  null,
  'variante con product_id inexistente es rechazada'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `supabase test db`
Expected: FAIL — `products` no existe todavía.

- [ ] **Step 3: Escribir la migración**

Run: `supabase migration new products`, luego escribir en el archivo creado:

```sql
create table public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  "group"     text not null,
  category    text not null check (category in ('Albums','Lightsticks','Ropa','Photocards','Posters')),
  description text,
  image_url   text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.product_variants (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products(id) on delete cascade,
  label        text not null,
  sku          text unique,
  price_cents  integer not null check (price_cents >= 0),
  stock        integer not null default 0 check (stock >= 0),
  weight_grams integer not null check (weight_grams >= 0),
  length_cm    integer,
  width_cm     integer,
  height_cm    integer,
  image_url    text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index on public.product_variants (product_id);
```

- [ ] **Step 4: Correr el test (debe pasar)**

Run: `supabase test db`
Expected: PASS — `01_schema_products_test.sql .. ok`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests/01_schema_products_test.sql
git commit -m "feat(db): add products and product_variants tables"
```

---

### Task 4: Tablas `orders`, `order_items`, `order_status_history`

**Files:**
- Create: `supabase/migrations/<ts>_orders.sql`
- Test: `supabase/tests/02_schema_orders_test.sql`

**Interfaces:**
- Consumes: `public.product_variants(id)` (FK desde `order_items`).
- Produces:
  - `public.orders(...)` con `payment_status`, `fulfillment_status`, campos de envío y Stripe.
  - `public.order_items(...)` con snapshot.
  - `public.order_status_history(...)`.

- [ ] **Step 1: Escribir el test pgTAP (falla)**

Crear `supabase/tests/02_schema_orders_test.sql`:

```sql
begin;
select plan(9);

select has_table('public', 'orders', 'orders existe');
select has_table('public', 'order_items', 'order_items existe');
select has_table('public', 'order_status_history', 'order_status_history existe');

select col_type_is('public', 'orders', 'total_cents', 'integer', 'total_cents es integer');
select col_has_default('public', 'orders', 'payment_status', 'payment_status tiene default');

-- payment_status invalido rechazado
select throws_ok(
  $$ insert into public.orders (order_number, customer_name, customer_email, shipping_address,
       shipping_city, shipping_state, shipping_postal_code, shipping_cost_cents, subtotal_cents,
       total_cents, payment_status)
     values ('AIGO-TEST','n','a@b.com','dir','cd','edo','01000',0,0,0,'invalido') $$,
  '23514', null, 'payment_status invalido es rechazado'
);

-- order_number unico
select col_is_unique('public', 'orders', 'order_number', 'order_number es UNIQUE');

-- quantity > 0
select throws_ok(
  $$ insert into public.order_items (order_id, product_name, variant_label, unit_price_cents, quantity, line_total_cents)
     values (gen_random_uuid(), 'p', 'M', 100, 0, 0) $$,
  null, null, 'quantity = 0 es rechazado'
);

-- borrar order borra sus items (cascade): verificamos la FK existe
select fk_ok('public', 'order_items', 'order_id', 'public', 'orders', 'id',
  'order_items.order_id referencia orders.id');

select * from finish();
rollback;
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `supabase test db`
Expected: FAIL — `orders` no existe.

- [ ] **Step 3: Escribir la migración**

Run: `supabase migration new orders`, luego:

```sql
create table public.orders (
  id                        uuid primary key default gen_random_uuid(),
  order_number              text not null unique,
  customer_name             text not null,
  customer_email            citext not null,
  customer_phone            text,
  shipping_address          text not null,
  shipping_city             text not null,
  shipping_state            text not null,
  shipping_postal_code      text not null,
  shipping_carrier          text,
  shipping_service          text,
  shipping_service_code     text,
  shipping_cost_cents       integer not null check (shipping_cost_cents >= 0),
  subtotal_cents            integer not null check (subtotal_cents >= 0),
  total_cents               integer not null check (total_cents >= 0),
  payment_status            text not null default 'pending'
                              check (payment_status in ('pending','paid','failed','refunded')),
  fulfillment_status        text not null default 'pending'
                              check (fulfillment_status in ('pending','preparing','shipped','delivered','cancelled')),
  tracking_number           text,
  tracking_url              text,
  stripe_payment_intent_id  text,
  stripe_checkout_session_id text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create table public.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders(id) on delete cascade,
  variant_id       uuid references public.product_variants(id) on delete set null,
  product_name     text not null,
  variant_label    text not null,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity         integer not null check (quantity > 0),
  line_total_cents integer not null check (line_total_cents >= 0)
);

create table public.order_status_history (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  status     text not null,
  note       text,
  created_at timestamptz not null default now()
);

create index on public.order_items (order_id);
create index on public.order_status_history (order_id);
create index on public.orders (customer_email);
```

- [ ] **Step 4: Correr el test (debe pasar)**

Run: `supabase test db`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests/02_schema_orders_test.sql
git commit -m "feat(db): add orders, order_items, order_status_history tables"
```

---

### Task 5: `profiles`, `settings` y función `is_admin()`

**Files:**
- Create: `supabase/migrations/<ts>_profiles_settings.sql`
- Test: `supabase/tests/03_schema_profiles_settings_test.sql`

**Interfaces:**
- Produces:
  - `public.profiles(id uuid PK → auth.users, is_admin boolean, created_at)`
  - `public.settings(id uuid, origin_address jsonb, fallback_standard_cents int, fallback_express_cents int)`
  - `public.is_admin(uid uuid) returns boolean` (SECURITY DEFINER)

- [ ] **Step 1: Escribir el test pgTAP (falla)**

Crear `supabase/tests/03_schema_profiles_settings_test.sql`:

```sql
begin;
select plan(5);

select has_table('public', 'profiles', 'profiles existe');
select has_table('public', 'settings', 'settings existe');
select has_function('public', 'is_admin', array['uuid'], 'is_admin(uuid) existe');

-- is_admin devuelve false para un uuid inexistente
select is( public.is_admin(gen_random_uuid()), false, 'is_admin false por defecto' );

-- is_admin.is_admin default false
select col_has_default('public', 'profiles', 'is_admin', 'profiles.is_admin tiene default');

select * from finish();
rollback;
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `supabase test db`
Expected: FAIL.

- [ ] **Step 3: Escribir la migración**

Run: `supabase migration new profiles_settings`, luego:

```sql
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.settings (
  id                      uuid primary key default gen_random_uuid(),
  origin_address          jsonb,
  fallback_standard_cents integer not null default 0,
  fallback_express_cents  integer not null default 0
);

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select is_admin from public.profiles where id = uid), false);
$$;
```

- [ ] **Step 4: Correr el test (debe pasar)**

Run: `supabase test db`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests/03_schema_profiles_settings_test.sql
git commit -m "feat(db): add profiles, settings tables and is_admin() function"
```

---

### Task 6: Generador de `order_number` y triggers `updated_at`

**Files:**
- Create: `supabase/migrations/<ts>_order_number.sql`

**Interfaces:**
- Consumes: `public.orders`, `public.products`, `public.product_variants`.
- Produces:
  - trigger que autogenera `order_number` = `'AIGO-' || <8 hex>` si viene NULL.
  - trigger genérico `set_updated_at()` en `products`, `product_variants`, `orders`.

- [ ] **Step 1: Escribir la migración**

Run: `supabase migration new order_number`, luego:

```sql
-- updated_at automatico
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_products_updated
  before update on public.products
  for each row execute function public.set_updated_at();

create trigger trg_variants_updated
  before update on public.product_variants
  for each row execute function public.set_updated_at();

create trigger trg_orders_updated
  before update on public.orders
  for each row execute function public.set_updated_at();

-- order_number automatico
create or replace function public.gen_order_number()
returns trigger language plpgsql as $$
begin
  if new.order_number is null then
    new.order_number = 'AIGO-' || upper(encode(gen_random_bytes(4), 'hex'));
  end if;
  return new;
end;
$$;

create trigger trg_orders_number
  before insert on public.orders
  for each row execute function public.gen_order_number();
```

- [ ] **Step 2: Verificar con una inserción manual**

Run:
```bash
supabase db reset
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" -c \
"insert into public.products (name,\"group\",category) values ('t','g','Albums') returning id;"
```
Expected: inserta y regresa un uuid (confirma que los triggers no rompen inserts).

- [ ] **Step 3: Verificar order_number autogenerado**

Run:
```bash
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" -c \
"insert into public.orders (customer_name,customer_email,shipping_address,shipping_city,shipping_state,shipping_postal_code,shipping_cost_cents,subtotal_cents,total_cents) values ('n','a@b.com','d','c','e','01000',0,0,0) returning order_number;"
```
Expected: regresa algo como `AIGO-1A2B3C4D`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations
git commit -m "feat(db): auto-generate order_number and updated_at triggers"
```

---

### Task 7: RLS del catálogo (`products`, `product_variants`)

**Files:**
- Create: `supabase/migrations/<ts>_rls_catalog.sql`
- Test: `supabase/tests/04_rls_catalog_test.sql`

**Interfaces:**
- Consumes: `public.is_admin(uuid)`, `public.products`, `public.product_variants`.
- Produces: RLS habilitado; `anon` lee solo filas con `is_active = true`.

- [ ] **Step 1: Escribir el test pgTAP (falla)**

Crear `supabase/tests/04_rls_catalog_test.sql`:

```sql
begin;
select plan(3);

-- sembrar: un producto activo y uno inactivo (como postgres, bypassa RLS)
insert into public.products (id, name, "group", category, is_active) values
  ('11111111-1111-1111-1111-111111111111','Activo','G','Albums', true),
  ('22222222-2222-2222-2222-222222222222','Inactivo','G','Albums', false);

-- anon solo ve el activo
set local role anon;

select results_eq(
  $$ select name from public.products order by name $$,
  $$ values ('Activo'::text) $$,
  'anon ve solo productos activos'
);

-- anon NO puede insertar
select throws_ok(
  $$ insert into public.products (name,"group",category) values ('x','g','Albums') $$,
  '42501', null,
  'anon no puede insertar productos'
);

reset role;

-- RLS habilitado en la tabla
select is(
  (select relrowsecurity from pg_class where oid = 'public.products'::regclass),
  true,
  'RLS habilitado en products'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `supabase test db`
Expected: FAIL — sin RLS, anon vería ambos productos y podría insertar.

- [ ] **Step 3: Escribir la migración**

Run: `supabase migration new rls_catalog`, luego:

```sql
alter table public.products enable row level security;
alter table public.product_variants enable row level security;

-- lectura publica de lo activo (o todo, si es admin)
create policy products_read on public.products for select
  to anon, authenticated
  using (is_active = true or public.is_admin(auth.uid()));

create policy variants_read on public.product_variants for select
  to anon, authenticated
  using (is_active = true or public.is_admin(auth.uid()));

-- escritura solo admin
create policy products_admin_write on public.products for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy variants_admin_write on public.product_variants for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
```

- [ ] **Step 4: Correr el test (debe pasar)**

Run: `supabase test db`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests/04_rls_catalog_test.sql
git commit -m "feat(db): RLS for catalog — public read active, admin write"
```

---

### Task 8: RLS de pedidos (`orders`, `order_items`, `order_status_history`)

**Files:**
- Create: `supabase/migrations/<ts>_rls_orders.sql`
- Test: `supabase/tests/05_rls_orders_test.sql`

**Interfaces:**
- Consumes: `public.is_admin(uuid)`.
- Produces: RLS que niega TODO acceso a `anon`; admin puede `SELECT` y `UPDATE orders`. Inserciones solo por `service_role` (bypassa RLS).

- [ ] **Step 1: Escribir el test pgTAP (falla)**

Crear `supabase/tests/05_rls_orders_test.sql`:

```sql
begin;
select plan(3);

insert into public.orders (order_number, customer_name, customer_email, shipping_address,
  shipping_city, shipping_state, shipping_postal_code, shipping_cost_cents, subtotal_cents, total_cents)
values ('AIGO-SEED','n','a@b.com','d','c','e','01000',0,0,0);

-- anon no ve ningun pedido
set local role anon;
select is_empty(
  $$ select id from public.orders $$,
  'anon no ve pedidos'
);

-- anon no puede insertar pedidos
select throws_ok(
  $$ insert into public.orders (order_number,customer_name,customer_email,shipping_address,
       shipping_city,shipping_state,shipping_postal_code,shipping_cost_cents,subtotal_cents,total_cents)
     values ('AIGO-HACK','n','a@b.com','d','c','e','01000',0,0,0) $$,
  '42501', null,
  'anon no puede crear pedidos'
);

reset role;
select is(
  (select relrowsecurity from pg_class where oid = 'public.orders'::regclass),
  true,
  'RLS habilitado en orders'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `supabase test db`
Expected: FAIL.

- [ ] **Step 3: Escribir la migración**

Run: `supabase migration new rls_orders`, luego:

```sql
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;

-- Sin politicas para anon => negado por defecto.
-- Admin puede leer todos los pedidos y actualizar estado/envio.
create policy orders_admin_select on public.orders for select
  to authenticated using (public.is_admin(auth.uid()));

create policy orders_admin_update on public.orders for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy order_items_admin_select on public.order_items for select
  to authenticated using (public.is_admin(auth.uid()));

create policy history_admin_select on public.order_status_history for select
  to authenticated using (public.is_admin(auth.uid()));
```

- [ ] **Step 4: Correr el test (debe pasar)**

Run: `supabase test db`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests/05_rls_orders_test.sql
git commit -m "feat(db): RLS for orders — deny anon, admin read/update"
```

---

### Task 9: RLS de `profiles` y `settings`

**Files:**
- Create: `supabase/migrations/<ts>_rls_profiles_settings.sql`
- Test: `supabase/tests/06_rls_profiles_settings_test.sql`

**Interfaces:**
- Consumes: `public.is_admin(uuid)`.
- Produces: RLS que niega `anon`; un usuario autenticado lee su propio perfil; `settings` solo admin. `is_admin` no es editable por el usuario (sin policy de UPDATE).

- [ ] **Step 1: Escribir el test pgTAP (falla)**

Crear `supabase/tests/06_rls_profiles_settings_test.sql`:

```sql
begin;
select plan(3);

insert into public.settings (fallback_standard_cents, fallback_express_cents) values (9900, 17900);

-- anon no ve settings
set local role anon;
select is_empty($$ select id from public.settings $$, 'anon no ve settings');
reset role;

select is(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  true, 'RLS habilitado en profiles'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.settings'::regclass),
  true, 'RLS habilitado en settings'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `supabase test db`
Expected: FAIL.

- [ ] **Step 3: Escribir la migración**

Run: `supabase migration new rls_profiles_settings`, luego:

```sql
alter table public.profiles enable row level security;
alter table public.settings enable row level security;

-- un usuario lee su propio perfil; un admin lee todos.
create policy profiles_self_read on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin(auth.uid()));

-- settings solo admin (lectura y escritura)
create policy settings_admin_all on public.settings for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
```

- [ ] **Step 4: Correr el test (debe pasar)**

Run: `supabase test db`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests/06_rls_profiles_settings_test.sql
git commit -m "feat(db): RLS for profiles and settings"
```

---

### Task 10: Seed del catálogo y settings

**Files:**
- Create: `supabase/seed.sql`

**Interfaces:**
- Consumes: `public.products`, `public.product_variants`, `public.settings`.
- Produces: 12 productos (de `src/stores/products.js`) cada uno con una variante `Único`, más una fila de `settings` con la tarifa fallback y la dirección de origen.

> Nota: el seed corre con privilegios de superusuario (bypassa RLS). Precios en centavos = pesos × 100.

- [ ] **Step 1: Escribir el seed**

Crear `supabase/seed.sql` (primeros 3 productos mostrados; **repetir el patrón para los 12** de `src/stores/products.js`, convirtiendo `price` a centavos y usando `stock`, `weight_grams` estimado por categoría — Albums 300g, Lightsticks 600g, Ropa 400g, Photocards 50g, Posters 200g):

```sql
-- Settings (fila unica): dirección de origen + tarifa fallback
insert into public.settings (origin_address, fallback_standard_cents, fallback_express_cents)
values (
  jsonb_build_object('street','CAMBIAR','city','CDMX','state','CDMX','postal_code','01000'),
  9900,   -- $99 estándar fallback
  17900   -- $179 express fallback
);

-- Producto 1
with p as (
  insert into public.products (name, "group", category, description, image_url)
  values (
    'BTS - Album "Proof"', 'BTS', 'Albums',
    'Álbum antología de BTS con 3 CDs, photobook y photocards exclusivas.',
    'https://placehold.co/400x400/F3E8EE/936DA4?text=BTS+Proof'
  ) returning id
)
insert into public.product_variants (product_id, label, price_cents, stock, weight_grams)
select id, 'Único', 85000, 15, 300 from p;

-- Producto 2
with p as (
  insert into public.products (name, "group", category, description, image_url)
  values (
    'BLACKPINK - Lightstick Ver.2', 'BLACKPINK', 'Lightsticks',
    'Lightstick oficial de BLACKPINK versión 2 con Bluetooth.',
    'https://placehold.co/400x400/FCD4C5/B06B8A?text=BP+Lightstick'
  ) returning id
)
insert into public.product_variants (product_id, label, price_cents, stock, weight_grams)
select id, 'Único', 120000, 8, 600 from p;

-- Producto 3
with p as (
  insert into public.products (name, "group", category, description, image_url)
  values (
    'Stray Kids - Hoodie "MANIAC"', 'Stray Kids', 'Ropa',
    'Hoodie oficial de la gira MANIAC de Stray Kids. Material premium.',
    'https://placehold.co/400x400/E1C7EA/936DA4?text=SKZ+Hoodie'
  ) returning id
)
insert into public.product_variants (product_id, label, price_cents, stock, weight_grams)
select id, 'Único', 75000, 20, 400 from p;

-- ... repetir productos 4 a 12 con el mismo patrón (ver src/stores/products.js)
```

- [ ] **Step 2: Aplicar seed y verificar**

Run: `supabase db reset`
Expected: al final aplica `seed.sql` sin error.

Run:
```bash
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" -c \
"select count(*) as productos from public.products; select count(*) as variantes from public.product_variants;"
```
Expected: `productos = 12`, `variantes = 12`.

- [ ] **Step 3: Verificar que anon ve el catálogo sembrado**

Run:
```bash
curl -s "$(supabase status -o env | grep API_URL | cut -d= -f2- | tr -d '\"')/rest/v1/products?select=name&limit=1" \
  -H "apikey: $(supabase status -o env | grep ANON_KEY | cut -d= -f2- | tr -d '\"')" | head
```
Expected: JSON con un producto (confirma RLS de lectura pública + seed juntos).

- [ ] **Step 4: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat(db): seed catalog from products.js and default settings"
```

---

## Self-Review (cobertura vs spec)

- **8 tablas** → Tasks 3, 4, 5. ✅
- **Precios en centavos / uuid / snake_case** → Global Constraints + todas las migraciones. ✅
- **CHECKs de estados y category** → Tasks 3, 4. ✅
- **`is_admin()` SECURITY DEFINER** → Task 5. ✅
- **`order_number` legible + `updated_at`** → Task 6. ✅
- **RLS: anon solo lee catálogo activo; sin acceso a orders/profiles/settings** → Tasks 7, 8, 9 con tests de comportamiento por rol. ✅
- **Admin lee/actualiza pedidos, gestiona catálogo** → Tasks 7, 8. ✅
- **Seed desde catálogo actual + settings con fallback** → Task 10. ✅
- **weight_grams/dimensiones para cotizar** → Task 3. ✅

**Fuera de esta fase (van en planes 2–4):** Supabase Auth y siembra de admins, las 4 Edge Functions, integración Stripe/Skydropx, recablear el frontend Vue. El descuento atómico de stock vive en `stripe-webhook` (Plan 4); aquí solo quedó el esquema que lo soportará.

**Pendiente humano antes de producción:** liberar un slot del plan gratuito de Supabase (2/2) para poder hacer `supabase link` + `supabase db push`. El desarrollo local de esta fase no lo requiere.
