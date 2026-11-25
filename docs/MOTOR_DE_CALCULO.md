# Motor de cálculo solar y financiero

Código: `src/lib/engine/`. Pruebas: `engine.test.ts` (con respuestas reales de las fuentes en `fixtures/`) y `resource.live.test.ts` (en vivo: `npm run test:live`). Todos los parámetros se editan en **/admin/parametros** y se versionan; cada estudio guarda la versión usada.

## 1. Recurso solar

1. Ubicación: coordenadas del usuario o, si no las comparte, capital de su provincia (se informa en el estudio).
2. Se consultan en paralelo tres fuentes, todas **sin pérdidas de sistema**:
   - **PVGIS-NSRDB** (satelital, API 5.2), cobertura América 60°N–20°S.
   - **PVGIS-ERA5** (reanálisis global ~30 km, API 5.3). SARAH no cubre Sudamérica.
   - **NASA POWER** climatología (GHI y temperatura). Conversión a rendimiento: irradiación en plano ≈ GHI para inclinaciones ≤15° cerca del ecuador; temperatura de celda ≈ T. ambiente + 25 °C; coeficiente −0,35 %/°C; −2 % por baja irradiancia y espectro.
3. Se adopta el **menor** rendimiento anual. Las fuentes difieren hasta un 30 % y ninguna es siempre la menor (ERA5 es la menor en Guayaquil y la mayor en Loja). Verificado en vivo el 25/11/2026, en kWh/kWp/año, inclinación 10°:

   | Punto | PVGIS-NSRDB | PVGIS-ERA5 | NASA POWER |
   |---|---|---|---|
   | Guayaquil | 1.431 | **1.114** | 1.242 |
   | Quito | 1.782 | 1.520 | **1.345** |
   | Loja | 1.394 | 1.584 | **1.356** |

   El reporte muestra todas las fuentes comparadas, con su período de datos (p. ej. NSRDB 2005–2015, ERA5 2005–2023, NASA 2001–2025).
3b. **Validación**: se descartan respuestas con menos de 12 meses, de otra base de datos, con valores de relleno (NASA usa −999) o fuera de rango (30–300 kWh/kWp por mes). Un error de red se reintenta una vez (conexiones reutilizadas que el servidor cerró); un error HTTP no.
3c. **Caché** (`solar_resource_cache`, migración 0008): una fila por celda de 0,05° (~5,5 km), inclinación entera y fuente, vigente 180 días (son climatologías). La consulta usa las coordenadas exactas: una celda redondeada en la costa puede caer en el mar (PVGIS responde 400, visto en Galápagos). Si una fuente falla y hay un dato guardado vencido, se usa ese dato con una nota: perder una fuente podría subir el mínimo y volver el estudio menos conservador. La caché se vacía desde **/admin/recurso-solar**; las filas con más del doble de vigencia se borran en la tarea diaria.
3d. **Verificación en vivo**: la tarea diaria consulta las tres fuentes en Guayaquil y deja el resultado en el panel. **/admin/recurso-solar** verifica bajo demanda Guayaquil, Quito y Puerto Baquerizo Moreno.
4. Orientación: `aspect=180` (norte) al sur del ecuador y `aspect=0` al norte. Inclinación por defecto 10°.
5. Si ninguna fuente responde, se usa un rendimiento regional conservador (Costa 1.150 · Sierra 1.250 · Amazonía 1.050 · Insular 1.400 kWh/kWp/año), y el estudio lo advierte en sus advertencias visibles. Las notas del recurso (fuentes comparadas, fuente que no respondió, dato guardado usado) van en el resultado, la pantalla y el PDF.

## 2. Pérdidas (aplicadas una sola vez)

`factor = (1−suciedad)(1−sombras)(1−cableado DC/mismatch)(η inversor)(1−cableado AC)(disponibilidad)`

