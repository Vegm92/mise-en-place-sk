---
tags: [mep, onboarding, marketing]
related: "[[CONTEXT]]"
---

# Análisis de competencia en Barcelona — método y hallazgos

Investigación de campo (fuentes públicas, web, agosto de 2026) para completar el
"trabajo pendiente" que ya señalaba
[[docs/onboarding/marketing/01_estrategia/competencia|Competencia]]: fichas
reales por competidor, sus precios reales, y cómo se publicitan. Pensado para
alimentar directamente el perfil de cliente y dolor, y de ahí la interfaz del
MVP — no es un ejercicio académico, es la base de la próxima ronda de
validación.

**Límite honesto:** no hay pantallazos. El navegador no estaba disponible en
esta sesión, así que la lectura de "cómo son sus páginas" sale de extraer el
contenido y la estructura de cada web, no de verlas. Suficiente para mensajes,
precio y arquitectura de la página; no sustituye a mirarlas con tus propios
ojos antes de las conversaciones de validación. Está en el trabajo pendiente,
al final.

## El método: una ficha, siempre igual

Para que esto no sea un resumen prestado (la crítica que ya se hacía la propia
página de competencia), cada competidor se mira siempre por los mismos ocho
sitios. Cópialo cada vez que aparezca un competidor nuevo:

1. **Qué vende** — la categoría real, no la que dice su eslogan.
2. **Para quién** — el segmento al que apunta la web, aunque el producto sirva para más.
3. **Promesa principal** — la frase del hero, literal.
4. **Características que destaca** — el orden importa: lo primero es lo que creen que vende.
5. **Precio** — público o no. Si no es público, es un dato en sí mismo (filtra a quién le hablan).
6. **Cómo se entra** — demo con comercial, alta sola, prueba gratis. Es el dato más accionable de todos.
7. **Estructura de la página** — el orden de las secciones dice qué creen que hay que vencer primero (duda, precio, confianza).
8. **Reseñas** — puntuación, número, y la queja que más se repite, no la valoración media sola.

De ahí salen dos preguntas que hay que responder siempre al cerrar la ficha:
**qué tiene que nosotros no**, y **qué tenemos que ellos no**. Si una ficha no
contesta esas dos, no sirve.

## El tablero, actualizado

Sobre el mapa que ya existía en `competencia.md`, con lo confirmado esta
sesión y dos fichajes nuevos (Kitchen Stocker y Apicbase no estaban).

| Competidor | Categoría | Precio real (confirmado ahora) | Cómo se entra | Punto fuerte a robar | Punto débil aprovechable |
|---|---|---|---|---|---|
| **Haddock** (Barcelona, YC) | Suite horeca (factura → coste → RRHH → IA) | **Ahora público**: Growth 85 €/mes (200 docs, 4 usuarios), Premium 120 €/mes (400 docs, ilimitados), Enterprise a medida. Anual con 15 % dto | Freemium/demo mixto — "probar gratis" y "solicitar demo" conviven | Escandallo dinámico + alerta de variación de precio ya en el plan de entrada | Se ha vuelto una suite (RRHH, TPV, agentes IA): más superficie, menos foco. Trustpilot 4,2/5 (24 reseñas) — mejor que la nota antigua de ~3,9, hay que asumir que ha mejorado, no repetir el dato viejo |
| **Kitchen Stocker** (España) — **nuevo en el mapa** | Inventario + food cost + OCR de facturas | 99 €/mes plan Profesional (hasta 3 locales, 15 usuarios), prueba 14 días sin tarjeta | **Autoservicio real**: crea cuenta → carga inventario → opera. Sin comercial de por medio | El self-serve que nosotros reivindicábamos como exclusivo ya no lo es tanto — ellos también dejan operar sin hablar con nadie | El foco es el inventario y la merma, no el precio por ingrediente ni la conversión de unidades — no lo mencionan en ningún sitio de la web |
| **Gstock** | ERP horeca con IA predictiva | No público. Calculadora de ROI en vez de tarifa | Solo demo agendada | Predicción de pedidos con IA, integración TPV de verdad | Promete "10 % de ahorro garantizado" sin matiz — hueco de honestidad que podemos usar sin nombrarlos |
| **Yurest** (Valencia) | TPV + inventario, ligero | Desde 40 €/mes con TPV incluido (fuente externa, no verificado en su propia web — bloqueada por robots.txt) | No verificado esta sesión | Precio de entrada bajo | La inteligencia sobre factura no es su núcleo, sigue siendo el TPV |
| **MarketMan** (global) | Inventario + compras | Cotización a medida (~239 $/mes por local, fuente externa) | Solo demo | Cuentas por pagar integradas | Cero reseñas en comparadores en español — presencia real en España dudosa |
| **Apicbase** (Bélgica) — **nuevo en el mapa** | Suite para cocinas centrales / cadenas grandes | 300–500 €/mes | Demo | Producción multi-cocina | No es nuestro segmento (independiente, 1–5 locales): útil solo como referencia de techo de precio |
| **Cuiner** | Gestión de personal con módulo de inventario | A medida | Demo | — | El inventario es un módulo secundario de un producto de RRHH. Casi no compite de verdad |
| **Holded / Quipu / Billin / Dext** | Contabilidad y factura fiscal | 7–50 €/mes (Holded no publica tarifa en portada, remite a "ver planes") | Alta sola, sin comercial | Setup en menos de 9 minutos (Holded) | Confirmado: "Hostelería" aparece como sector en el listado de Holded, sin ninguna función pensada para restaurantes. Se quedan en la cabecera, como ya se sabía |

