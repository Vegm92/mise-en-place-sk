import { sql } from 'drizzle-orm';
import { db } from './db';

export interface DbRoleInfo {
	role: string;
	superuser: boolean;
	bypassRls: boolean;
	tableOwner: string | null;
	scoped: boolean;
}

export async function readDbRole(): Promise<DbRoleInfo> {
	const rows = await db.execute(sql`
		SELECT current_user AS role,
			(SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user) AS superuser,
			(SELECT rolbypassrls FROM pg_catalog.pg_roles WHERE rolname = current_user) AS bypass_rls,
			(SELECT pg_get_userbyid(c.relowner)
				FROM pg_catalog.pg_class c
				JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
				WHERE n.nspname = 'public' AND c.relname = 'restaurants') AS table_owner
	`);
	const r = (rows as unknown as Array<Record<string, unknown>>)[0] ?? {};
	return describeDbRole({
		role: String(r.role ?? ''),
		superuser: r.superuser === true,
		bypassRls: r.bypass_rls === true,
		tableOwner: r.table_owner == null ? null : String(r.table_owner),
	});
}

export function describeDbRole(info: Omit<DbRoleInfo, 'scoped'>): DbRoleInfo {
	const scoped = Boolean(info.role)
		&& !info.superuser
		&& !info.bypassRls
		&& info.tableOwner !== null
		&& info.tableOwner !== info.role;
	return { ...info, scoped };
}

export function dbRoleDetail(info: DbRoleInfo): string {
	if (!info.role) return 'Could not read the connection role';
	const why = [
		info.superuser ? 'superuser' : null,
		info.bypassRls ? 'BYPASSRLS' : null,
		info.tableOwner === info.role ? 'owns the app tables' : null,
	].filter(Boolean).join(', ');
	return info.scoped
		? `${info.role} · not table owner (${info.tableOwner}) · RLS active`
		: `${info.role} · ${why || 'unscoped'} · RLS inert — runtime-role cutover pending (#464)`;
}
