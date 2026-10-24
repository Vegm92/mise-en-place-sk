# 01 · Método para construir la lista ICP (Barcelona) + lista semilla

**Objetivo:** 10 restaurantes de pago en 8 semanas, al menos 3 en el plan superior (Business).
**Embudo de referencia (supuesto interno, a medir desde la semana 1):** ~150 cuentas cualificadas → ~40 conversaciones → ~20 demos → ~12 pilotos → 10 de pago. Si a las 3 semanas la tasa real es peor, se amplía la lista, no se baja el listón del ICP.

---

## 1. El ICP en una tabla

| | Entra | Fuera |
|---|---|---|
| **Tamaño** | Grupo independiente de 2 a 10 locales, **o** un solo local de alto volumen o alta gama | Más de 10 locales; cadenas con central de compras |
| **Compra a proveedores** | ≥ 20.000 €/mes (grupo o local) | < 10.000 €/mes: el dolor no paga una suscripción |
| **Propiedad** | El dueño (o un socio) decide en una conversación | Participadas por fondos, franquicias sin autonomía de compra, restaurantes de hotel (compra el hotel) |
| **Cocina** | Producto fresco y caro: pescado, marisco, carne, producto de importación | Cafeterías, coctelerías, bares de copas con poca materia prima |
| **Zona** | Barcelona ciudad (cabeza de playa) | Resto de España, por ahora |
| **Señal extra** | Lo intentó con Excel y lo dejó; acaba de abrir locales; cocina de mercado con carta cambiante | Ya mete todas las facturas línea a línea en otra herramienta y está contento |

**Por qué ≥ 20.000 €/mes.** Es aritmética, no un dato de mercado: con 20.000 € de compra al mes, una subida del 2 % que pase sin verse son 400 € al mes (20.000 × 0,02) y 4.800 € al año (400 × 12). Esa cifra se compara con [PRECIO_TIER] × 12.

### Límites del producto que condicionan el ICP (léalo antes de priorizar grupos)

- **Multi-local está en piloto.** El plan Business admite hasta **5 locales** (`maxLocations = 5` en `src/lib/server/billing.ts`). Crear locales nuevos está detrás de un interruptor beta (`beta_feature_multiLocation`, apagado por defecto) y `docs/03_features/multi_locations.md` lista 4 desviaciones abiertas (cuota, facturación y plan leídos desde el local activo en vez del grupo).
- **No hay vista consolidada de grupo.** Cada local es un espacio de datos aislado; se cambia de local con un selector. «Qué local compra más caro» **no** es una pantalla que exista hoy.
- **No hay invitación de usuarios** (el rol `member` está reservado, sin flujo de invitación). Un grupo con un responsable de compras y varios jefes de cocina querrá varios accesos: confirmar cómo se resuelve antes de prometerlo.
- **Consecuencia práctica:** prioriza grupos de 2–5 locales. Los de 6–10 entran en la lista, pero el piloto se hace en 1–2 locales y se dice con claridad qué no hay todavía.

---

## 2. Fuentes y qué sacar de cada una

