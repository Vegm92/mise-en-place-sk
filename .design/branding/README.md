# Variaciones de color de marca

Cinco direcciones de paleta (A Pizarra, B Cocina, C Huerta, D Tinta, E Bodega),
cada una en claro y oscuro, montadas sobre la pantalla de Resumen para poder
compararlas sobre UI real en lugar de sobre muestras sueltas.

- `palettes.mjs` — las cinco paletas, con su motivación y su coste.
- `contrast.mjs` — comprueba WCAG AA (4,5:1) para texto, acento sobre superficie
  y cada color semántico sobre `surface` y `surface-2`. `node contrast.mjs`.
- `gen.mjs` — genera los diez artboards `.dc.html` y `canvas.json` a partir de
  `palettes.mjs`. `node gen.mjs`.
- `preview.mjs` — convierte un `.dc.html` en una página suelta para verlo en un
  navegador. `node preview.mjs Main.dc.html /tmp/x.html`.

Los `.dc.html`, `canvas.json` y el lienzo publicado son generados y no se versionan.

Cuando se elija una dirección, sus valores pasan a los tokens de `src/app.css`
(bloques `:root[data-theme="light"]`, `:root[data-theme="dark"]` y el acento
`.mep[data-accent="..."]`).

Nota surgida al construirlo: el `--mep-caution` actual (`#8a7300`) se queda en
4,43:1 sobre `--mep-surface-2`. En las cinco variantes está en `#7f6b00`.
