ALTER TABLE "suppliers" ADD COLUMN "type" text[];--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "tags" text[];--> statement-breakpoint
-- Incidencia #22 (mvp-modular-limpio): backfill tipo+etiqueta desde la categoria unica de siempre.
-- Categorias sin mapeo conocido (incl. 'Other'/NULL) se quedan sin tipo -> aparecen en Avisos.
UPDATE "suppliers" SET "type" = ARRAY[]::text[], "tags" = ARRAY[]::text[] WHERE "type" IS NULL;--> statement-breakpoint
UPDATE "suppliers" s SET
  "type" = m.type,
  "tags" = m.tags
FROM (VALUES
  ('Frutas y Verduras',        ARRAY['Comida'],    ARRAY['Frutas y Verduras']),
  ('Carnes y Derivados',       ARRAY['Comida'],    ARRAY['Carnes']),
  ('Pescados y Mariscos',      ARRAY['Comida'],    ARRAY['Pescado']),
  ('Lácteos',                  ARRAY['Comida'],    ARRAY['Lácteos']),
  ('Aceites y Conservas',      ARRAY['Comida'],    ARRAY['Aceites y Conservas']),
  ('Bebidas',                  ARRAY['Bebidas'],   ARRAY['Refrescos']),
  ('Panadería y Bollería',     ARRAY['Comida'],    ARRAY['Panadería']),
  ('Especias y Condimentos',   ARRAY['Comida'],    ARRAY['Especias']),
  ('Productos de Limpieza',    ARRAY['Artículos'], ARRAY['Limpieza']),
  ('Congelados',               ARRAY['Comida'],    ARRAY['Congelados']),
  ('Embutidos y Charcutería',  ARRAY['Comida'],    ARRAY['Embutidos']),
  ('Vinos y Cavas',            ARRAY['Bebidas'],   ARRAY['Vinos y Cavas']),
  ('Café y Bebidas Calientes', ARRAY['Bebidas'],   ARRAY['Café'])
) AS m(category, type, tags)
WHERE s."category" = m.category;
