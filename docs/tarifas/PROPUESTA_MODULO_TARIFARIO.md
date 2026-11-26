# Ampliación del módulo tarifario — Auditoría, normativa y propuesta

Energy Solutions Ecuador · plataforma `energysolec-web` · 26 de noviembre de 2026

Documento previo a la implementación (entregables 1 a 4 y esquema de 7 y 8). **No cambia producción.** Cada commit en
`main` se despliega solo en Vercel, así que todo el trabajo irá en la rama `tarifas/modulo-v2` y solo llegará a `main`
con tu autorización expresa.

---

## 0. Resumen

| | |
|---|---|
| **Estado actual** | 4 tarifas provisionales con un solo precio de energía por bloque, un cargo de demanda plano y un «10 % de otros cargos». No hay distribuidoras, horarios, temporadas, factores de gestión de la demanda, mínimo de demanda facturable, factor de potencia ni versiones. |
| **Lo más grave** | Editar una tarifa **la sobrescribe**, y los estudios no guardan qué valores usaron. Además, la compensación de excedentes del motor no sigue la Regulación ARCONEL-005/24 (créditos en kWh acumulables 24 meses), y la opción «precio fijo por kWh exportado» no tiene respaldo para consumidores regulados. |
| **Normativa vigente localizada** | Pliego Tarifario del SPEE 2026 **codificado** (Res. ARCONEL-023/25, 029/25 y 009/26), vigente del 01-10-2026 al 31-12-2026, y la Regulación ARCONEL-005/24 codificada (generación distribuida para autoabastecimiento). Ambas leídas en su texto oficial. |
| **Propuesta** | Pliegos versionados → grupos de distribuidoras → tarifas inmutables con cargos separados (energía por bloque, período y temporada; demanda con su factor; comercialización; pérdidas en transformador; factor de potencia; subsidio cruzado; cargos de terceros). Un motor de factura nuevo y puro, y la simulación de la Regulación 005/24. |
| **Migración** | Solo aditiva (`0012`): tablas y columnas nuevas, sin borrar nada. El motor nuevo se activa con un interruptor y el actual queda como respaldo. |
| **Necesito de ti** | Las decisiones de la sección 9, en especial planillas reales para validar y el criterio sobre la tarifa de la dignidad y el alumbrado público. |

---

## 1. Auditoría del motor tarifario existente

Archivos: `src/lib/engine/tariff.ts`, `finance.ts`, `solar.ts`, `study.ts`, `default-tariffs.ts`,
`src/lib/services/tariff-form.ts`, `src/app/api/study/route.ts`, tabla `tariffs` (`0001_schema.sql`).

| # | Hallazgo | Efecto | Gravedad |
|---|---|---|---|
| A1 | `saveTariff` hace `upsert` por id: editar una tarifa **reemplaza** sus valores. | No hay historial; una corrección cambia el pasado. | Alta |
| A2 | `solar_studies.tariff_id` existe pero **nunca se llena**; el estudio solo guarda código, nombre y nota en `results.tariff`. | Las cifras del estudio se conservan, pero no se puede reconstruir con qué valores se calcularon. | Alta |
| A3 | La compensación `net_balance` compensa **dentro del mismo mes** y descarta el saldo. La Regulación 005/24 acumula créditos (SEA) hasta 24 meses. | Subestima el ahorro cuando hay excedentes estacionales. | Alta |
| A4 | `fixed_price` (pago por kWh exportado) no tiene respaldo: la 005/24 dice que el saldo se reinicia «sin que la Distribuidora deba otorgar una compensación económica». | Ahorros sin base regulatoria si alguien la activa. | Alta |
| A5 | Sin períodos horarios: las tarifas «con demanda horaria» (BT > 10 kW, todo MT y AT) usan un precio único. | La industria en MT paga 0,1178 / 0,1318 / 0,1001 USD/kWh según el período; el valor provisional actual (0,08) se aleja mucho. | Alta |
| A6 | Sin factores de gestión de la demanda (FGD, FGDI, FGDVE) ni el mínimo de demanda facturable (60 % de la máxima de 12 meses). | El cargo por demanda sale mal calculado. | Media |
| A7 | `demandSavingsFromPv = true` resta un 10 % arbitrario a la demanda. | Supuesto sin base; contradice «no asumir reducción de demanda». | Media |
| A8 | `other_charges_pct` (10 %) mezcla alumbrado, bomberos y otros, y lo aplica sobre energía y demanda. | Los cargos de terceros no son del pliego: dependen del municipio y del régimen del alumbrado (SAPG). | Media |
| A9 | Primer bloque residencial a 0,04 USD/kWh hasta 130 kWh («tarifa dignidad»). | El pliego 2026 cobra 0,091 USD/kWh (0,078 en EEQ) en 1-50 kWh. La dignidad es un subsidio con requisitos, no la tarifa base. | Media |
| A10 | Sin temporadas: la Costa (CNEL y Galápagos) tiene bloques residenciales distintos de diciembre a mayo. | Error estacional en residencial de alto consumo. | Media |
| A11 | Sin recargo del 2 % para MT medido en BT, ni penalización por factor de potencia < 0,94. | Factura subestimada en esos casos. | Baja |
| A12 | La distribuidora elegida en la calculadora **no se usa** para escoger la tarifa (`api/study` elige por segmento). | Quito y la Sierra tienen precios distintos en los mismos rangos. | Media |
| A13 | Sin subsidio cruzado residencial (Anexo 2): sobre el umbral de cada distribuidora el usuario aporta un porcentaje. | Bajar del umbral con generación propia también ahorra ese aporte. | Baja |
| A14 | El modelo mensual supone que la generación cubre el «consumo diurno» con un solo % por segmento. | No distingue punta/media/base, donde el precio cambia y casi no hay sol en punta (18:00-22:00). | Media |

