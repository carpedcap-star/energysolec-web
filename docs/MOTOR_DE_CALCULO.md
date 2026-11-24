# Motor de cálculo solar y financiero

Código: `src/lib/engine/`. Pruebas: `engine.test.ts` (20 casos). Todos los parámetros se editan en **/admin/parametros** y se versionan; cada estudio guarda la versión usada.

## 1. Recurso solar

1. Ubicación: coordenadas del usuario o, si no las comparte, capital de su provincia (se informa en el estudio).
2. Se consultan en paralelo tres fuentes, todas **sin pérdidas de sistema**:
   - **PVGIS-NSRDB** (satelital, API 5.2), cobertura América 60°N–20°S.
   - **PVGIS-ERA5** (reanálisis global ~30 km, API 5.3). SARAH no cubre Sudamérica.
   - **NASA POWER** climatología (GHI y temperatura). Conversión a rendimiento: irradiación en plano ≈ GHI para inclinaciones ≤15° cerca del ecuador; temperatura de celda ≈ T. ambiente + 25 °C; coeficiente −0,35 %/°C; −2 % por baja irradiancia y espectro.
3. Se adopta el **menor** rendimiento anual (los reanálisis tienden a sobrestimar en el trópico nuboso). El reporte muestra todas las fuentes comparadas.
4. Orientación: `aspect=180` (norte) al sur del ecuador y `aspect=0` al norte. Inclinación por defecto 10°.
5. Si ninguna fuente responde, se usa un rendimiento regional conservador (Costa 1.150 · Sierra 1.250 · Amazonía 1.050 · Insular 1.400 kWh/kWp/año), y el estudio lo advierte.

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
