export const REPORT_TYPES = ['weekly', 'monthly', 'prices', 'payables'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_STYLES = ['executive', 'accounting', 'editorial'] as const;
export type ReportStyle = (typeof REPORT_STYLES)[number];

export function isReportType(value: string | null | undefined): value is ReportType {
	return !!value && (REPORT_TYPES as readonly string[]).includes(value);
}

export function isReportStyle(value: string | null | undefined): value is ReportStyle {
	return !!value && (REPORT_STYLES as readonly string[]).includes(value);
}

export type Tone = 'up' | 'down' | 'warn' | 'muted';

export type Label = string | { key: string; vars: Record<string, string | number> };

export type Cell = string | { v: string; tone?: Tone; kind?: 'cat' | 'key' };

export function cellText(cell: Cell): string {
	return typeof cell === 'string' ? cell : cell.v;
}

export function cellTone(cell: Cell): Tone | null {
	return typeof cell === 'string' ? null : (cell.tone ?? null);
}

export function cellKind(cell: Cell): 'cat' | 'key' | null {
	return typeof cell === 'string' ? null : (cell.kind ?? null);
}

export interface ReportKpi {
	label: string;
	value: string;
	note: Label | null;
	tone: Tone | null;
}

export interface ReportColumn {
	key: string;
	label: string;
	numeric: boolean;
}

export interface ReportBar {
	label: Label;
	value: string;
	pct: number;
	color: string;
	muted: boolean;
}

export interface ReportCsv {
	filename: string;
	header: string[];
	rows: (string | number | null)[][];
}

export interface ReportDoc {
	type: ReportType;
	heading: string;
	eyebrow: string;
	subheading: Label;
	periodIso: string;
	generatedAt: string;
	kpis: ReportKpi[];
	summary: string | null;
	chartTitle: string | null;
	chartNote: string | null;
	bars: ReportBar[];
	tableTitle: string;
	columns: ReportColumn[];
	rows: Record<string, Cell>[];
	total: Record<string, Cell> | null;
	empty: boolean;
	csv: ReportCsv;
}

const CSV_SEP = ';';
const CSV_EOL = '\r\n';
const CSV_BOM = '﻿';

function numericCsvText(value: number): string {
	return Number.isFinite(value) ? value.toFixed(2).replace('.', ',') : '';
}

function csvField(value: string | number | null | undefined): string {
	if (value === null || value === undefined) return '';
	const text = typeof value === 'number' ? numericCsvText(value) : value;
	if (/["\r\n;]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
	return text;
}

export function toCsv(header: string[], rows: (string | number | null)[][]): string {
	const lines = [header.map(csvField).join(CSV_SEP)];
	for (const row of rows) lines.push(row.map(csvField).join(CSV_SEP));
	return CSV_BOM + lines.join(CSV_EOL) + CSV_EOL;
}
