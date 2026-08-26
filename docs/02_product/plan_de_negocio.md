---
tags: [mep, business-plan]
related: "[[CONTEXT]]"
---

# Plan de Negocio — Mise en Place

**SaaS de inteligencia de compras para hostelería: de la factura del proveedor al control del food cost, con IA.**

*Versión para inversores · Junio 2026 · Confidencial*

> Este plan asume la versión comercial del producto: registro self-service, suscripción de pago, infraestructura de email, cumplimiento RGPD y endurecimiento de seguridad completados (hoja de ruta técnica ya planificada y trazada en el repositorio, issues #60–#109).

---

## 1. Resumen ejecutivo

**Mise en Place** convierte la peor tarea administrativa de un restaurante —teclear facturas y albaranes de proveedores— en su mejor herramienta de gestión. El hostelero fotografía o sube la factura; nuestra IA extrae proveedor, líneas, cantidades, precios e IVA con confianza por campo; y la plataforma la transforma en analítica de gasto, alertas de subidas de precio por ingrediente, presupuestos por categoría, recordatorios de pago y un asistente de IA que responde preguntas sobre sus compras.

**Por qué ahora (tres fuerzas simultáneas):**

1. **Dolor económico récord.** La cesta de alimentos ha subido más de un 35 % acumulado desde 2021 (OCU), con picos del +15,7 % interanual (INE, dic. 2022) y volatilidad extrema por producto (café +54 % en 2025; aceite de oliva duplicándose y desplomándose). Mientras, la rentabilidad de bares y restaurantes **cayó un 0,9 % en 2025 pese a facturar un +3 %** (Hosteltur/DBK), con márgenes netos del 3–5 %. El food cost (28–35 % de las ventas) es el mayor coste controlable del sector, y hoy se gestiona a ciegas.
2. **Obligación legal inminente.** Entre 2027 y 2028 **todos** los restaurantes españoles deberán usar software de facturación certificado (VERI*FACTU: 1 ene./1 jul. 2027, RDL 15/2025) y recibir factura electrónica B2B estructurada con reporte de estados de pago (RD 238/2026, Ley Crea y Crece; fechas previstas oct. 2027 / oct. 2028). La digitalización de la factura de proveedor pasa de "deseable" a **legalmente inevitable**. Nosotros montamos la ola; no necesitamos crearla.
3. **Salto tecnológico.** Los modelos multimodales (Gemini) extraen facturas heterogéneas en español —incluido el caótico albarán fotografiado en una cocina— con un coste marginal por documento inferior a un céntimo, algo imposible con el OCR clásico que lastró a la generación anterior de competidores.

**Mercado:** ~280.000 establecimientos de restauración en España (104.745 restaurantes, 93 % independientes; ~130.000 bares), dentro de un mercado europeo de ~1,5 M de establecimientos. TAM España ≈ €250 M/año; SAM (restauración independiente digitalizable) ≈ €135 M/año; objetivo a 3 años: ~1.800 locales de pago ≈ €1,8 M ARR.

**Modelo:** suscripción SaaS por local, precios públicos y transparentes (€49–€199/mes), prueba de 30 días. Frente a un sector dominado por precios "bajo presupuesto" y venta consultiva (Haddock, Gstock, Apicbase), competimos con self-service, transparencia y activación en minutos.

**Canal diferencial:** las gestorías. La factura del restaurante ya viaja cada mes a su asesoría para impuestos; Mise en Place se sitúa aguas arriba, entrega a la gestoría datos estructurados y limpios, y convierte a ~70.000 despachos (solo ~10 % digitalizados) en prescriptores, no en competidores. El programa de partners de Quipu y Holded demuestra que el canal funciona.

**La petición:** ronda de **€750.000** para 18 meses: completar la comercialización del producto (4–6 semanas de trabajo ya planificado), validar el canal gestorías y alcanzar ~600 locales de pago (~€600k ARR run-rate) antes de la ventana regulatoria 2027.

---

## 2. El problema

Un restaurante medio recibe **200–400 documentos de proveedor al mes** (facturas, albaranes, tickets; estimación sectorial a validar con investigación primaria). Hoy esos papeles:

- **Se teclean a mano o no se procesan.** El coste de procesar manualmente una factura en papel se estima en €10–17,6 (Billentis; estudios de AP en EE. UU.: $10–15). Para 250 docs/mes son cientos de euros mensuales en tiempo administrativo invisible.
- **Roban el tiempo del dueño.** Los hosteleros españoles dedican ~14 h/semana a tareas administrativas; el 92 % afirma que esa carga le impide mejorar el negocio (estudio Square + American Express, 2024).
- **Ocultan las subidas de precio.** Sin datos por línea, el proveedor que sube la merluza un 12 % en tres entregas pasa desapercibido hasta el cierre trimestral de la gestoría — cuando el margen ya se ha perdido. Con inflación alimentaria del +35 % acumulado y volatilidad por producto de dos dígitos, esto es la diferencia entre el 5 % de margen y la pérdida.
- **No alimentan ninguna decisión.** La gestoría usa la factura para el IVA, no para decirle al chef que el aceite ha vuelto a bajar y toca renegociar.

El resultado: ~6 de cada 10 restaurantes nuevos cierran antes de 2 años, en un sector que es el 6,7 % del PIB y emplea a 1,85 M de personas.

## 3. La solución

**Flujo central (ya construido y operativo):** foto o PDF → extracción IA con confianza por campo → revisión guiada (los campos dudosos se revisan obligatoriamente; los importes nunca se guardan sin validar) → datos estructurados.

Sobre ese dato limpio, la plataforma ya ofrece:

| Módulo | Valor para el hostelero |
|---|---|
| **Analítica de gasto** | Gasto por proveedor, categoría y periodo; tendencias; concentración de proveedores (riesgo de cadena de suministro) |
| **Alertas de shock de precios** | Aviso inmediato cuando un ingrediente sube por encima del umbral — el "radar" del food cost |
| **Presupuestos por categoría** | Límite mensual por familia de compra con avisos de desviación |
| **Recordatorios de pago** | Facturas vencidas y próximas a vencer; evita recargos y tensiones con proveedores |
| **Resumen semanal IA** | Digest con los movimientos de la semana, enviado por email |
| **Asistente IA de compras** | "¿Cuánto gasté en pescado este mes?" "¿Qué proveedor me ha subido más los precios?" — respuesta en segundos sobre datos propios |
| **Multi-local y multiusuario** | Arquitectura multi-tenant con aislamiento por restaurante (RLS) desde el día uno |
| **Modo offline / móvil** | Cola de subida offline pensada para cocinas sin cobertura; captura con cámara |

**Hoja de ruta de producto (12–18 meses):** conciliación pedido-factura (PO matching, la funcionalidad más pedida en reviews de competidores — issue #25), portal/asiento para gestorías, exportación contable (a3, Holded, formato Facturae), escandallos ligados a precio real de compra, y módulo de recepción de e-factura B2B alineado con RD 238/2026.

**Defensibilidad:** el valor no está en el OCR (commodity) sino en (1) el grafo de precios por ingrediente-proveedor-zona que se acumula con cada factura procesada —con 1.000 restaurantes tendremos el mejor índice de precios mayoristas de alimentación de España—, (2) las correcciones de los usuarios como dataset de fine-tuning/evaluación (tabla `extraction_corrections` ya en producción), y (3) el coste de cambio una vez que el histórico de compras y los flujos con la gestoría viven en la plataforma.

## 4. Mercado

| | Establecimientos | Cálculo | Valor |
|---|---|---|---|
| **TAM España** | ~280.000 restauración (Uve Data 2025; 275.892 en 2024: 104.745 restaurantes + 129.904 bares) | × ARPA €900/año | **≈ €250 M/año** |
| **SAM** | ~150.000 (restaurantes independientes + bares con volumen real de proveedores; 93 % de los restaurantes son independientes) | × €900 | **≈ €135 M/año** |
| **SOM (3 años)** | ~1.800 locales (1,2 % del SAM) | × ARPA creciente | **≈ €1,8 M ARR** |
| **Expansión UE** | ~1,5 M establecimientos F&B (Eurostat); Italia ~265k, misma estructura de independientes | ×5–6 España | **&gt; €1.300 M/año** |

El sector factura €166.211 M (6,7 % del PIB); el segmento restaurantes, €31.000 M en 2025 (+3,5 %, DBK). No es un mercado que haya que evangelizar sobre su problema: la inflación y la normativa lo están haciendo por nosotros.

## 5. Viento de cola regulatorio (calendario verificado)

| Norma | Qué obliga | Fecha |
|---|---|---|
| **VERI*FACTU** (Ley 11/2021 + RD 1007/2023, aplazado por RDL 15/2025) | Software de facturación certificado e inalterable, con QR y envío opcional a AEAT | **1 ene. 2027** (sociedades) / **1 jul. 2027** (resto, incl. autónomos) |
| **Factura electrónica B2B** (Ley Crea y Crece, RD 238/2026, en vigor 20 abr. 2026) | Emitir y **recibir** e-factura estructurada (Facturae/UBL/CII) y reportar estados de pago en ~4 días | Previsto **oct. 2027** (&gt;€8 M) / **oct. 2028** (todas las pymes) — pendiente de orden ministerial |
| **TicketBAI** (País Vasco) | Ya plenamente en vigor (Gipuzkoa 2023, Álava 2022, Bizkaia 2024–26) | Prueba de que el modelo funciona y de que la hostelería se adapta |

Implicación: en menos de 30 meses, todo restaurante deberá recibir facturas estructuradas y reportar si las ha pagado — exactamente los módulos de recepción, estado y recordatorio de pago de Mise en Place. Seremos la capa de *inteligencia* sobre una obligación legal que otros venderán como mero *cumplimiento*.

## 6. Competencia

| Competidor | Foco | Precio | Financiación | Debilidad explotable |
|---|---|---|---|---|
| **Haddock** (Barcelona, YC W22) | Digitalización de facturas + escandallos | No público (~€75/mes ref. "menos de 2,5 €/día", no verificado) | €1 M pre-seed (2022); sin rondas posteriores públicas | Precio opaco, venta consultiva, Trustpilot ~3,9 con quejas históricas de precisión OCR |
| **Gstock** (ES) | Inventario + escandallos, OCR de albaranes | Bajo presupuesto | — | Producto inventario-first, complejo para independientes |
| **Yurest** (Valencia) | Suite completa ops; "Lite" para independientes (nov. 2025) | — | Bootstrapped (~€675k ingresos 2023, ~450 locales) | Suite pesada; invoice intelligence no es su núcleo |
| **MarketMan** (global) | Inventario + escaneo facturas | Desde $199/mes + $500 alta | $100 M+ (PSG/Meal Ticket) | Reviews: escaneo falla "el 50 % de las veces", soporte lento, permanencia; sin localización española |
| **Supy** (UAE) | Multi-marca, procurement | — | $9,5 M | Enfocado a grupos multi-local, no independientes; sin presencia España |
| **Choco / Rekki** | Pedidos restaurante-proveedor (gratis para el restaurante) | Freemium (paga el proveedor) | $328 M / ~$23–60 M | No hacen analítica de coste ni factura; modelo distinto |
| **Genéricos ES** (Holded €7,5–99,5; Quipu €14–49; Billin desde €6,6; Dext ~$31,5; Docuten) | Contabilidad/e-factura fiscal | €7–50/mes | — | Extraen cabecera para impuestos; **ninguno** hace precio por línea de ingrediente, conversión de unidades ni food cost |

**Posicionamiento:** entre los genéricos baratos que no entienden una merluza y las suites caras que exigen implantación, Mise en Place es *la* herramienta específica de facturas-a-inteligencia para el independiente: precio público, alta self-service, valor visible con la primera factura (time-to-value < 10 minutos).

**Validación por capital y exits:** xtraCHEF (mismo producto, EE. UU.) vendida a Toast por ~$23,5 M + earnout (2021); MarginEdge $45 M Serie C con 4.000 restaurantes y $3.000 M en facturas/año; Nory $16 M Serie A (Accel, 2024); Tenzo $12,5 M. En España solo hay un jugador financiado (Haddock, €1 M) — hueco evidente en seed.

## 7. Modelo de negocio

**Precios públicos (por local, IVA no incl., −15 % en pago anual):**

| Plan | Precio/mes | Incluye |
|---|---|---|
| **Básico** | **€49** | 100 docs/mes, 1 usuario, analítica, alertas, recordatorios |
| **Pro** | **€99** | 400 docs/mes, multiusuario, asistente IA, digest email, exportación contable, soporte prioritario |
| **Grupos** | **€199** | Multi-local, consolidado de grupo, API, onboarding dedicado |

- **Prueba 30 días** sin tarjeta (promesa actual de la waitlist: 1 mes gratis — se honra como cupón de lanzamiento).
- **ARPA blended objetivo:** ~€75/mes (€900/año), entre el ancla de los genéricos (€7–50) y MarketMan ($199): el precio se justifica solo — recuperar un 1 % de food cost en un local que compra €15.000/mes son €150/mes.
- **Márgenes:** coste IA (Gemini Flash) < €0,01/documento → < 2 % de ingresos; margen bruto objetivo ≥ 80 %.
- **Ingresos futuros:** asiento de gestoría (€/cliente gestionado), datos agregados de precios (índice anónimo sectorial), módulo e-factura RD 238/2026, marketplace de renegociación con proveedores.

**Unit economics objetivo (mes 18):**

| Métrica | Objetivo | Base |
|---|---|---|
| CAC blended | ≤ €250 | Canal gestoría (CAC bajo, lotes de clientes) + inbound SEO/contenido |
| Churn mensual | ≤ 3 % | Coste de cambio por histórico + integración gestoría |
| Vida media cliente | ~30 meses | — |
| LTV (bruto) | ~€1.800–2.200 | ARPA €75 × 30 × 80 % margen |
| **LTV/CAC** | **≥ 7×** | — |
| Payback CAC | < 4 meses | — |

## 8. Go-to-market

**Fase 1 — Lanzamiento (meses 1–6): Madrid + Barcelona, directo.**
- Conversión de la waitlist existente (cupón del mes gratis prometido).
- Contenido SEO en español sobre lo que ya preocupa: "calendario VERI*FACTU hostelería", "cómo calcular food cost", "subida precio aceite 2026" — publicando nuestro **índice mensual de precios de alimentación** a partir de datos agregados anónimos (el activo de datos como imán de PR/SEO; nadie más lo tiene a nivel de línea de ingrediente).
- Activación medida de extremo a extremo (evento a evento: alta → primera factura → primera alerta → semana 1).

**Fase 2 — Canal gestorías (meses 4–12): el multiplicador.**
- ~70.000 despachos en España (media 2,8 empleados; solo ~10 % digitalizados). El restaurante ya les envía las facturas; nosotros les entregamos el dato estructurado y exportable → ahorran horas de tecleo por cliente.
- Programa partner copiado de lo que ya funciona (Quipu, Holded): software gratis para el despacho, comisión recurrente del 20 % año 1, directorio de partners. Cada gestoría aporta lotes de 5–30 restaurantes con CAC marginal.
- Acreditación como **agente digitalizador del Kit Digital**: el restaurante paga la suscripción con bono público.

**Fase 3 — Ola regulatoria (meses 12–24).**
- Módulo de recepción e-factura B2B + estados de pago (RD 238/2026) lanzado 6–9 meses antes de la primera fecha obligatoria: campaña "cumple y además ahorra".
- Expansión a grupos pequeños (3–15 locales) con el plan Grupos; primeras pruebas en Portugal/Italia (estructura de mercado análoga, 265k establecimientos en Italia).

**Viralidad incorporada:** asiento gratuito de solo-lectura para la gestoría (cada cliente expone el producto a su despacho, y cada despacho a su cartera); informes compartibles ("tu proveedor X ha subido un 14 %") con marca.

## 9. Proyecciones (escenario base, conservador)

| | Año 1 | Año 2 | Año 3 |
|---|---|---|---|
| Locales de pago (fin de año) | 150 | 600 | 1.800 |
| ARPA mensual blended | €65 | €75 | €85 |
| **ARR (fin de año)** | **€117k** | **€540k** | **€1,84 M** |
| Ingresos reconocidos | ~€70k | ~€350k | ~€1,1 M |
| Margen bruto | 78 % | 80 % | 82 % |
| Equipo (FTE) | 4 | 8 | 14 |
| Burn neto anual | ~€320k | ~€420k | ~breakeven H2 |

Hipótesis clave: 30 % de altas vía gestorías en año 1 → 60 % en año 3; conversión trial→pago 35 %; churn mensual 3,5 % año 1 bajando a 2,5 %. Sensibilidad: con churn 5 % y conversión 25 %, el año 3 cierra en ~€1,1 M ARR — el caso sigue funcionando porque el CAC de canal es bajo.

*Benchmark de realismo: Yurest, bootstrapped, alcanzó ~€675k de ingresos con 450 locales; Haddock ~2.000 restaurantes en 4 años con €1 M. Nuestro plan a 3 años se sitúa entre ambos, con más capital y un calendario regulatorio a favor que ninguno de los dos tuvo.*

## 10. Estado del producto y riesgos

**Estado real (auditoría interna, junio 2026):** núcleo técnico construido y testeado (extracción con confianza por campo, multi-tenant con RLS, CI verde, Sentry, offline móvil). Brechas de comercialización identificadas, planificadas y estimadas — registro, pagos (Stripe), email transaccional, RGPD, endurecimiento de endpoints, empaquetado PWA — en ~4–6 semanas de ejecución (issues #60–#109 del repositorio). Este plan asume su finalización antes del lanzamiento.

| Riesgo | Mitigación |
|---|---|
| **Precisión de extracción** (un total mal leído destruye la confianza) | Revisión obligatoria de campos de baja confianza antes de guardar; las correcciones de usuario realimentan la evaluación |
| **Distribución** (el hostelero es difícil de alcanzar en digital) | Canal gestorías + Kit Digital + índice de precios como imán orgánico; no dependemos de paid |
| **Respuesta de Haddock / entrada de un genérico** | Velocidad + transparencia de precios + foco independiente; los genéricos carecen del dominio (unidades, escandallos, albaranes); Haddock está escalando hacia grupos y LatAm |
| **Dependencia de Gemini** | Capa de abstracción del modelo ya implementada (`GenerateFn`); benchmark permite cambiar de proveedor con regresión controlada |
| **Calendario regulatorio se retrasa** (ya ocurrió con VERI*FACTU) | El caso de negocio se sostiene solo con el dolor de inflación/margen; la regulación es acelerador, no premisa |
| **Concentración en un fundador técnico** | Parte de la ronda financia la primera contratación comercial senior (canal gestorías) |

## 11. La petición

**€750.000** (pre-seed/seed) para 18 meses:

| Uso | % |
|---|---|
| Producto e ingeniería (2 ing. + fundador): cierre comercialización, PO matching, módulo e-factura, portal gestorías | 45 % |
| Go-to-market: 1 perfil comercial canal + contenido/SEO + Kit Digital | 35 % |
| Operaciones, legal (RGPD/DPA), infraestructura | 12 % |
| Colchón | 8 % |

**Hitos comprometidos:** mes 3: lanzamiento público con pagos; mes 6: 100 locales de pago y 10 gestorías partner; mes 12: 350 locales, €300k ARR run-rate, módulo e-factura en beta; mes 18: 600 locales, €540k ARR, métricas para Serie A (LTV/CAC > 5, churn < 3 %).

**Comparables de entrada:** Haddock levantó €1 M pre-seed con menos producto del que Mise en Place tiene hoy; la categoría ha producido un exit (xtraCHEF→Toast) y rondas A–C consistentes en Europa 2022–2026 (Nory $16 M, Tenzo $12,5 M, MarginEdge $45 M).

---

## Anexo — Fuentes principales

- **Mercado:** Anuario de la Hostelería de España 2024/2025 (Hostelería de España/CaixaBank); Uve Data Market Horeca 2024–2025 (275.892–280.403 establecimientos; 104.745 restaurantes, 93 % independientes); DBK Informa (restaurantes €31.000 M, 2025); Eurostat SBS (~1,5 M establecimientos F&B UE).
- **Regulación:** BOE — RD 238/2026 (factura electrónica B2B, BOE-A-2026-7295); RDL 15/2025 (aplazamiento VERI*FACTU a 2027, BOE-A-2025-24446); AEAT (notas informativas); Cuatrecasas y Fieldfisher (calendarios).
- **Dolor económico:** INE (IPC alimentos +15,7 % dic. 2022); OCU (cesta +35–38 % acumulado); Hosteltur/El Economista (rentabilidad −0,9 % en 2025); Square + American Express, "Recupera tu Tiempo" (14 h/semana de administración, 2024); Billentis (€17,6/factura manual).
- **Competencia y financiación:** Y Combinator, Profesional Horeca, El Referente (Haddock); Capterra/G2 (MarketMan, Gstock, Dext); BusinessWire (Meal Ticket/PSG); TechCrunch (Choco, MarginEdge); Toast (adquisición xtraCHEF); Silicon Republic (Nory); Amadeus Capital (Tenzo).
- **Canal:** Quipu y Holded (programas de partners para asesorías); Channel Partner (digitalización de gestorías ~10 %); Acelera Pyme (Kit Digital).

*Cifras marcadas como estimación sectorial (documentos/mes por restaurante, precio de Haddock) pendientes de validación con investigación primaria; el resto contrastadas en dos o más fuentes independientes a fecha 9 de junio de 2026.*
