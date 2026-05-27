// Canvas — wires every artboard into a DesignCanvas layout.

const { X } = window.MEPIcons;

const W = 1440;       // desktop artboard width
const H_DASH = 1100;
const H_FLOW = 900;
const H_LIST = 880;
const H_DETAIL = 1100;

// iPhone 16 ratio — IOSDevice default 402×874. Frame canvas a touch bigger for breathing room.
const MOB_W = 442;
const MOB_H = 914;

// Wrapper — gives each artboard its own theme/accent context + a topbar.
function Artboard({ theme = 'light', accent = 'amber', density = 'default',
  active, title, crumbs, periodLabel = 'Mayo 2026', label, children, screenLabel,
  actions }) {
  return (
    <MEPShell theme={theme} accent={accent} density={density} active={active} screenLabel={screenLabel}>
      {({ theme: t, setTheme, isDark }) => (
        <>
          <MEPTopBar title={title} crumbs={crumbs} periodLabel={periodLabel}
            isDark={isDark} onThemeToggle={() => setTheme(isDark ? 'light' : 'dark')}
            actions={actions} />
          {typeof children === 'function' ? children({ isDark }) : children}
        </>
      )}
    </MEPShell>
  );
}

// Centered iPhone for mobile artboards
function MobileArtboard({ dark = false, children, screenLabel }) {
  return (
    <div data-screen-label={screenLabel} style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: dark ? '#1f1b16' : '#f0eee9',
    }}>
      <IOSDevice width={402} height={874} dark={dark}>
        {children}
      </IOSDevice>
    </div>
  );
}

