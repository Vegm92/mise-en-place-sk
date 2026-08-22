ALTER TABLE "suppliers" ADD COLUMN "type" text[];--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "tags" text[];--> statement-breakpoint
-- Incidencia #22 (mvp-modular-limpio): backfill tipo+etiqueta desde la categoria unica de siempre.
-- Categorias sin mapeo conocido (incl. 'Other'/NULL) se quedan sin tipo -> aparecen en Avisos.
UPDATE "suppliers" SET
  "type" = CASE "category"
    WHEN 'Frutas y Verduras'        THEN ARRAY['Comida']
    WHEN 'Carnes y Derivados'       THEN ARRAY['Comida']
    WHEN 'Pescados y Mariscos'      THEN ARRAY['Comida']
    WHEN 'Lácteos'                  THEN ARRAY['Comida']
    WHEN 'Aceites y Conservas'      THEN ARRAY['Comida']
    WHEN 'Bebidas'                  THEN ARRAY['Bebidas']
    WHEN 'Panadería y Bollería'     THEN ARRAY['Comida']
    WHEN 'Especias y Condimentos'   THEN ARRAY['Comida']
    WHEN 'Productos de Limpieza'    THEN ARRAY['Artículos']
    WHEN 'Congelados'               THEN ARRAY['Comida']
    WHEN 'Embutidos y Charcutería'  THEN ARRAY['Comida']
    WHEN 'Vinos y Cavas'            THEN ARRAY['Bebidas']
    WHEN 'Café y Bebidas Calientes' THEN ARRAY['Bebidas']
    ELSE ARRAY[]::text[]
  END,
  "tags" = CASE "category"
    WHEN 'Frutas y Verduras'        THEN ARRAY['Frutas y Verduras']
    WHEN 'Carnes y Derivados'       THEN ARRAY['Carnes']
    WHEN 'Pescados y Mariscos'      THEN ARRAY['Pescado']
    WHEN 'Lácteos'                  THEN ARRAY['Lácteos']
    WHEN 'Aceites y Conservas'      THEN ARRAY['Aceites y Conservas']
    WHEN 'Bebidas'                  THEN ARRAY['Refrescos']
    WHEN 'Panadería y Bollería'     THEN ARRAY['Panadería']
    WHEN 'Especias y Condimentos'   THEN ARRAY['Especias']
    WHEN 'Productos de Limpieza'    THEN ARRAY['Limpieza']
    WHEN 'Congelados'               THEN ARRAY['Congelados']
    WHEN 'Embutidos y Charcutería'  THEN ARRAY['Embutidos']
    WHEN 'Vinos y Cavas'            THEN ARRAY['Vinos y Cavas']
    WHEN 'Café y Bebidas Calientes' THEN ARRAY['Café']
    ELSE ARRAY[]::text[]
  END
WHERE "type" IS NULL;