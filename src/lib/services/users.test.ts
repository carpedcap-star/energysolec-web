import { describe, expect, it } from 'vitest';
import { parseUserForm, passwordProblem, roleChangeProblem } from './users';
import type { StaffUser } from '../data/types';

const u = (id: string, role: StaffUser['role'], active = true): StaffUser => ({ id, full_name: id, email: `${id}@x.ec`, phone: null, role, is_advisor: false, active, activated: true, created_at: '' });
const fdOf = (o: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.append(k, v); return fd; };

describe('usuarios: formulario', () => {
  it('normaliza el correo y valida rol y teléfono', () => {
    const r = parseUserForm(fdOf({ full_name: 'Ana Pérez', email: ' Ana@EnergySolec.com ', role: 'ventas', is_advisor: 'on' }));
    if ('error' in r) throw new Error(r.error);
    expect(r.data).toMatchObject({ email: 'ana@energysolec.com', role: 'ventas', is_advisor: true, active: true, phone: null });
    expect('error' in parseUserForm(fdOf({ full_name: 'Ana Pérez', email: 'ana@x.ec', role: 'dios' }))).toBe(true);
    expect((parseUserForm(fdOf({ full_name: 'Ana Pérez', email: 'ana@x.ec', role: 'ventas', phone: 'abc' })) as { error: string }).error).toMatch(/Teléfono/);
  });
  it('edición: la casilla «Activo» desmarcada desactiva (no se envía, pero el formulario la incluía)', () => {
    const off = parseUserForm(fdOf({ full_name: 'Ana Pérez', email: 'ana@x.ec', role: 'ventas', active_field: '1' }));
    const on = parseUserForm(fdOf({ full_name: 'Ana Pérez', email: 'ana@x.ec', role: 'ventas', active_field: '1', active: 'on' }));
    expect('data' in off && off.data.active).toBe(false);
    expect('data' in on && on.data.active).toBe(true);
  });
});

describe('usuarios: contraseñas', () => {
  it('exige largo, letras y números, y no repetir el correo', () => {
    expect(passwordProblem('corta1')).toMatch(/10 caracteres/);
    expect(passwordProblem('solamenteletras')).toMatch(/número/);
    expect(passwordProblem('1234567890')).toMatch(/letras/);
    expect(passwordProblem('anaperez2026!', 'anaperez@x.ec')).toMatch(/correo/);
    expect(passwordProblem('Paneles-Solares-2026', 'ana@x.ec')).toBeNull();
  });
});

describe('usuarios: nunca quedarse sin acceso', () => {
  const all = [u('a', 'superadmin'), u('b', 'superadmin'), u('c', 'ventas')];
  it('nadie cambia su propio rol ni se desactiva', () => {
    expect(roleChangeProblem(all[0], { role: 'gerencia', active: true }, 'a', all)).toMatch(/propio rol/);
    expect(roleChangeProblem(all[0], { role: 'superadmin', active: false }, 'a', all)).toMatch(/propio rol/);
    expect(roleChangeProblem(all[0], { role: 'superadmin', active: true }, 'a', all)).toBeNull();
  });
  it('siempre queda un superadministrador activo', () => {
    expect(roleChangeProblem(all[1], { role: 'gerencia', active: true }, 'a', all)).toBeNull();
    const solo = [u('a', 'superadmin'), u('b', 'superadmin', false), u('c', 'gerencia')];
    expect(roleChangeProblem(solo[0], { role: 'gerencia', active: true }, 'c', solo)).toMatch(/al menos un superadministrador/);
    expect(roleChangeProblem(solo[0], { role: 'superadmin', active: false }, 'c', solo)).toMatch(/al menos un superadministrador/);
  });
});
