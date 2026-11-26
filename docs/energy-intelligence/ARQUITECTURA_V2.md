# Energy Intelligence Engine V2 — Arquitectura consolidada

Energy Solutions Ecuador · `energysolec-web` · rama `tarifas/modulo-v2` · 26 de noviembre de 2026

Entregable de la **Fase 1**: auditoría, arquitectura, modelo de datos, cambios, dependencias, costos operativos y
decisiones pendientes. **No incluye código ni cambios de base de datos.** Integra y reemplaza el alcance de
`docs/tarifas/PROPUESTA_MODULO_TARIFARIO.md`, que sigue vigente como diseño detallado del motor tarifario (Fase 2).

Restricciones que se mantienen en todas las fases:
- trabajo solo en esta rama, sin merge a `main`;
- sin migraciones ni cambios en la base de producción;
- sin contratar proveedores de pago sin autorización;
- nada de precios, tarifas o datos técnicos sin respaldo presentados como validados;
- la IA solo interpreta documentos: todos los cálculos se hacen con código determinista y probado.

---

## 1. Auditoría del sistema existente (respecto a V2)

| Área | Hoy | Brecha frente a V2 |
|---|---|---|
| Flujo del cliente | Asistente de 4 pasos (`wizard.tsx`): segmento y objetivo, ubicación por provincia, consumo (factura, kWh o historial), detalles; registro antes de ver el estudio; PDF por correo | No hay confirmación en mapa, superficies múltiples, opción «no lo sé» por dato ni comparación de tecnologías |
| Lectura de planillas | Claude (`claude-opus-5-5`) con salida estructurada Zod; 8 campos: distribuidora, categoría, período, kWh, valor eléctrico, total, demanda e historial; el cliente confirma; archivo en bucket privado | Faltan franjas horarias, factor de potencia, rubros separados, créditos, saldos, evidencia y confianza por dato; un solo archivo por carga |
| Motor tarifario | Bloques incrementales, demanda plana, «10 % otros cargos»; tarifas editables en sitio | Ver la propuesta tarifaria: pliego 2026 con 4 grupos, franjas, FGD/FGDI, 60 % de DMmax12, FP, Regulación 005/24, versiones |
| Recurso solar | PVGIS-NSRDB, PVGIS-ERA5 y NASA POWER **mensual** (`PVcalc`), se adopta el menor; caché por celda; pérdidas una sola vez | Sin series **horarias** ni secuencias de días nublados: imprescindibles para híbrido, Off Grid y franjas tarifarias |
| Dimensionamiento | Una superficie (m² × m²/kWp fijo de cubierta o terreno); objetivo = consumo diurno o cobertura; autoconsumo mensual limitado por un «% diurno» | Sin geometría de módulo, filas, retiros ni pasillos; sin potencia ideal, máxima y óptima por separado; sin optimización económica |
| Baterías | Heurística: desplaza el excedente diario promedio o cubre horas × kW críticos | Sin despacho horario, SOC mínimo, potencia de descarga, arranques, degradación ni distinción entre beneficio económico y de respaldo |
| Off Grid | No existe | Todo |
| Costos | `pvTiers` (USD/kWp por rango) + USD/kWh de batería + % de ingeniería + IVA + mínimo | Sin desglose por componente, implantación, tecnología, ubicación ni complejidad; sin libro de costos versionado ni márgenes ocultos |
| Catálogo | `products.specs` jsonb libre; productos de ejemplo marcados `is_placeholder` | Sin especificaciones eléctricas tipadas, compatibilidad ni kits de referencia de Ingeniería |
| Finanzas | VAN, TIR, LCOE, payback simple y descontado, ROI, 3 escenarios, reposición de inversor y batería | Reutilizable; falta Off Grid (costo de energía suministrada y confiabilidad) y flujo por alternativa |
| Informe | PDF corporativo de una solución (`report.tsx`) | Falta la comparación de alternativas, superficies, baterías, facturación antes y después por rubro, y fuentes |
| CRM | Lead con estudio, asesor, actividades, etapas | Falta la oportunidad con datos técnicos, la conversión a propuesta y la trazabilidad estudio → cotización → proyecto |
| Seguridad | RLS, buckets privados, URL firmadas, Turnstile, límites por IP, tope diario de lecturas IA (`BILL_DAILY_MAX`), auditoría con actor | Se conserva y se extiende a las tablas nuevas; costos internos y márgenes con RLS más estricta |