Lo que **sí** está bien y se conserva: bloques incrementales con validación de continuidad (el pliego dice «cargos
incrementales»), la factura nunca llega a cero (comercialización siempre se paga, como exige el pliego 4.6.1 d), la
demanda no se reduce por defecto, los escenarios, el VAN, la TIR y el LCOE, y las advertencias de tarifa provisional.

---

## 2. Documentación normativa oficial localizada

Todas descargadas de sitios oficiales y leídas en su texto completo.

| Documento | Fuente | Qué establece |
|---|---|---|
| **Pliego Tarifario del SPEE 2026 — codificado** (Res. ARCONEL-023/25 del 28-11-2025, 029/25 del 31-12-2025 y 009/26 del 29-09-2026), 43 p. | [arconel.gob.ec](https://arconel.gob.ec/wp-content/uploads/downloads/2026/09/pliego_tarifario_spee_2026_codificado_1.pdf) | Estructura, cargos y régimen tarifario. **Vigencia: 01-10-2026 a 31-12-2026** (numeral 7). |
| Res. ARCONEL-029/25 y anexos | [cnelep.gob.ec](https://www.cnelep.gob.ec/wp-content/uploads/2026/01/Resoluci%C3%B3n-Nro.-ARCONEL-029-2025-y-anexos-cert-signed.pdf) | Ratifica el pliego para 2026 y mantiene los mecanismos de cobro del alumbrado público general (SAPG) de 2025. |
| Res. ARCONEL-003/2026 | [arconel.gob.ec](https://arconel.gob.ec/wp-content/uploads/downloads/2026/02/Resolucion-Nro.-ARCONEL-003-2026-y-su-anexo.pdf) | Incentivo tarifario para la movilidad eléctrica (no cambia las tarifas generales). |
| **Regulación ARCONEL-005/24 codificada** — generación distribuida para autoabastecimiento de consumidores regulados | [arconel.gob.ec](https://arconel.gob.ec/wp-content/uploads/downloads/2024/10/Regulacion-005_24-Codificada-signed-1.pdf) | Modalidades, balance neto, créditos de energía y facturación con SGDA. Vigente según el listado de abril de 2026. |
| Listado de regulaciones vigentes (23-04-2026) | [arconel.gob.ec](https://arconel.gob.ec/wp-content/uploads/downloads/2026/04/Regulaciones_vigentes_23ABRIL26.pdf) | Confirma la vigencia de 005/24 y de la Regulación 004/24 (régimen económico y tarifario). |

### 2.1 Lo que dice el pliego 2026 (extracto verificado)

- **Categorías:** Residencial y General. General se divide en comercial, industrial y «otros»: entidades oficiales, asistencia social, beneficio público, culto, bombeo, escenarios deportivos, servicio comunitario, abonados especiales, vehículos eléctricos y estaciones de carga.
- **Niveles de voltaje:** BV ≤ 0,6 kV; MV hasta 40 kV; AV1 de 40 a 138 kV; AV2 > 138 kV.
- **Tipos de tarifa:** sin demanda (hasta 10 kW), con demanda, con demanda horaria (dos franjas: 08-22 y 22-08) y con demanda horaria diferenciada (industrial MV/AV, SPAP, VE). No todas existen en cada nivel ni para cada grupo: lo indica la tabla del numeral 4.2.
- **Períodos:** punta 18:00-22:00, media 08:00-18:00, base 22:00-08:00. En la diferenciada:
  - lunes a viernes, tres precios: 08-18, 18-22 y 22-08;
  - el precio de 22-08 también se aplica a sábados, domingos y feriados de 22:00 a 18:00;
  - sábados, domingos y feriados de 18:00 a 22:00 tienen precio propio.
  - Los vehículos eléctricos usan otra combinación (L-D 18-22 como punta).
- **Bloques:** «cargos incrementales» en residencial y general sin demanda: cada kWh paga el precio de su bloque.
  - Residencial: 1-50, 51-100, … 351-500, 501-700, 701-1000, 1001-1500, 1501-2500, 2501-3500 y superior.
  - Comercial sin demanda: 1-300 y superior.
- **Grupos de distribuidoras del Anexo 1** (precios distintos):
  1. Ambato, Azogues, CNEL Bolívar, CentroSur, Cotopaxi, Norte, Riobamba y Sur.
  2. CNEL El Oro, Esmeraldas, Guayas-Los Ríos, Los Ríos, Manabí, Milagro, Santa Elena, Santo Domingo y Sucumbíos, más Galápagos. Residencial **estacional**: los bloques 501-700 y 701-1000 bajan de 0,1285 / 0,1450 a 0,1050 / 0,1109 de diciembre a mayo.
  3. CNEL UN Guayaquil, con tablas propias.
  4. Empresa Eléctrica Quito: residencial 1-50 a 0,078, 51-100 a 0,081 y 101-150 a 0,083; comercial sin demanda 1-300 a 0,081.
- **Ejemplos de cargos (grupo 1):**
  - Comercialización: 1,414 USD/consumidor-mes.
  - Demanda: BT con demanda 4,790 USD/kW-mes; MV con demanda horaria 4,576; AV 4,400; AV2 4,300.
  - Industrial MV diferenciada: 0,1178 / 0,1318 / 0,1001 / 0,1178 USD/kWh.
- **Demanda facturable (4.6.4.1):** la máxima del mes, con un mínimo del 60 % de la máxima de los últimos 12 meses. En bombeo agrícola y acuícola se usa la del mes, sin mínimo.
- **Factores de gestión (4.6.5)** con DP (máxima en 18-22) sobre DM (máxima del mes):
  - FGD = máx(0,6; DP/DM).
  - FGDI = 0,50 si DP/DM < 0,6; 0,5833·r + 0,4167·r² entre 0,6 y 0,9; 1,00 por encima de 0,9.
  - FGDVE = 0,60 si la máxima es en media o base; 1,00 si es en punta.
- **Factor de potencia (4.6.6):** sin penalización si FP ≥ 0,94. Si no, PBFP = (0,94/FP − 1) × la factura del SPEE inicial. Con FP < 0,60 la distribuidora puede suspender el servicio.
- **Recargo del 2 % (4.4):** se aplica a potencia y energía cuando un consumidor de MV se mide en BV.
- **Factura del SPEE (6):** energía + potencia + pérdidas en transformador + comercialización + PBFP. El alumbrado público, la dignidad y otros subsidios o compensaciones del Estado son **rubros aparte** de la planilla.
- **Subsidio cruzado (Anexo 2):** umbrales por distribuidora, en kWh-mes por usuario:
  - EEQ: reciben hasta 130 y aportan sobre 160.
  - CentroSur: reciben hasta 90 y aportan sobre 100.
  - CNEL Guayaquil: reciben hasta 130 y aportan sobre 250.
  - Porcentaje de aporte: 10 % para las empresas eléctricas, 5 % para Guayaquil y 10 % para el resto de CNEL. La disposición de la tabla es ambigua; se confirmará fila por fila al importarla.

### 2.2 Lo que dice la Regulación 005/24 (generación distribuida)

- **Modalidades:** 1a (individual local), 1b (múltiple local) y 2a, 2b y 2c (remotas).
- **Potencia (art. 7):**
  - Con inyección a la red, limitada por la capacidad de la red en el punto de conexión.
  - Sin inyección, limitada por la demanda máxima del consumidor.
  - La producción anual no debe superar el consumo anual (art. 9).
- **Residencial y general sin demanda (art. 27.1):**
  - Si la energía neta del mes es ≤ 0, la energía facturable es 0 y el sobrante pasa a crédito en kWh.
  - Si es > 0, se descuenta del saldo acumulado.
  - El saldo **se reinicia a cero cada 24 meses** desde la puesta en marcha, sin pago.
  - La comercialización siempre se paga.
- **General con demanda (27.2):** la energía se trata igual que en 27.1. La demanda y la comercialización se facturan siempre. La demanda facturable pasa a ser **la máxima tomada de la red** (D_red).
- **Con demanda horaria (27.3, Anexo E):**
  - Se usa la energía **equivalente** Σ(E_k·T_k)/T_m, donde T_m es el mayor cargo horario.
  - Si queda saldo a pagar, se cobra al mayor cargo horario (T_m).
  - Los créditos se reinician igual a los 24 meses.
- **Medición en BT con transformador (art. 28):** la energía entregada se reduce en un 2 %.

### 2.3 Lo que no se pudo verificar con documento oficial (queda provisional)

| Tema | Situación | Tratamiento propuesto |
|---|---|---|
| Tarifa de la dignidad (precio, umbrales 110 kWh Sierra / 130 kWh Costa, regla de 11 de 12 meses) | Solo fuentes de prensa y calculadoras; no está en el pliego. | Subsidio configurable por distribuidora, **provisional y desactivado** hasta tener el decreto o la resolución. |
| Alumbrado público (SAPG), bomberos, recolección de basura | Mecanismo de cobro ratificado para 2026, pero el valor depende del municipio o la ordenanza. | Cargos de terceros por distribuidora o cantón, cargados por Gerencia con su fuente; se estiman desde la planilla del cliente cuando la sube. |
| Reforma del Reglamento de la LOSPEE (septiembre 2026) sobre autoabastecimiento | Hay noticias de una reforma que amplía la inyección a la red; no confirmé si modifica la 005/24. | Revisar antes de validar el módulo; el motor sigue la 005/24 codificada. |
| Calendario de feriados nacionales | Lo fija el Gobierno cada año. | Tabla `holidays` por año, cargada con su fuente. |
| Área de servicio por cantón | ARCONEL y las distribuidoras publican sus áreas, pero no las tengo en formato de datos. | Sugerencia por provincia, con excepciones por cantón donde haya dos distribuidoras; provisional hasta validarla. |
| Pliego 2027 | Aún no aprobado; ARCONEL suele aprobarlo en noviembre o diciembre. | El modelo de pliegos versionados lo absorbe: se importa como un pliego nuevo. |

---

## 3. Arquitectura y modelo de datos propuestos

Principios:
- Nada inventado: todo valor tiene fuente y estado.
- Las tarifas validadas son **inmutables**; corregirlas crea una versión nueva.
- Cada estudio guarda la versión exacta que usó.
- El motor sigue siendo puro y probado.
- Se mantiene la arquitectura actual: `Store` con dos implementaciones, RLS en espejo de `PERMS` y migraciones aditivas.

### 3.1 Tablas (migración `0012_tariff_model.sql`)

```
tariff_schedules           -- un pliego o una codificación vigente
  id, code ('SPEE-2026-Q4'), title, resolutions text[], document_url, valid_from, valid_to,
  status ('provisional'|'validado'|'historico'), validated_by → profiles, validated_at, notes, created_at

distributors               -- 20 distribuidoras / unidades de negocio del Anexo 2
  id, code ('EEQ','CENTROSUR','EEASA','CNEL-GYE', …), name, legal_name, kind ('empresa'|'unidad_negocio'),
  parent ('CNEL EP' para las unidades), active

distributor_coverage       -- sugerencia provincia/cantón → distribuidora
  province, canton (null = toda la provincia), distributor_id, source_note, status

tariff_groups              -- agrupación del Anexo 1 dentro de un pliego
  id, schedule_id, name, distributor_ids uuid[]

tariffs (existente, ampliada; columnas nuevas, todas opcionales para no romper nada)
  + schedule_id, group_id, official_code, category ('residencial'|'general'),
  + consumer_group ('residencial'|'comercial'|'industrial'|'entidades_oficiales'|'asistencia_social'|'beneficio_publico'|'culto'|'bombeo'|'bombeo_spap'|'escenarios_deportivos'|'servicio_comunitario'|'ve'|'carga_rapida'|'temporal'|…),
  + demand_type ('sin_demanda'|'con_demanda'|'horaria'|'horaria_diferenciada'), voltage_group ('BV'|'MV'|'AV1'|'AV2'),
  + block_method ('incremental'|'rango'), structure jsonb (ver 3.2), resolution, document_url, valid_to,
  + status ('provisional'|'validada'|'historica'), validated_by, validated_at, version int, supersedes_id
  (code, name, segment, voltage_level, energy_blocks… se conservan: el motor actual sigue funcionando)

tariff_period_schemes      -- definición de franjas por pliego
  id, schedule_id, code ('HORARIA-2','DIFERENCIADA-4','VE-3'), periods jsonb
  -- [{key:'lv_08_18', days:'laborable', from:'08:00', to:'18:00'}, {key:'sdf_18_22', days:'sab_dom_feriado', …}]

holidays                   -- feriados nacionales por año, con fuente
  date, name, source_note

third_party_charges        -- alumbrado, bomberos, basura: fuera del pliego
  id, distributor_id, canton, name, method ('fijo'|'porcentaje'|'por_kwh'), value, applies_to, source_note, status,
  reducible_by_pv bool

subsidies                  -- dignidad, subsidio cruzado del Anexo 2
  id, schedule_id, distributor_id, kind ('dignidad'|'cruzado'), params jsonb, status, source_note

solar_studies (existente)  + tariff_snapshot jsonb   -- copia exacta de la tarifa y los cargos usados
                           (tariff_id existente: ahora sí se llena)
```

### 3.2 Estructura de cargos (`tariffs.structure`, validada con Zod)

```ts
{
  commercialization: { usdPerMonth: 1.414 },
  energy: [                                   // uno por período y temporada
    { period: 'todo' | 'lv_08_18' | …, season?: { months: [12,1,2,3,4,5] },
      blocks: [{ fromKwh: 0, toKwh: 50, usdPerKwh: 0.091 }, …] }   // incrementales; un bloque si no hay rangos
  ],
  demand?: { usdPerKwMonth: 4.576, factor: 'ninguno'|'FGD'|'FGDI'|'FGDVE', minShareOfMax12: 0.6 | null },
  transformerLossSurcharge?: 0.02,            // MV medido en BT
  powerFactor?: { threshold: 0.94 },          // PBFP = (0,94/FP − 1) × factura del SPEE
  periodSchemeCode?: 'DIFERENCIADA-4',
  reducibility: { energy: true, demand: 'solo_con_datos_horarios', commercialization: false }
}
```

Cada componente lleva su clasificación de **reducible con FV**:
- **energía:** sí, por período;
- **demanda:** no por defecto (solo con perfil horario medido, y con la regla D_red de la 005/24);
- **comercialización:** nunca;
- **factor de potencia:** puede empeorar, porque la FV baja los kW pero no los kVAr;
- **subsidio cruzado:** depende del umbral;
- **terceros:** según su método.

### 3.3 Motor (puro, en `src/lib/engine/`)

- `billing.ts` → `computeBill(tariff, monthInput)` devuelve la factura **por rubros**: energía por período, demanda con su factor y el mínimo del 60 %, pérdidas, comercialización, PBFP, subsidios y terceros, cada uno con su base de cálculo.
- `periods.ts` → reparte kWh por período a partir de un perfil horario (24 h × laborable/fin de semana o feriado), con los feriados del año.
- `profiles.ts` → perfiles de carga tipo por segmento. Si el cliente da kWh por período (industrial), se usan sus datos. La generación FV se reparte por hora con la forma diaria del recurso solar (PVGIS horario o curva normalizada por mes); en punta (18-22) la generación es casi nula y se modela así.
- `net-metering.ts` → Regulación 005/24: balance mensual, crédito en kWh y saldo acumulado con reinicio cada 24 meses; para tarifas horarias, energía equivalente Σ(E_k·T_k)/T_m; demanda facturable = máxima tomada de la red. Solo se aplica si el cliente declara el régimen 005/24 y la potencia cumple los límites del art. 7; si no, los excedentes valen $0, como hoy.
- `finance.ts` → mismo VAN, TIR, LCOE y payback, pero el ahorro anual sale de `computeBill` antes y después, mes a mes, en los 25 años (los créditos que caducan se pierden).
- `study.ts` → elige la tarifa por distribuidora, grupo, categoría, tensión y tipo de demanda; admite una **tarifa efectiva manual** (USD/kWh de la planilla) con advertencia; y guarda `tariff_snapshot`.
- **Advertencias nuevas:**
  - sin kWh por período en tarifa horaria;
  - tarifa o pliego provisional;
  - pliego vencido;
  - distribuidora sugerida y no confirmada;
  - cargos de terceros estimados;
  - excedentes que caducan;
  - potencia sobre el consumo anual (art. 9).
- **Compatibilidad:** con `TARIFF_ENGINE=v1` el sitio usa el motor actual sin cambios. Los estudios existentes no se recalculan: sus resultados guardados se muestran tal cual.

### 3.4 Panel y calculadora

- `/admin/tarifas`: pliegos con su estado; dentro, grupos y tarifas.
  - Las tarifas validadas no se editan: «Crear versión».
  - **Solo Gerencia valida** (como los parámetros), con usuario y fecha. Pasar a histórica es automático al vencer.
- `/admin/distribuidoras`: catálogo y cobertura provincia/cantón.
- `/admin/tarifas/importar`: subir CSV o Excel → vista previa por fila con errores y duplicados → confirmar. Todo entra como **provisional**, nunca validado.
- **Exportar:** el pliego completo en CSV y Excel con la misma plantilla.
- **Calculadora:**
  - Provincia y cantón sugieren la distribuidora («Sugerida: EEQ · cámbiala si tu planilla dice otra»).
  - Categoría según el segmento.
  - Industrial: kWh por período (L-V 08-18, 18-22, 22-08; fines de semana) y demanda máxima.
  - Opción «uso la tarifa efectiva de mi planilla».
  - Casilla «tengo o tendré contrato de autoabastecimiento (Regulación 005/24)».

### 3.5 Seguridad

- **RLS:** igual que hoy en `tariffs` (escriben superadmin, ingeniería y gerencia; leen ventas y marketing). Lo mismo en las tablas nuevas; validar exige el rol de Gerencia también en la base, con un disparador como el de los pagos.
- **API:** el público no lee las tablas; la calculadora usa el servidor. Funciones nuevas con `revoke … from public, anon, authenticated` (regla de la 0011).
- **Importación:** solo en el servidor, máx. 2 MB y 5000 filas, con detección de inyección de fórmulas en CSV (`=`, `+`, `-`, `@` al inicio) al exportar.

---

## 4. Plan de migración

1. **`0012_tariff_model.sql`** (aditiva, sin `drop` ni `update` destructivos):
   - crea las tablas nuevas y las columnas opcionales en `tariffs` y `solar_studies`, con RLS y permisos de funciones;
   - registra el pliego `LEGADO` (provisional) y vincula a él las 4 tarifas actuales como `provisional` versión 1, sin cambiar sus valores.
2. **Datos 2026-Q4:** se importan con el importador (no en la migración) desde un CSV generado del PDF oficial, como **provisionales**. Gerencia los valida en el panel tras revisarlos contra el PDF (la lista de control va en las instrucciones).
3. **Producción:** con la CLI (`supabase db push`) o con un archivo `08_` generado y probado como el 06, que admita `create` porque la migración es aditiva y protegida contra doble ejecución. 04 y la huella se regeneran para 12 migraciones.
4. **Activación:** se despliega con `TARIFF_ENGINE=v1` (sin cambios visibles). Cuando Gerencia valide el pliego, se cambia a `v2` en Vercel y se redespliega.
5. **Reversión:**
   - Inmediata: volver a `TARIFF_ENGINE=v1` y redesplegar.
   - Datos: las tablas nuevas no afectan al motor v1.
   - Esquema: un archivo de reversión borra solo los objetos de 0012, y se niega si ya hay estudios que los usen.

---

## 5. Plan de implementación y pruebas (en la rama, por fases)

| Fase | Contenido | Pruebas |
|---|---|---|
| F1 | Migración 0012, `Store` (ambas implementaciones), catálogo de distribuidoras, pliegos y versiones, `tariff_snapshot` | Integración Supabase: RLS, inmutabilidad, solo Gerencia valida, simulación de 04 |
| F2 | Motor `billing`, `periods`, `net-metering` y `finance` v2 | Unitarias en cada frontera: bloques 50/51, 300/301, 500/501…; horas 07:59/08:00, 17:59/18:00, 21:59/22:00; sábado 18-22 y feriado; FGD y FGDI en 0,59 / 0,6 / 0,9 / 1,0; mínimo del 60 %; FP 0,94 y 0,6; reinicio de créditos a los 24 meses; energía equivalente |
| F3 | Importador y exportador CSV/Excel, plantilla y CSV oficial 2026-Q4 | Errores, duplicados, inyección de fórmulas, y comprobación del CSV contra el texto del PDF (prueba que lee el PDF oficial versionado) |
| F4 | Panel (pliegos, versiones, validación, distribuidoras) y calculadora (sugerencia, kWh por período, tarifa efectiva, 005/24) | e2e escritorio y móvil, más el recorrido contra Supabase |
| F5 | Regresión y validación con planillas reales | Los estudios existentes no cambian (v1); facturas reales de cada segmento reproducidas con un error ≤ 1 % en los rubros del SPEE |

Para F5 necesito planillas reales (ver sección 9). Los «casos documentados» de ARCONEL son la estructura y los cargos;
no publican facturas de ejemplo.

---

## 6. Informe de cambios

Se entregará al cerrar cada fase, con la lista de archivos, las migraciones, las pruebas y los resultados.

## 7. Instrucciones para Gerencia (esquema)

1. **Revisar un pliego importado:** comparar cada tabla con la página del PDF que se indica al lado.
2. **Validar:** se registran usuario y fecha. Con eso las tarifas quedan disponibles para la calculadora y su valor ya no cambia.
3. **Pliego nuevo** (p. ej. 2027): importar el CSV → revisar → validar. El anterior pasa a histórico en su fecha de fin.
4. **Cargos de terceros y subsidios:** cargarlos solo con su ordenanza, decreto o resolución, y su enlace.
5. **Corregir un error:** «Crear versión». La versión anterior queda en el historial y los estudios hechos con ella no cambian.

## 8. Despliegue y reversión (esquema)

Rama → vista previa de Vercel (necesita variables en Preview o una base de pruebas) → tu aprobación → merge a `main` con
`TARIFF_ENGINE=v1` → migración 0012 en producción → 04 en verde → importar y validar el pliego → `TARIFF_ENGINE=v2`
→ pruebas en producción. Reversión: ver la sección 4, punto 5.

---

## 9. Decisiones que necesito antes de implementar

1. **Aprobar el modelo** de las secciones 3 y 4 y el orden de las fases F1 a F5.
2. **Planillas reales para validar** (sin datos personales: puedes tachar nombre, cédula y dirección): al menos una por caso:
   - residencial de Quito, de la Sierra y de la Costa (CNEL);
   - comercial sin demanda;
   - comercial con demanda;
   - industrial MT con demanda horaria diferenciada.
3. **Tarifa de la dignidad y alumbrado público:** mientras no haya documento oficial, ¿las dejamos fuera del cálculo con una advertencia (recomendado), o las cargamos como provisionales con la fuente que tengas?
4. **Cobertura por cantón:** ¿tienes el listado oficial de áreas de servicio de las distribuidoras, o lo compilo como provisional desde sus sitios oficiales (requiere permitir esos dominios en la red de esta sesión)?
5. **Vista previa en Vercel:** para probar la rama sin tocar producción, conviene una base Supabase de pruebas con sus variables en el entorno **Preview**. ¿La creamos, o pruebo solo en local y en CI?
