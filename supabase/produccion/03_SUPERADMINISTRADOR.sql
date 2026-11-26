-- =====================================================================================================
-- 03_SUPERADMINISTRADOR.sql — Energy Solutions Ecuador · energysolec-web
-- Da el rol de superadministrador del panel a un usuario que YA creaste en Authentication → Users
-- (con «Auto Confirm User» marcado). No crea usuarios ni contraseñas.
--
-- Antes de ejecutarlo, cambia SOLO las dos líneas marcadas con  <<<  :
--   · el correo exacto con el que creaste el usuario;
--   · tu nombre completo (aparece en el panel y en la auditoría).
-- Si el usuario ya tenía perfil, lo convierte en superadministrador activo. Puedes ejecutarlo de nuevo sin problema.
-- =====================================================================================================

do $$
declare
  v_email text := 'CORREO_DEL_USUARIO_CREADO_EN_AUTHENTICATION';   -- <<< cambia esto
  v_name  text := 'NOMBRE_Y_APELLIDO';                             -- <<< cambia esto
  u record;
begin
  v_email := lower(trim(v_email));
  v_name := trim(v_name);
  if v_email = lower('CORREO_DEL_USUARIO_CREADO_EN_AUTHENTICATION') or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Escribe el correo del usuario en la línea v_email (entre comillas simples).';
  end if;
  if v_name = 'NOMBRE_Y_APELLIDO' or length(v_name) < 3 then
    raise exception 'Escribe tu nombre completo en la línea v_name (entre comillas simples).';
  end if;

  select id, email, email_confirmed_at into u from auth.users where lower(email) = v_email;
  if not found then
    raise exception 'No existe un usuario con el correo %: créalo primero en Authentication → Users → Add user → Create new user.', v_email;
  end if;
  if u.email_confirmed_at is null then
    raise exception 'El usuario % no está confirmado: bórralo y créalo de nuevo marcando «Auto Confirm User».', v_email;
  end if;

  insert into public.profiles (id, email, full_name, role, active, is_advisor)
  values (u.id, u.email, v_name, 'superadmin', true, false)
  on conflict (id) do update set role = 'superadmin', active = true, full_name = excluded.full_name;
end
$$;

select email, full_name, role, active, created_at
from public.profiles
where role = 'superadmin'
order by created_at;