function App() {
  return (
    <DesignCanvas minScale={0.06} maxScale={3}>

      {/* ────────────────────────────────────────────────────────────
          DASHBOARD
          ──────────────────────────────────────────────────────────── */}
      <DCSection id="dashboard"
        title="01 · Resumen — escritorio"
        subtitle="Pantalla de inicio. Tres direcciones del mismo conjunto de datos.">

        <DCArtboard id="dash-a-light" label="A · KPI strip + alertas (claro)"
          width={W} height={H_DASH}>
          <Artboard active="dashboard" title="Resumen" screenLabel="01 Dashboard · KPI strip · claro">
            <MEPDashboardMain />
          </Artboard>
        </DCArtboard>

        <DCArtboard id="dash-a-dark" label="A · KPI strip + alertas (oscuro)"
          width={W} height={H_DASH}>
          <Artboard theme="dark" active="dashboard" title="Resumen" screenLabel="01 Dashboard · KPI strip · oscuro">
            <MEPDashboardMain />
          </Artboard>
        </DCArtboard>

        <DCArtboard id="dash-b" label="B · Banner de alerta"
          width={W} height={H_DASH}>
          <Artboard active="dashboard" title="Resumen" screenLabel="01 Dashboard · alert-first">
            <MEPDashboardAlertFirst />
          </Artboard>
        </DCArtboard>

        <DCArtboard id="dash-c" label="C · Hoy / próximo / contexto"
          width={W} height={H_DASH}>
          <Artboard active="dashboard" title="Resumen" screenLabel="01 Dashboard · now/next/context">
            <MEPDashboardNowNext />
          </Artboard>
        </DCArtboard>

        <DCArtboard id="dash-c-dark" label="C · Oscuro"
          width={W} height={H_DASH}>
          <Artboard theme="dark" active="dashboard" title="Resumen" screenLabel="01 Dashboard · now/next/context · oscuro">
            <MEPDashboardNowNext />
          </Artboard>
        </DCArtboard>
      </DCSection>

      {/* ────────────────────────────────────────────────────────────
          UPLOAD FLOW
          ──────────────────────────────────────────────────────────── */}
      <DCSection id="upload"
        title="02 · Subir factura — escritorio"
        subtitle="Flujo de tres pasos: soltar, extraer, revisar.">

        <DCArtboard id="up-1" label="① Soltar archivos"
          width={W} height={H_FLOW}>
          <Artboard active="invoices" title="Subir factura" periodLabel={null}
            crumbs={['Facturas', 'Nueva']}
            actions={<button className="btn btn-ghost"><X size={14}/> Cancelar</button>}
            screenLabel="02 Upload · paso 1 · soltar">
            <MEPUploadDrop />
          </Artboard>
        </DCArtboard>

        <DCArtboard id="up-2" label="② Extrayendo"
          width={W} height={H_FLOW}>
          <Artboard active="invoices" title="Subir factura" periodLabel={null}
            crumbs={['Facturas', 'Nueva']}
            actions={<button className="btn btn-ghost"><X size={14}/> Cancelar</button>}
            screenLabel="02 Upload · paso 2 · extrayendo">
            <MEPUploadExtracting />
          </Artboard>
        </DCArtboard>

        <DCArtboard id="up-3" label="③ Revisar datos"
          width={W} height={H_FLOW}>
          <Artboard active="invoices" title="Subir factura" periodLabel={null}
            crumbs={['Facturas', 'Nueva']}
            actions={null}
            screenLabel="02 Upload · paso 3 · revisar">
            <MEPUploadReview />
          </Artboard>
        </DCArtboard>

        <DCArtboard id="up-3-dark" label="③ Revisar (oscuro)"
          width={W} height={H_FLOW}>
          <Artboard theme="dark" active="invoices" title="Subir factura" periodLabel={null}
            crumbs={['Facturas', 'Nueva']}
            actions={null}
            screenLabel="02 Upload · paso 3 · revisar · oscuro">
            <MEPUploadReview />
          </Artboard>
        </DCArtboard>
      </DCSection>

      {/* ────────────────────────────────────────────────────────────
          INVOICE LIST
          ──────────────────────────────────────────────────────────── */}
      <DCSection id="list"
        title="03 · Listado de facturas — escritorio"
        subtitle="Vista de auditoría. Densidad alta, filtros visibles, acciones masivas.">

        <DCArtboard id="list-light" label="Listado (claro)"
          width={W} height={H_LIST}>
          <Artboard active="invoices" title="Facturas" screenLabel="03 Invoice list · claro">
            <MEPInvoiceList />
          </Artboard>
        </DCArtboard>

        <DCArtboard id="list-dark" label="Listado (oscuro)"
          width={W} height={H_LIST}>
          <Artboard theme="dark" active="invoices" title="Facturas" screenLabel="03 Invoice list · oscuro">
            <MEPInvoiceList />
          </Artboard>
        </DCArtboard>

        <DCArtboard id="list-compact" label="Listado · densidad compacta"
          width={W} height={H_LIST}>
          <Artboard active="invoices" title="Facturas" density="compact"
            screenLabel="03 Invoice list · compacto">
            <MEPInvoiceList />
          </Artboard>
        </DCArtboard>
      </DCSection>

      {/* ────────────────────────────────────────────────────────────
          INVOICE DETAIL
          ──────────────────────────────────────────────────────────── */}
      <DCSection id="detail"
        title="04 · Detalle de factura — escritorio"
        subtitle="Documento + datos + historial. Misma estructura mental que la revisión de extracción.">

        <DCArtboard id="det-light" label="Detalle (claro)"
          width={W} height={H_DETAIL}>
          <Artboard active="invoices" title="Factura 2026-A-0471"
            periodLabel={null}
            actions={null}
            screenLabel="04 Invoice detail · claro">
            <MEPInvoiceDetail />
          </Artboard>
        </DCArtboard>

        <DCArtboard id="det-dark" label="Detalle (oscuro)"
          width={W} height={H_DETAIL}>
          <Artboard theme="dark" active="invoices" title="Factura 2026-A-0471"
            periodLabel={null}
            actions={null}
            screenLabel="04 Invoice detail · oscuro">
            <MEPInvoiceDetail />
          </Artboard>
        </DCArtboard>
      </DCSection>

      {/* ────────────────────────────────────────────────────────────
          SUPPLIERS
          ──────────────────────────────────────────────────────────── */}
      <DCSection id="suppliers"
        title="05 · Proveedores — escritorio"
        subtitle="Listado completo + perfil con pestañas (resumen, facturas, productos, conversiones).">

        <DCArtboard id="sup-list" label="Listado"
          width={W} height={H_LIST}>
          <Artboard active="suppliers" title="Proveedores" periodLabel={null}
            actions={null}
            screenLabel="05 Suppliers · listado">
            <MEPSuppliersList />
          </Artboard>
        </DCArtboard>

        <DCArtboard id="sup-list-dark" label="Listado (oscuro)"
          width={W} height={H_LIST}>
          <Artboard theme="dark" active="suppliers" title="Proveedores" periodLabel={null}
            actions={null}
            screenLabel="05 Suppliers · listado · oscuro">
            <MEPSuppliersList />
          </Artboard>
        </DCArtboard>

        <DCArtboard id="sup-profile" label="Perfil · Pescados Atlántico"
          width={W} height={1280}>
          <Artboard active="suppliers" title="Pescados Atlántico Vigo" periodLabel={null}
            actions={null}
            screenLabel="05 Suppliers · perfil">
            <MEPSupplierProfile />
          </Artboard>
        </DCArtboard>
      </DCSection>

      {/* ────────────────────────────────────────────────────────────
          BUDGETS
          ──────────────────────────────────────────────────────────── */}
      <DCSection id="budgets"
        title="06 · Presupuestos — escritorio"
        subtitle="Una sola pantalla. Edición en línea, proyección de cierre y alerta global visible.">

        <DCArtboard id="bud-light" label="Presupuestos (claro)"
          width={W} height={1080}>
          <Artboard active="budgets" title="Presupuestos" periodLabel={null}
            actions={null}
            screenLabel="06 Budgets · claro">
            <MEPBudgets />
          </Artboard>
        </DCArtboard>

        <DCArtboard id="bud-dark" label="Presupuestos (oscuro)"
          width={W} height={1080}>
          <Artboard theme="dark" active="budgets" title="Presupuestos" periodLabel={null}
            actions={null}
            screenLabel="06 Budgets · oscuro">
            <MEPBudgets />
          </Artboard>
        </DCArtboard>
      </DCSection>

      {/* ────────────────────────────────────────────────────────────
          ANALYTICS — SPEND
          ──────────────────────────────────────────────────────────── */}
      <DCSection id="analytics-spend"
        title="07 · Análisis · Gasto — escritorio"
        subtitle="¿Dónde va el dinero? Stacked bars + supplier ranking + day-of-week + MoM.">

        <DCArtboard id="ana-spend-light" label="Análisis de gasto"
          width={W} height={1300}>
          <Artboard active="spend" title="Análisis · Gasto" periodLabel={null}
            actions={null}
            screenLabel="07 Analytics · spend · claro">
            <MEPAnalyticsSpend />
          </Artboard>
        </DCArtboard>

        <DCArtboard id="ana-spend-dark" label="Análisis de gasto (oscuro)"
          width={W} height={1300}>
          <Artboard theme="dark" active="spend" title="Análisis · Gasto" periodLabel={null}
            actions={null}
            screenLabel="07 Analytics · spend · oscuro">
            <MEPAnalyticsSpend />
          </Artboard>
        </DCArtboard>
      </DCSection>

      {/* ────────────────────────────────────────────────────────────
          ANALYTICS — PRICES
          ──────────────────────────────────────────────────────────── */}
      <DCSection id="analytics-prices"
        title="08 · Análisis · Precios — escritorio"
        subtitle="¿Qué precios están cambiando? Grid de tarjetas, ordenado por magnitud del cambio.">

        <DCArtboard id="ana-prices-light" label="Análisis de precios"
          width={W} height={1280}>
          <Artboard active="prices" title="Análisis · Precios" periodLabel={null}
            actions={null}
            screenLabel="08 Analytics · prices · claro">
            <MEPAnalyticsPrices />
          </Artboard>
        </DCArtboard>

        <DCArtboard id="ana-prices-dark" label="Análisis de precios (oscuro)"
          width={W} height={1280}>
          <Artboard theme="dark" active="prices" title="Análisis · Precios" periodLabel={null}
            actions={null}
            screenLabel="08 Analytics · prices · oscuro">
            <MEPAnalyticsPrices />
          </Artboard>
        </DCArtboard>
      </DCSection>

      {/* ────────────────────────────────────────────────────────────
          MOBILE
          ──────────────────────────────────────────────────────────── */}
      <DCSection id="mobile"
        title="09 · Móvil"
        subtitle="iPhone — pensado para el restaurante en hora punta: consulta rápida y captura de facturas en papel.">

        <DCArtboard id="mob-dash" label="Resumen"
          width={MOB_W} height={MOB_H}>
          <MobileArtboard screenLabel="05 Mobile · dashboard">
            <MEPMobileShell title="Resumen" tab="home">
              <MEPMobileDashboard />
            </MEPMobileShell>
          </MobileArtboard>
        </DCArtboard>

        <DCArtboard id="mob-dash-dark" label="Resumen (oscuro)"
          width={MOB_W} height={MOB_H}>
          <MobileArtboard dark screenLabel="05 Mobile · dashboard · oscuro">
            <MEPMobileShell title="Resumen" tab="home" theme="dark">
              <MEPMobileDashboard />
            </MEPMobileShell>
          </MobileArtboard>
        </DCArtboard>

        <DCArtboard id="mob-camera" label="Capturar factura"
          width={MOB_W} height={MOB_H}>
          <MobileArtboard dark screenLabel="05 Mobile · cámara">
            <MEPMobileUploadCamera />
          </MobileArtboard>
        </DCArtboard>

        <DCArtboard id="mob-review" label="Revisar extracción"
          width={MOB_W} height={MOB_H}>
          <MobileArtboard screenLabel="05 Mobile · revisar">
            <MEPMobileReview />
          </MobileArtboard>
        </DCArtboard>

        <DCArtboard id="mob-list" label="Listado de facturas"
          width={MOB_W} height={MOB_H}>
          <MobileArtboard screenLabel="05 Mobile · facturas">
            <MEPMobileInvoiceList />
          </MobileArtboard>
        </DCArtboard>

        <DCArtboard id="mob-detail" label="Detalle de factura"
          width={MOB_W} height={MOB_H}>
          <MobileArtboard screenLabel="05 Mobile · detalle">
            <MEPMobileInvoiceDetail />
          </MobileArtboard>
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
