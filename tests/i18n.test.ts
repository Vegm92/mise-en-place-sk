import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { locale, t } from '../src/lib/i18n';

// Resolve a key against the current locale via the derived `t` store.
const tr = (key: string) => get(t)(key);

beforeEach(() => {
  // Tests mutate the shared locale store; reset to the default each time.
  locale.set('es');
});

describe('t (translation lookup)', () => {
  it('resolves a key for the active locale', () => {
    locale.set('en');
    expect(tr('nav.dashboard')).toBe('Dashboard');
    locale.set('es');
    expect(tr('nav.dashboard')).toBe('Resumen');
  });

  it('falls back to the key itself when no translation exists', () => {
    expect(tr('this.key.does.not.exist')).toBe('this.key.does.not.exist');
  });

  it('reacts to locale changes', () => {
    locale.set('es');
    expect(tr('action.logout')).toBe('Cerrar sesión');
    locale.set('en');
    expect(tr('action.logout')).toBe('Sign out');
  });
});

describe('weekly digest keys (added with the dedicated /digest page)', () => {
  const keys = [
    'nav.digest',
    'digest.title',
    'digest.week',
    'digest.dismissed',
    'digest.unavailable',
  ];

  it('resolves in Spanish', () => {
    locale.set('es');
    for (const k of keys) expect(tr(k)).not.toBe(k);
    expect(tr('digest.title')).toBe('Resumen semanal');
  });

  it('resolves in English', () => {
    locale.set('en');
    for (const k of keys) expect(tr(k)).not.toBe(k);
    expect(tr('digest.title')).toBe('Weekly Digest');
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
      locale.set(lc);
      for (const k of keys) expect(tr(k)).not.toBe(k);
    }
  });

  it('keeps the {mb} interpolation placeholder in both locales', () => {
    locale.set('es');
    expect(tr('upload.imageTooLarge')).toContain('{mb}');
    locale.set('en');
    expect(tr('upload.imageTooLarge')).toContain('{mb}');
  });
});

describe('locale key parity (es vs en)', () => {
  // Every key added in one locale must exist in the other, otherwise the UI
  // silently renders a raw key for one language. Exercised across the keys
  // touched in this window plus a wider sample of the catalog.
  const sampleKeys = [
    'nav.dashboard', 'nav.digest', 'action.logout',
    'digest.title', 'digest.week', 'digest.dismissed', 'digest.unavailable',
    'upload.cameraBtn', 'upload.imageTooLarge', 'upload.captureTip',
    'upload.previewUse', 'upload.previewRetake',
    'upload.offlineSaved', 'upload.offlineRetrying', 'upload.offlineLimit',
    'confirm.stage.read', 'confirm.processing', 'confirm.redirecting',
    // i18n issue-101: ~20 hardcoded strings
    'coach.next', 'coach.skip',
    'notif.title', 'notif.clearAll', 'notif.empty',
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
    'tour.step1.title', 'tour.step1.body',
    'tour.step2.title', 'tour.step2.body', 'tour.step2.next',
    'tour.complete.title', 'tour.complete.body', 'tour.complete.btn',
  ];

  it('resolves every sampled key in both locales (no missing translations)', () => {
    const missing: string[] = [];
    for (const lc of ['es', 'en'] as const) {
      locale.set(lc);
      for (const k of sampleKeys) {
        if (tr(k) === k) missing.push(`${lc}:${k}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('uses distinct strings per locale for a representative key', () => {
    locale.set('es');
    const es = tr('upload.offlineLimit');
    locale.set('en');
    const en = tr('upload.offlineLimit');
    expect(es).not.toBe(en);
  });
});
