-- Cuentas comerciales: instaladores y distribuidores autorizados (Fase 2, punto 7).
-- Flujo: la empresa solicita en /profesionales → Gerencia aprueba en el panel → la persona de contacto activa su
-- acceso con un enlace de un solo uso → la tienda y los pedidos usan los precios de su nivel.
-- Toda escritura pasa por el servidor con la clave de servicio; estas reglas protegen además ante errores de código.

alter type lead_source add value if not exists 'cuenta_comercial';

alter table trade_accounts
  add column contact_name text not null default '',
  add column email citext,
  add column phone text,
  add column city text,
  add column notes text,
  add column status text not null default 'pendiente',
  add column review_note text,
  add column reviewed_at timestamptz,
  add column lead_id uuid references leads(id) on delete set null,
  add column updated_at timestamptz not null default now();

alter table trade_accounts
  add constraint trade_status_valid check (status in ('pendiente','aprobada','rechazada','suspendida')),
  -- `approved` es lo que lee la RLS de precios (0002): siempre en espejo con el estado.
  add constraint trade_approved_mirror check (approved = (status = 'aprobada')),
  -- Aprobada = revisada por una persona del panel y con usuario de acceso creado.
  add constraint trade_approved_complete check (status <> 'aprobada' or (approved_by is not null and user_id is not null and reviewed_at is not null)),
  add constraint trade_ruc_format check (ruc is null or ruc ~ '^[0-9]{13}$'),
  add constraint trade_email_required check (email is not null or status = 'rechazada');

-- Una sola solicitud viva por correo y por RUC (las rechazadas no cuentan: la empresa puede volver a solicitar).
create unique index trade_accounts_email_live on trade_accounts(email) where status <> 'rechazada';
create unique index trade_accounts_ruc_live on trade_accounts(ruc) where status <> 'rechazada';
create index trade_accounts_status_idx on trade_accounts(status, created_at desc);

-- Aprobar o suspender da o quita acceso a precios: solo superadministración o Gerencia (espejo de PERMS.trade_approve).
-- Un usuario del panel no puede ser a la vez cliente comercial (sesiones y permisos separados).
create or replace function guard_trade_account() returns trigger language plpgsql as $$
begin
  if new.user_id is not null and exists (select 1 from profiles p where p.id = new.user_id) then
    raise exception 'Un usuario del panel no puede tener una cuenta comercial';
  end if;
  if new.status in ('aprobada','suspendida') and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    if new.approved_by is null or not exists (
      select 1 from profiles p where p.id = new.approved_by and p.active and p.role in ('superadmin','gerencia')
    ) then
      raise exception 'Solo Gerencia o superadministración pueden aprobar o suspender cuentas comerciales';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger t_guard_trade before insert or update on trade_accounts for each row execute function guard_trade_account();

-- Pedidos con precios de nivel solo desde una cuenta comercial.
alter table orders add column trade_account_id uuid references trade_accounts(id) on delete restrict;
alter table orders add constraint order_tier_requires_account check (price_tier = 'final' or trade_account_id is not null);
create index orders_trade_account_idx on orders(trade_account_id) where trade_account_id is not null;
