---
tags: [mep, features]
related: "[[CONTEXT]]"
---

# Ajustes y Ayuda

Fuentes de diseño de `/settings` y `/help`. Cada `.dc.html` es una lámina
(artboard) y `canvas.json` las coloca en el lienzo, repartidas en tres páginas.

## Qué hay

| Fichero | Qué es |
|---|---|
| `Main.dc.html` | Ajustes, escritorio (1280×980), las seis secciones navegables |
| `Movil.dc.html` | Ajustes, móvil (390×844): lista de secciones + panel |
| `Oscuro.dc.html` | La misma pantalla con la rampa oscura de `app.css` |
| `Ayuda.dc.html` | Centro de ayuda, escritorio, con raíl y buscador |
| `AyudaMovil.dc.html` | El centro de ayuda en móvil, con pastillas en vez de raíl |
| `Elementos.dc.html` | Hoja de elementos: cada componente de las dos pantallas y sus estados |

Las láminas son clicables: el buscador filtra, el raíl cambia de sección, los
deslizadores se mueven, los interruptores conmutan y la barra de guardado
aparece al primer cambio.

## Qué cambia respecto a lo que hay hoy

Mismo sistema —tokens de `src/app.css`, Mona Sans, acento ámbar, radios
4/6/10/999— reestructurado:

1. **Cabecera de sección dentro del contenido.** Hasta ahora solo el raíl decía
   dónde estabas.
2. **Buscador** sobre un índice de 25 ajustes; el resultado salta a su sección.
3. **Fila nueva.** La explicación sube bajo la etiqueta (columna de 232 px) en
   vez de colgar bajo el control, así la columna de controles queda alineada.
4. **Una barra de guardado** en lugar de seis botones «Guardar» repartidos.
   Cuenta los cambios pendientes y trae «Descartar». Los flujos —cambiar email,
   cambiar contraseña, eliminar cuenta— conservan su propio botón.
5. **Contraseña plegada** hasta que la abres.
6. **Tipos de alerta** con cabecera de grupo, contador y fila entera pulsable.
7. **WhatsApp a dos columnas:** número y QR a un lado, autorizados y código de
   emparejamiento al otro.
8. **Zona de riesgo plegada:** el bloque rojo aparece solo cuando lo pides.
9. **En móvil**, el acordeón pasa a lista + panel —una sección a la vez, con
   vuelta atrás— y cada fila resume su estado real.
10. **El centro de ayuda** gana el mismo raíl que Ajustes, con los pasos en
    rejilla 2×2, el tour como apartado propio, los trucos en tres columnas y
    las preguntas como acordeón.

## Estado

Implementado. `/settings` y `/help` siguen estas láminas; lo que se apartó del
diseño está anotado abajo.

- **Las láminas están en ámbar; la app ya no.** ADR-026 mueve el acento a
  `slate` y reserva el azul para la acción. El código no lo nota —todo va por
  `--mep-acc`— pero los `.dc.html` siguen con `#8a530f` quemado. Hay que
  volver a sembrarlos en slate antes de usarlos como referencia de color.
- Las dos pastillas de icono que la lámina pintaba con `--mep-info` (el enlace
  al centro de ayuda y el enlace a Ajustes) pasaron al tinte de acento: bajo
  ADR-026 ese azul es el de la acción, y ahí no había ninguna.

- La FAQ del centro de ayuda quedó como `<details>`/`<summary>` en vez del
  acordeón de una sola pregunta abierta: así se despliega sin JavaScript.
- Las filas de local no llevan el contador de albaranes que dibujaba la lámina
  (`128 albaranes este mes`): el `load` de la página no trae ese dato y no
  merece una consulta más.
- La tarjeta de perfil que encabezaba la lista en móvil tampoco está, por lo
  mismo: mostraba el plan, que esta página no carga.
- **Sección "Campos de la revisión" (issue #880), no está en las láminas.**
  Se añadió después de sembrar el lienzo: un interruptor por campo opcional
  de `batch/[id]` (fecha de vencimiento, notas), con el mismo patrón visual
  que "Tipos de alerta" (`alert-toggle`). Los campos obligatorios —proveedor,
  número, fecha del documento, importe— no aparecen aquí porque nunca se
  pueden ocultar. Quien vuelva a sembrar `Main.dc.html`/`Movil.dc.html`
  desde el editor debe añadirla a mano si quiere que las láminas la reflejen.

## Dónde vive el código

| Pieza | Fichero |
|---|---|
| Pantalla de ajustes | `src/routes/(app)/settings/+page.svelte` |
| Carga y acciones | `src/routes/(app)/settings/+page.server.ts` |
| Visibilidad de campos opcionales (issue #880) | `src/lib/server/field-visibility.ts` |
| Centro de ayuda | `src/routes/(app)/help/+page.svelte` |
| Contenido de la ayuda | `src/lib/help-content.ts` |
| Textos | `src/lib/i18n.ts` (claves `set.*` y `help.*`) |
| Tokens y clases | `src/app.css` |
| Tarjeta y deslizador | `src/lib/components/mep/{SectionCard,Slider}.svelte` |

Los textos de las láminas salen de `i18n.ts` sin retocar. Los datos son de
ejemplo (Casa Nou, tres locales, uno bloqueado) y el QR es un dibujo de
relleno, no un código válido.

## Volver a montar el lienzo

Las láminas se siembran en una copia del editor con el ayudante de la skill
`/design`; el `.html` resultante es una salida de compilación y no se versiona.

```
node <skill>/seed-canvas.mjs --template <skill>/payload.template.html \
  --out ajustes-y-ayuda.html --title "Ajustes y Ayuda" \
  --artboard Main.dc.html --artboard Movil.dc.html --artboard Oscuro.dc.html \
  --artboard Ayuda.dc.html --artboard AyudaMovil.dc.html --artboard Elementos.dc.html \
  --canvas canvas.json
```

`Oscuro.dc.html` se genera a partir de `Main.dc.html` cambiando los valores
claros por los de `:root[data-theme="dark"]`; si cambias `Main`, vuelve a
generarlo en vez de editarlo a mano.
