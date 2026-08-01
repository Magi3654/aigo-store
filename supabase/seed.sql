-- Seed del catalogo, migrado desde src/stores/products.js.
-- Corre como superusuario (bypassa RLS). Precios en centavos = pesos x 100.
-- weight_grams estimado por categoria: Albums 300, Lightsticks 600, Ropa 400,
-- Photocards 50, Posters 200.

-- Settings (fila unica): direccion de origen + tarifa fallback de envio.
insert into public.settings (origin_address, fallback_standard_cents, fallback_express_cents)
values (
  jsonb_build_object('street','CAMBIAR','city','CDMX','state','CDMX','postal_code','01000'),
  9900,   -- $99 estandar
  17900   -- $179 express
);

insert into public.products (name, "group", category, description, image_url)
values
  ('BTS - Album "Proof"', 'BTS', 'Albums',
   'Álbum antología de BTS con 3 CDs, photobook y photocards exclusivas.',
   'https://placehold.co/400x400/F3E8EE/936DA4?text=BTS+Proof'),
  ('BLACKPINK - Lightstick Ver.2', 'BLACKPINK', 'Lightsticks',
   'Lightstick oficial de BLACKPINK versión 2 con Bluetooth.',
   'https://placehold.co/400x400/FCD4C5/B06B8A?text=BP+Lightstick'),
  ('Stray Kids - Hoodie "MANIAC"', 'Stray Kids', 'Ropa',
   'Hoodie oficial de la gira MANIAC de Stray Kids. Material premium.',
   'https://placehold.co/400x400/E1C7EA/936DA4?text=SKZ+Hoodie'),
  ('TWICE - Album "READY TO BE"', 'TWICE', 'Albums',
   'Álbum READY TO BE de TWICE. Incluye photobook y photocards random.',
   'https://placehold.co/400x400/E1C7EA/BB82A8?text=TWICE+RTB'),
  ('BTS - Photocards Set (7pcs)', 'BTS', 'Photocards',
   'Set de 7 photocards oficiales de BTS. Edición especial.',
   'https://placehold.co/400x400/FCD4C5/C18797?text=BTS+PCs'),
  ('SEVENTEEN - Lightstick Ver.3', 'SEVENTEEN', 'Lightsticks',
   'Lightstick oficial de SEVENTEEN versión 3. Carat Bong.',
   'https://placehold.co/400x400/F3E8EE/A583AA?text=SVT+Lightstick'),
  ('NewJeans - Album "Get Up"', 'NewJeans', 'Albums',
   'Mini álbum "Get Up" de NewJeans en formato de bolsa.',
   'https://placehold.co/400x400/F3E8EE/936DA4?text=NJ+GetUp'),
  ('ATEEZ - Poster Set', 'ATEEZ', 'Posters',
   'Set de 4 posters oficiales de ATEEZ. Tamaño A3.',
   'https://placehold.co/400x400/E1C7EA/936DA4?text=ATEEZ+Poster'),
  ('aespa - Album "MY WORLD"', 'aespa', 'Albums',
   'Tercer mini álbum de aespa "MY WORLD". Incluye photocards y poster.',
   'https://placehold.co/400x400/E1C7EA/BB82A8?text=aespa+MW'),
  ('Stray Kids - Lightstick "Nachimbong"', 'Stray Kids', 'Lightsticks',
   'Lightstick oficial de Stray Kids. Nachimbong con Bluetooth.',
   'https://placehold.co/400x400/FCD4C5/B06B8A?text=SKZ+LS'),
  ('BLACKPINK - T-shirt "Born Pink"', 'BLACKPINK', 'Ropa',
   'Playera oficial de la gira BORN PINK. 100% algodón.',
   'https://placehold.co/400x400/F3E8EE/936DA4?text=BP+Tshirt'),
  ('LE SSERAFIM - Album "UNFORGIVEN"', 'LE SSERAFIM', 'Albums',
   'Primer álbum de estudio de LE SSERAFIM. Incluye photobook y PCs.',
   'https://placehold.co/400x400/F3E8EE/A583AA?text=LSF+Album');

-- Una variante "Único" por producto. Se une por nombre, que es unico en el
-- catalogo sembrado arriba.
insert into public.product_variants (product_id, label, price_cents, stock, weight_grams)
select p.id, 'Único', v.price_cents, v.stock, v.weight_grams
from public.products p
join (values
  ('BTS - Album "Proof"',                   85000, 15, 300),
  ('BLACKPINK - Lightstick Ver.2',         120000,  8, 600),
  ('Stray Kids - Hoodie "MANIAC"',          75000, 20, 400),
  ('TWICE - Album "READY TO BE"',           65000, 12, 300),
  ('BTS - Photocards Set (7pcs)',           35000, 30,  50),
  ('SEVENTEEN - Lightstick Ver.3',         110000, 10, 600),
  ('NewJeans - Album "Get Up"',             55000, 25, 300),
  ('ATEEZ - Poster Set',                    28000, 18, 200),
  ('aespa - Album "MY WORLD"',              60000, 14, 300),
  ('Stray Kids - Lightstick "Nachimbong"', 105000,  6, 600),
  ('BLACKPINK - T-shirt "Born Pink"',       55000, 22, 400),
  ('LE SSERAFIM - Album "UNFORGIVEN"',      58000, 16, 300)
) as v(name, price_cents, stock, weight_grams) on v.name = p.name;

-- ============================================================
-- ADMIN DE DESARROLLO — SOLO PARA EL STACK LOCAL.
-- `supabase db push` NO ejecuta este archivo, asi que esto nunca llega a la
-- nube. En la nube el admin se crea desde Studio (ver README).
-- Credenciales: admin@aigo.local / aigo-admin-local
-- ============================================================
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated',
  'admin@aigo.local',
  crypt('aigo-admin-local', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  '', '', '', ''
);

-- GoTrue exige una identidad de tipo email para el login con contrasena.
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '{"sub":"00000000-0000-4000-8000-000000000001","email":"admin@aigo.local","email_verified":true,"phone_verified":false}',
  'email',
  now(), now(), now()
);

insert into public.profiles (id, is_admin)
values ('00000000-0000-4000-8000-000000000001', true);