---

## 2. Arquitectura consolidada

```
 Cliente (web, móvil)                         Panel (Gerencia · Ingeniería · Ventas)
      │                                                │
      ▼                                                ▼
 ┌──────────────── Capa de datos del proyecto (con procedencia) ─────────────────┐
 │ Planilla (IA → propuesta)  ·  Respuestas del cliente  ·  Mapa/superficies      │
 │ Cada dato: valor · unidad · fuente · evidencia · confianza · estado            │
 └───────────────┬───────────────────────────────────────────────────────────────┘
                 ▼
 ┌─────────────── Motores puros y deterministas (src/lib/engine) ────────────────┐
 │ 1 Tarifario (pliego versionado, factura por rubros, Regulación 005/24)        │
 │ 2 Recurso solar (mensual + horario, por superficie; secuencias críticas)      │
 │ 3 Perfil de carga (planilla, franjas, plantillas por segmento, inventario)    │
 │ 4 Superficies (geometría, densidad, módulos por superficie)                   │
 │ 5 Catálogo y compatibilidad (módulo · inversor · batería)                     │
 │ 6 Simulador horario 8760 (FV → carga → batería → red; despacho)               │
 │ 7 Dimensionamiento: On Grid · Hybrid · Off Grid (ideal · máxima · óptima)     │
 │ 8 Costos (libro versionado, partidas por impulsor)                            │
 │ 9 Finanzas (VAN, TIR, LCOE, flujo 25 años, reposiciones, escenarios)          │
 │ 10 Comparador y recomendador (factibilidad, objetivos, explicación)           │
 └───────────────┬───────────────────────────────────────────────────────────────┘
                 ▼
  Estudio inmutable (copias exactas: tarifa, recurso, libro de costos, equipos, versiones)
                 ▼
  Informe PDF · Oportunidad en el CRM · Conversión a propuesta (Ingeniería y Ventas)
```

Principios:
1. **IA solo para interpretar.** La planilla produce una *propuesta* de datos con evidencia; el código la valida y el cliente la confirma. Nada se calcula con la IA.
2. **Procedencia por dato.** Fuentes posibles: `planilla`, `cliente`, `mapa`, `supuesto`, `catalogo`, `normativa` o `ingenieria`. Estados posibles: `pendiente`, `confirmado` o `validado`. Lo que el cliente no sabe queda `pendiente` y se resuelve con un supuesto declarado y una advertencia.
3. **Estudio inmutable.** Guarda las versiones de pliego, libro de costos, equipos y parámetros, y el motor con que se calculó. Recalcular crea un estudio nuevo.
4. **Factibilidad antes que recomendación.** Una alternativa inviable no se muestra como opción: se explica por qué.
5. **Compatibilidad.** El motor v1 actual sigue activo hasta que la Gerencia valide los datos de V2; un interruptor de despliegue elige el motor.

---

## 3. Motores (diseño técnico)

### 3.1 Recurso solar horario
- **Serie horaria de año típico por superficie** (orientación e inclinación propias) con PVGIS `seriescalc` (`loss=0`, como hoy) y NASA POWER horario. Las series se normalizan (hora local UTC−5 o UTC−6 en Galápagos, unidades, irradiancia en plano y temperatura) y se comparan por energía mensual. Se adopta la fuente más baja, como exige la regla 4 del negocio.
- **Off Grid:** NASA POWER diario de varios años (≥ 10) para encontrar el mes crítico y la peor secuencia de N días consecutivos de baja irradiación. El dimensionamiento usa esas secuencias, no promedios anuales.
- **Caché:** se amplía `solar_resource_cache` con el perfil horario comprimido (8760 valores por superficie normalizada a 1 kWp).
- **Pérdidas:** una sola vez (suciedad, sombreado de la superficie, cableado, inversor, disponibilidad) y temperatura desde la serie. Degradación anual en finanzas.

