# 04 · Oferta de piloto: 30 días con sus facturas reales

Dos partes: **(1)** la oferta tal como se le enseña al cliente (pegable en un email o PDF de una página) y **(2)** las reglas internas para medirla sin discusiones y los requisitos previos.

Los precios son marcadores: `[PRECIO_TIER]` (Starter, Pro o Business según el caso), `[PRECIO_PILOTO]` y `[DESCUENTO_FUNDADOR]`. El precio se decide aparte.

---

## 1. La oferta (versión cliente)

> **Piloto de 30 días · Mise en Place · [CUENTA]**
>
> **La condición:** si en 30 días no detectamos al menos **[X] €** en subidas de precio, errores o cobros de más en sus facturas reales, **no paga nada**.
>
> **Cómo se calcula [X]:** el 1 % de lo que usted compra a proveedores en un mes.
> Usted nos dice que compra **[G] €** al mes → **[X] = [G] × 0,01 = [resultado] €**.
>
> **Lo que hace usted**
> 1. Antes del día 3: sube las facturas y albaranes de los **últimos 2–3 meses** de sus **3 a 5 proveedores principales** (foto o PDF; puede ser por lotes o un ZIP).
> 2. Durante los 30 días: sube **todo lo que llegue de esos proveedores** en menos de 48 h desde que lo recibe.
> 3. Dedica 20 minutos el día 15 y 30 minutos el día 30 a revisar los resultados conmigo.
>
> **Lo que hacemos nosotros**
> 1. Le dejamos la cuenta configurada el día 1: proveedores, umbral de aviso de precio al 2 % (usted puede cambiarlo).
> 2. Revisamos con usted lo que la app no haya leído con seguridad durante la primera semana.
> 3. El día 15, un resumen de lo encontrado hasta entonces.
> 4. El día 30, un **acta de hallazgos**: cada hallazgo con su factura, su línea y su cálculo. Usted puede quitar cualquiera que no le convenza; solo cuenta lo que los dos aceptamos.
> 5. Sus datos son suyos: puede exportar sus facturas a Excel y borrar la cuenta cuando quiera.
>
> **Día 30**
> - **Si los hallazgos aceptados no llegan a [X] €:** no paga nada. Puede irse o seguir; si sigue, empezamos a contar desde ese día.
> - **Si llegan a [X] € o más:** el mes de piloto se factura a **[PRECIO_PILOTO]** y la suscripción continúa a **[PRECIO_TIER] al mes** con el **descuento de fundador [DESCUENTO_FUNDADOR]** durante [DURACIÓN_DESCUENTO]. Sin permanencia: se cancela cuando quiera.
>
> **Lo que el piloto no incluye** (para que no haya sorpresas): no es un programa de facturación ni de contabilidad; no emite facturas, así que no sustituye al software que usted necesite para VERI\*FACTU; no se conecta todavía con su TPV; exporta a Excel, no a a3 ni a Contasol.

---

## 2. Qué cuenta como hallazgo (reglas internas, se comparten si el cliente las pide)

Tres tipos. Cada uno con fórmula; nada se proyecta para inflar la cifra.

### Tipo 1 · Subida de precio

Para cada producto, comprado **al mismo proveedor**, cuyo precio por unidad (o por kg/l cuando la app ha normalizado el formato) sube **≥ 2 %** respecto a su precio de referencia:

```
€ pagados de más = (precio nuevo − precio de referencia) × cantidad comprada al precio nuevo
```

- **Precio de referencia:** la mediana de hasta 3 precios anteriores de ese producto a ese proveedor (es la misma regla que usa la alerta de la app, `docs/03_features/price_alerts.md`).
- **Periodo:** solo compras **dentro de la ventana del piloto** (histórico subido + 30 días). No se cuentan meses futuros.
- Se puede mostrar **aparte** el impacto anual si el precio se mantiene (`€ de más al mes × 12`), etiquetado como **proyección**. **La proyección no cuenta para [X].**
- Las **bajadas** de precio también se enseñan (sirven para renegociar o cambiar de proveedor) pero no suman a [X].

### Tipo 2 · Error o cobro de más en un documento

| Hallazgo | € que cuenta |
|---|---|
| Factura duplicada (el proveedor manda o cobra la misma factura dos veces; la app avisa de duplicados) | El importe de la factura repetida, si se comprueba que se iba a pagar dos veces |
| Línea facturada que no aparece en el albarán de esa entrega | El importe de esa línea |
| Cantidad facturada mayor que la del albarán | (cantidad facturada − cantidad del albarán) × precio unitario |
| Total de la factura que no cuadra con la suma de sus líneas | La diferencia a favor del proveedor, **solo si se confirma que el error está en el documento** y no en la lectura |

Para los de albarán ↔ factura hace falta que el cliente suba **los dos documentos** de la misma entrega.

### Tipo 3 · Mejor precio en otro proveedor (informativo)

