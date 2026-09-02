import type ExcelJS from 'exceljs';

export const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8871E' } };
export const BAND_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F7F7' } };
export const THIN_BORDER: Partial<ExcelJS.Borders> = {
	top:    { style: 'thin', color: { argb: 'FFE5E5E5' } },
	bottom: { style: 'thin', color: { argb: 'FFE5E5E5' } },
};

export function styleHeaderRow(row: ExcelJS.Row): void {
	row.height = 22;
	row.eachCell((cell) => {
		cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
		cell.fill = HEADER_FILL;
		cell.alignment = { vertical: 'middle' };
	});
}

export function styleBandedRows(sheet: ExcelJS.Worksheet): void {
	sheet.eachRow((row, rowNumber) => {
		row.eachCell({ includeEmpty: true }, (cell) => {
			cell.border = THIN_BORDER;
			if (rowNumber > 1 && rowNumber % 2 === 0) cell.fill = BAND_FILL;
		});
	});
}
