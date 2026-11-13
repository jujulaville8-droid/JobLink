/**
 * A small in-memory stand-in for the Supabase service client, enough for the
 * JobLink Verified route tests: filtered reads, conditional updates, inserts,
 * deletes and a storage bucket. Rows are plain objects; embedded relations are
 * placed on the row by the test fixture (the column list is not interpreted).
 */
type Row = Record<string, unknown>
type Filter = (row: Row) => boolean

const path = (row: Row, key: string): unknown => key.split('.').reduce<unknown>((value, part) => {
  const next = Array.isArray(value) ? value[0] : value
  return next && typeof next === 'object' ? (next as Row)[part] : undefined
}, row)

type Result = { data: unknown; error: null | { code: string; message: string }; count?: number }

class Query implements PromiseLike<Result> {
  private filters: Filter[] = []
  private action: 'select' | 'update' | 'insert' | 'delete' = 'select'
  private payload: Row | Row[] = {}
  private one = false
  private head = false
  private max = Infinity
  private sort: { key: string; ascending: boolean } | null = null

  constructor(private db: FakeDb, private table: string) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }) { if (options?.head) this.head = true; return this }
  update(values: Row) { this.action = 'update'; this.payload = values; return this }
  insert(values: Row | Row[]) { this.action = 'insert'; this.payload = values; return this }
  delete() { this.action = 'delete'; return this }
  eq(key: string, value: unknown) { this.filters.push((row) => path(row, key) === value); return this }
  neq(key: string, value: unknown) { this.filters.push((row) => path(row, key) !== value); return this }
  in(key: string, values: unknown[]) { this.filters.push((row) => values.includes(path(row, key))); return this }
  is(key: string, value: unknown) { this.filters.push((row) => (path(row, key) ?? null) === value); return this }
  lt(key: string, value: string) { this.filters.push((row) => String(path(row, key) ?? '') < value && path(row, key) != null); return this }
  lte(key: string, value: string) { this.filters.push((row) => path(row, key) != null && String(path(row, key)) <= value); return this }
  gte(key: string, value: string) { this.filters.push((row) => path(row, key) != null && String(path(row, key)) >= value); return this }
  order(key: string, options?: { ascending?: boolean }) { this.sort = { key, ascending: options?.ascending !== false }; return this }
  limit(count: number) { this.max = count; return this }
  maybeSingle() { this.one = true; return this }
  single() { this.one = true; return this }

  private run() {
    const rows = this.db.tables[this.table] ?? (this.db.tables[this.table] = [])
    const failure = this.db.failures[`${this.table}.${this.action}`]
    if (failure) return { data: null, error: failure }
    this.db.calls.push({ table: this.table, action: this.action, payload: this.payload })

    if (this.action === 'insert') {
      const added = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row) => ({ id: `${this.table}-${rows.length + 1}`, ...(this.db.defaults[this.table] ?? {}), ...row }))
      for (const row of added) {
        const refusal = this.db.onInsert?.(this.table, row)
        if (refusal) return { data: null, error: refusal }
        rows.push(row)
      }
      return { data: this.one ? added[0] : added, error: null }
    }
    let matched = rows.filter((row) => this.filters.every((filter) => filter(row)))
    if (this.action === 'update') {
      for (const row of matched) Object.assign(row, this.payload)
    } else if (this.action === 'delete') {
      this.db.tables[this.table] = rows.filter((row) => !matched.includes(row))
    } else if (this.sort) {
      const { key, ascending } = this.sort
      matched = [...matched].sort((a, b) => String(path(a, key) ?? '').localeCompare(String(path(b, key) ?? '')) * (ascending ? 1 : -1))
    }
    // Copies, as a real client returns: later writes must not change rows a caller already holds.
    const limited = matched.slice(0, this.max).map((row) => ({ ...row }))
    if (this.head) return { data: null, error: null, count: matched.length }
    return { data: this.one ? limited[0] ?? null : limited, error: null, count: matched.length }
  }

  then<A = Result, B = never>(resolve?: ((value: Result) => A | PromiseLike<A>) | null, reject?: ((reason: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.run() as Result).then(resolve, reject)
  }
}

export class FakeDb {
  tables: Record<string, Row[]> = {}
  files = new Map<string, Buffer>()
  bucketPublic = false
  calls: { table: string; action: string; payload: unknown }[] = []
  failures: Record<string, { code: string; message: string }> = {}
  storageFailures: Partial<Record<'upload' | 'download' | 'remove', boolean>> = {}
  onInsert?: (table: string, row: Row) => { code: string; message: string } | null
  rpcResults: Record<string, unknown> = {}
  /** Column defaults the real table would apply on insert. */
  defaults: Record<string, Row> = { seeker_verifications: { status: 'awaiting_payment', reupload_documents: [], sharing_notice: false } }

  constructor(tables: Record<string, Row[]> = {}) { this.tables = tables }

  from(table: string) { return new Query(this, table) }
  rpc(name: string) { return Promise.resolve({ data: this.rpcResults[name] ?? [{ allowed: true, remaining: 99, retry_after_seconds: 0 }], error: null }) }

  storage = {
    getBucket: async () => ({ data: { public: this.bucketPublic }, error: null }),
    from: () => ({
      upload: async (name: string, bytes: Buffer) => {
        if (this.storageFailures.upload) return { error: { message: 'upload failed' } }
        this.files.set(name, Buffer.from(bytes)); return { error: null }
      },
      download: async (name: string) => {
        const bytes = this.files.get(name)
        if (!bytes || this.storageFailures.download) return { data: null, error: { message: 'missing' } }
        return { data: new Blob([new Uint8Array(bytes)]), error: null }
      },
      remove: async (names: string[]) => {
        if (this.storageFailures.remove) return { error: { message: 'remove failed' } }
        for (const name of names) this.files.delete(name); return { error: null }
      },
      list: async (folder: string) => ({
        data: folder === ''
          ? [...new Set([...this.files.keys()].map((name) => name.split('/')[0]))].map((name) => ({ name }))
          : [...this.files.keys()].filter((name) => name.startsWith(`${folder}/`)).map((name) => ({ name: name.slice(folder.length + 1), created_at: '2020-01-01T00:00:00Z' })),
        error: null,
      }),
    }),
  }
}