Si el mismo producto se compra a dos proveedores y uno es más barato, se enseña el ahorro potencial. **No cuenta para [X]**: no es dinero pagado de más, es una decisión de compra.

### Cómo se cierra el acta

1. Lista de hallazgos con: proveedor, nº de factura, fecha, producto/línea, cálculo, €.
2. El cliente marca «aceptado» o «no» en cada uno.
3. [X] se compara con la suma de los **aceptados** de los tipos 1 y 2.
4. El acta se guarda (PDF o email) y se firma con un «de acuerdo» por email.

### Por qué el 1 % (y cuándo cambiarlo)

- Con el mínimo del ICP (20.000 €/mes), [X] = 200 €: más que una cuota mensual previsible y, a la vez, alcanzable con **un** producto caro que suba unos puntos.
- Es una apuesta: **no hay datos propios** de cuánto se encuentra de media, porque todavía no hay clientes. Tras los 3 primeros pilotos, ajustar el porcentaje con lo observado. Si el riesgo preocupa, empezar con 0,5 %; no subir por encima del 1 % hasta tener datos.
- Si el cliente no sabe su [G], usar la suma de las facturas del primer mes completo que suba, y dejarlo por escrito el día 1.

### Si el cliente no cumple su parte

Si a día 30 no ha subido el histórico o menos de la mitad de lo recibido en el mes, la garantía no se puede medir con justicia. No se cobra automáticamente: se habla, se ofrece alargar 15 días con la misma condición o cerrar sin coste. Prioridad: que nadie se sienta engañado.

---

## 3. Calendario del piloto

| Día | Qué pasa | Responsable |
|---|---|---|
| −2 | Llamada de arranque (10 min): [G], proveedores principales, quién sube los documentos | Fundador + cliente |
| 0 | Cuenta creada y configurada; email con instrucciones de 5 líneas | Fundador |
| 1–3 | Subida del histórico | Cliente |
| 3–7 | Revisión de lo dudoso; corregir unidades no reconocidas | Fundador + cliente |
| 15 | Resumen intermedio (20 min) | Fundador |
| 15–30 | Subida de lo nuevo en < 48 h | Cliente |
| 30 | Acta de hallazgos y decisión (30 min) | Ambos |

**Recordatorio interno:** un mensaje corto los lunes y jueves («¿ha llegado algo de [proveedor] esta semana?»). El hábito de subir es el riesgo principal del producto (ver issue #786 sobre la semana 4).

---

## 4. Conversión a pago

1. El día 30, si se llega a [X]: enviar el enlace de pago del plan que toque (`/billing`) con el descuento de fundador aplicado.
2. Qué plan: **Starter** si es un local con < 100 documentos/mes; **Pro** si necesita resumen semanal por email, asistente y análisis de precios por proveedor; **Business** si es un grupo (hasta 5 locales). Para la meta de «3 en Business», los candidatos son las cuentas de 2–5 locales de la lista.
3. Descuento de fundador: `[DESCUENTO_FUNDADOR]` durante `[DURACIÓN_DESCUENTO]`, a cambio de dos cosas concretas y opcionales: una llamada de 20 minutos al mes para dar opinión y permiso para contar su caso **con datos anonimizados** si él lo aprueba por escrito. Nunca un testimonio redactado por nosotros.

---

## 5. Requisitos previos internos (sin esto, no se arranca un piloto)

| Requisito | Por qué | Estado conocido |
|---|---|---|
| Entidad legal (SL o alta de autónomo) que pueda firmar, facturar y ser responsable del tratamiento | La política de privacidad nombra a «Mise en Place SL», que según #779 no está registrada | **Abierto (#779)** |
| Contrato de encargado del tratamiento (art. 28 RGPD) para el cliente | Un grupo con gestoría o asesor lo pedirá | **Pendiente (#784)** |
| Cuota de documentos de la cuenta piloto ampliada | La prueba estándar son 20 documentos/mes; un histórico de 3 meses de 5 proveedores la supera | Ajustar `settings.plan_quota` por cuenta |
| Umbral de aviso al 2 % | El defecto es 15 % | Ajustes → Alertas |
| Multi-local, solo si es imprescindible | Detrás de interruptor beta y con 4 desviaciones conocidas en cuota/facturación (`docs/03_features/multi_locations.md`) | Preferir pilotar en 1 local |
| Varios usuarios por restaurante | No hay flujo de invitación de usuarios | Decidir cómo accede el equipo antes de prometerlo |
| Alerta de caída del trabajador de extracción | Si el trabajador cae, las facturas se quedan en cola sin aviso | Ver #781 |
| Stripe probado en real | No ha habido ninguna transacción real | Ver #785 |
| Ubicación del alojamiento y condiciones de Gemini | La política lista Railway en «Sudeste asiático» y la confirmación del plan de pago de Gemini con DPA está pendiente | Confirmar antes de hablar de dónde están los datos |