| Fuente | Para qué | Cómo |
|---|---|---|
| **Google Maps** | Descubrir locales, contar sedes de una marca, volumen (nº de reseñas como proxy de afluencia), horario (servicios/día) | Buscar «[marca] Barcelona» y contar fichas; anotar nº de reseñas y franja de precio (€€–€€€€) |
| **Guía Michelin** (guide.michelin.com) | Alta gama: estrellas, Bib Gourmand, recomendados. Lista oficial de Barcelona: [todas las estrellas de Barcelona](https://guide.michelin.com/es/es/articulo/dining-out/todas-las-estrellas-michelin-de-barcelona) | Filtrar Barcelona; descartar los de hotel |
| **Guía Repsol** (Soles) | Alta gama y novedades. Nuevos Soles 2026 en Barcelona: Dos Palillos, Amar, Besta, Eldelmar, Prodigi ([Time Out](https://www.timeout.es/barcelona/es/noticias/cataluna-lidera-el-ranking-de-soles-repsol-en-espana-con-122-restaurantes-021726)) | Cruzar con Michelin; las aperturas recientes son buena señal |
| **Time Out Barcelona** | Quién es el dueño, qué grupo tiene qué locales, aperturas y cierres | Las fichas suelen nombrar al grupo y al responsable |
| **Gremi de Restauració de Barcelona** | Asociación con ~9.000 establecimientos asociados ([Ara, dic. 2025](https://es.ara.cat/lengua/rotulos-menus-camareros-hablen-catalan-barcelona-gremio-restauracion-subvenciona-traducciones_1_5580723.amp.html)); su junta incluye propietarios del ICP (p. ej. Via Veneto, [betevé](https://beteve.cat/economia/via-veneto-semproniana-junta-gremi-de-restauracio-de-barcelona/)) | Eventos, junta directiva, posibles jornadas para asociados. Canal de prescripción, no de lista masiva |
| **BORME** (boe.es/diario_borme) y **LibreBORME** | Razón social, administradores, fecha de constitución, ampliaciones | Buscar la razón social (sale en el aviso legal de la web del restaurante) |
| **eInforma / Axesor** | Rango de ventas, empleados, CNAE, sociedades vinculadas al mismo administrador | Ficha básica gratuita; informe completo de pago |
| **SABI (Bureau van Dijk)** | Cuentas anuales completas: **la línea «Aprovisionamientos» de la cuenta de PyG es literalmente lo que compran a proveedores** | Acceso vía biblioteca universitaria, cámara de comercio o suscripción. Alternativa: depósito de cuentas en el Registro Mercantil (registradores.org), de pago por documento |
| **LinkedIn** | Identificar director de operaciones, responsable de compras, controller; ofertas de empleo («responsable de compras», «administrativo/a de facturas») = señal de dolor | Búsqueda por empresa + «compras», «operaciones», «food cost» |
| **Web propia del grupo** | Lista oficial de locales, aviso legal (razón social y CIF), email general o formulario | Siempre la fuente final para contar locales |
| **Prensa**: La Vanguardia, Directo al Paladar, Ara, Alimarket, Barcelona Food Experience | Aperturas, cierres, cambios de propiedad, entrevistas con cifras | Buscar «[grupo] abre», «[grupo] facturación» |

---

## 3. Filtros, en este orden

1. **Independiente y con decisión local.** Fuera: participadas por fondos, franquicias, más de 10 locales, restaurante dentro de hotel.
2. **Número de locales** (2–10) **o** local único con volumen alto (≥ 150 plazas o ≥ 2 servicios diarios llenos) o alta gama (estrella Michelin / 2–3 Soles).
3. **Ticket medio:** €€€ o más, o €€ con volumen muy alto.
4. **Tipo de cocina:** pescado, marisco, carne, japonés, cocina de mercado → máxima volatilidad de precio de compra.
5. **Gasto estimado con proveedores ≥ 20.000 €/mes** (método abajo).
6. **Ya usa software de compras** (Gstock, Haddock, Kitchen Stocker, Yurest, ERP propio): no descalifica, pero baja prioridad. Preguntar en la primera llamada.

## 4. Cómo estimar el gasto con proveedores

**Método A (preferido): cuentas anuales.**
Gasto mensual con proveedores ≈ «Aprovisionamientos» (PyG del último ejercicio depositado) ÷ 12.
Si el grupo tiene varias sociedades (una por local, muy habitual), sumar las sociedades del mismo administrador (eInforma/Axesor las relacionan).

**Método B (si no hay cuentas): capacidad.**
Gasto mensual ≈ plazas × ocupación media × servicios/día × días abiertos/mes × ticket medio × % de coste de materia prima.
- Todos los factores salen de observación (Google Maps, web, carta) **excepto el % de materia prima, que es un supuesto interno** y debe preguntarse en la llamada.
- **Nunca usar el resultado del método B en un email o en la demo.** Sirve solo para ordenar la lista. En el contacto, la cifra la pone el cliente.

**Método C (en la llamada):** «¿Cuánto compraron a proveedores el mes pasado, aproximadamente?» — es la única cifra que se usa delante del cliente.

---

## 5. Modelo de puntuación (0–100)

| Criterio | Puntos |
|---|---|
| **Locales** | 1 local de alto volumen/alta gama: 12 · 2 locales: 14 · 3–5: 25 · 6–10: 18 (el producto llega a 5 locales; más es trabajo manual) |
| **Gasto estimado con proveedores/mes** | < 10k: 0 · 10–20k: 8 · 20–50k: 18 · > 50k: 25 |
| **Volatilidad de la materia prima** | Marisco/pescado/japonés/carne madurada: 15 · cocina de mercado mixta: 10 · pizza/brunch/café: 4 |
| **Decisión de compra** | Dueño decide y es accesible: 15 · director de operaciones/compras identificable: 12 · comité o central: 0 (descartar) |
| **Señal de momento** | Apertura o cierre reciente, cambio de chef o de propiedad, nueva distinción, oferta de empleo en compras/administración: hasta 10 |
| **Acceso** | Contacto común, presencia en el Gremi, email/formulario público, perfil de LinkedIn activo: hasta 10 |

**A (≥ 70):** contactar en la semana 1. **B (50–69):** semana 2–3. **C (< 50):** solo si sobra capacidad.
Revisar la puntuación tras la primera llamada: el gasto real que diga el cliente sustituye a la estimación.

---

## 6. Campos de la hoja CRM

Una fila por **cuenta** (grupo o local único); los contactos en una pestaña aparte enlazada por `id_cuenta`.

| Campo | Ejemplo / valores |
|---|---|
| `id_cuenta` | BCN-001 |
| `nombre_comercial` | Grupo La Flauta |
| `razon_social` / `cif` | Global Rambla Restauración, S.L. / (aviso legal de la web) |
| `n_locales_bcn` / `n_locales_total` | 4 / 4 |
| `locales` | Lista con dirección y barrio |
| `tipo_cocina` | tapas / marisco / japonés / brasa / alta cocina |
| `ticket_medio` | €€ / €€€ / €€€€ |
| `distinciones` | 2★ Michelin, 2 Soles… |
| `aprovisionamientos_anuales` | Cifra + ejercicio + fuente (SABI/eInforma/RM) |
| `gasto_mensual_estimado` | Cifra + método (A/B/C) |
| `gasto_mensual_declarado` | Lo que diga el cliente (sustituye al estimado) |
| `software_actual` | Excel / Gstock / Haddock / ERP / ninguno / desconocido |
| `gestoria` | Nombre si lo dicen (canal de prescripción) |
| `decisor_rol` | propietario / director de operaciones / chef ejecutivo / responsable de compras |
| `decisor_nombre` | **Solo si aparece en una fuente pública**; con `fuente_nombre` (URL) |
| `canal_contacto` | email general / formulario / teléfono / LinkedIn / visita |
| `contacto_publico` | Email o formulario publicado + URL donde aparece |
| `base_legal_contacto` | Interés legítimo B2B + fuente pública (ver nota LSSI en `02_secuencia_outreach.md`) |
| `score` / `tier` | 0–100 / A-B-C |
| `fuente_1`, `fuente_2` | URLs |
| `estado` | sin contactar → contactado → respuesta → llamada → demo → piloto → pago / descartado |
| `fecha_ultimo_toque`, `siguiente_paso`, `fecha_siguiente_paso` | |
| `objecion_principal` | Código de `05_objeciones.md` |
| `motivo_descarte` | |
| `notas` | Lo que dijo, en sus palabras |

---

## 7. Rutina de 2 semanas para llegar a ~150 cuentas

- **Días 1–2:** volcar la lista semilla (abajo), completar razón social y web oficial de cada una.
- **Días 3–5:** barrido por cocina en Google Maps (marisquerías, japoneses, brasas, arrocerías, cocina de mercado) por distritos: Eixample, Gràcia, Ciutat Vella, Sant Martí/Poblenou, Sarrià-Sant Gervasi, Les Corts. Anotar marcas con 2+ fichas.
- **Días 6–7:** Michelin + Repsol + Bib Gourmand de Barcelona, quitando hoteles.
- **Días 8–9:** cuentas anuales de las cuentas A (Aprovisionamientos) y decisores en LinkedIn.
- **Día 10:** puntuar, ordenar, preparar personalización de las 20 primeras (ver `07_emails_primer_contacto.md`).

---

## 8. Lista semilla (33 cuentas)

**Cómo se verificó.** Cada fila tiene al menos una URL pública. El navegador/lector de páginas no estaba disponible en esta sesión: la verificación se hizo sobre el contenido indexado que devolvía el buscador para esas URLs. **✔** = el dato clave (formato y nº de locales) aparece en una fuente reciente. **◐** = la fuente existe pero el recuento está fechado o no es oficial: confirmar en la web del grupo antes de contactar. Los nombres de personas solo aparecen cuando una fuente pública los cita; antes de usarlos, abrir la URL y comprobarlo.

**Contacto público.** Solo se indica un email cuando aparece publicado en una fuente oficial (guía del Ayuntamiento). Son buzones de **reservas**: no son el canal ideal para vender; úselos solo si no hay otro. En el resto, buscar el formulario o email general en la web oficial y anotar la URL.

| # | Cuenta | Locales (aprox.) | Fuente pública | Por qué encaja | Decisor probable | Contacto público | Score prelim. | Verif. |
|---|---|---|---|---|---|---|---|---|
| 1 | **Grupo La Flauta** (Global Rambla Restauración, S.L.) — La Flauta, Ciudad Condal, Cervecería Catalana | 3–5 (más una apertura en hotel) | [Alimarket](https://www.alimarket.es/restauracion/noticia_amp/410347/grupo-la-flauta-suma-en-barcelona-dentro-de-un-hotel) · [Barcelona Navigator](https://barcelonanavigator.com/cerveceria-catalana/) | Tapas de altísima rotación en el Eixample, compra diaria de fresco, grupo en crecimiento | Propietario / director de operaciones | Web citada en listados: laflautagroup.com (sin verificar) | 82 | ◐ |
| 2 | **Grupo Cabo** (Atandocabos 2020, S.L.) — Bodega del Cabo y otros | 8 (dato de 2022) | [Alimarket](https://www.alimarket.es/restauracion/noticia_amp/362329/grupo-cabo-consolida-en-2022-su-oferta-de-restauracion-singular-en-barcelona) · [Time Out](https://www.timeout.es/barcelona/es/restaurantes/bodega-del-cabo) | 5 aperturas en un año, menú del día (margen ajustado), expansión por barrios | Fundador (Time Out cita a Rodrigo Varela al frente) | Sin web localizada; sede social Ali Bei 125 (Alimarket) | 80 | ◐ |
| 3 | **Parking Pizza** | 5 en BCN + 2 en Madrid (nov. 2025) | [Ara](https://es.ara.cat/comer/parking-pizza-diez-anos-pleno-auge-tendra-nuevos-locales-barcelona-madrid_1_5559472.html) · [Forbes](https://forbes.es/?p=393164) · [Alimarket](https://www.alimarket.es/restauracion/noticia_amp/382930/parking-pizza-preve-crecer-con-4-5-locales-al-ano) | 7 locales, CEO profesional desde 2023, plan de 4–5 aperturas/año: necesita control por local | CEO (Forbes: Santiago Font) / fundadora (Berta Bernat) | Buscar en su web | 74 | ✔ |
| 4 | **Grupo Nomo** — Nomo Gràcia, Galvany, Sarrià, Nomo Market; Costa Brava, Girona, Madrid | ~10 (4 en BCN) | [Qué!](https://www.que.es/economia/empresas-grupo-nomo-desembarca-madrid.html) · [Time Out](https://www.timeout.es/barcelona/es/restaurantes/nomo) | Japonés: pescado crudo de alto coste y volátil; ~200 personas de equipo | Socios fundadores (hermanos Molina-Martell) / director de operaciones | Buscar en su web | 76 | ◐ |
| 5 | **El Glop** — Taverna El Glop, Taverna El Nou Glop, Braseria El Glop, El Glop Gaudí | 4 | [ma.to](https://ma.to/venue/elglopbarcelona) · [Guia BCN](https://guia.barcelona.cat/en/detall/restaurant-taverna-el-nou-glop_75990210155.html) | Brasa, carne y arroces desde 1978; volumen muy alto (miles de reseñas por local) | Propietario familiar / gerente | reserves@grupelglop.com ([Guia BCN](https://guia.barcelona.cat/en/detall/restaurant-taverna-el-nou-glop_75990210155.html)) — es de reservas | 83 | ✔ |
| 6 | **7 Portes** | 1 (más de 200 comensales a la vez) | [Dossier grupos 2026](https://7portes.com/downloads/resumen_7portesdossiergrupos_2026_es.pdf) · [Barcelona Navigator](https://barcelonanavigator.com/restaurant-7-portes/) | Local único de volumen muy alto, arroces y marisco, abierto todos los días | Gerencia / propiedad; jefe de compras si existe | reserves@7portes.com ([Guia BCN](https://guia.barcelona.cat/en/detall/restaurant-7-portes_75990279824.html)) — es de reservas | 78 | ✔ |
| 7 | **El Nacional** (Passeig de Gràcia 24 bis) | 1 espacio: 4 restaurantes + 4 barras, +700 comensales | [Time Out](https://www.timeout.com/barcelona/restaurants/el-nacional-barcelona-a-restaurant-that-used-to-be-a-theatre-a-factory-and-a-car-park) · [Dossier](https://apiv1.meetmaps.com/files/12963/el_nacional_en_8170127100547.pdf) | Volumen enorme y muchas familias de producto (brasa, pescado, marisco, ostras) | Director de operaciones / responsable de compras (propiedad no confirmada) | Buscar en su web | 78 | ✔ |
| 8 | **Disfrutar + Compartir Barcelona + Compartir Cadaqués** | 3 | [Fine Dining Lovers](https://www.finedininglovers.co.uk/explore/articles/discover-compartir-barcelona-new-restaurant-disfrutar-family) · [Four Magazine](https://www.four-magazine.com/tasting-notes/oriol-castro-eduard-xatruch-and-mateu-casanas-to-open-new-restaurant-in-barcelona/) | 3★ Michelin + Compartir BCN (550 m², 80 plazas); producto de máxima calidad | Socios (Castro, Xatruch, Casañas); director y socio de Compartir BCN (Nil Dulcet, según fuente) | Buscar en su web | 72 | ✔ |
| 9 | **Cocina Hermanos Torres** | 1 (3★, nave de 800 m²) | [Ara](https://es.ara.cat/comer/tercera-estrella-michelin-hermanos-torres-noche-dorada-gastronomia-catalana_1_4555403.amp.html) · [Gastroranking](https://gastroranking.es/r/cocina-hermanos-torres_155261/) | Alta gama, gasto por cubierto muy alto | Chefs-propietarios / administración | Buscar en su web | 62 | ✔ |
| 10 | **Grupo Koy** (Hideki Matsuhisa) — Shunka, Koy Shunka (1★), Majide, IKOYA; Koy Hermitage (Andorra) | 4–5 | [MAFF Japón](https://www.maff.go.jp/e/policies/market/award/attach/pdf/index-88.pdf) · [Michelin](https://guide.michelin.com/en/catalunya/la-barceloneta/restaurant/koy-shunka) | Japonés con producto de importación y pescado: precio muy volátil | Propietario-chef | Buscar en su web | 76 | ◐ |
| 11 | **Gresca, Gresca Bar, Bar Torpedo** (Rafa Peña) | 3 | [Ara](https://es.ara.cat/comer/cenar-tarde-barcelona-solucion-despues-teatro-oa-concierto_1_4950087.html) · [ma.to](https://ma.to/venue/restaurantgresca) | Premio Nacional de Gastronomía 2023; caza y producto; cocina compartida entre dos locales | Rafa Peña / Mireia Navarro | Buscar en su web | 70 | ✔ |
| 12 | **Rafa Zafra** — Estimar (BCN y Madrid), Masia Tibidabo, Rural (Madrid) y otros | ~7 (BCN, Madrid, Ibiza, Sevilla; cifra aproximada) | [Ara: Masia Tibidabo](https://es.ara.cat/comer/masia-tibidabo-nuevo-restaurante-rafa-zafra-barcelona-pies_1_5758322.html) · [Ara: cierre Per Feina](https://es.ara.cat/comer/rafa-zafra-cierra-restaurante-feina-facturabamos-dia-mesa-l-estimar_1_5762660.html) | Marisco premium (máxima volatilidad); acaba de cerrar un local por rentabilidad | Rafa Zafra / Anna Gotanegra / gerencia | Buscar en su web | 80 | ✔ |
| 13 | **Sensi** — Sensi Tapas, Sensi Bistro, Gourmet Tapas Sensi, Mezzanine, Paz 19 | 4–5 (Gòtic) | [Barcelona.de](https://www.barcelona.de/en/sensi-restaurant.html) · [Time Out](https://www.timeout.es/barcelona/es/restaurantes/gourmet-sensi) · [Gastroranking](https://gastroranking.es/r/sensi-tapas_188/) | Mucho volumen turístico en un radio de 200 m; compras que se pueden centralizar | Fundadores (una fuente cita a Alexandre Dubourgais y Alexis Alary) | Buscar en su web | 72 | ◐ |
| 14 | **Lluritu** — Lluritu, Lluritu 2, Lluritu 3 | 3 | [Time Out](https://www.timeout.es/barcelona/es/restaurantes/lluritu-3) · [Ara](https://es.ara.cat/comer/marisqueria-declara-desenfadada-precios-acaba-inaugurar-tercer-local-barcelona_1_5176852.html) | Marisquería a precio moderado: cada subida de marisco se come el margen | Socios fundadores | Buscar en su web | 82 | ✔ |
| 15 | **Grupo Varela** — La Xarxa/Casa Varela, Bodega La Puntual, L'Estupendu, Galante | 4–5 (BCN y Badalona) | [ma.to](https://ma.to/venue/grupovarela) · [Time Out: Galante](https://www.timeout.es/barcelona/es/restaurantes/galante) · [Time Out: La Puntual](https://www.timeout.com/barcelona/restaurants/bodega-la-puntual) | Cocina de mercado en varios formatos; grupo familiar desde 1960 | José Varela (propietario, según Time Out) | Web citada en listado: grupovarela.es (sin verificar) | 77 | ✔ |
| 16 | **Teresa Carles Healthy Foods** — Teresa Carles, Flax & Kale (varios), Teresa's | ~6–8 (BCN, Madrid, Lleida) | [Alimarket](https://www.alimarket.es/restauracion/noticia_amp/231680/el-grupo-de-restauracion-teresa-carles-se-consolida-en-barcelona) · [Ara](https://es.ara.cat/comer/han-dicho-durante-anos-raros-hippies-acelgas-sorprendentemente-hemos-tenido-restaurantes-llenos_128_5204410.html) | Multi-local, +140 empleados, fresco + pescado azul; además vende en retail (compras complejas) | Familia Barri Carles / director de operaciones / compras | Buscar en su web | 64 | ◐ |
| 17 | **Grup Ramonet** — Can Ramonet, El Nou Ramonet | 2 | [Tab Travel](https://theguide.tab.travel/QPQCK/can-ramonet) · [OpenTable](https://www.opentable.de/r/can-ramonet-barcelona) | Marisco en la Barceloneta, comidas de grupo | Propietario | Buscar en su web | 66 | ✔ |
| 18 | **Ikibana** — Paral·lel, Sarrià, Born | 3 | [FC Barcelona](https://www.fcbarcelona.es/es/noticias/3799872/20-de-descuento-en-los-restaurantes-ikibana-de-barcelona-parallel-born-y-sarria/amp) · [Gastroranking](https://gastroranking.es/r/ikibana-paralelo_50902/) | Japonés-brasileño: pescado + carne, locales grandes | Propietario / director de operaciones | Web citada: ikibana.com | 68 | ✔ |
| 19 | **Brunch & Cake** | ~6 en BCN + presencia internacional | [Time Out](https://www.timeout.es/barcelona/es/restaurantes/brunch-cake) · [HighXtar](https://highxtar.com/en/the-best-brunches-in-barcelona-are-back/) | 6 locales de alta rotación. **Verificar** si lo internacional es franquicia y si compran centralizado | Fundadores / director de operaciones | Buscar en su web | 55 | ◐ |
| 20 | **Federal Café** | 2 en BCN + Girona, Madrid, Valencia, Sitges | [Valencia Plaza](https://valenciaplaza.com/cultura-y-sociedad/el-popular-federal-cafe-abrira-en-el-corazon-de-valencia) · [Time Out](https://www.timeout.es/barcelona/es/restaurantes/federal-cafe) | ~6 locales, pero formato café: gasto por local más bajo | Fundadores (una fuente cita a Christopher King y Tommy Tang) | Buscar en su web | 48 | ✔ |
| 21 | **Xiringuito Escribà** | 1 en BCN (+ Tokio) | [Lonely Planet](https://www.lonelyplanet.com/points-of-interest/xiringuito-escriba/1106189) · [Metropolis Japan](https://metropolisjapan.com/xiringuito-escriba/) | Arrocería de playa de mucho volumen, marisco | Familia Escribà / gerencia | Buscar en su web | 70 | ✔ |
| 22 | **Alkimia + Al Kostat** (Jordi Vilà) | 2 (mismo edificio) | [Michelin: Alkimia](https://guide.michelin.com/de/de/catalunya/barcelona/restaurant/alkimia) · [Michelin: Al Kostat](https://guide.michelin.com/ar/es/catalunya/barcelona/restaurante/alkostat) | 1★ + bistró; mucho pescado | Jordi Vilà | Buscar en su web | 64 | ✔ |
| 23 | **Dos Palillos + Dos Pebrots** (Albert Raurich) | 2 | [VilaWeb](https://www.vilaweb.cat/noticies/albert-raurich-una-herencia-del-bulli-ha-estat-treballar-en-exces/) · [Time Out](https://www.timeout.com/barcelona/restaurants/dos-pebrots) | 1★ y 2 Soles nuevos en 2026; producto asiático de importación | Albert Raurich / Tamae Imachi; Dos Pebrots: socios Takeshi Somekawa y Adri de Pablo (VilaWeb) | Buscar en su web | 68 | ✔ |
| 24 | **Mont Bar** | 1 (2★ desde la guía 2026) | [Michelin](https://guide.michelin.com/es/es/catalunya/barcelona/restaurante/mont-bar) · [Michelin 2026](https://guide.michelin.com/es/es/articulo/michelin-guide-ceremony/descubre-las-nuevas-estrellas-michelin-de-espana-para-2026) | Acaba de subir a 2★: más presión sobre producto y coste | Iván Castro (propietario) / Fran Agudo (chef) | Buscar en su web | 64 | ✔ |
| 25 | **Enigma** (Albert Adrià) | 1 (2★ desde la guía 2026) | [Michelin 2026](https://guide.michelin.com/es/es/articulo/michelin-guide-ceremony/descubre-las-nuevas-estrellas-michelin-de-espana-para-2026) · [Ara](https://es.ara.cat/comer/estrellas-michelin-llenan-ego-merecemos_128_5573863.html) | Alta gama, gasto por cubierto muy alto | Albert Adrià / gerencia | Buscar en su web | 58 | ✔ |
| 26 | **Via Veneto** | 1 (1★, desde 1967) | [Michelin](https://guide.michelin.com/es/es/catalunya/barcelona/restaurante/via-veneto) · [Ara](https://es.ara.cat/comer/via-veneto-restaurante-emblema-lujo-calido_1_5848861.html) · [betevé](https://beteve.cat/economia/via-veneto-semproniana-junta-gremi-de-restauracio-de-barcelona/) | Clásico de lujo; el propietario está en la junta del Gremi (posible prescriptor) | Pere Monje (propietario, según fuentes) | Buscar en su web | 72 | ✔ |
| 27 | **Besta + Batea** (y Arume) | 2–3 | [JRE](https://jre.eu/en/restaurants/bestabarcelona) · [Neo2: Batea](https://www.neo2.com/?p=431594) | Cocina gallego-catalana y marisquería; Besta, nuevo Sol Repsol 2026 | Socios-chefs (Manu Núñez, Carles Ramon; Marta Morales en Batea) | Buscar en su web | 76 | ✔ |
| 28 | **Mosquito, Grasshopper, Red Ant** | 3 | [Time Out: Red Ant](https://www.timeout.es/barcelona/es/restaurantes/red-ant-noodle-bar) · [Time Out: Mosquito](https://www.timeout.com/barcelona/restaurants/mosquito) | 3 locales asiáticos informales; ticket bajo | Propietario (Time Out cita a Giles Brown) | Buscar en su web | 50 | ✔ |
| 29 | **Los Reyes del Mango** — Terraza Martínez, Frankie Gallo Cha Cha Cha, The Campaner (Londres) | 3 | [Restaurant Online](https://www.restaurantonline.co.uk/Article/2023/06/06/Barcelona-based-group-Los-Reyes-del-Mango-has-opened-The-Campaner-at-London-s-Chelsea-Barracks/) · [Time Out](https://www.timeout.es/barcelona/es/noticias/la-arroceria-con-las-mejores-vistas-de-barcelona-cumple-diez-anyos-en-todo-lo-alto-072023) | Arroces y marisco a gran volumen en Montjuïc | Fundadora (fuente cita a Mar Martín) / socios | Buscar en su web | 74 | ◐ |
| 30 | **RíasKru** (Rías de Galicia + Espai Kru) | 1 (dos plantas) | [Ara (sep. 2026)](https://en.ara.cat/food/borja-iglesias-the-rias-galicia-in-barcelona-is-not-for-sale-for-more-than-two-million-euros-even-if-real-estate-agency-says_1_5852690.html) · [Time Out](https://www.timeout.es/barcelona/es/restaurantes/rias-de-galicia) | Marisco gallego premium | Gerente (Ara cita a Borja Iglesias; propiedad: Manuel Lao) | Buscar en su web | 70 | ✔ |
| 31 | **Can Majó** | 1 | [Barcelona Navigator](https://barcelonanavigator.com/can-majo/) · [Gastroranking](https://gastroranking.es/r/can-majo_128/) | Marisquería familiar en la Barceloneta desde 1968 | Familia propietaria | Buscar en su web | 60 | ✔ |
| 32 | **Cal Pep** | 1 | [Falstaff](https://www.falstaff.com/en/restaurants/cal-pep-restaurant-barcelona) · [Ajuntament](https://ajuntament.barcelona.cat/comerc/en/passadis-del-pep) | Tapas de mar con rotación muy alta, compra diaria | Propietario (Pep Manubens, según fuentes) | Buscar en su web | 60 | ✔ |
| 33 | **Passadís del Pep** | 1 | [Ajuntament](https://ajuntament.barcelona.cat/comerc/en/passadis-del-pep) · [Directo al Paladar](https://www.directoalpaladar.com/chefs/adios-a-joan-manubens-el-cocinero-catalan-que-enamoro-a-las-estrellas-de-hollywood) | Sin carta, producto de mercado del día: precio cambiante cada semana | Propietario (2.ª generación, según fuentes) | Buscar en su web | 60 | ✔ |

**Recuento:** 33 cuentas, todas con fuente pública; 25 con el dato clave confirmado (✔) y 8 con recuento fechado o sin confirmar (◐).

### Excluidas a propósito (y por qué)

| Cuenta | Motivo | Fuente |
|---|---|---|
| Grupo Tragaluz / En Compañía de Lobos | 23 restaurantes y participado mayoritariamente por Miura (fondo) | [Alimarket](https://www.alimarket.es/restauracion/noticia_amp/300188/miura-se-hace-con-mas-del-60--de-grupo-tragaluz-en-compania-de-lobos) |
| Grupo Sagardi | ~32 restaurantes en varios países | [Alimarket](https://www.alimarket.es/restauracion/noticia_amp/305763/sagardi-abre-en-amsterdam-y-lanza-la-nueva-marca--cadaques-cuina-mediterrania-) |
| Grupo Andilana (Les Quinze Nits…) | 25–34 restaurantes y participación de Meridia | [Alimarket](https://www.alimarket.es/restauracion/noticia_amp/232628/meridia-toma-una-participacion-minoritaria-pero-significativa-en-andilana) |
| Grupo Moncho's (incl. Botafumeiro) | ~18 restaurantes; por encima del techo de 10 | [Alimarket](https://www.alimarket.es/restauracion/noticia_amp/248502/grupo-moncho-s-reabrira-el--daps--de-an-grup-como--europa-cafe-) |
| Bacoa | Propiedad de AmRest (cadena con central) | [Alimarket](https://www.alimarket.es/restauracion/noticia_amp/305748/amrest-realiza-la-tercera-apertura-del-ano-de-bacoa) |
| Lasarte, ABaC, Aleia | Restaurantes dentro de hotel: compra el hotel | [Michelin 2026](https://guide.michelin.com/es/es/articulo/michelin-guide-ceremony/descubre-las-nuevas-estrellas-michelin-de-espana-para-2026) |
| Lomo Alto / Lomo Bajo | Cerrado | [Time Out](https://www.timeout.es/barcelona/es/noticias/cierra-el-restaurante-de-carne-mas-grande-y-uno-de-los-mejores-de-barcelona-092826) |
| Tapas 24 | Carles Abellán dice no tener ya restaurantes; los locales pasaron a sus trabajadores. Posible cuenta, pero hay que localizar al nuevo decisor | [Ara](https://es.ara.cat/comer/he-pasado-seis-concursos-acreedores-tres-divorcios-cuatro-separaciones_128_4956817.html) |

**Nota competitiva:** según el análisis interno (`docs/onboarding/marketing/01_estrategia/analisis_competencia_bcn.md`), Gstock cita clientes en Barcelona. Preguntar siempre «¿qué usan hoy para las facturas?» antes de la demo.
