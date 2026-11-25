import { describe, expect, it } from 'vitest';
import { summaryText, afterFailure, billPurgeBefore, buildDigests, digestEmail, endOfEcDay, isExpired, isRetryable, MAX_ATTEMPTS, parseEcLocal, toEcLocal, type ReminderLead } from './followup';

// 25 nov 2026, 10:00 en Ecuador = 15:00 UTC
const NOW = Date.parse('2026-11-25T15:00:00Z');
const lead = (o: Partial<ReminderLead>): ReminderLead => ({ id: 'l1', full_name: 'Ana', company: null, stage: 'contactado', advisor_id: 'a1', next_activity_at: null, next_activity_note: null, first_contact_at: '2026-11-20T15:00:00Z', created_at: '2026-11-20T15:00:00Z', source: 'calculadora', ...o });

describe('hora de Ecuador', () => {
  it('el campo datetime-local se interpreta en UTC−5', () => {
    expect(parseEcLocal('2026-11-26T09:00')).toBe('2026-11-26T14:00:00.000Z');
    expect(toEcLocal('2026-11-26T14:00:00.000Z')).toBe('2026-11-26T09:00');
    expect(parseEcLocal('mañana')).toBeNull();
  });
  it('fin del día en Ecuador, también cerca de medianoche UTC', () => {
    expect(new Date(endOfEcDay(NOW)).toISOString()).toBe('2026-11-26T04:59:59.999Z');
    // 26 nov 02:00 UTC sigue siendo 25 nov en Ecuador
    expect(new Date(endOfEcDay(Date.parse('2026-11-26T02:00:00Z'))).toISOString()).toBe('2026-11-26T04:59:59.999Z');
  });
});

describe('cola de correos', () => {
  it('espera creciente y error al quinto intento', () => {
    expect(afterFailure(1, NOW)).toEqual({ status: 'pendiente', next_attempt_at: new Date(NOW + 5 * 60e3).toISOString() });
    expect(afterFailure(2, NOW)).toEqual({ status: 'pendiente', next_attempt_at: new Date(NOW + 30 * 60e3).toISOString() });
    expect(afterFailure(4, NOW)).toEqual({ status: 'pendiente', next_attempt_at: new Date(NOW + 12 * 3600e3).toISOString() });
    expect(afterFailure(MAX_ATTEMPTS, NOW)).toEqual({ status: 'error' });
  });
  it('los enlaces de acceso no se guardan para reintentar', () => {
    expect(isRetryable('invitacion_panel')).toBe(false);
    expect(isRetryable('cuenta_comercial_aprobada')).toBe(false);
    expect(isRetryable('estudio_solar')).toBe(true);
  });
  it('vence según la plantilla', () => {
    expect(isExpired({ template: 'estudio_solar', created_at: '2026-11-23T16:00:00Z' }, NOW)).toBe(false);
    expect(isExpired({ template: 'estudio_solar', created_at: '2026-11-22T14:00:00Z' }, NOW)).toBe(true);
    expect(isExpired({ template: 'recordatorio_seguimiento', created_at: '2026-11-24T18:00:00Z' }, NOW)).toBe(true);
  });
});

describe('recordatorios', () => {
  it('agrupa por asesor actividades de hoy y vencidas, no las futuras ni las de leads cerrados', () => {
    const d = buildDigests([
      lead({ id: 'hoy', next_activity_at: '2026-11-25T20:00:00Z', next_activity_note: 'Llamar' }),
      lead({ id: 'vencida', next_activity_at: '2026-11-24T15:00:00Z' }),
      lead({ id: 'manana', next_activity_at: '2026-11-26T15:00:00Z' }),
      lead({ id: 'cerrado', stage: 'ganado', next_activity_at: '2026-11-24T15:00:00Z' }),
      lead({ id: 'otro', advisor_id: 'a2', next_activity_at: '2026-11-25T13:00:00Z' }),
    ], NOW);
    const a1 = d.find((x) => x.advisorId === 'a1')!;
    expect(a1.due.map((i) => i.id)).toEqual(['vencida', 'hoy']);
    expect(a1.due[0].overdue).toBe(true);
    expect(d.find((x) => x.advisorId === 'a2')!.due).toHaveLength(1);
  });
  it('recuerda cada actividad una sola vez; si cambia la fecha, vuelve a recordar', () => {
    const at = '2026-11-25T13:00:00Z';
    expect(buildDigests([lead({ next_activity_at: at, next_activity_reminded_for: at })], NOW)).toHaveLength(0);
    expect(buildDigests([lead({ next_activity_at: at, next_activity_reminded_for: '2026-11-20T13:00:00Z' })], NOW)).toHaveLength(1);
  });
  it('leads nuevos sin contacto por más de 24 h, una sola alerta; sin asesor van al grupo null', () => {
    const base = { stage: 'nuevo' as const, first_contact_at: null, advisor_id: null };
    const d = buildDigests([
      lead({ ...base, id: 'viejo', created_at: '2026-11-24T10:00:00Z' }),
      lead({ ...base, id: 'reciente', created_at: '2026-11-25T05:00:00Z' }),
      lead({ ...base, id: 'alertado', created_at: '2026-11-23T10:00:00Z', uncontacted_alerted_at: '2026-11-24T12:00:00Z' }),
    ], NOW);
    expect(d).toHaveLength(1);
    expect(d[0].advisorId).toBeNull();
    expect(d[0].uncontacted.map((i) => i.id)).toEqual(['viejo']);
  });
  it('el correo escapa los textos del lead y enlaza al panel', () => {
    const [d] = buildDigests([lead({ full_name: '<img src=x onerror=alert(1)>', next_activity_at: '2026-11-25T20:00:00Z', next_activity_note: 'a & b' })], NOW);
    const m = digestEmail(d, 'Luis', 'https://www.energysolec.com');
    expect(m.html).not.toContain('<img');
    expect(m.html).toContain('&lt;img');
    expect(m.html).toContain('a &amp; b');
    expect(m.html).toContain('https://www.energysolec.com/admin/leads/l1');
    expect(m.subject).toBe('Seguimiento comercial: 1 pendiente');
  });
});

it('las planillas sin lead se depuran a los 7 días', () => {
  expect(billPurgeBefore(NOW)).toBe('2026-11-18T15:00:00.000Z');
});

it('resumen legible de una ejecución', () => {
  expect(summaryText({ mensajes: { enviados: 2, fallidos: 0 }, recordatorios: { resumenes: 0 }, depuracion: { omitido: 'sin proveedor' } }))
    .toBe('Correos: 2 enviados · Recordatorios: sin cambios · Depuración: sin proveedor');
});