### 3.2 Perfil de carga
- **Con planilla:** kWh mensuales (12 meses si hay historial) repartidos por hora con plantillas por segmento. Si la planilla trae franjas (punta, media, base y fin de semana) o una curva de carga (industrial), esos datos mandan y la plantilla solo reparte dentro de cada franja.
- **Sin planilla (Off Grid):** inventario de equipos (cantidad, W, W de arranque, horas por día, uso nocturno, crítico) a partir de una lista con valores típicos editables, marcados como `supuesto`.
- **Plantillas:** se versionan y las valida Ingeniería. Hasta entonces llevan una advertencia.

### 3.3 Superficies
Para cada superficie se calcula:
- **Área útil** = área bruta − retiros − pasillos − obstáculos. Si el cliente solo da un área aproximada, se aplica un factor de aprovechamiento por tipo de implantación, como `supuesto`.
- **Distribución:** con dimensiones y polígono, se colocan módulos del catálogo (vertical u horizontal) en una grilla con separación entre filas. En inclinadas sobre losa o suelo, la separación sale del ángulo de sombra mínimo configurado; en Ecuador, cerca del ecuador, suelen bastar inclinaciones bajas.
- **Resultados por superficie:** módulos máximos, kWp, generación horaria y anual, área usada y restante, y costo de implantación (del libro de costos).
- **Combinación de superficies:** se ordenan por costo nivelado de la energía de cada una (costo ÷ energía) y se llenan hasta la potencia recomendada.

### 3.4 Simulador horario (núcleo común)
Cada hora del año: FV de cada superficie → carga → batería (si hay) → red (importación o exportación) → cortes de red (híbrido/Off Grid).

- **Resultado:** kWh por franja tarifaria, autoconsumo instantáneo, carga y descarga, SOC, energía no suministrada y demanda máxima tomada de la red por mes.
- **Ritmo:** unos milisegundos por año simulado en el servidor, lo que permite barridos de optimización.
- **Facturación:** el motor tarifario calcula la factura de cada mes antes y después, por rubros.
- **Compensación de excedentes:** solo con la Regulación 005/24 declarada y aplicable (créditos en kWh, reinicio a los 24 meses, energía equivalente en tarifas horarias). Sin ella, los excedentes valen $0.

### 3.5 On Grid
| Potencia | Cálculo |
|---|---|
| **A. Ideal** | La que cubre el consumo anual. Con 005/24, la producción anual no puede superarlo (art. 9). Sin compensación, la que maximiza el autoconsumo sin excedentes significativos |
| **B. Máxima instalable** | Suma de las superficies útiles con el módulo de referencia |
| **C. Óptima económica** | Barrido de kWp entre 0 y mín(A, B) que maximiza el VAN del escenario base con la tarifa real; se informa también la de menor inversión y la de mejor TIR |
| **D. Recomendada** | C, salvo que el objetivo del cliente pida otra; se explica la elección |

Además:
- **Inyección cero:** el excedente se recorta en cada hora y el inversor se limita.
- **Métricas que se separan:** cobertura energética anual, autoconsumo, reducción de la factura (USD) y ahorro (USD).
- **Factura:** nunca se promete $0 si quedan cargos no compensables (comercialización, demanda, terceros).
- **Aviso fijo:** sin respaldo durante apagones.

### 3.6 Hybrid
- **Modos de respaldo:** cargas esenciales, parcial, total o autonomía personalizada (2, 4, 6, 8, 12 o 24 h).
- **Dimensionamiento:**
  - potencia del inversor híbrido y potencia de respaldo ≥ cargas en simultáneo;
  - arranque ≤ potencia pico del inversor y de la batería;
  - capacidad útil = energía de respaldo ÷ (DoD × eficiencia), con reserva mínima de SOC;
  - recarga diaria posible con la FV disponible;
  - degradación anual y reposición en el año en que la capacidad baja del umbral.
- **Despacho simulado:** autoconsumo; reserva para respaldo; arbitraje por franja solo si la diferencia de precios cubre las pérdidas de ida y vuelta (con el pliego 2026 casi nunca, y así se dirá); reducción de picos **solo** con datos horarios de demanda que la demuestren.
- **Beneficio separado:** el económico (ahorro adicional por almacenar) y el de continuidad (horas de respaldo; costo por kWh de respaldo). No se suman como si fueran lo mismo.