## Lo que cambia respecto a lo que ya sabíamos

Tres hallazgos que hay que incorporar al posicionamiento, no solo archivar aquí:

**1. Kitchen Stocker rompe la frontera que dábamos por buena.** El argumento
de `competencia.md` era "las suites son caras, con comercial e implantación;
nosotros somos la única alta sola con valor desde la primera factura".
Kitchen Stocker también deja entrar sin hablar con nadie, también lee
facturas con OCR, y su precio de entrada (99 €/mes) es público. Ya no somos
los únicos con ese eje. Lo que sigue siendo nuestro, comprobado hoy, es que
ellos vendan **inventario y merma** como columna vertebral, y nosotros
**precio por ingrediente y conversión de unidades** — ninguno de los ocho
competidores de la tabla lo menciona como su núcleo. Ese es el hueco real, no
el "alta sola" que ya se está poniendo de moda en la categoría.

**2. Haddock ya no tiene precio opaco — y se ha convertido en suite.** El
`competencia.md` actual decía "precio no público, ~75 €/mes de referencia".
Ahora publica tarifa (85–120 €/mes) y reseñas razonables (4,2/5). Pero a
cambio ha ampliado a RRHH, horarios y "agentes de IA" — cuantas más cosas
vende, menos puede sonar a "esto resuelve exactamente tu viernes de
papeleo". Es el mismo patrón que xtraCHEF en EE. UU.
([[docs/02_product/competitor_xtrachef|teardown ya hecho]]): la suite completa
diluye la promesa concreta. Ahí es donde seguimos teniendo ventaja de
mensaje, no de producto.

