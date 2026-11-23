/**
 * Internal (test/support) accounts — QA 20.11.: they never show in client
 * views. Rows of other people whose joined employee profile is internal
 * are dropped; a viewer's own rows always stay (internal staff test the
 * employee flow with these accounts).
 */
export function withoutInternal<T extends { employee_id?: string | null; employee?: object | null }>(
  rows: T[],
  viewerId: string | null | undefined,
): T[] {
  return rows.filter(
    (r) => r.employee_id === viewerId || (r.employee as { is_internal?: boolean | null } | null | undefined)?.is_internal !== true,
  )
}
