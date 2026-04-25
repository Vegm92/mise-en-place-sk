/**
 * Extraction pipeline tests — mocks the generate function and pdf-parse
 * so no real API calls or file I/O are needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pdf-parse before importing extract.ts
vi.mock('pdf-parse', () => ({
  default: vi.fn(),
}));

import { extractInvoice, classifyFile, type GenerateFn } from '../src/lib/server/extract';
import pdfParse from 'pdf-parse';

const MOCK_INVOICE_DATA = {
  supplier_name: 'Proveedor Test S.L.',
  invoice_number: 'FAC-2024-001',
  invoice_date: '2024-01-15',
  due_date: '2024-02-15',
  total_amount: 1250.00,
  currency: 'EUR',
  confidence: 0.92,
  line_items: [
    { description: 'Aceite de oliva 5L', quantity: 10, unit: 'garrafa', unit_price: 85.0, total_price: 850.0 },
    { description: 'Sal fina 1kg', quantity: 20, unit: 'kg', unit_price: 2.0, total_price: 40.0 },
  ],
};

function makeGenerateFn(responseText: string): GenerateFn {
  return vi.fn<Parameters<GenerateFn>, ReturnType<GenerateFn>>().mockResolvedValue(responseText);
}

// Spy on fs.readFileSync to avoid real disk access
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: vi.fn((filePath: string) => {
      if (String(filePath).endsWith('.pdf')) return Buffer.from('%PDF fake content');
      return Buffer.from('fake image bytes');
    }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('extractInvoice — text PDF path', () => {
  it('calls Gemini with text content and returns parsed data', async () => {
    vi.mocked(pdfParse).mockResolvedValue({
      text: 'FACTURA\nProveedor Test S.L.\nTotal: 1250.00 EUR\n'.repeat(5),
      numpages: 1,
      numrender: 1,
      info: {},
      metadata: null,
      version: '1.10.100',
    });

    const generate = makeGenerateFn(JSON.stringify(MOCK_INVOICE_DATA));
    const result = await extractInvoice('/fake/invoice.pdf', generate);

    expect(result.supplier_name).toBe('Proveedor Test S.L.');
    expect(result.total_amount).toBe(1250.00);
    expect(result.currency).toBe('EUR');
    expect(result.confidence).toBe(0.92);
    expect(result.line_items).toHaveLength(2);
    expect(generate).toHaveBeenCalledOnce();

    const call = vi.mocked(generate).mock.calls[0][0] as string;
    expect(typeof call).toBe('string');
    expect(call).toContain('INVOICE TEXT:');
  });
});

describe('extractInvoice — scanned PDF path', () => {
  it('calls Gemini with inline PDF data when PDF has little text', async () => {
    vi.mocked(pdfParse).mockResolvedValue({
      text: 'scan',
      numpages: 1,
      numrender: 1,
      info: {},
      metadata: null,
      version: '1.10.100',
    });

    const generate = makeGenerateFn(JSON.stringify(MOCK_INVOICE_DATA));
    const result = await extractInvoice('/fake/scanned.pdf', generate);

    expect(result.supplier_name).toBe('Proveedor Test S.L.');
    expect(generate).toHaveBeenCalledOnce();

    const call = vi.mocked(generate).mock.calls[0][0] as Array<unknown>;
    expect(Array.isArray(call)).toBe(true);
    const first = call[0] as { inlineData: { mimeType: string } };
    expect(first.inlineData.mimeType).toBe('application/pdf');
  });
});

describe('extractInvoice — image path', () => {
  it('calls Gemini with inline image data for JPG files', async () => {
    const generate = makeGenerateFn(JSON.stringify(MOCK_INVOICE_DATA));
    const result = await extractInvoice('/fake/invoice.jpg', generate);

    expect(result.supplier_name).toBe('Proveedor Test S.L.');
    expect(generate).toHaveBeenCalledOnce();

    const call = vi.mocked(generate).mock.calls[0][0] as Array<unknown>;
    const first = call[0] as { inlineData: { mimeType: string } };
    expect(first.inlineData.mimeType).toBe('image/jpeg');
  });

  it('calls Gemini with correct media type for PNG files', async () => {
    const generate = makeGenerateFn(JSON.stringify(MOCK_INVOICE_DATA));
    await extractInvoice('/fake/invoice.png', generate);

    const call = vi.mocked(generate).mock.calls[0][0] as Array<unknown>;
    const first = call[0] as { inlineData: { mimeType: string } };
    expect(first.inlineData.mimeType).toBe('image/png');
  });
});

describe('extractInvoice — response parsing', () => {
  it('strips markdown fences from Gemini response', async () => {
    vi.mocked(pdfParse).mockResolvedValue({
      text: 'x'.repeat(100),
      numpages: 1, numrender: 1, info: {}, metadata: null, version: '1.10.100',
    });

    const fenced = `\`\`\`json\n${JSON.stringify(MOCK_INVOICE_DATA)}\n\`\`\``;
    const generate = makeGenerateFn(fenced);
    const result = await extractInvoice('/fake/invoice.pdf', generate);
    expect(result.supplier_name).toBe('Proveedor Test S.L.');
  });

  it('throws on invalid JSON from Gemini', async () => {
    vi.mocked(pdfParse).mockResolvedValue({
      text: 'x'.repeat(100),
      numpages: 1, numrender: 1, info: {}, metadata: null, version: '1.10.100',
    });

    const generate = makeGenerateFn('not valid json at all');
    await expect(extractInvoice('/fake/invoice.pdf', generate)).rejects.toThrow();
  });
});

describe('classifyFile', () => {
  it('throws for unsupported file types', () => {
    expect(() => classifyFile('/fake/invoice.xlsx')).toThrow('Unsupported file type');
  });
});
