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
declare
  candidate text;
begin
  if new.order_number is null then
    -- reintenta ante una colision improbable; el UNIQUE de order_number sigue
    -- siendo el respaldo real ante una carrera entre transacciones concurrentes.
    loop
      candidate := 'AIGO-' || upper(encode(gen_random_bytes(4), 'hex'));
      exit when not exists (select 1 from public.orders where order_number = candidate);
    end loop;
    new.order_number := candidate;
  end if;
  return new;
end;
$$;

create trigger trg_orders_number
  before insert on public.orders
  for each row execute function public.gen_order_number();