Como la fuente se pide con `loss=0` y ya incluye temperatura, ninguna pérdida se cuenta dos veces (verificado por prueba). La degradación del primer año se aplica aparte, y la anual en el modelo financiero.

## 3. Dimensionamiento

`Potencia FV (kWp) = Energía objetivo anual ÷ Rendimiento específico neto (kWh/kWp)`

| Situación | Energía objetivo |
|---|---|
| Sin compensación de excedentes (por defecto) | Consumo anual × fracción diurna |
| Con baterías | Consumo × mín(cobertura objetivo, fracción diurna + 0,30) |
| Con compensación configurada | Consumo × cobertura objetivo (90 %) |

Luego: límite por superficie (m²/kWp de cubierta o terreno), redondeo a módulos enteros, inversor a la potencia comercial siguiente según relación DC/AC.

**Autoconsumo mensual:** la generación cubre como máximo el consumo diurno del mes; la batería desplaza el excedente hacia la noche con su eficiencia ida-vuelta y su profundidad de descarga. Con 12 meses de historial o una curva de carga (calculadora profesional) el resultado es más preciso.

## 4. Factura y ahorro

- Factura por componentes: bloques de energía crecientes, cargo por demanda (kW), comercialización fija y otros cargos en %.
- Calculadora rápida: el consumo se obtiene **invirtiendo la tarifa** desde el valor de la factura (bisección).
- Ahorro = factura actual − factura con el sistema, mes a mes. Los cargos fijos se mantienen. **El cargo por demanda no se reduce** salvo que se active `demandSavingsFromPv`. **Los excedentes valen cero** salvo que se configure `net_balance` o `fixed_price` tras verificar la regulación aplicable.
- Se advierte si el consumo y la factura indicados no son coherentes (diferencia > 35 %).

## 5. Modelo financiero

- **Inversión:** kWp × precio del tramo (economías de escala) + baterías + ingeniería (%) × factor de escenario; mínimo por proyecto; + IVA.
- **Flujo anual:** ahorro₁ × (1−degradación)^(n−1) × (1+incremento tarifario)^(n−1) − O&M (con su inflación) − reposiciones (inversor en el año 13, baterías en el año 12 al 60 % del costo).
- **Indicadores:** retorno simple y descontado (fraccional), VAN, TIR (bisección), LCOE = (inversión + VP de costos) ÷ VP de energía, ahorro acumulado, rentabilidad neta acumulada y cuota referencial si se activa el financiamiento.
- **Escenarios:**

| | Rendimiento | Incremento tarifario | Inversión | Degradación extra |
|---|---|---|---|---|
| Conservador | −7 % | 0 % | +10 % | +0,2 %/año |
| Base | 0 | 1 % | 0 | 0 |
| Optimista | +3 % | 2 % | −5 % | 0 |

## 6. Valores provisionales que deben validarse

Precios por kWp por tramo, USD/kWh de baterías, % de ingeniería, IVA aplicable a sistemas fotovoltaicos, O&M, tasa de descuento, factor de emisión del SNI (0,30 kg CO₂/kWh provisional), régimen de excedentes y **todas las tarifas** (pliego ARCONEL vigente por distribuidora). Mientras sean provisionales, el estudio lo indica al cliente.

## 7. Resultados de referencia (valores provisionales, recurso regional Costa)

| Caso | Sistema | Inversión | Ahorro año 1 | Retorno simple | TIR |
|---|---|---|---|---|---|
| Residencial, factura $120 | 4,6 kWp | $6.443 | $550 | 13,8 años | 5,8 % |
| Comercial, factura $1.500 | 112,5 kWp | $97.825 | $11.569 | 9,4 años | 9,4 % |
| Industrial, factura $25.000, 600 kW de demanda | 2,1 MWp | $1,63 M | $182.341 | 10,2 años | 8,3 % |

Los plazos son largos porque las tarifas ecuatorianas son bajas y subsidiadas, y el motor no infla el ahorro. Gerencia debe revisar estos casos al cargar los precios reales.
