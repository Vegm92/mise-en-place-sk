ALTER TABLE "suppliers" ADD COLUMN "type" text[];--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "tags" text[];--> statement-breakpoint
-- Incidencia #22 (mvp-modular-limpio): backfill tipo+etiqueta desde la categoria unica de siempre.
-- Categorias sin mapeo conocido (incl. 'Other'/NULL) se quedan sin tipo -> aparecen en Avisos.
UPDATE "suppliers" SET "type" = ARRAY[]::text[], "tags" = ARRAY[]::text[] WHERE "type" IS NULL;--> statement-breakpoint
UPDATE "suppliers" SET "type" = ARRAY['Comida'] WHERE "category" = ANY(ARRAY[
  'Frutas y Verduras', 'Carnes y Derivados', 'Pescados y Mariscos', 'Lácteos',
  'Aceites y Conservas', 'Panadería y Bollería', 'Especias y Condimentos',
  'Congelados', 'Embutidos y Charcutería'
]);--> statement-breakpoint
UPDATE "suppliers" SET "type" = ARRAY['Bebidas'] WHERE "category" = ANY(ARRAY[
  'Bebidas', 'Vinos y Cavas', 'Café y Bebidas Calientes'
]);--> statement-breakpoint
UPDATE "suppliers" SET "type" = ARRAY['Artículos'] WHERE "category" = 'Productos de Limpieza';--> statement-breakpoint
UPDATE "suppliers" s SET "tags" = m.tags
FROM (VALUES
  ('Frutas y Verduras',        ARRAY['Frutas y Verduras']),
  ('Carnes y Derivados',       ARRAY['Carnes']),
  ('Pescados y Mariscos',      ARRAY['Pescado']),
  ('Lácteos',                  ARRAY['Lácteos']),
  ('Aceites y Conservas',      ARRAY['Aceites y Conservas']),
  ('Bebidas',                  ARRAY['Refrescos']),
  ('Panadería y Bollería',     ARRAY['Panadería']),
  ('Especias y Condimentos',   ARRAY['Especias']),
  ('Productos de Limpieza',    ARRAY['Limpieza']),
  ('Congelados',               ARRAY['Congelados']),
  ('Embutidos y Charcutería',  ARRAY['Embutidos']),
  ('Vinos y Cavas',            ARRAY['Vinos y Cavas']),
  ('Café y Bebidas Calientes', ARRAY['Café'])
) AS m(category, tags)
WHERE s."category" = m.category;
