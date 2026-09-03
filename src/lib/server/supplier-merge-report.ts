import { sql } from 'drizzle-orm';
import { db } from './db';
import type { BatchDb } from './batch';
import { isValidSpanishTaxId } from '$lib/tax-id';

export interface SupplierMergeMember {
	id: number;
	name: string;
	invoiceCount: number;
}

export interface SupplierMergeGroup {
	restaurantId: string;
	restaurantName: string;
	normalizedCif: string;
	winner: SupplierMergeMember;
	losers: SupplierMergeMember[];
	invoicesMoving: number;
	invoicesBlocked: number;
}

export interface SupplierMergeReport {
	groups: SupplierMergeGroup[];
	suppliersMerged: number;
	invoicesMoving: number;
	invoicesBlocked: number;
	invalidTaxIds: number;
}

interface SupplierRow extends Record<string, unknown> {
	restaurant_id: string;
	restaurant_name: string;
	normalized_cif: string;
	id: number;
	name: string;
	invoice_count: number;
}

interface CollisionRow extends Record<string, unknown> {
	restaurant_id: string;
	normalized_cif: string;
	extra: number;
}

const groupKey = (restaurantId: string, normalizedCif: string) => `${restaurantId} ${normalizedCif}`;

export async function reportSupplierMerges(exec: BatchDb = db): Promise<SupplierMergeReport> {
	// tenant-scope-ok: an operator-run migration dry run, cross-tenant by design.
	const rows = await exec.execute<SupplierRow>(sql`
		SELECT s.restaurant_id, r.name AS restaurant_name, s.normalized_cif, s.id, s.name,
			(SELECT COUNT(*)::int FROM invoices i WHERE i.supplier_id = s.id) AS invoice_count
		FROM suppliers s
		JOIN restaurants r ON r.id = s.restaurant_id
		WHERE s.normalized_cif IS NOT NULL
		ORDER BY s.restaurant_id, s.normalized_cif, s.id
	`);

	// tenant-scope-ok: same dry run, counting invoice numbers a merge cannot collapse.
	const collisions = await exec.execute<CollisionRow>(sql`
		SELECT restaurant_id, normalized_cif, SUM(shared - 1)::int AS extra
		FROM (
			SELECT s.restaurant_id, s.normalized_cif, COUNT(*)::int AS shared
			FROM invoices i
			JOIN suppliers s ON s.id = i.supplier_id
			WHERE s.normalized_cif IS NOT NULL AND i.invoice_number IS NOT NULL
			GROUP BY s.restaurant_id, s.normalized_cif, i.invoice_number
			HAVING COUNT(*) > 1
		) shared_numbers
		GROUP BY restaurant_id, normalized_cif
	`);

	const blockedByGroup = new Map<string, number>();
	for (const row of collisions) {
		blockedByGroup.set(groupKey(row.restaurant_id, row.normalized_cif), Number(row.extra));
	}

	const byGroup = new Map<string, SupplierRow[]>();
	let invalidTaxIds = 0;
	for (const row of rows) {
		if (!isValidSpanishTaxId(row.normalized_cif)) {
			invalidTaxIds++;
			continue;
		}
		const key = groupKey(row.restaurant_id, row.normalized_cif);
		const members = byGroup.get(key);
		if (members) members.push(row); else byGroup.set(key, [row]);
	}

	const groups: SupplierMergeGroup[] = [];
	for (const [key, members] of byGroup) {
		if (members.length < 2) continue;
		const toMember = (row: SupplierRow): SupplierMergeMember =>
			({ id: Number(row.id), name: row.name, invoiceCount: Number(row.invoice_count) });
		const [winner, ...losers] = members;
		const blocked = blockedByGroup.get(key) ?? 0;
		const loserMembers = losers.map(toMember);
		const loserInvoices = loserMembers.reduce((total, l) => total + l.invoiceCount, 0);
		groups.push({
			restaurantId: winner.restaurant_id,
			restaurantName: winner.restaurant_name,
			normalizedCif: winner.normalized_cif,
			winner: toMember(winner),
			losers: loserMembers,
			invoicesMoving: Math.max(loserInvoices - blocked, 0),
			invoicesBlocked: Math.min(blocked, loserInvoices),
		});
	}

	return {
		groups,
		suppliersMerged: groups.reduce((total, g) => total + g.losers.length, 0),
		invoicesMoving: groups.reduce((total, g) => total + g.invoicesMoving, 0),
		invoicesBlocked: groups.reduce((total, g) => total + g.invoicesBlocked, 0),
		invalidTaxIds,
	};
}

export function formatSupplierMergeReport(report: SupplierMergeReport): string {
	const lines = [
		`${report.groups.length} duplicate group(s), ${report.suppliersMerged} supplier row(s) to retire`,
		`${report.invoicesMoving} invoice(s) move, ${report.invoicesBlocked} blocked by a shared invoice number`,
		`${report.invalidTaxIds} supplier row(s) hold a tax id that fails the checksum — normalized_cif cleared, no merge`,
	];
	for (const group of report.groups) {
		lines.push(`\n${group.restaurantName} — ${group.normalizedCif}`);
		lines.push(`  keep #${group.winner.id} ${group.winner.name} (${group.winner.invoiceCount} invoice(s))`);
		for (const loser of group.losers) {
			lines.push(`  merge #${loser.id} ${loser.name} (${loser.invoiceCount} invoice(s))`);
		}
		if (group.invoicesBlocked > 0) {
			lines.push(`  ${group.invoicesBlocked} invoice(s) stay put — invoice number already used in this group`);
		}
	}
	return lines.join('\n');
}
