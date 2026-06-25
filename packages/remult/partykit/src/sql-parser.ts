/**
 * Minimal SQL parser for Remult-generated D1 queries.
 * Extracts table name, action type, and column→value mapping
 * from INSERT/UPDATE/DELETE statements.
 *
 * Handles the exact SQL patterns Remult generates:
 *   INSERT INTO "table" ("col1", "col2") VALUES (?1, ?2)
 *   UPDATE "table" SET "col1"=?1, "col2"=?2 WHERE "id"=?3
 *   DELETE FROM "table" WHERE "id"=?1
 */

export interface ParsedWrite {
	table: string;
	action: 'insert' | 'update' | 'delete';
	/** Column → value mapping built from SQL columns + params order */
	row: Record<string, unknown>;
	/** The id column value if present */
	id?: string;
}

const INSERT_RE = /^\s*INSERT\s+INTO\s+"([^"]+)"\s*\(([^)]+)\)\s*VALUES/i;
const UPDATE_RE = /^\s*UPDATE\s+"([^"]+)"\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/i;
const DELETE_RE = /^\s*DELETE\s+FROM\s+"([^"]+)"\s+WHERE\s+(.+)/i;

/**
 * Extract column names from `("col1", "col2", ...)` clause.
 */
function extractColumns(colClause: string): string[] {
	const cols: string[] = [];
	// Match content inside the parens, split by commas
	const inner = colClause.trim();
	// Find all quoted identifiers
	const re = /"([^"]+)"/g;
	let m = re.exec(inner);
	while (m !== null) {
		cols.push(m[1]);
		m = re.exec(inner);
	}
	return cols;
}

/**
 * Parse SET clause into column names in order.
 * `"col1"=?1, "col2"=?2` → ["col1", "col2"]
 */
function extractSetColumns(setClause: string): string[] {
	const cols: string[] = [];
	const re = /"([^"]+)"\s*=\s*\??/g;
	let m = re.exec(setClause);
	while (m !== null) {
		cols.push(m[1]);
		m = re.exec(setClause);
	}
	return cols;
}

/**
 * Parse WHERE clause for the id value.
 * `"id"=?3` with params → extracts the param at the right index
 * For now handles `"id"=?N` patterns.
 */
function extractWhereId(
	whereClause: string,
	params: unknown[]
): string | undefined {
	const idRe = /"id"\s*=\s*\?(\d+)/i;
	const m = idRe.exec(whereClause);
	if (m) {
		const idx = Number.parseInt(m[1], 10) - 1;
		return String(params[idx] ?? '');
	}
	// Try "id"=? (unnamed)
	const idRe2 = /"id"\s*=\s*\?/i;
	if (idRe2.test(whereClause)) {
		// The id is typically the LAST param
		return String(params[params.length - 1] ?? '');
	}
	return undefined;
}

export function parseWriteSql(
	sql: string,
	params: unknown[]
): ParsedWrite | null {
	// INSERT
	let m = INSERT_RE.exec(sql);
	if (m) {
		const table = m[1];
		const cols = extractColumns(m[2]);
		const row: Record<string, unknown> = {};
		for (let i = 0; i < cols.length && i < params.length; i++) {
			row[cols[i]] = params[i];
		}
		return { table, action: 'insert', row, id: String(row.id ?? '') };
	}

	// UPDATE
	m = UPDATE_RE.exec(sql);
	if (m) {
		const table = m[1];
		const setClause = m[2];
		const whereClause = m[3] ?? '';
		const cols = extractSetColumns(setClause);

		// SET params come first, then WHERE params
		const row: Record<string, unknown> = {};
		for (let i = 0; i < cols.length && i < params.length; i++) {
			row[cols[i]] = params[i];
		}
		const id = extractWhereId(whereClause, params);

		return { table, action: 'update', row, id };
	}

	// DELETE
	m = DELETE_RE.exec(sql);
	if (m) {
		const table = m[1];
		const whereClause = m[2];
		const id = extractWhereId(whereClause, params);
		return { table, action: 'delete', row: { id }, id };
	}

	return null;
}

/** Check if SQL is a write operation we care about. */
export function isWriteSql(sql: string): boolean {
	const trimmed = sql.trim().toUpperCase();
	return (
		trimmed.startsWith('INSERT') ||
		trimmed.startsWith('UPDATE') ||
		trimmed.startsWith('DELETE')
	);
}
