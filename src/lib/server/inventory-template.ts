import ExcelJS from 'exceljs';
import { renderTemplate, type Locale } from '$lib/i18n-messages';
import { VALID_CATEGORIES, UNCATEGORIZED_CATEGORY, categorySlug } from '$lib/constants';
import { HEADER_FILL, THIN_BORDER, styleHeaderRow } from './xlsx-style';
import type { CatalogExportRow } from './products';

const SUBTOTAL_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
const QUANTITY_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };

const DEFAULT_CATEGORY_ORDER = [...VALID_CATEGORIES.filter((c) => c !== UNCATEGORIZED_CATEGORY), UNCATEGORIZED_CATEGORY];

function categoryRank(category: string | null, categoryOrder: readonly string[]): number {
	const rank = categoryOrder.indexOf(category ?? UNCATEGORIZED_CATEGORY);
	return rank === -1 ? categoryOrder.length : rank;
}

function categoryLabel(category: string | null, locale: Locale): string {
	const slug = categorySlug(category ?? UNCATEGORIZED_CATEGORY);
	const key = `category.${slug}`;
	const rendered = renderTemplate(locale, key);
	return rendered === key ? (category ?? UNCATEGORIZED_CATEGORY) : rendered;
}

function groupByCategory(rows: CatalogExportRow[], categoryOrder: readonly string[]): Map<string | null, CatalogExportRow[]> {
	const groups = new Map<string | null, CatalogExportRow[]>();
	for (const row of rows) {
		const list = groups.get(row.category) ?? [];
		list.push(row);
		groups.set(row.category, list);
	}
	return new Map([...groups.entries()].sort((a, b) => categoryRank(a[0], categoryOrder) - categoryRank(b[0], categoryOrder)));
}

export function buildInventoryWorkbook(
	rows: CatalogExportRow[],
	locale: Locale,
	categoryOrder: readonly string[] = DEFAULT_CATEGORY_ORDER,
): ExcelJS.Workbook {
	const workbook = new ExcelJS.Workbook();
	workbook.creator = 'Mise en Place';
	workbook.created = new Date();

	const sheet = workbook.addWorksheet('Inventario', { views: [{ state: 'frozen', ySplit: 1 }] });

	sheet.columns = [
		{ header: 'Categoría',              key: 'category', width: 26 },
		{ header: 'Producto',               key: 'product',  width: 34 },
		{ header: 'Unidad',                 key: 'unit',     width: 12 },
		{ header: 'Precio unitario (€)',    key: 'price',    width: 18 },
		{ header: 'Cantidad contada',       key: 'quantity', width: 18 },
		{ header: 'Total (€)',              key: 'total',    width: 14 },
	];

	const subtotalRows: number[] = [];

	for (const [category, items] of groupByCategory(rows, categoryOrder)) {
		const label = categoryLabel(category, locale);
		const firstDataRow = sheet.rowCount + 1;

		for (const item of items) {
			const rowNumber = sheet.rowCount + 1;
			sheet.addRow({
				category: label,
				product:  item.canonicalName,
				unit:     item.canonicalUnit ?? '',
				price:    item.unitPrice,
				quantity: null,
				total:    { formula: `D${rowNumber}*E${rowNumber}` },
			});
		}

		const lastDataRow = sheet.rowCount;
		const subtotalRow = sheet.addRow({
			category: '',
			product:  `Subtotal ${label}`,
			total:    { formula: `SUM(F${firstDataRow}:F${lastDataRow})` },
		});
		subtotalRow.eachCell((cell) => { cell.font = { bold: true }; cell.fill = SUBTOTAL_FILL; });
		subtotalRows.push(subtotalRow.number);
	}

	const grandTotalRow = sheet.addRow({
		category: '',
		product:  'Total general',
		total:    { formula: subtotalRows.length > 0 ? `SUM(${subtotalRows.map((n) => `F${n}`).join(',')})` : '0' },
	});
	grandTotalRow.eachCell((cell) => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = HEADER_FILL; });

	sheet.getColumn('price').numFmt = '#,##0.00';
	sheet.getColumn('total').numFmt = '#,##0.00';

	styleHeaderRow(sheet.getRow(1));

	sheet.eachRow((row, rowNumber) => {
		row.eachCell({ includeEmpty: true }, (cell) => { cell.border = THIN_BORDER; });
		if (rowNumber === 1) return;
		const isSubtotalOrTotal = subtotalRows.includes(rowNumber) || rowNumber === grandTotalRow.number;
		if (!isSubtotalOrTotal) {
			const quantityCell = row.getCell('quantity');
			quantityCell.fill = QUANTITY_FILL;
			quantityCell.protection = { locked: false };
		}
	});

	return workbook;
}
