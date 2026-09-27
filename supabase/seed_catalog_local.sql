-- ============================================================
-- IMAGENES DE MOCKUP Y PRODUCTO "VELAS" DE EJEMPLO — SOLO STACK LOCAL.
-- `supabase db push` NO ejecuta seeds. Fotos de Unsplash (licencia Unsplash:
-- uso comercial libre). La clienta las reemplaza desde el panel (image_url).
-- Idempotente.
-- ============================================================

update public.products set image_url = 'https://images.unsplash.com/photo-1619983081563-430f63602796?w=800&q=75'
 where name in ('BTS - Album "Proof"', 'TWICE - Album "READY TO BE"');

update public.products set image_url = 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800&q=75'
 where name = 'Stray Kids - Hoodie "MANIAC"';

update public.products set image_url = 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=75'
 where name = 'BLACKPINK - T-shirt "Born Pink"';

insert into public.products (name, "group", category, description, image_url)
values ('Vela aromática "Purple"', 'AIGO', 'Velas',
        'Vela de soya con aroma a lavanda, hecha a mano. 200 g.',
        'https://images.unsplash.com/photo-1603006905003-be475563bc59?w=800&q=75')
on conflict (name) do nothing;

insert into public.product_variants (product_id, label, price_cents, stock, weight_grams)
select p.id, 'Único', 32000, 12, 350
  from public.products p
 where p.name = 'Vela aromática "Purple"'
   and not exists (select 1 from public.product_variants v where v.product_id = p.id);
