# Vue 3 + Vite

This template should help get you started developing with Vue 3 in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about IDE Support for Vue in the [Vue Docs Scaling up Guide](https://vuejs.org/guide/scaling-up/tooling.html#ide-support).

## Panel de administración

El acceso al panel usa Supabase Auth. No hay registro público: los administradores se
crean a mano y se marcan en la tabla `profiles`.

### Desarrollo local

`supabase/seed.sql` siembra un admin en cada `supabase db reset`:

- **Correo:** `admin@aigo.local`
- **Contraseña:** `aigo-admin-local`

Esas credenciales son **solo para el stack local**. `supabase db push` no ejecuta el seed,
así que nunca llegan a la nube.

### En la nube

1. En Supabase Studio, **Authentication → Users → Add user**, con correo y contraseña
   propios y "Auto Confirm User" activado.
2. Copiar el UUID del usuario recién creado.
3. En el **SQL Editor**, marcarlo como administrador:

   ```sql
   insert into public.profiles (id, is_admin)
   values ('<uuid-del-usuario>', true)
   on conflict (id) do update set is_admin = true;
   ```

Sin ese paso, el usuario inicia sesión pero el panel lo rechaza: la RLS bloquea toda
lectura y escritura de administración a quien no tenga `is_admin = true`.
