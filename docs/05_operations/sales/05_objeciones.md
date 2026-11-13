# 05 · Manejo de objeciones

Estas objeciones están **deducidas, no observadas**: todavía no hay conversaciones de venta reales. Tras las 10 primeras llamadas, reescribir esta página con las que de verdad salgan (y apuntar en el CRM el código `OBJ-xx` de cada una).

**El patrón que mejor funciona** (de `docs/onboarding/marketing/02_audiencia/objeciones.md`):
1. Reconocer el límite.
2. Reencuadrar hacia lo que sí resolvemos.
3. Proponer una prueba pequeña, nunca un compromiso grande.

---

## Qué decimos y qué no (consultar antes de contestar cualquier objeción)

| Se puede decir (existe en el código) | Solo como «en piloto» | **No se dice** (no existe o es falso) |
|---|---|---|
| Foto con el móvil o PDF (también JPG/PNG/HEIC), varias a la vez, ZIP; un PDF con varias facturas se separa solo | Envío por **WhatsApp** (funciona sobre un cliente no oficial mientras no haya cuenta verificada de Meta; riesgo de bloqueo, #789) | «Cumple VERI\*FACTU» o «le pone al día con la normativa» |
| Lee proveedor, cabecera y **cada línea** (producto, cantidad, unidad, precio, IVA) con confianza por campo | **Reenvío por email** a una dirección propia del restaurante (construido; confirmar que está activo en producción) | Integración con TPV (en estudio, no disponible) |
| Lo dudoso se marca (verde/ámbar/rojo) y no se guarda sin revisión | **Multi-local**: hasta 5 locales en Business, cada uno con sus datos aparte | Vista consolidada de todo el grupo / comparar locales en una pantalla |
| Historial de precio por producto y proveedor, con formatos normalizados a la misma unidad cuando los reconoce | | Exportación a a3, Contasol u otro programa contable (hoy: Excel) |
| Aviso de subida (y bajada) de precio al confirmar la factura; umbral configurable de 1 % a 50 % (por defecto 15 %) | | Usuarios e invitaciones para cada miembro del equipo |
| Panel con «subió un X %», lo pagado de más en el mes y, si lo hay, otro proveedor que lo vende más barato | | Recordatorios de pago o control de estados de pago (el producto se ha reenfocado en revisar albaranes, no en pagos) |
| Gasto por proveedor, producto, categoría y mes | | Porcentaje de acierto de lectura («99 %» o cualquier otro) |
| Cruce albarán ↔ factura: líneas que faltan, cantidades que no cuadran; borrador de reclamación al proveedor que se envía solo si usted lo envía | | Clientes, casos de éxito, ahorros medios, logotipos |
| Aviso de facturas duplicadas | | «Datos alojados en la UE» y «nunca se usan para entrenar modelos» (**pendiente de confirmar**) |
| Lee y comprueba el QR VERI\*FACTU de las facturas **recibidas**; lee factura electrónica Facturae/UBL sin IA | | |
| Exportar facturas a Excel; exportar y borrar la cuenta | | |
| Resumen semanal por email y asistente de preguntas (planes Pro y Business) | | |

---

## Las objeciones

### OBJ-01 · «Ya lo hace mi gestor»

**Qué hay detrás:** confía en su gestor y no quiere un segundo interlocutor, o cree que «controlar facturas» ya está cubierto.

**Respuesta:**
> «Y que lo siga haciendo. Su gestor usa la factura para el IVA y la contabilidad: mira el total. Esto mira el precio de cada línea y le avisa a usted, no a final de trimestre sino el día que llega el albarán. No le quita trabajo a su gestor ni cambia lo que le manda. ¿Su gestor le ha avisado alguna vez de que un proveedor le ha subido la merluza?»

**No diga:** nada que suene a sustituir a la gestoría o a «hacer la contabilidad».
**Bonus:** si dice el nombre de la gestoría, anótelo: es un posible canal (ver `06_guia_entrevistas.md`).

---

### OBJ-02 · «Mi proveedor no me sube precios» / «Con mis proveedores tengo confianza»

**Qué hay detrás:** relación de años; además, nadie quiere sentir que le toman el pelo.

**Respuesta:**
> «Puede que sea así, y entonces mejor: lo comprobamos con sus facturas. Si en 30 días no encontramos nada, no paga. Ojo, que no hace falta mala fe: cambia una tarifa, una caja pasa de 12 a 10 unidades al mismo precio, y nadie lo mira porque no hay tiempo. Y también le avisa cuando baja, que sirve para negociar.»

**Prueba:** la oferta de piloto (`04_oferta_piloto_30dias.md`).

---

### OBJ-03 · «No tengo tiempo»

**Qué hay detrás:** es verdad. Y teme una implantación.

**Respuesta:**
> «Por eso no le pido una implantación. Mándeme las tres últimas facturas de su proveedor de [pescado/carne] y en 48 horas le digo qué ha cambiado de precio y cuánto le ha costado. Si no ve nada útil, lo dejamos ahí.»

**No haga:** proponer una demo de 45 minutos.

---

### OBJ-04 · «Ya uso [TPV / ERP]»

**Qué hay detrás:** cree que su sistema ya lo hace, o no quiere otra herramienta.

**Respuesta (TPV):**
> «El TPV controla lo que vende. Esto controla lo que compra: lee las facturas de proveedor. No toca su TPV y no hay que cambiar nada. La conexión con TPV no la tenemos todavía; estamos trabajando en ello.»

**Respuesta (ERP / programa de gestión):**
> «¿Su programa tiene metidas todas las facturas línea a línea, con el precio de cada producto? ¿Le avisó de la última subida? Si la respuesta es sí, no me necesita y se lo digo yo. Si las líneas las teclea alguien a mano o no se teclean, ahí es donde ayudamos: le damos el dato ya leído y lo puede sacar en Excel.»

**No diga:** «nos integramos con…» ningún sistema concreto.

---

### OBJ-05 · «¿Y mis datos?» / «No quiero que mis precios de compra anden por ahí»

**Qué hay detrás:** los precios de compra son información sensible frente a competidores y proveedores.

**Respuesta (lo que es verdad hoy):**
> «Sus facturas solo las ve su cuenta: cada restaurante tiene sus datos separados y ninguna consulta mezcla datos de dos restaurantes. Todo viaja cifrado. Puede exportar sus facturas a Excel y borrar su cuenta cuando quiera. Para leer los documentos usamos la IA de Google (Gemini), y la lista de proveedores técnicos que tratan datos está en nuestra política de privacidad.»

**⚠️ No diga hasta confirmarlo:**
- «Los datos están en la UE»: la política de privacidad actual lista el alojamiento (Railway) en «Sudeste asiático». Confirmar la región real y corregir la política antes de hablar de ubicación.
- «No se usan para entrenar modelos»: depende de que Gemini esté en plan de pago con el acuerdo de tratamiento de Google aceptado (pendiente según la auditoría de agosto).
- «Le firmamos un contrato de encargado del tratamiento»: pendiente (#784), y necesita entidad legal (#779).

---

### OBJ-06 · «Es caro»

**Qué hay detrás:** compara con cero, o con un programa de contabilidad de 10–30 € al mes.

**Respuesta:**
> «Hagamos la cuenta con sus números. ¿Cuánto compra al mes a proveedores?» *(→ [G])* «Cada punto de subida que no ve son [G × 0,01] € al mes. La suscripción son [PRECIO_TIER]. Con detectar una subida de [PRECIO_TIER ÷ (G × 0,01)] puntos al mes, está pagada. Y en el piloto, si no encontramos al menos [X] €, no paga nada.»

**No diga:** «nuestros clientes ahorran X». No hay clientes todavía.

---

### OBJ-07 · «Lo hago con Excel»

**Qué hay detrás:** ya ha sentido el dolor y lo ha intentado resolver. **Es la mejor señal de compra.**

**Respuesta:**
> «Entonces sabe exactamente lo que cuesta. ¿Cuántas líneas mete al mes y quién las teclea? ¿Está al día ahora mismo?» *(Escuchar.)* «La diferencia es que aquí no se teclea: se hace la foto, se leen las líneas, y el aviso le llega solo. Y si quiere seguir con su Excel, lo exporta.»

**No diga:** que importamos su Excel histórico (no existe esa función).

---

### OBJ-08 · «Mis cocineros no lo van a usar»

**Qué hay detrás:** ha visto fracasar herramientas por falta de adopción.

**Respuesta:**
> «No tienen que usar nada nuevo: hacer una foto del albarán cuando llega, como ya hacen para mandarlo por WhatsApp. Quien mira los números es usted.»

**⚠️ Honestidad:**
- WhatsApp y el reenvío por email están **en piloto**: dígalo así.
- Hoy no hay invitaciones de usuarios por persona. Si el grupo necesita un acceso para cada jefe de cocina, no lo prometa: «eso lo vemos en el piloto».

---

### OBJ-09 · «¿Esto cumple VERI\*FACTU?» / «¿Me sirve para la nueva ley?»

**Respuesta (completa y honesta: sí para recibir, no para emitir):**
> «No. VERI\*FACTU obliga al software con el que **usted emite** sus facturas, y nosotros no emitimos facturas: leemos las que le mandan sus proveedores. Para lo que usted factura necesita un programa de facturación certificado, y eso no lo hacemos. Lo que sí hacemos es leer y comprobar el código QR VERI\*FACTU de las facturas que recibe, y leer la factura electrónica cuando se la manden.»

**Nunca:** «sí» a secas, «le ayudamos con la normativa», «estamos preparados para VERI\*FACTU».

---

### OBJ-10 · «¿Y si cerráis?»

**Qué hay detrás:** riesgo real con una empresa que empieza.

**Respuesta:**
> «Es una pregunta justa: somos una empresa nueva y pequeña. Por eso no hay permanencia, sus facturas las puede exportar a Excel en cualquier momento, y los originales (las fotos o PDF) siguen siendo suyos. Si un día dejáramos el servicio, le avisaríamos con tiempo para descargarlo todo.»

**⚠️ Antes de prometer un plazo concreto de preaviso** (p. ej. 60 días), ponerlo por escrito en los términos del servicio.

---

### OBJ-11 · «Quiero probarlo gratis»

**Respuesta:**
> «Mejor que gratis: 30 días con sus facturas, y si no encontramos al menos [X] € —el 1 % de lo que compra en un mes—, no paga nada. Lo único que le pido es que suba las facturas de sus proveedores principales.»

**Por qué no una prueba gratis sin más:** sin compromiso de subir facturas, no hay datos y la prueba no demuestra nada. La condición del piloto obliga a los dos.

---

### OBJ-12 · «Ya tengo un software de compras» (Gstock, Haddock, Kitchen Stocker, Yurest…)

**Respuesta:**
> «Entonces probablemente ya tiene parte de esto. Dos preguntas para saber si le aporto algo: ¿tiene todas las facturas metidas línea a línea, también los albaranes de foto? ¿Le avisó de la última subida de precio el mismo día? Si las dos son sí, no le hago perder el tiempo.»

**No haga:** hablar mal del otro programa por su nombre. Si está contento, descalifique con elegancia y pida permiso para volver a llamar en 6 meses.

---

### OBJ-13 · «Ya probé un escáner de facturas y fallaba»

**Qué hay detrás:** se quemó con un OCR que guardaba datos mal. **Es la objeción que mejor sabemos contestar.**

**Respuesta:**
> «Por eso aquí la máquina no decide sola. Cada campo dudoso sale marcado y no se guarda sin que alguien lo revise. Pruébelo con sus albaranes más feos, los que fallaban con el otro.»

**Honestidad:** lo escrito a mano es lo más difícil. Si es su caso principal, dígalo y propóngale probar con los suyos antes de prometer nada.

---

### OBJ-14 · «Tengo varios locales: quiero verlo todo junto»

**Respuesta:**
> «Hoy cada local va con sus datos separados y se cambia de uno a otro en un clic; una pantalla que sume todos los locales todavía no la tenemos. Le propongo empezar por el local que más compra. Si allí encontramos dinero, añadimos el segundo.»

**No diga:** «vista de grupo», «comparativa entre locales», «consolidado».

---

### OBJ-15 · «¿Lo conecta con mi contabilidad / con mi gestoría?»

**Respuesta:**
> «Exporta las facturas a Excel, que su gestoría puede usar. Exportación directa a a3 o Contasol no la tenemos. ¿Qué programa usa su gestoría? Me sirve para saber qué hacer primero.»

*(Anotar el programa en el CRM: alimenta la decisión de producto del canal gestorías, #783.)*

---

### OBJ-16 · «Me lo pienso» / «Mándame información»

**Respuesta:**
> «Claro. Para que tenga algo útil y no un folleto: ¿qué tendría que ver para decir que sí?» *(Callar.)* «Si me manda tres facturas de un mismo proveedor, se lo enseño con las suyas. ¿Le parece si le llamo el [día] a las [hora]?»

---

## Plantilla para objeciones nuevas

```
### OBJ-xx · «[frase literal del cliente]»
Quién la dijo (rol, tipo de cuenta) · fecha:
Qué hay detrás (hipótesis):
Respuesta que funcionó / que no funcionó:
¿Hay una regla de producto detrás o es promesa? (si es promesa → no se usa)
```
