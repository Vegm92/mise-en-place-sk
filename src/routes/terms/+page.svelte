<svelte:head>
  <title>Términos de Servicio · Mise en Place</title>
</svelte:head>

<div class="mep legal" data-accent="amber" data-density="default">
  <article>
    <a class="back" href="/">← Volver</a>

    <h1>Términos de Servicio</h1>
    <p class="meta">Última actualización: 1 de junio de 2026</p>

    <hr />

    <h2>1. Aceptación</h2>
    <p>
      Al registrarte o usar Mise en Place (el "Servicio"), aceptas estos Términos en su totalidad. Si no estás de acuerdo,
      no uses el Servicio.
    </p>

    <h2>2. Descripción del Servicio</h2>
    <p>
      Mise en Place es una plataforma SaaS de gestión de facturas y control de costes para el sector de la hostelería.
      Proporciona extracción automática de facturas mediante inteligencia artificial, análisis de gasto por proveedor,
      presupuestos por categoría y alertas de precio.
    </p>

    <h2>3. Cuentas y seguridad</h2>
    <ul>
      <li>Debes proporcionar información veraz y mantenerla actualizada.</li>
      <li>Eres responsable de mantener la confidencialidad de tu contraseña.</li>
      <li>Notifícanos inmediatamente si sospechas de acceso no autorizado a tu cuenta.</li>
      <li>Puedes invitar a miembros adicionales a tu restaurante; eres responsable de su uso del Servicio.</li>
    </ul>

    <h2>4. Uso aceptable</h2>
    <p>Queda prohibido:</p>
    <ul>
      <li>Usar el Servicio para actividades ilegales o fraudulentas.</li>
      <li>Intentar acceder a datos de otros usuarios.</li>
      <li>Realizar ingeniería inversa o reproducir el software.</li>
      <li>Sobrecargar la infraestructura mediante ataques automatizados (scraping masivo, DoS).</li>
    </ul>

    <h2>5. Propiedad intelectual</h2>
    <p>
      Todo el software, diseño y marca son propiedad de Mise en Place SL. Tus datos (facturas, proveedores, etc.) son
      y permanecen de tu propiedad; nos otorgas una licencia para procesarlos únicamente con el fin de prestar el Servicio.
    </p>

    <h2>6. Facturación y pagos</h2>
    <ul>
      <li>El Servicio se ofrece con un periodo de prueba gratuito de 30 días.</li>
      <li>Los planes de pago se facturan mensualmente mediante Stripe.</li>
      <li>Las cancelaciones surten efecto al final del período de facturación en curso.</li>
      <li>No se realizan reembolsos parciales por períodos no utilizados, salvo exigencia legal.</li>
    </ul>

    <h2>7. Disponibilidad y SLA</h2>
    <p>
      Nos esforzamos por mantener una disponibilidad del 99,5% mensual. No garantizamos disponibilidad ininterrumpida.
      Los mantenimientos planificados se anunciarán con al menos 24 horas de antelación.
    </p>

    <h2>8. Limitación de responsabilidad</h2>
    <p>
      En la máxima medida permitida por la ley, nuestra responsabilidad total ante ti no superará el importe abonado en
      los 12 meses anteriores al hecho causante. No somos responsables de pérdidas de datos causadas por errores del
      usuario, interrupciones de terceros o causas de fuerza mayor.
    </p>

    <h2>9. Privacidad</h2>
    <p>
      El tratamiento de datos personales se rige por nuestra <a href="/privacy">Política de Privacidad</a>, que forma parte
      integrante de estos Términos.
    </p>

    <h2>10. Modificaciones</h2>
    <p>
      Podemos modificar estos Términos con un preaviso de 30 días por correo electrónico. El uso continuado del Servicio
      tras dicho plazo implica la aceptación de los nuevos Términos.
    </p>

    <h2>11. Rescisión</h2>
    <p>
      Puedes cancelar tu cuenta en cualquier momento desde <em>Ajustes → Eliminar cuenta</em>. Nos reservamos el derecho
      de suspender cuentas que incumplan estos Términos.
    </p>

    <h2>12. Ley aplicable y jurisdicción</h2>
    <p>
      Estos Términos se rigen por la ley española. Las partes se someten a la jurisdicción de los Juzgados y Tribunales
      de Madrid, con renuncia expresa a cualquier otro fuero que pudiera corresponderles.
    </p>

    <h2>13. Contacto</h2>
    <p>
      Para cualquier consulta sobre estos Términos: <a href="mailto:legal@mise-en-place.app">legal@mise-en-place.app</a>
    </p>

    <hr />
    <p class="footer-links">
      <a href="/privacy">Política de Privacidad</a> ·
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
  a { color: var(--mep-acc); }
  hr {
    border: none;
    border-top: 1px solid var(--mep-divider);
    margin: 24px 0;
  }
  .footer-links { font-size: 13px; color: var(--mep-fg-3); margin-top: 16px; }
  .footer-links a { color: var(--mep-fg-3); }
</style>