### 3.7 Off Grid
- **Entrada:** inventario de equipos o consumo histórico, autonomía requerida, cargas críticas y nivel de confiabilidad deseado.
- **Simulación:** año típico horario más la peor secuencia de días nublados.
- **Búsqueda:** la combinación mínima (kWp, kWh, inversor) que cumple la **probabilidad de pérdida de carga** objetivo (LOLP, configurable por segmento) y la autonomía.
- **Indicadores:** energía no suministrada, días de autonomía reales, costo de la energía suministrada (USD/kWh a 25 años con reposiciones) y confiabilidad.
- **Sin planilla ni alternativa comparable:** no se muestra «retorno de inversión». Si el cliente indica una alternativa (generador, extensión de red) con su costo, se compara.
- **Superficie insuficiente:** se muestra la autonomía y la confiabilidad alcanzables y las opciones (reducir cargas, más superficie o generador de respaldo). Nunca se declara independencia garantizada sin cumplir el objetivo de confiabilidad.

### 3.8 Costos
- **Libro de costos versionado** (provisional → validado por Gerencia → histórico). Partidas por categoría: módulos, inversores, estructuras, baterías, protecciones DC y AC, cableado, canalizaciones, puesta a tierra, monitoreo, mano de obra, ingeniería, permisos, obra civil, logística, equipos de montaje, pruebas, margen e impuestos.
- **Impulsor de cada partida:** fijo, por kWp, por módulo, por kWh de almacenamiento, por unidad de obra o porcentaje.
- **Filtros:** tecnología, tipo de implantación, rango de potencia, provincia (factor de ubicación) y complejidad.
- **Modo EPC integral:** un precio por kWp que **excluye** las partidas que ya contiene (marcadas), para no duplicar.
- **Alcances adicionales** nunca incluidos en silencio: transformador, subestación, refuerzo estructural, interconexión especial. Se muestran como «no incluido — requiere evaluación».
- **Reglas de cotización personalizada** (p. ej. potencia mayor que X, implantación flotante, media tensión sin transformador identificado): el estudio muestra un rango y pide visita, en lugar de una cifra.
- **Visibilidad:** el cliente ve precios finales por alternativa. Costos internos y márgenes solo los ven Gerencia y superadministración.

### 3.9 Comparador
- **Factibilidad:** cada alternativa se evalúa contra superficie, compatibilidad, confiabilidad y datos mínimos.
- **Etiquetas:** menor inversión, mayor ahorro, mejor retorno, mayor autonomía y mayor independencia, calculadas, no redactadas.
- **Recomendación:** la que mejor cumple el objetivo del cliente, con una explicación generada desde reglas.
- **Alternativas no aplicables:** se omiten con su motivo (p. ej. «Off Grid no recomendado: requiere 3,2 veces la superficie disponible»).

### 3.10 Lectura de planillas v2
- **Entrada:** varios archivos (PDF digital o escaneado, fotos, varias páginas), ≤ 4 MB cada uno por el límite de Vercel; el navegador reduce las fotos. Claude lee PDF e imágenes directamente: no hace falta un servicio de OCR aparte.
- **Esquema ampliado:** cada campo trae `{ valor, página, texto de respaldo, confianza }`.
  - **Generales:** distribuidora o unidad de negocio, categoría, nivel de tensión, período, kWh del mes e historial.
  - **Demanda y franjas:** demanda registrada y facturada (con historial), kWh por franja y factor de potencia.
  - **Rubros:** energía, demanda, comercialización, alumbrado, subsidios, penalizaciones, otros cargos, créditos energéticos, total, deudas y saldos.
- **Ubicación:** solo se extraen provincia, cantón y parroquia; **nunca** la dirección ni identificadores personales. La ubicación exacta la confirma el cliente en el mapa.
- **Validación determinista:**
  - la suma de rubros cuadra con el total;
  - los kWh y la demanda, pasados por el pliego de la distribuidora detectada, reproducen el rubro de energía y demanda (si no, se marca categoría dudosa);
  - el historial es coherente;
  - los datos de confianza baja quedan `pendiente`.
- **Control de costos:** tope diario global (`BILL_DAILY_MAX`), límite por IP, Turnstile, máximo de páginas por carga y modelo configurable (decisión C3).

