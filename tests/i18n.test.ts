import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { setLocale, t, ti, tp, tcat, tiv, loadAllMessages } from '../src/lib/i18n';
import { translations } from '../src/lib/i18n-messages';
import { untranslated } from './helpers/i18n-setup';

await loadAllMessages();

// Resolve a key against the current locale via the derived `t` store.
const tr = (key: string) => t(key);
// Interpolating / pluralizing resolvers via their derived stores.
const tri = (key: string, vars: Record<string, string | number>) => ti(key, vars);
const trp = (key: string, count: number) => tp(key, count);
// Category-value and category-aware interpolation resolvers.
const trcat = (canonical: string | null | undefined) => tcat(canonical);
const triv = (key: string, vars: Record<string, string | number>) => tiv(key, vars);

beforeEach(() => {
  // Tests mutate the shared locale store; reset to the default each time.
  setLocale('es');
});

describe('t (translation lookup)', () => {
  it('resolves a key for the active locale', () => {
    setLocale('en');
    expect(tr('nav.dashboard')).toBe('Dashboard');
    setLocale('es');
    expect(tr('nav.dashboard')).toBe('Resumen');
  });

  it('falls back to the key itself when no translation exists', () => {
    expect(tr('this.key.does.not.exist')).toBe('this.key.does.not.exist');
  });

  it('reacts to locale changes', () => {
    setLocale('es');
    expect(tr('action.logout')).toBe('Cerrar sesión');
    setLocale('en');
    expect(tr('action.logout')).toBe('Sign out');
  });
});

describe('reports keys (the dedicated /reports page)', () => {
  const keys = [
    'nav.digest',
    'rep.title',
    'rep.summary',
  ];

  it('resolves in Spanish', () => {
    setLocale('es');
    for (const k of keys) expect(tr(k)).not.toBe(k);
    expect(tr('rep.title')).toBe('Informes');
  });

  it('resolves in English', () => {
    setLocale('en');
    for (const k of keys) expect(tr(k)).not.toBe(k);
    expect(tr('rep.title')).toBe('Reports');
  });
});

describe('issue #581 — nav label and page title renamed to Informes/Reports', () => {
  it('the sidebar nav label resolves to Informes/Reports, not the old digest wording', () => {
    setLocale('es');
    expect(tr('nav.digest')).toBe('Informes');
    expect(tr('nav.digest')).not.toBe('Resumen semanal');
    setLocale('en');
    expect(tr('nav.digest')).toBe('Reports');
    expect(tr('nav.digest')).not.toBe('Weekly Digest');
  });

  it('the page title resolves to Informes/Reports, not the old digest wording', () => {
    setLocale('es');
    expect(tr('rep.title')).toBe('Informes');
    expect(tr('rep.title')).not.toBe('Resumen semanal');
    setLocale('en');
    expect(tr('rep.title')).toBe('Reports');
    expect(tr('rep.title')).not.toBe('Weekly Digest');
  });
});

describe('mobile camera-capture keys (added with capture improvements)', () => {
  const keys = [
    'upload.cameraBtn',
    'upload.imageTooLarge',
    'upload.captureTip',
    'upload.captureTipTitle',
    'upload.captureTipDismiss',
    'upload.previewUse',
    'upload.previewRetake',
    'upload.offlineSaved',
    'upload.offlineRetrying',
    'upload.offlineLimit',
  ];

  it('resolves in both locales', () => {
    for (const lc of ['es', 'en'] as const) {
      setLocale(lc);
      for (const k of keys) expect(tr(k)).not.toBe(k);
    }
  });

  it('keeps the {mb} interpolation placeholder in both locales', () => {
    setLocale('es');
    expect(tr('upload.imageTooLarge')).toContain('{mb}');
    setLocale('en');
    expect(tr('upload.imageTooLarge')).toContain('{mb}');
  });
});

