-- Carga de planillas eléctricas (Fase 2, punto 6).
-- El servidor sube el archivo al bucket privado 'bills' y registra la propuesta de la IA en bill_uploads.
-- El cliente nunca escribe directo: todas las escrituras pasan por /api/bill y /api/study con la clave de servicio.

-- Límites del bucket, en espejo con BILL_LIMITS (src/lib/services/bill.ts): 4 MB y solo PDF o imagen.
update storage.buckets
   set file_size_limit = 4194304,
       allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp']
 where id = 'bills';

-- Una carga confirmada siempre está vinculada a su estudio.
alter table bill_uploads
  add constraint bill_uploads_confirmed_has_study check (not confirmed_by_user or study_id is not null);

create index if not exists bill_uploads_study_idx on bill_uploads(study_id);
create index if not exists bill_uploads_lead_idx on bill_uploads(lead_id);
-- Para depurar las cargas no confirmadas (minimización de datos, LOPDP).
create index if not exists bill_uploads_pending_idx on bill_uploads(created_at) where not confirmed_by_user;
