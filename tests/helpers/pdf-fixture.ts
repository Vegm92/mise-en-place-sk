import { PDFDocument, StandardFonts } from 'pdf-lib';

export interface PageSpec {
	lines: string[];
}

export async function buildPdf(pages: PageSpec[]): Promise<Buffer> {
	const doc = await PDFDocument.create();
	const font = await doc.embedFont(StandardFonts.Helvetica);

	for (const page of pages) {
		const sheet = doc.addPage([595, 842]);
		page.lines.forEach((line, index) => {
			sheet.drawText(line, { x: 40, y: 780 - index * 18, size: 11, font });
		});
	}

	return Buffer.from(await doc.save());
}

export function invoicePage(number: string, date: string, lines: string[] = []): PageSpec {
	return {
		lines: [
			'SASAFruit S.L.',
			'CIF B66417643 - C/Victor Hugo 1, Sant Cugat del Valles',
			`FACTURA Num. ${number}`,
			`FECHA: ${date}`,
			'GREEN PLANET NOMADA BEACH S.L',
			'CODI DESCRIPCIO QTY PREU IMPORT',
			...lines,
			'Base 162,03 IVA 10,0 TOTAL FACTURA 169,03',
		],
	};
}

export function continuationPage(number: string, lines: string[] = []): PageSpec {
	return {
		lines: [
			`FACTURA Num. ${number}`,
			'Pagina 2 de 2',
			...lines,
			'Base 162,03 IVA 10,0 TOTAL FACTURA 169,03',
		],
	};
}

export function coverPage(rows: string[]): PageSpec {
	return {
		lines: [
			'1-SASAFruit s.l. Listado de facturas pendientes de cobro',
			'Cliente 1895 GREEN PLANET NOMADA BEACH S.L',
			'Num. reg. Fecha rg. Fecha vt. Importe reg. Importe acum.',
			...rows,
		],
	};
}
