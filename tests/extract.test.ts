/**
 * Extraction pipeline tests — mocks the Anthropic client and pdf-parse
 * so no real API calls or file I/O are needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pdf-parse before importing extract.ts
vi.mock('pdf-parse', () => ({
  default: vi.fn(),
}));

import { extractInvoice, classifyFile } from '../src/lib/server/extract';
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

function makeAnthropicMock(responseText: string) {
  const mockResponse = { content: [{ type: 'text', text: responseText }] };
  return {
    messages: {
      create: vi.fn().mockResolvedValue(mockResponse),
    },
    beta: {
      messages: {
        create: vi.fn().mockResolvedValue(mockResponse),
      },
    },
  };
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
  it('calls Claude with text content and returns parsed data', async () => {
    vi.mocked(pdfParse).mockResolvedValue({
      text: 'FACTURA\nProveedor Test S.L.\nTotal: 1250.00 EUR\n'.repeat(5),
      numpages: 1,
      numrender: 1,
      info: {},
      metadata: null,
      version: '1.10.100',
    });

    const client = makeAnthropicMock(JSON.stringify(MOCK_INVOICE_DATA));
    const result = await extractInvoice('/fake/invoice.pdf', client as never);

    expect(result.supplier_name).toBe('Proveedor Test S.L.');
    expect(result.total_amount).toBe(1250.00);
    expect(result.currency).toBe('EUR');
    expect(result.confidence).toBe(0.92);
    expect(result.line_items).toHaveLength(2);
    expect(client.messages.create).toHaveBeenCalledOnce();

    const call = vi.mocked(client.messages.create).mock.calls[0][0] as { messages: Array<{ content: string }> };
    expect(typeof call.messages[0].content).toBe('string');
    expect(call.messages[0].content).toContain('INVOICE TEXT:');
  });
});

describe('extractInvoice — scanned PDF path', () => {
  it('calls Claude with image content when PDF has little text', async () => {
    vi.mocked(pdfParse).mockResolvedValue({
      text: 'scan',
      numpages: 1,
      numrender: 1,
      info: {},
      metadata: null,
      version: '1.10.100',
    });

    const client = makeAnthropicMock(JSON.stringify(MOCK_INVOICE_DATA));
    const result = await extractInvoice('/fake/scanned.pdf', client as never);

    expect(result.supplier_name).toBe('Proveedor Test S.L.');
    expect(client.beta.messages.create).toHaveBeenCalledOnce();

    const call = vi.mocked(client.beta.messages.create).mock.calls[0][0] as { messages: Array<{ content: unknown[] }> };
    const content = call.messages[0].content as Array<{ type: string }>;
    expect(Array.isArray(content)).toBe(true);
    expect(content[0].type).toBe('document');
  });
});

describe('extractInvoice — image path', () => {
  it('calls Claude with image content for JPG files', async () => {
    const client = makeAnthropicMock(JSON.stringify(MOCK_INVOICE_DATA));
    const result = await extractInvoice('/fake/invoice.jpg', client as never);

    expect(result.supplier_name).toBe('Proveedor Test S.L.');
    expect(client.messages.create).toHaveBeenCalledOnce();

    const call = vi.mocked(client.messages.create).mock.calls[0][0] as { messages: Array<{ content: unknown[] }> };
    const content = call.messages[0].content as Array<{ type: string; source?: { media_type: string } }>;
    expect(content[0].type).toBe('image');
    expect(content[0].source?.media_type).toBe('image/jpeg');
  });

  it('calls Claude with correct media type for PNG files', async () => {
    const client = makeAnthropicMock(JSON.stringify(MOCK_INVOICE_DATA));
    await extractInvoice('/fake/invoice.png', client as never);

    const call = vi.mocked(client.messages.create).mock.calls[0][0] as { messages: Array<{ content: unknown[] }> };
    const content = call.messages[0].content as Array<{ type: string; source?: { media_type: string } }>;
    expect(content[0].source?.media_type).toBe('image/png');
  });
});

describe('extractInvoice — response parsing', () => {
  it('strips markdown fences from Claude response', async () => {
    vi.mocked(pdfParse).mockResolvedValue({
      text: 'x'.repeat(100),
      numpages: 1, numrender: 1, info: {}, metadata: null, version: '1.10.100',
    });

    const fenced = `\`\`\`json\n${JSON.stringify(MOCK_INVOICE_DATA)}\n\`\`\``;
    const client = makeAnthropicMock(fenced);
    const result = await extractInvoice('/fake/invoice.pdf', client as never);
    expect(result.supplier_name).toBe('Proveedor Test S.L.');
  });

  it('throws on invalid JSON from Claude', async () => {
    vi.mocked(pdfParse).mockResolvedValue({
      text: 'x'.repeat(100),
      numpages: 1, numrender: 1, info: {}, metadata: null, version: '1.10.100',
    });

    const client = makeAnthropicMock('not valid json at all');
    await expect(extractInvoice('/fake/invoice.pdf', client as never)).rejects.toThrow();
  });
});

describe('classifyFile', () => {
  it('throws for unsupported file types', () => {
    expect(() => classifyFile('/fake/invoice.xlsx')).toThrow('Unsupported file type');
  });
});
