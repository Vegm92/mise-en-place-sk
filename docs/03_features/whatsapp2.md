Implementa en el repositorio actual una integración de WhatsApp para que los trabajadores puedan enviar facturas directamente al sistema mediante WhatsApp.

### Objetivo

Crear un MVP usando **WhatsApp Web + `whatsapp-web.js`**, sin Meta Business, WhatsApp Cloud API ni Meta Business Account.

El bot debe funcionar como una capa de integración independiente del extractor existente.

### Flujo

```text
Worker → WhatsApp → whatsapp-web.js → Mise en Place → Railway Worker
                                             ↓
Worker ← WhatsApp ← whatsapp-web.js ← Resultado
```

1. El trabajador envía una imagen o PDF por WhatsApp.
2. El bot detecta el mensaje y descarga el documento.
3. Se crea un `invoice_job` con:

   * `job_id`
   * WhatsApp user/phone
   * mensaje original
   * documento
   * `processing_status`
   * `review_status`
4. El documento se envía al flujo/worker de extracción existente en Railway.
5. Cuando termina, se guarda el resultado estructurado.
6. El bot responde por WhatsApp mostrando los datos detectados.
7. El trabajador puede responder:

   * `OK` / `CORRECTO` → `review_status = REVIEWED`
   * `INCORRECTO` → `review_status = TO_REVIEW`
8. El bot confirma la acción.

### Arquitectura

No mezcles la lógica de WhatsApp con el extractor.

Crea una capa/adaptador independiente, conceptualmente:

```text
integrations/
  whatsapp/
    client
    message-handler
    media-handler
    session
```

El resto de la aplicación debe comunicarse con esta capa mediante una interfaz clara.

La idea es poder sustituir posteriormente `whatsapp-web.js` por Meta Cloud API sin tener que modificar el invoice pipeline.

### Estados

Separa:

```text
processing_status:
RECEIVED
PROCESSING
PROCESSED
FAILED

review_status:
PENDING
REVIEWED
TO_REVIEW
```

No utilices un único status para ambas responsabilidades.

### Importante

No asumas que solamente habrá una factura pendiente por trabajador. Un usuario puede enviar varias facturas antes de que terminen de procesarse.

Cada mensaje/documento debe tener un `job_id` único y las acciones `OK` / `INCORRECTO` deben estar vinculadas inequívocamente al invoice correspondiente.

### WhatsApp

Usa `whatsapp-web.js`.

Necesitamos:

* autenticación mediante QR;
* persistencia de la sesión para no tener que escanear el QR después de cada restart;
* recepción de imágenes;
* recepción de documentos/PDF;
* envío de mensajes;
* descarga de media;
* identificación del usuario/remitente;
* manejo de reconexiones;
* logging de errores.

No implementes Meta Cloud API.

### Seguridad

No aceptes facturas de cualquier número de WhatsApp.

Implementa una allowlist configurable mediante environment variables, por ejemplo:

```text
WHATSAPP_ALLOWED_NUMBERS
```

Si un número no autorizado envía un documento, rechazarlo y registrar el evento.

No expongas credenciales, sesiones ni tokens en logs.

### Integración con Railway

Reutiliza el mecanismo de procesamiento existente del proyecto en lugar de crear un segundo extractor.

Si actualmente existe una API/queue/job system para enviar documentos al worker, intégrate con ella.

Si necesitas crear un endpoint nuevo, hazlo siguiendo las convenciones existentes del proyecto.

### UX

Cuando recibe una factura:

```text
📄 Factura recibida.
Procesándola...
```

Cuando termina:

```text
📋 Factura procesada

Proveedor: ...
Nº factura: ...
Fecha: ...
Subtotal: ...
IVA: ...
Total: ...

¿Los datos son correctos?

Responde:
✅ OK
❌ INCORRECTO
```

Si responde OK:

```text
✅ Factura marcada como revisada.
```

Si responde incorrecto:

```text
⚠️ Factura marcada como "To Review".
```

### Requisitos de implementación

Antes de modificar código:

1. Inspecciona completamente el repositorio.
2. Entiende cómo funciona actualmente el invoice pipeline.
3. Identifica dónde debe integrarse WhatsApp.
4. Reutiliza componentes existentes siempre que sea posible.
5. No dupliques lógica de extracción.
6. Sigue las convenciones arquitectónicas existentes.
7. Añade tests para el nuevo flujo.
8. Actualiza `.env.example` con las nuevas variables.
9. Documenta cómo ejecutar el bot localmente y cómo hacer el primer login mediante QR.
10. Verifica que la aplicación existente sigue funcionando sin WhatsApp configurado.

### Criterio de éxito

Quiero poder ejecutar el proyecto, escanear un QR con una cuenta de WhatsApp y conseguir este flujo end-to-end:

```text
Enviar factura por WhatsApp
        ↓
Bot recibe imagen/PDF
        ↓
Invoice Job creado
        ↓
Railway procesa
        ↓
Resultado guardado
        ↓
WhatsApp recibe extracción
        ↓
OK
        ↓
DB = REVIEWED
```

y:

```text
INCORRECTO
        ↓
DB = TO_REVIEW
```

No hagas una implementación superficial ni un mock del flujo. Primero entiende el código existente y después implementa la integración de forma que quede preparada para sustituir `whatsapp-web.js` por Meta Cloud API en el futuro.
