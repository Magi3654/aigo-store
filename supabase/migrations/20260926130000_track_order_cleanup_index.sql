-- track_order borra los intentos de mas de un dia en cada llamada. Sin un indice
-- por created_at esa limpieza lee la tabla entera, y un atacante que rota IP y
-- numero de pedido puede llenarla hasta volver lentas todas las consultas.
create index on public.track_order_attempts (created_at);