describe('locale key parity (es vs en)', () => {
  // Every key added in one locale must exist in the other, otherwise the UI
  // silently renders a raw key for one language. Exercised across the keys
  // touched in this window plus a wider sample of the catalog.
  const sampleKeys = [
    'nav.dashboard', 'nav.digest', 'action.logout',
    'rep.title', 'rep.summary', 'rep.weekly.name', 'rep.col.category',
    'upload.cameraBtn', 'upload.imageTooLarge', 'upload.captureTip',
    'upload.previewUse', 'upload.previewRetake',
    'upload.offlineSaved', 'upload.offlineRetrying', 'upload.offlineLimit',
    'confirm.stage.read', 'confirm.processing', 'confirm.redirecting',
    // i18n issue-101: ~20 hardcoded strings
    'coach.next', 'coach.skip',
    'notif.title', 'notif.clearAll', 'notif.empty',
    // Supplier categorisation nudge + suggestion (issues #301/#315). The alert
    // text itself is keyed, not baked into the notification row, so both
    // locales must carry it.
    'notif.categorize', 'notif.catAccept', 'notif.catChange', 'notif.setConversion',
    'notif.msg.uncategorized', 'notif.msg.catSuggested',
    // Remaining notification types converted to messageKey/messageVars (issue #337)
    'notif.msg.priceShockUp', 'notif.msg.priceShockDown', 'notif.msg.lowStock',
    'notif.msg.unitConversion', 'notif.msg.budgetExceeded', 'notif.msg.budgetWarning',
    'notif.msg.productSuggestion', 'notif.msg.productSuggestionAi',
    'dash.alert.priceShockUp', 'dash.alert.priceShockDown', 'dash.alert.budgetPct',
    'set.tourTitle', 'set.tourDesc', 'set.tourRepeat',
    'set.privacyTitle', 'set.dataExportBtn', 'set.deleteConfirmWord',
    'set.deleteBtn', 'set.deletingBtn', 'set.privacyLink', 'set.termsLink',
    'dash.firstInvoice',
    'pending.processing', 'pending.processingDesc', 'pending.title',
    'pending.manualReview', 'pending.duplicate',
    'pending.sectionData', 'pending.sectionLines',
    'pending.colOrigDesc', 'pending.colDesc', 'pending.priceWarning',
    'pending.approve', 'pending.reject',
    'onboard.title', 'onboard.subtitle', 'onboard.nameLabel',
    'onboard.namePlaceholder', 'onboard.submit',
    // Onboarding segmentation questions (issue #328)
    'onboard.venue.label', 'onboard.venue.skip', 'onboard.venue.menuDelDia',
    'onboard.venue.carta', 'onboard.venue.barTapas', 'onboard.venue.hotel', 'onboard.venue.grupo',
    'onboard.category.label', 'onboard.category.skip',
    'action.delete',
    'sup.contact', 'sup.noCategory', 'sup.confirmDelete.title',
    'sup.confirmDelete.body', 'sup.confirmDelete.yes',
    'sup.edit.title', 'sup.field.name', 'sup.field.category',
    'sup.monthlySpend', 'sup.last7months', 'sup.monthlyAvg',
    'sup.reliability', 'sup.reliability.sub',
    'sup.score.very', 'sup.score.ok', 'sup.score.poor',
    'sup.insufficient', 'sup.insufficient.desc',
    'sup.products.title', 'sup.products.desc',
    'sup.conversions.title', 'sup.conversions.desc',
    // The tour renders the help-centre copy (issue #569); only its own chrome
    // keys are its own.
    'tour.next.review', 'tour.next.finish',
    'tour.complete.title', 'tour.complete.body', 'tour.complete.btn',
    'tour.nudge.title', 'tour.nudge.body', 'tour.nudge.accept', 'tour.nudge.dismiss',
  ];

  it('resolves every sampled key in both locales (no missing translations)', () => {
    const missing: string[] = [];
    for (const lc of ['es', 'en'] as const) {
      setLocale(lc);
      for (const k of sampleKeys) {
        if (tr(k) === k) missing.push(`${lc}:${k}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('uses distinct strings per locale for a representative key', () => {
    setLocale('es');
    const es = tr('upload.offlineLimit');
    setLocale('en');
    const en = tr('upload.offlineLimit');
    expect(es).not.toBe(en);
  });
});

describe('full locale parity (every key in both es and en)', () => {
  // Stronger than the sampled check above: the entire catalog must be
  // symmetric, so no key can ever render as a raw fallback in one language.
  it('has the exact same set of keys in es and en', () => {
    const esKeys = Object.keys(translations.es).sort();
    const enKeys = Object.keys(translations.en).sort();
    const missingInEn = esKeys.filter((k) => !(k in translations.en));
    const missingInEs = enKeys.filter((k) => !(k in translations.es));
    expect({ missingInEn, missingInEs }).toEqual({ missingInEn: [], missingInEs: [] });
  });

  it('never maps a key to an empty string in either locale', () => {
    const blanks: string[] = [];
    for (const lc of ['es', 'en'] as const) {
      for (const [k, v] of Object.entries(translations[lc])) {
        if (v.trim() === '') blanks.push(`${lc}:${k}`);
      }
    }
    expect(blanks).toEqual([]);
  });

  it('keeps {n} placeholders symmetric across locales for plural .other forms', () => {
    const mismatched: string[] = [];
    for (const k of Object.keys(translations.es)) {
      if (!k.endsWith('.other')) continue;
      const esHasN = translations.es[k as keyof typeof translations.es].includes('{n}');
      const enHasN = translations.en[k as keyof typeof translations.en].includes('{n}');
      if (esHasN !== enHasN) mismatched.push(k);
    }
    expect(mismatched).toEqual([]);
  });
});

describe('ti (interpolating translator)', () => {
  it('substitutes a single named placeholder', () => {
    setLocale('en');
    expect(tri('saved.desc', { id: 42 })).toBe(
      'Invoice #42 has been stored and is ready for review.',
    );
  });

  it('substitutes every occurrence and supports multiple vars', () => {
    setLocale('en');
    expect(tri('upload.imageTooLarge', { mb: 20 })).toBe('Image exceeds the 20 MB limit');
    setLocale('es');
    expect(tri('upload.imageTooLarge', { mb: 20 })).toBe('La imagen supera el límite de 20 MB');
  });

  it('reacts to locale changes', () => {
    setLocale('es');
    expect(tri('sup.viewAll', { n: 7 })).toBe('Ver todas (7)');
    setLocale('en');
    expect(tri('sup.viewAll', { n: 7 })).toBe('View all (7)');
  });

  it('leaves the raw key untouched when it does not exist', () => {
    expect(tri('no.such.key', { n: 1 })).toBe('no.such.key');
  });
});

describe('tp (pluralizing translator)', () => {
  it('selects the .one form for a count of 1', () => {
    setLocale('en');
    expect(trp('misc.invoice', 1)).toBe('1 invoice');
    setLocale('es');
    expect(trp('misc.invoice', 1)).toBe('1 albarán');
  });

  it('selects the .other form and interpolates the count', () => {
    setLocale('en');
    expect(trp('misc.invoice', 3)).toBe('3 invoices');
    setLocale('es');
    expect(trp('misc.invoice', 3)).toBe('3 albaranes');
  });

  it('uses the .zero form when defined for a count of 0', () => {
    setLocale('en');
    expect(trp('misc.invoice', 0)).toBe('No invoices');
    setLocale('es');
    expect(trp('misc.invoice', 0)).toBe('Sin albaranes');
  });

  it('falls back to the .other form at 0 when no .zero form exists', () => {
    setLocale('en');
    expect(trp('inv.confirm.delete', 0)).toBe('Delete 0 invoices? This cannot be undone.');
  });

  it('resolves every plural family in both locales', () => {
    const families = [
      'misc.invoice',
      'inv.confirm.reviewed',
      'inv.confirm.delete',
      'confirm.extract',
      'confirm.addFile',
      'upload.extractData',
      'sup.confirmDelete.body',
    ];
    const missing: string[] = [];
    for (const lc of ['es', 'en'] as const) {
      setLocale(lc);
      for (const fam of families) {
        for (const count of [1, 2]) {
          const out = trp(fam, count);
          if (out.includes('.one') || out.includes('.other') || out.includes('{n}')) {
            missing.push(`${lc}:${fam}:${count}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

// Issue #294 — the upload path used to answer with hardcoded English (and, for
// the quota messages, hardcoded Spanish). The server now returns i18n keys, so
// every key it can emit must resolve in both locales; an unresolved key would
// render as `upload.err.something` in the user's face.
describe('strings de-hardcoded from components', () => {
  const keys = [
    'minv.filter.month',
    'minv.filter.toReview',
    'minv.filter.issues',
    'minv.filter.supplier',
    'minv.filter.category',
    'minv.linesSuffix',
    'action.review',
    'upload.previewAlt',
    'upload.err.badResponse',
    'upload.err.network',
    'sup.conv.ph.factor',
    'admin.wa.numberHealth',
    'admin.wa.noEvents',
    'admin.wa.quality',
    'admin.wa.messagingLimit',
    'admin.wa.worst30d',
    'admin.wa.colWhen',
    'admin.wa.colEvent',
    'admin.wa.colSeverity',
    'admin.wa.tenantSenders',
    'admin.worker.alive',
    'admin.worker.stale',
    'admin.worker.unknown',
  ];

  it('resolves in both locales', () => {
    const missing: string[] = [];
    for (const lc of ['es', 'en'] as const) {
      setLocale(lc);
      for (const key of keys) if (tr(key) === key) missing.push(`${lc}:${key}`);
    }
    expect(missing).toEqual([]);
  });

  it('keeps the two languages distinct where they should differ', () => {
    setLocale('es');
    expect(tr('minv.filter.month')).toBe('Este mes');
    expect(tr('action.review')).toBe('Revisar');
    setLocale('en');
    expect(tr('minv.filter.month')).toBe('This month');
    expect(tr('action.review')).toBe('Review');
  });

  it('interpolates the webhook fields into the admin WhatsApp notice', () => {
    for (const lc of ['es', 'en'] as const) {
      setLocale(lc);
      const msg = tri('admin.wa.noEvents', { fields: 'account_update / phone_number_quality_update' });
      expect(msg).toContain('account_update / phone_number_quality_update');
      expect(msg).not.toContain('{fields}');
    }
  });
});

describe('tcat (category display labels, issue #338)', () => {
  it('renders canonical Spanish values as-is in Spanish', () => {
    setLocale('es');
    expect(trcat('Bebidas')).toBe('Bebidas');
    expect(trcat('Lácteos')).toBe('Lácteos');
    expect(trcat('Pescados y Mariscos')).toBe('Pescados y Mariscos');
  });

  it('translates canonical values in English', () => {
    setLocale('en');
    expect(trcat('Bebidas')).toBe('Beverages');
    expect(trcat('Lácteos')).toBe('Dairy');
    expect(trcat('Productos de Limpieza')).toBe('Cleaning products');
    expect(trcat('Café y Bebidas Calientes')).toBe('Coffee & hot drinks');
  });

  it('translates the Other sentinel in both directions', () => {
    setLocale('es');
    expect(trcat('Other')).toBe('Sin categoría');
    setLocale('en');
    expect(trcat('Other')).toBe('No category');
  });

  it('treats null/empty as uncategorised', () => {
    setLocale('es');
    expect(trcat(null)).toBe('Sin categoría');
    expect(trcat(undefined)).toBe('Sin categoría');
    expect(trcat('')).toBe('Sin categoría');
  });

  it('falls back to the canonical string for unknown categories, never a raw key', () => {
    for (const lc of ['es', 'en'] as const) {
      setLocale(lc);
      expect(trcat('Mi Categoría Personalizada')).toBe('Mi Categoría Personalizada');
      expect(trcat('Trufa Negra')).toBe('Trufa Negra');
    }
  });

  it('reacts to locale changes', () => {
    setLocale('es');
    expect(trcat('Congelados')).toBe('Congelados');
    setLocale('en');
    expect(trcat('Congelados')).toBe('Frozen foods');
  });
});

describe('tiv (category-aware interpolation, issue #338)', () => {
  it('translates the category var inside a notification message', () => {
    setLocale('en');
    const msg = triv('notif.msg.catSuggested', {
      supplier: 'Refrescos y Más Distribución, S.L.',
      category: 'Bebidas',
    });
    expect(msg).toBe(
      "Is 'Refrescos y Más Distribución, S.L.' a Beverages supplier? Confirm to count its spend towards budgets and analytics.",
    );
    expect(msg).not.toContain('Bebidas');
  });

  it('leaves the canonical value in place in Spanish', () => {
    setLocale('es');
    expect(triv('notif.msg.catSuggested', { supplier: 'Acme', category: 'Bebidas' })).toContain(
      'un proveedor de Bebidas',
    );
  });

  it('translates the category in budget alerts too', () => {
    setLocale('en');
    expect(
      triv('notif.msg.budgetExceeded', {
        category: 'Pescados y Mariscos',
        spent: 900,
        budget: 800,
        pct: 112,
      }),
    ).toContain("'Fish & seafood'");
  });

  it('passes through custom budget categories unchanged', () => {
    setLocale('en');
    expect(
      triv('notif.msg.budgetWarning', {
        category: 'Trufa Negra',
        spent: 90,
        budget: 100,
        pct: 90,
        threshold: 80,
      }),
    ).toContain("'Trufa Negra'");
  });

  it('behaves like ti when there is no category var', () => {
    setLocale('en');
    expect(triv('notif.msg.uncategorized', { supplier: 'Acme' })).toBe(
      tri('notif.msg.uncategorized', { supplier: 'Acme' }),
    );
  });
});

describe('upload action error keys (server-returned, issue #294)', () => {
  const serverSource = readFileSync(
    new URL('../src/routes/(app)/+page.server.ts', import.meta.url),
    'utf-8',
  );
  const sessionsSource = readFileSync(
    new URL('../src/lib/server/sessions.ts', import.meta.url),
    'utf-8',
  );

  const emitted = [
    ...new Set([
      ...(serverSource.match(/upload\.(?:err|reject)\.[A-Za-z]+/g) ?? []),
      // reject reasons are interpolated into `upload.reject.${reason}`
      ...(sessionsSource.match(/'(?:unsupportedType|tooLarge|tooSmall|contentMismatch)'/g) ?? [])
        .map(r => `upload.reject.${r.replaceAll("'", '')}`),
    ]),
  ];

  it('emits at least the known upload error keys', () => {
    expect(emitted.length).toBeGreaterThanOrEqual(8);
  });

  it('resolves every emitted key in both locales', () => {
    const missing: string[] = [];
    for (const lc of ['es', 'en'] as const) {
      setLocale(lc);
      for (const key of emitted) {
        if (tr(key) === key) missing.push(`${lc}:${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('leaves no hardcoded user-facing prose in the upload action', () => {
    // The strings the issue called out, in either language.
    for (const prose of [
      'No valid files received',
      'exceed the 20 MB limit',
      'Too many uploads',
      'File save failed',
      'Has alcanzado el límite',
      'Solo te quedan',
    ]) {
      expect(serverSource).not.toContain(prose);
    }
  });
});

describe('revenue console keys (admin SaaS metrics)', () => {
  const metricsSource = readFileSync(
    new URL('../src/lib/server/revenue-metrics.ts', import.meta.url),
    'utf-8',
  );

  // The page builds these keys by concatenation (`'admin.rev.leak.' + leak.key`),
  // so a leak or funnel stage added server-side never fails to compile — it just
  // renders the raw key. Derive the list from the source and assert both locales.
  const leakKeys = [...new Set(
    [...metricsSource.matchAll(/key: '(\w+)',[^}]*monthlyImpactCents/g)].map(m => m[1]),
  )];
  const funnelKeys = ['waitlist', 'signup', 'activated', 'paying'];
  const categories = (metricsSource.match(/COST_CATEGORIES = \[([^\]]+)\]/)?.[1] ?? '')
    .split(',')
    .map(s => s.trim().replaceAll("'", ''))
    .filter(Boolean);

  const keys = [
    ...leakKeys.flatMap(k => [`admin.rev.leak.${k}`, `admin.rev.leakHint.${k}`]),
    ...funnelKeys.map(k => `admin.rev.funnel.${k}`),
    ...categories.map(c => `admin.rev.cat.${c}`),
    ...['live', 'estimated', 'none'].map(s => `admin.rev.source.${s}`),
    'admin.revenue',
    'admin.rev.title',
    'admin.rev.mrr',
    'admin.rev.cac',
    'admin.rev.ltvCac',
    'admin.rev.payback',
    'admin.rev.nrrAnnual',
    'admin.rev.section.cohorts',
    'admin.rev.section.leakage',
  ];

  it('derives the dynamic key lists from the server module', () => {
    expect(leakKeys.length).toBeGreaterThanOrEqual(7);
    expect(categories).toEqual(['marketing', 'salaries', 'tools', 'other']);
  });

  it('resolves every revenue key in both locales', () => {
    const missing: string[] = [];
    for (const lc of ['es', 'en'] as const) {
      setLocale(lc);
      for (const key of keys) {
        if (tr(key) === key) missing.push(`${lc}:${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('issue #661 — invoice export status filter label', () => {
  const keys = [
    'export.title',
    'export.dateRange',
    'export.dateHint',
    'export.status',
    'export.allStatus',
    'inv.review.revisado',
    'inv.review.por_revisar',
    'inv.review.incidencia',
    'export.download',
    'export.cancel',
    'export.backLabel',
  ];

  it('resolves every key the export page uses in both locales', () => {
    const missing: string[] = [];
    for (const lc of ['es', 'en'] as const) {
      setLocale(lc);
      for (const k of keys) if (tr(k) === k) missing.push(`${lc}:${k}`);
    }
    expect(missing).toEqual([]);
  });

  it('labels the status filter Estado in Spanish and Status in English', () => {
    setLocale('es');
    expect(tr('export.status')).toBe('Estado');
    setLocale('en');
    expect(tr('export.status')).toBe('Status');
  });
});

describe('issue #534 — analytics period/filter short labels', () => {
  const keys = [
    'spend.period.monthShort',
    'spend.period.quarterShort',
    'spend.period.halfShort',
    'spend.period.allShort',
    'prices.filter.all',
    'prices.filter.up',
    'prices.filter.down',
    'prices.filter.flat',
  ];

  it('resolves every period/filter key the analytics pages use in both locales', () => {
    expect(untranslated(keys)).toEqual([]);
  });

  it('keys the previously-hardcoded 30 d / 90 d / 6 m short labels in both locales', () => {
    for (const lc of ['es', 'en'] as const) {
      setLocale(lc);
      expect(tr('spend.period.monthShort')).toBe('30 d');
      expect(tr('spend.period.quarterShort')).toBe('90 d');
      expect(tr('spend.period.halfShort')).toBe('6 m');
    }
  });
});

describe('issue #844 — /forgot-password and /reset-password error keys', () => {
  // Both pages resolve `` `forgot.err.${form.error}` `` / `` `reset.err.${form.error}` ``
  // at runtime (a dynamic key `lint:i18n` cannot check statically). Pins the
  // keys the two actions' own business-logic error codes already resolve to
  // in both locales. Deliberately excludes 'invalid': the honeypot check
  // (publicFormAction) already returns it for forgot-password with no
  // `forgot.err.invalid` key backing it — a pre-existing, silent gap (an
  // untranslated bot only ever sees a raw key) that predates and is outside
  // this issue; reset-password's own schema-parse-failure path was written
  // to reuse the already-mapped 'expired' code specifically to avoid adding
  // a second one (src/lib/i18n-messages.ts is owned by another workstream
  // while #844 is in flight).
  const forgotKeys = ['missing', 'rate_limited'].map(k => `forgot.err.${k}`);
  const resetKeys = ['expired', 'tooShort', 'tooLong', 'mismatch', 'failed'].map(k => `reset.err.${k}`);

  it('resolves every forgot-password and reset-password error key in both locales', () => {
    const missing: string[] = [];
    for (const lc of ['es', 'en'] as const) {
      setLocale(lc);
      for (const k of [...forgotKeys, ...resetKeys]) if (tr(k) === k) missing.push(`${lc}:${k}`);
    }
    expect(missing).toEqual([]);
  });
});
