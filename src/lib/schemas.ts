import { z } from 'zod';

const phone = z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Número de teléfono no válido');
export const Utm = z.record(z.string(), z.string().max(200)).optional().default({});

export const LeadContact = z.object({
  name: z.string().trim().min(2, 'Ingresa tu nombre').max(120),
  email: z.string().trim().toLowerCase().email('Ingresa un correo válido').max(160),
  phone: phone.optional().or(z.literal('')),
  company: z.string().trim().max(160).optional().or(z.literal('')),
  acceptPrivacy: z.literal(true, { message: 'Debes aceptar la política de privacidad para recibir tu estudio.' }),
  acceptMarketing: z.boolean().default(false),   // autorización comercial separada y opcional (LOPDP)
  utm: Utm,
  website: z.string().max(0).optional(),        // honeypot
  turnstileToken: z.string().max(2048).optional(),
});

export const UnlockBody = LeadContact.extend({ code: z.string().regex(/^ESE-\d{4}-\d{6}$/) });

export const GenericLeadBody = LeadContact.extend({
  source: z.enum(['contacto', 'cotizacion', 'catalogo', 'financiamiento', 'capacitacion', 'servicio']),
  segment: z.enum(['residencial', 'comercial', 'industrial']).optional(),
  city: z.string().trim().max(80).optional(),
  province: z.string().trim().max(60).optional(),
  monthlyBillUsd: z.coerce.number().positive().max(5_000_000).optional(),
  topic: z.string().trim().max(160).optional(),
  message: z.string().trim().max(3000).optional(),
});

export const OrderBody = z.object({
  lines: z.array(z.object({ productId: z.string().min(1).max(64), qty: z.number().int().min(1).max(9999) })).min(1).max(100),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(160),
  phone,
  city: z.string().trim().min(2).max(80),
  address: z.string().trim().min(5).max(300),
  customerType: z.enum(['final', 'instalador', 'distribuidor', 'empresa']),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
  needsInstallation: z.boolean().default(false),
  acceptPrivacy: z.literal(true, { message: 'Debes aceptar la política de privacidad.' }),
  acceptMarketing: z.boolean().default(false),
  utm: Utm,
  website: z.string().max(0).optional(),
  turnstileToken: z.string().max(2048).optional(),
});

export const firstError = (e: z.ZodError) => e.issues[0]?.message ?? 'Datos no válidos';
