import 'server-only';
import { getStore } from './data/store';

/** id → nombre del personal (para mostrar asesores en el CRM). Los usuarios de prueba de desarrollo son «dev-<rol>». */
export async function staffNames(): Promise<(id: string | null | undefined) => string> {
  const users = await getStore().listUsers().catch(() => []);
  const map = new Map(users.map((u) => [u.id, u.active ? u.full_name : `${u.full_name} (desactivado)`]));
  return (id) => (!id ? 'Sin asignar' : map.get(id) ?? (id.startsWith('dev-') ? `Dev (${id.slice(4)})` : 'Usuario desconocido'));
}