---

## 4. Modelo de datos (migraciones aditivas, en orden)

Tablas del **motor tarifario** (`0012`): ver la propuesta tarifaria, sección 3.1: `tariff_schedules`, `distributors`, `distributor_coverage`, `tariff_groups`, ampliación de `tariffs`, `tariff_period_schemes`, `holidays`, `third_party_charges`, `subsidies`.

Nuevas para V2 (`0013` y siguientes):

```
mounting_types            -- catálogo de implantación (10 iniciales)
  code, name, client_description, image_paths[], is_illustrative, density_defaults jsonb
  (factor de aprovechamiento, separación de filas, inclinación típica), requires_engineering, active

pv_module_specs           product_id → pmax_w, length_mm, width_mm, efficiency, gamma_pmax, voc, vmp, isc, imp,
                          bifaciality, degradation_y1, degradation_yearly, product_warranty_y, power_warranty_y, source_doc
inverter_specs            product_id → technology (string|hibrido|offgrid|micro), ac_kw, phases, voltage, mppt_count,
                          vdc_max, mppt_vmin, mppt_vmax, idc_max_per_mppt, efficiency, battery_compatible,
                          backup_kw, surge_kw, parallel_max, source_doc
battery_specs             product_id → nominal_kwh, usable_kwh, cont_kw, peak_kw, voltage, dod, roundtrip, cycles,
                          warranty_y, eol_capacity, source_doc
equipment_compatibility   inverter_id, battery_id, verified_by, source_doc
reference_kits            segment, technology, module_id, inverter_id, battery_id, status, validated_by

cost_books                version, status (provisional|validado|historico), validated_by/at, notes
cost_items                book_id, category, technology, mounting_type, kwp_from, kwp_to, driver
                          (fijo|kwp|modulo|kwh|unidad|porcentaje), value, unit, province_factor jsonb, included_in_epc bool
cost_rules                book_id, kind (cotizacion_personalizada|alcance_adicional), condition jsonb, message
cost_margins              book_id, technology, margin_pct          -- RLS: solo gerencia/superadmin

study_sites               study_id, lat, lng, province, canton, confirmed_by_user, source
study_surfaces            study_id, mounting_type, area_gross_m2, area_usable_m2, polygon geojson, dims,
                          azimuth, tilt, shading, obstacles, setbacks_m, aisles, access_notes, structural_notes, provenance
study_loads               study_id, name, qty, power_w, surge_w, hours_day, night_share, critical   (Off Grid)
study_data_points         study_id, key, value jsonb, unit, source, evidence jsonb, confidence, status, validated_by
study_alternatives        study_id, technology, feasible, reason, sizing jsonb, simulation_summary jsonb,
                          client_price jsonb, finance jsonb, labels text[], limitations text[], recommended
study_costs_internal      alternative_id, cost_book_version, breakdown jsonb, margin jsonb   -- RLS estricta
solar_studies (existente) + engine_version, objectives jsonb, snapshots jsonb (tarifa, recurso, equipos, parámetros)

opportunities             lead_id, study_id, stage, technology, kwp, kwh, price_estimate, saving_estimate,
                          autonomy_h, restrictions text[], confidence, advisor_id
quotes                    opportunity_id, version, status, items jsonb, created_by    -- propuesta personalizada
                          (vínculo posterior a projects cuando se ejecute)
```

**RLS** (en espejo de `PERMS`):
- catálogos y libro de costos: los escribe Ingeniería o Compras; los valida Gerencia;
- `cost_margins` y `study_costs_internal`: solo Gerencia y superadmin;
- `study_*` y `opportunities`: Ventas (sus leads), Ingeniería y Gerencia;
- ninguna tabla es legible con la clave pública;
- funciones con la regla de la 0011.

**Validación con rol** por disparador en la base, como los pagos: libros de costos, pliegos y kits.

---

## 5. Experiencia del cliente (flujo)

