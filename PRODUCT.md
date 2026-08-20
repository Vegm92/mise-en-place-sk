# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Confirmado:** no son dos perfiles separados sino la misma persona/equipo de cocina, con dos modos de uso muy distintos a lo largo del turno:

- **Modo prisa (mayor parte del día):** recepción de mercancía a media faena — fotografiar/subir albaranes, revisiones rápidas, todo desde el móvil, con las manos ocupadas y sin margen de atención.
- **Modo tranquilo (momentos más calmados):** hacer escandallos y revisar documentos con más detenimiento.

Aun en el modo "tranquilo", el criterio de partida es que en cocina casi siempre hay prisa de fondo — diseñar asumiendo urgencia por defecto, no calma.

**Secundarios (por evidencia del repositorio, no confirmados en entrevista):** dueño/gerente del restaurante, que revisa facturas, proveedores, analítica de precios y presupuestos, probablemente desde escritorio; administración/gestoría en algunos casos.

## Product Purpose

Inteligencia de facturas de proveedor para restaurantes independientes, impulsada por IA. El restaurante fotografía o sube un albarán/factura (PDF/JPG/PNG); Gemini extrae proveedor, cabecera y líneas con confianza por campo; la persona revisa y confirma; la app convierte eso en histórico de precios, alertas de subida de precio, presupuestos, recordatorios de pago y (a construir) escandallos de recetas.

Éxito = cero fricción en captura + datos fiables para poder calcular después el coste real de cada plato.

## Positioning

Nicho: no es un ERP ni una app de contabilidad genérica. La diferencia frente a alternativas es leer papel real (incluyendo correcciones manuscritas del repartidor) con OCR+IA con confianza por campo, y encadenar ese dato automáticamente hacia el control de escandallos — algo que una app de facturación genérica no hace.

## Operating Context

- Recepción de mercancía en cocina: fotos tomadas con prisa, a veces con tachones a bolígrafo sobre cantidades impresas (la corrección manuscrita debe primar).
- Canal alternativo de captura: WhatsApp, además de la app.
- Conectividad no garantizada en cocina: existe cola de subida offline (IndexedDB).
- Contexto regulatorio español: VERI*FACTU (obligatorio 2027) y facturación electrónica B2B (Ley Crea y Crece) — la app no emite facturas, pero sí parseará QR VERI*FACTU y formatos estructurados (Facturae/UBL).
- Multi-tenant: cada restaurante es un tenant aislado (`restaurant_id` en cada tabla).

## Capabilities and Constraints

- Trabajo de rediseño vive en la rama `mvp-modular-limpio`; `main` es producción real con cobro activo por Stripe — no se fusiona sin decisión explícita.
- MVP definido en 3 pasos secuenciales (ver `PROPUESTA_MVP.md`): Paso 1 (captura + OCR + revisión) completo a nivel de código; Paso 2 (histórico de precios) mayormente completo; Paso 3 (escandallos/recetas) no construido todavía.
- Terminología del dominio: "albarán" (delivery note, puede no llevar precio todavía → "Pendiente de tarificación"), "factura" (invoice), "escandallo" (recipe costing / food cost).
- Convención de código: sin tildes en nombres de BD/código (`ALBARAN`), pero los textos que ve el usuario sí llevan tilde ("Albarán").
- Stack existente: SvelteKit 2 + Svelte 5 (runes), Tailwind CSS 4, shadcn-svelte/bits-ui; componentes ya organizados en variantes `mobile/*` y `desktop/*`.

## Brand Commitments

- Nombre completo del producto: **"Mise en Place"** — al CEO le gusta la jerga/referencia culinaria que tiene, se mantiene como nombre de marca.
- **Abierto, no decidido todavía:** como nombre de app es largo; explorar en el rediseño si el nombre corto ya existente ("Mise", ya usado como `short_name` en el manifest PWA) debe ser el que se muestre en UI (cabecera, icono, etc.) mientras "Mise en Place" queda para contextos formales/marketing. Esto se resuelve como parte del trabajo visual, no está cerrado aquí.
- Sin logo formal fuera de los iconos de la PWA. El naranja/terracota mencionado es una referencia al color de un logo que le gusta al CEO, no una paleta de marca ya fijada — hay apertura a propuestas distintas si hay un criterio sólido detrás, procurando que el naranja siga presente de alguna forma.
- La paleta y forma actuales (terracota `#B8741A` sobre fondo cálido `#F5F4F0`, definidos en `static/manifest.webmanifest`) **no son un activo de marca a preservar tal cual**: se pidió explícitamente repensar colores, formas y disposición de la interfaz completa, con el naranja como hilo conductor deseable pero no obligatorio.

## Evidence on Hand

- Contenido regulatorio (VERI*FACTU, Ley Crea y Crece) es real, documentado en `README.md`.
- No hay testimonios, casos de cliente, ni cifras de mercado a mostrar — no inventar ninguno.
- Iconos PWA existentes en `static/icons/` y `static/favicon*`.

## Product Principles

1. Cero fricción en la captura: es el paso donde el usuario tiene más prisa y menos paciencia (recepción de mercancía en cocina).
2. Ante la duda entre "más completo" o "más simple pero entendible", se elige lo simple.
3. Reconstrucción, no invención: lo que ya funciona en `main` se trae y se pule, no se reescribe por reescribir.
4. Avance en fases probadas: no se avanza a la siguiente fase hasta que la anterior funciona de verdad, viéndola usada, no solo compilando.
5. Bilingüe es/en, español primero.

## Accessibility & Inclusion

No se ha establecido ningún requisito de accesibilidad específico más allá del soporte bilingüe es/en. A definir si surge una necesidad concreta.
