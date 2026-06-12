<svelte:head>
  <title>Política de Privacidad · Mise en Place</title>
</svelte:head>

<div class="mep legal" data-accent="amber" data-density="default">
  <article>
    <a class="back" href="/">← Volver</a>

    <h1>Política de Privacidad</h1>
    <p class="meta">Última actualización: 1 de junio de 2026</p>

    <hr />

    <h2>1. Responsable del tratamiento</h2>
    <p>
      <strong>Mise en Place SL</strong> (en adelante, "nosotros", "la Empresa") es el responsable del tratamiento de los datos
      personales recogidos a través de la plataforma Mise en Place (mise-en-place.app).
    </p>

    <h2>2. Datos que recopilamos</h2>
    <ul>
      <li><strong>Datos de cuenta:</strong> dirección de correo electrónico, nombre y contraseña cifrada.</li>
      <li><strong>Datos del negocio:</strong> facturas, albaranes e información de proveedores que tú mismo subes.</li>
      <li><strong>Datos de uso:</strong> registros de acceso, identificadores de sesión, métricas de rendimiento anónimas.</li>
      <li><strong>Datos de pago:</strong> procesados directamente por Stripe; nosotros no almacenamos datos de tarjeta.</li>
    </ul>

    <h2>3. Base legal del tratamiento</h2>
    <ul>
      <li><strong>Ejecución de contrato</strong> (Art. 6.1.b RGPD): prestación del servicio contratado.</li>
      <li><strong>Interés legítimo</strong> (Art. 6.1.f RGPD): seguridad, prevención de fraude y mejora del servicio.</li>
      <li><strong>Cumplimiento de obligación legal</strong> (Art. 6.1.c RGPD): conservación de registros contables.</li>
    </ul>

    <h2>4. Sub-encargados del tratamiento (DPA)</h2>
    <p>Para prestar el servicio, compartimos datos con los siguientes sub-encargados:</p>
    <table>
      <thead>
        <tr>
          <th>Proveedor</th>
          <th>Función</th>
          <th>País</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Supabase Inc.</td>
          <td>Base de datos y autenticación</td>
          <td>UE (AWS eu-west-1)</td>
        </tr>
        <tr>
          <td>Google LLC (Gemini API)</td>
          <td>Extracción de datos de facturas mediante IA</td>
          <td>EE.UU. (cláusulas contractuales tipo)</td>
        </tr>
        <tr>
          <td>Stripe Inc.</td>
          <td>Procesamiento de pagos</td>
          <td>EE.UU. (cláusulas contractuales tipo)</td>
        </tr>
        <tr>
          <td>Sentry (Functional Software)</td>
          <td>Monitorización de errores</td>
          <td>EE.UU. (cláusulas contractuales tipo)</td>
        </tr>
      </tbody>
    </table>

    <h2>5. Transferencias internacionales</h2>
    <p>
      Los proveedores estadounidenses mencionados anteriormente están sujetos a las cláusulas contractuales tipo (CCT)
      aprobadas por la Comisión Europea, garantizando un nivel de protección equivalente al RGPD.
    </p>

    <h2>6. Conservación de datos</h2>
    <ul>
      <li>Datos de cuenta: hasta la eliminación de la cuenta + 30 días de retención para reversión.</li>
      <li>Facturas y datos financieros: 5 años desde la fecha del documento (obligación legal contable).</li>
      <li>Registros de auditoría: 5 años.</li>
      <li>Datos de sesión y logs: 90 días.</li>
    </ul>

    <h2>7. Tus derechos (RGPD)</h2>
    <p>Puedes ejercer los siguientes derechos enviando un correo a <a href="mailto:privacy@mise-en-place.app">privacy@mise-en-place.app</a>:</p>
    <ul>
      <li><strong>Acceso (Art. 15):</strong> obtener una copia de tus datos. Disponible en <em>Ajustes → Exportar mis datos</em>.</li>
      <li><strong>Rectificación (Art. 16):</strong> corregir datos inexactos.</li>
      <li><strong>Supresión (Art. 17):</strong> solicitar la eliminación de tu cuenta y datos. Disponible en <em>Ajustes → Eliminar cuenta</em>.</li>
      <li><strong>Portabilidad (Art. 20):</strong> recibir tus datos en formato JSON estructurado.</li>
      <li><strong>Oposición (Art. 21):</strong> oponerte al tratamiento basado en interés legítimo.</li>
    </ul>
    <p>Responderemos en el plazo máximo de 30 días. Tienes derecho a presentar una reclamación ante la <strong>AEPD</strong> (www.aepd.es).</p>

    <h2>8. Cookies</h2>
    <p>
      Usamos únicamente cookies estrictamente necesarias para mantener tu sesión autenticada. No empleamos cookies de
      seguimiento ni publicidad de terceros.
    </p>

    <h2>9. Seguridad</h2>
    <p>
      Todos los datos se transmiten cifrados mediante TLS 1.2+. Las contraseñas se almacenan con hash bcrypt gestionado por
      Supabase Auth. El acceso a los datos de producción está restringido mediante roles y auditoría.
    </p>

    <h2>10. Contacto</h2>
    <p>
      Para cualquier cuestión sobre privacidad: <a href="mailto:privacy@mise-en-place.app">privacy@mise-en-place.app</a>
    </p>

    <hr />
    <p class="footer-links">
      <a href="/terms">Términos de Servicio</a> ·
      <a href="/">Inicio</a>
    </p>
  </article>
</div>

<style>
  .legal {
    min-height: 100vh;
    background: var(--mep-bg);
    color: var(--mep-fg);
  }
  .legal article {
    max-width: 720px;
    margin: 0 auto;
    padding: 48px 24px 80px;
    line-height: 1.7;
  }
  .back {
    font-size: 13px;
    color: var(--mep-fg-3);
    text-decoration: none;
  }
  .back:hover { color: var(--mep-fg-2); }
  h1 {
    margin-top: 24px;
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--mep-fg);
  }
  h2 {
    margin-top: 28px;
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--mep-fg);
  }
  .meta { color: var(--mep-fg-3); font-size: 14px; }
  p { color: var(--mep-fg-2); }
  ul { color: var(--mep-fg-2); padding-left: 20px; }
  li { margin: 4px 0; }
  strong { color: var(--mep-fg); font-weight: 600; }
  a { color: var(--mep-acc); }
  hr {
    border: none;
    border-top: 1px solid var(--mep-divider);
    margin: 24px 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
    margin-top: 8px;
  }
  th, td {
    padding: 8px 12px;
    text-align: left;
    border: 1px solid var(--mep-border);
    color: var(--mep-fg-2);
  }
  thead tr { background: var(--mep-surface-2); }
  th { color: var(--mep-fg); font-weight: 600; }
  .footer-links { font-size: 13px; color: var(--mep-fg-3); margin-top: 16px; }
  .footer-links a { color: var(--mep-fg-3); }
</style>