1. **Planilla:** subir la planilla o fotos, o elegir «no tengo planilla» (el asistente de equipos lleva a Off Grid o híbrido).
2. **Revisión:** «Esto leímos» con los datos destacados; cada uno se puede corregir o marcar como «no sé».
3. **Ubicación:** mapa con el punto sugerido por cantón; el cliente lo ajusta.
4. **Dónde van los paneles:** tarjetas con imagen por tipo («techo de metal», «losa», «terreno», «parqueadero»…), sin términos técnicos. Para cada una, «área aproximada» o «dibujar en el mapa».
5. **Objetivos:** «ahorrar en la factura», «tener luz en apagones (¿cuántas horas?)», «no depender de la red», «menor inversión».
6. **Registro:** datos de contacto y consentimientos, igual que hoy.
7. **Comparación:** 1 a 3 alternativas con la recomendada destacada, su motivo y las limitaciones visibles.
8. **Informe:** descarga del PDF y botón de visita técnica.

Las imágenes de implantación serán **fotos de proyectos propios autorizadas** o **ilustraciones genéricas marcadas
como ilustrativas**; no se usan fotos de terceros (decisión D8).

---

## 6. Cambios necesarios en el repositorio

- **Motores nuevos y puros** en `src/lib/engine/`: `billing`, `periods`, `net-metering`, `hourly`, `load-profile`, `surfaces`, `dispatch`, `ongrid`, `hybrid`, `offgrid`, `costs` y `compare`, cada uno con pruebas.
- **`finance.ts`:** se generaliza sin cambiar los resultados de v1 (prueba de regresión).
- **Store:** operaciones nuevas en las dos implementaciones; `.data/dev-db.json` con datos de prueba marcados.
- **Panel:**
  - `/admin/costos`: libros, partidas, simulación de precios e importación CSV/Excel;
  - `/admin/equipos`: especificaciones tipadas, compatibilidad y kits;
  - `/admin/implantacion`;
  - `/admin/tarifas` y `/admin/distribuidoras` (Fase 2);
  - oportunidades y propuestas en la ficha del lead.
- **Público:** nuevo asistente `/calculadora` v2. El actual sigue disponible tras el interruptor hasta la validación.
- **PDF:** plantilla nueva de varias secciones con gráficos SVG generados en el servidor.
- **Pruebas:** unitarias, integración Supabase, e2e de escritorio y móvil, y los 25 casos del punto 15 de la especificación, más regresión de estudios existentes.

---

## 7. Dependencias

| Necesidad | Opción propuesta | Costo |
|---|---|---|
| Excel y CSV (importar y exportar) | `exceljs` y `papaparse` (licencias MIT) | Sin costo |
| Mapa satelital y dibujo de polígonos | `maplibre-gl` o `leaflet` + `terra-draw`, con `@turf/area` para medir | Las librerías no cuestan; **las imágenes satelitales sí requieren un proveedor** (decisión D4) |
| Series horarias | PVGIS `seriescalc` y NASA POWER horario y diario: API públicas sin clave, hosts ya permitidos | Sin costo; con límites de uso, se cachea |
| Lectura de planillas | API de Claude (ya integrada) | Ver sección 8 |
| PDF y gráficos | `@react-pdf/renderer` (ya instalado) con SVG propio | Sin costo |
| Optimización | Barridos deterministas en código, sin librerías de optimización | — |

---

## 8. Costos operativos (estimaciones por medir, no compromisos)

**Lectura de una planilla con IA.** Precios publicados de la API por millón de tokens (entrada / salida):
- `claude-opus-5-5` (el actual): USD 4 / 20.
- `claude-sonnet-5-5`: USD 2 / 10.
- `claude-haiku-5-5`: USD 0,10 / 0,50.

Supuestos para el cálculo, a medir con `count_tokens` y con planillas reales:
- una planilla de 2 páginas ≈ 4 000 a 8 000 tokens de entrada, porque cada página de PDF entra como texto e imagen;
- instrucciones ≈ 1 500 tokens;
- respuesta con evidencia por campo ≈ 2 000 a 4 000 tokens, más el razonamiento del modelo.

| Modelo | Costo estimado por planilla |
|---|---|
| Opus 5.5 | **≈ USD 0,05 a 0,15** |
| Sonnet 5.5 | ≈ USD 0,03 a 0,08 |
| Haiku 5.5 | ≈ USD 0,003 a 0,01 |

