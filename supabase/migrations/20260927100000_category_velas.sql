-- La tienda vende velas: nueva categoria.
alter table public.products drop constraint products_category_check;
alter table public.products add constraint products_category_check
  check (category in ('Albums','Lightsticks','Ropa','Photocards','Posters','Velas'));