**3. Nadie, en ningún sitio, comunica la regla de "si duda, no se guarda
sola".** Ni Haddock, ni Gstock, ni Kitchen Stocker mencionan qué pasa cuando
la IA no está segura. Todos venden precisión (algunos con cifras
arriesgadas, como el "10 % garantizado" de Gstock). Ninguno vende **el
límite reconocido**. Es la objeción n.º 3 de `objeciones.md` ("ya probé un
escáner y fallaba") y, con más competidores del mismo tipo en el mercado, esa
objeción va a aparecer más, no menos, en las conversaciones de validación.

## Tabla de gaps

| Qué tienen ellos que nosotros no | Quién lo tiene | Qué tenemos nosotros que ellos no |
|---|---|---|
| Integración TPV → margen real por plato (coste × venta) | Haddock, Gstock | Precio por ingrediente con conversión de unidades como producto central, no un módulo más |
| Predicción de pedidos con IA | Gstock | Regla de producto: dato dudoso no se guarda sin confirmación humana, visible en verde/ámbar/rojo |
| Creación de pedidos a proveedores (antes de la compra) | Haddock, Yurest, MarketMan | Captura por WhatsApp sin instalar nada — nadie en la tabla lo ofrece como canal de entrada |
| Gestión de RRHH / horarios / fichajes | Haddock, Cuiner | Precio público sin calculadora de ROI ni "cotización a medida": una cifra, un plan |
| Prueba gratis de autoservicio ya normalizada en la categoría | Kitchen Stocker | Chat conversacional sobre los datos propios de compra |
| Multi-local con roles a escala ya vendido como fuerte | Kitchen Stocker, Gstock | Grafo de precios histórico como activo que crece solo (nadie lo vende como ventaja, aunque algunos lo tengan) |
| Marca ya validada en Barcelona con clientes reales citados (Grupo La Fábrica, Arzábal en Gstock) | Gstock, Haddock | El origen: hecho por alguien que estuvo en la cocina, no un ERP horeca genérico |

## Propuesta de valor y dolor específico — versión para llevar a las conversaciones

La hipótesis de `posicionamiento.md` ("pierde horas y margen porque las
facturas no acaban en ningún sitio") sigue siendo cierta pero ya no es
diferencial: Kitchen Stocker y Haddock atacan el mismo dolor genérico y
también han bajado la barrera de entrada. Con lo que hay hoy en el mercado, el
dolor específico que vale la pena probar en las 10-15 conversaciones no es
"no tengo mis facturas organizadas" — es este:

> **No es que no exista forma de organizar las facturas. Es que las opciones
> que ha visto (un Excel propio, o un intento de herramienta) o le exigen una
> demo y un comercial antes de saber si sirve, o le han fallado leyendo mal
> un dato y ahora no se fía.**

Propuesta de valor afilada, para probar tal cual:

> **Una foto esta semana, sin hablar con nadie — y si algo no se entiende, te
> lo decimos en vez de inventarlo.**

Esto añade una sexta pregunta a las cinco ya escritas en
[[docs/onboarding/marketing/02_audiencia/segmentos_y_personas|segmentos_y_personas.md]],
pensada específicamente para contrastar esta hipótesis:

> 6. Si hoy probaras una herramienta nueva para esto, ¿qué te haría dejarla a
>    los cinco minutos?

La respuesta separa "me pidieron hablar con un comercial" (confirma el eje
de fricción de entrada) de "no me fié de lo que leyó" (confirma el eje de
confianza) — y dice cuál de los dos pesa más para este cliente en concreto,
cosa que hoy no sabemos.

## Qué implica para la interfaz del MVP

Esquemático, a nivel de qué debe existir y en qué orden — no maquetación:

1. **La foto es la portada.** No hay dashboard vacío ni pantalla de
   bienvenida antes de subir la primera factura. El primer clic disponible es
   "sube una factura", no "configura tu restaurante".
2. **El precio por ingrediente vive en la línea, no en un informe aparte.**
   Cada línea de factura confirmada muestra al lado el precio anterior de ese
   ingrediente con ese proveedor. Es el único sitio de la tabla comparativa
   donde ningún competidor pone el foco — que se note en la pantalla, no solo
   en el argumento de venta.
3. **Verde / ámbar / rojo, visible sin explicación.** El campo dudoso se ve
   dudoso a simple vista en la pantalla de confirmación, no en un tooltip que
   hay que buscar. Es la respuesta a la objeción n.º 3 y tiene que notarse
   con los ojos, no solo leerse en la landing.
4. **WhatsApp como puerta de entrada real, no una nota a pie de página.** La
   persona que manda la foto (camarero, repartidor) no necesita saber que
   existe una app. El dueño-chef es el único que abre la interfaz completa.
5. **Precio y plan siempre visibles dentro de la propia app**, no solo en la
   landing — refuerza en el uso diario lo que en la venta es diferencial
   (nada de "para saber cuánto cuesta, agenda una demo").
6. **Nada de módulos ajenos.** Ni RRHH, ni horarios, ni gestión de pedidos
   antes de la compra. Cuantas más pantallas tenga la app que no sean
   factura → coste → alerta → presupuesto, más nos parecemos a la suite que
   estamos usando como ejemplo a evitar (Haddock, y antes xtraCHEF).
7. **El primer dato útil llega antes de los cinco minutos.** Tras confirmar
   la primera factura, la pantalla siguiente muestra algo accionable ya
   ("este ingrediente ha subido X% respecto a la última compra a este
   proveedor"), no un dashboard pidiendo más datos para funcionar.

## Trabajo pendiente

- [ ] Pantallazos reales de Haddock, Kitchen Stocker y Gstock — esta sesión
      no tuvo navegador disponible. Repetir con Claude en Chrome o a mano.
- [ ] Verificar el precio de Yurest directamente (su web bloquea el acceso
      automático) — llamar o pedir el dato por otra vía.
- [ ] Alta como usuario "mistery shopper" en Kitchen Stocker (prueba gratis
      sin tarjeta) para ver el onboarding real, no el que cuenta la web.
- [ ] Vaciado de reseñas de Haddock por queja concreta (Trustpilot, 24
      reseñas) — encontrar la frase textual, no solo la nota media.
- [ ] Confirmar con Victor si alguna vez se evaluó integración TPV — el gap
      más repetido en la tabla (Haddock, Gstock) y el más caro de cerrar.
- [ ] Llevar la sexta pregunta a las 10-15 conversaciones y anotar la
      respuesta por separado de las otras cinco.

## Relacionado

- [[docs/onboarding/marketing/01_estrategia/competencia|Competencia]] — el
  mapa original, ahora con estos hallazgos incorporados arriba
- [[docs/onboarding/marketing/01_estrategia/posicionamiento|Posicionamiento]]
- [[docs/onboarding/marketing/02_audiencia/objeciones|Objeciones]]
- [[docs/onboarding/marketing/02_audiencia/segmentos_y_personas|Segmentos y personas]]
- [[docs/02_product/competitor_xtrachef|Teardown de xtraCHEF]] — el mismo
  método, aplicado antes al análogo estadounidense

## Fuentes

- [haddock.app](https://www.haddock.app/) y [precios de Haddock](https://www.haddock.app/precios-de-haddock)
- [Trustpilot — haddock.app](https://www.trustpilot.com/review/haddock.app)
- [kitchenstocker.com](https://www.kitchenstocker.com/)
- [g-stock.es](https://g-stock.es/)
- [Comparativa Kitchen Stocker/Apicbase/MarketMan/Yurest/Cuiner](https://www.kitchenstocker.com/blog/mejor-software-gestion-restaurante)
- [Comparativa software de facturación para restaurantes](https://banktrack.com/blog/software-facturacion-restaurantes)
- [MarketMan — Comparasoftware](https://www.comparasoftware.es/marketman)
- [holded.com/es](https://www.holded.com/es)
