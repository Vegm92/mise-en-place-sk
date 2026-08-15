/**
 * Extraction pipeline tests — mocks the generate function and the PDF text
 * extractor (unpdf)
 * so no real API calls or file I/O are needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock unpdf before importing extract.ts — classifyPdf imports it dynamically.
const extractTextMock = vi.fn();
vi.mock('unpdf', () => ({
  getDocumentProxy: vi.fn(async () => ({})),
  extractText: (...args: unknown[]) => extractTextMock(...args),
}));

/** Stand-in for the old pdfParse mock: resolves unpdf's { text } shape. */
function mockPdfText(text: string) {
  extractTextMock.mockResolvedValue({ text, totalPages: 1 });
}

import { extractInvoice, classifyFile, type GenerateFn } from '../src/lib/server/extract';

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
  return vi.fn<GenerateFn>().mockResolvedValue(responseText);
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
    mockPdfText('FACTURA\nProveedor Test S.L.\nTotal: 1250.00 EUR\n'.repeat(5));

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
    mockPdfText('scan');

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
    mockPdfText('x'.repeat(100));

    const fenced = `\`\`\`json\n${JSON.stringify(MOCK_INVOICE_DATA)}\n\`\`\``;
    const generate = makeGenerateFn(fenced);
    const result = await extractInvoice('/fake/invoice.pdf', generate);
    expect(result.supplier_name).toBe('Proveedor Test S.L.');
  });

  it('throws on invalid JSON from Gemini', async () => {
    mockPdfText('x'.repeat(100));

    const generate = makeGenerateFn('not valid json at all');
    await expect(extractInvoice('/fake/invoice.pdf', generate)).rejects.toThrow();
  });
});

// A timed-out extraction must actually cancel the in-flight Gemini request,
// not just reject the JS promise — otherwise the request lingers, holds a
// socket and a Gemini concurrency slot, and (with the strictly-sequential
// worker) jobs pile up behind it. The wiring is an AbortSignal threaded from
// extractInvoice down to the generate call.
describe('extractInvoice — request cancellation', () => {
  it('forwards an AbortSignal to the generate function', async () => {
    mockPdfText('x'.repeat(100));

    let received: AbortSignal | undefined;
    const generate: GenerateFn = vi.fn(async (_content, signal) => {
      received = signal;
      return JSON.stringify(MOCK_INVOICE_DATA);
    });

    await extractInvoice('/fake/invoice.pdf', generate);
    expect(received).toBeInstanceOf(AbortSignal);
    expect(received?.aborted).toBe(false);
  });

  it('aborts the signal when the extraction hangs past the timeout', async () => {
    vi.resetModules();
    vi.stubEnv('GEMINI_TIMEOUT_MS', '20');
    try {
      const { extractInvoice: extractFresh } = await import('../src/lib/server/extract');
      mockPdfText('x'.repeat(100));

      let received: AbortSignal | undefined;
      const generate: GenerateFn = vi.fn((_content, signal) => {
        received = signal;
        return new Promise<string>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      });

      await expect(extractFresh('/fake/invoice.pdf', generate)).rejects.toThrow(/timed out/);
      expect(received?.aborted).toBe(true);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});

describe('classifyFile', () => {
  it('throws for unsupported file types', () => {
    expect(() => classifyFile('/fake/invoice.xlsx')).toThrow('Unsupported file type');
  });
});

// Issue #385: supplier-level contact fields (CIF/NIF, address, email, phone)
// were never requested from the LLM in the first place — the JSON schema in
// the extraction prompt only asked for header/line-item fields.
describe('extractInvoice — supplier contact fields (issue #385)', () => {
  it('asks the model for supplier_nif, supplier_address, supplier_email and supplier_phone', async () => {
    mockPdfText('FACTURA\nProveedor Test S.L.\nTotal: 1250.00 EUR\n'.repeat(5));

    const generate = makeGenerateFn(JSON.stringify(MOCK_INVOICE_DATA));
    await extractInvoice('/fake/invoice.pdf', generate);

    const call = vi.mocked(generate).mock.calls[0][0] as string;
    expect(call).toContain('supplier_nif');
    expect(call).toContain('supplier_address');
    expect(call).toContain('supplier_email');
    expect(call).toContain('supplier_phone');
  });

  it('passes supplier contact fields through when the model returns them', async () => {
    mockPdfText('FACTURA\nSuministros Alimentarios Goya, S.L.\n'.repeat(5));

    const dataWithContact = {
      ...MOCK_INVOICE_DATA,
      supplier_nif: 'B-99881122',
      supplier_address: 'Polígono Ind. La Resina, Nave 14, 28201 Madrid',
      supplier_email: 'facturacion@goya.es',
      supplier_phone: '+34 91 555 22 33',
    };
    const generate = makeGenerateFn(JSON.stringify(dataWithContact));
    const result = await extractInvoice('/fake/invoice.pdf', generate);

    expect(result.supplier_nif).toBe('B-99881122');
    expect(result.supplier_address).toBe('Polígono Ind. La Resina, Nave 14, 28201 Madrid');
    expect(result.supplier_email).toBe('facturacion@goya.es');
    expect(result.supplier_phone).toBe('+34 91 555 22 33');
  });

  it('does not fabricate contact fields absent from the model response', async () => {
    mockPdfText('ALBARÁN\nSin datos de contacto\n'.repeat(5));

    const generate = makeGenerateFn(JSON.stringify(MOCK_INVOICE_DATA));
    const result = await extractInvoice('/fake/invoice.pdf', generate);

    expect(result.supplier_nif ?? null).toBeNull();
    expect(result.supplier_address ?? null).toBeNull();
    expect(result.supplier_email ?? null).toBeNull();
    expect(result.supplier_phone ?? null).toBeNull();
  });
});