Con el tope diario actual de 200 lecturas, el peor caso con Opus es de unos USD 30 por día. El modelo se elige con una evaluación de 20 a 30 planillas reales (decisión C3). La evaluación también cuesta tokens, así que la ejecuto solo con tu autorización.

**Otros servicios:**
- **PVGIS y NASA POWER:** gratuitos.
- **Supabase y Vercel:** el uso crece por archivos y cómputo. Para uso comercial Vercel exige el plan Pro. Precios por verificar en su sitio.
- **Imágenes satelitales:** según el proveedor (D4); no se contrata nada sin tu autorización.
- **Correo (Resend):** pendiente desde antes.

---

## 9. Plan por fases (cada una en la rama, con aprobación antes de la siguiente)

| Fase | Entregable | Criterio de cierre |
|---|---|---|
| 1 | Este documento | Aprobación de arquitectura y decisiones |
| 2 | Motor tarifario nacional (propuesta tarifaria) y lectura de planillas v2 | Pliego 2026-Q4 importado como provisional; facturas reales reproducidas (≤ 1 % en rubros del SPEE) |
| 3 | Catálogo de implantación, especificaciones de equipos y compatibilidad | Kits de referencia cargados por Ingeniería; incompatibilidades rechazadas en pruebas |
| 4 | Superficies y On Grid (ideal, máxima, óptima y recomendada; inyección cero) | Casos On Grid residencial, comercial e industrial; superficie insuficiente; superficies mixtas |
| 5 | Híbrido y almacenamiento | Respaldo por horas, arranques, batería insuficiente, reposición, despacho |
| 6 | Off Grid y confiabilidad | Sin planilla, con historial, mes crítico, LOLP, superficie insuficiente |
| 7 | Motor de costos diferenciado y panel «Costos y dimensionamiento» | Comparación por implantación, sin duplicar EPC, reglas de cotización personalizada |
| 8 | Interfaz pública y comparación | e2e escritorio y móvil, «no sé» en todos los datos |
| 9 | Informe PDF, CRM y propuestas | Trazabilidad estudio → oportunidad → cotización |
| 10 | Pruebas integrales y propuesta de despliegue | Los 25 casos del punto 15 y la regresión v1; plan de despliegue para tu autorización |

---

## 10. Decisiones pendientes

**A. Arquitectura**
- A1. Aprobar la arquitectura, el modelo de datos y el orden de fases.

**B. Pendientes de la propuesta tarifaria**
- B1. Planillas reales sin datos personales (ahora también para evaluar la lectura con IA).
- B2. Tarifa de la dignidad y alumbrado público: fuera del cálculo con advertencia hasta tener documento (recomendado).
- B3. Cobertura de distribuidoras por cantón: listado oficial, o lo compilo como provisional.
- B4. Base de pruebas en Supabase para las vistas previas de Vercel, o solo local y CI.

**C. Inteligencia artificial**
- C1. ¿Se mantiene la lectura con IA en producción? Requiere `ANTHROPIC_API_KEY`, que hoy no está configurada.
- C2. Tope de gasto mensual y tope diario de lecturas.
- C3. Autorización para una evaluación con 20 a 30 planillas (costo estimado < USD 5) para elegir el modelo.

**D. Producto y datos**
- D4. Proveedor de imágenes satelitales (requiere cuenta y aceptar sus términos), o empezar solo con «área aproximada».
- D5. **Libro de costos inicial:** precios reales por partida, implantación y tecnología, que debe entregar Gerencia o Compras. Hasta entonces las inversiones se muestran como **provisionales**, igual que hoy.
- D6. **Equipos de referencia:** marcas y modelos con fichas técnicas, definidos por Ingeniería; el catálogo actual tiene productos de ejemplo.
- D7. **Criterios de ingeniería:**
  - LOLP objetivo para Off Grid (p. ej. ≤ 1 % residencial, ≤ 0,1 % crítico);
  - días de autonomía por defecto;
  - SOC mínimo de reserva;
  - factores de aprovechamiento por implantación.
- D8. Imágenes de implantación: fotos de proyectos propios autorizadas, o ilustraciones genéricas.
- D9. Política de retención de polígonos y coordenadas: son datos personales según la LOPDP. Hay que ajustar el texto de privacidad.
- D10. Plan Pro de Vercel, requerido para uso comercial.
