type Row = Record<string, unknown>;

type Select = Record<string, true | undefined> | undefined;
type Include =
  | Record<string, true | { orderBy?: unknown } | undefined>
  | undefined;

function applySelect<T extends Row>(row: T | null, select: Select): T | null {
  if (!row || !select) return row;
  const out: Row = {};
  for (const key of Object.keys(select)) {
    if (select[key]) out[key] = (row as Row)[key];
  }
  return out as T;
}

function matchWhere(row: Row, where: Row): boolean {
  for (const [key, val] of Object.entries(where)) {
    if (val === undefined) continue;
    if (row[key] !== val) return false;
  }
  return true;
}

class MeetingSessionTable {
  rows: Row[] = [];
  segmentsTable!: TranscriptSegmentTable;
  notesTable!: MeetingNotesTable;

  create({ data }: { data: Row }): Promise<Row> {
    const now = new Date();
    const row: Row = {
      createdAt: now,
      startedAt: null,
      endedAt: null,
      ...data,
    };
    this.rows.push(row);
    return Promise.resolve({ ...row });
  }

  update({ where, data }: { where: { id: string }; data: Row }): Promise<Row> {
    const row = this.rows.find((r) => r.id === where.id);
    if (!row) throw new Error('not found');
    Object.assign(row, data);
    return Promise.resolve({ ...row });
  }

  findUnique(args: {
    where: { id: string };
    select?: Select;
    include?: Include;
  }): Promise<Row | null> {
    const row = this.rows.find((r) => r.id === args.where.id) ?? null;
    if (!row) return Promise.resolve(null);
    if (args.include) {
      const out: Row = { ...row };
      if (args.include.segments) {
        const segs = this.segmentsTable.rows
          .filter((s) => s.sessionId === row.id)
          .sort((a, b) => Number(a.startMs) - Number(b.startMs));
        out.segments = segs.map((s) => ({ ...s }));
      }
      if (args.include.notes) {
        const notes =
          this.notesTable.rows.find((n) => n.sessionId === row.id) ?? null;
        out.notes = notes ? { ...notes } : null;
      }
      return Promise.resolve(out);
    }
    return Promise.resolve(applySelect({ ...row }, args.select));
  }

  async findUniqueOrThrow(args: {
    where: { id: string };
    select?: Select;
    include?: Include;
  }): Promise<Row> {
    const row = await this.findUnique(args);
    if (!row) throw new Error('not found');
    return row;
  }

  findMany(args?: {
    where?: Row;
    orderBy?: Row;
    take?: number;
    include?: Include;
  }): Promise<Row[]> {
    let rows = [...this.rows];
    if (args?.where) {
      rows = rows.filter((r) => matchWhere(r, args.where!));
    }
    if (args?.orderBy) {
      const [key, dir] = Object.entries(args.orderBy)[0];
      rows.sort((a, b) => {
        const av = a[key] instanceof Date ? a[key].getTime() : 0;
        const bv = b[key] instanceof Date ? b[key].getTime() : 0;
        return dir === 'asc' ? av - bv : bv - av;
      });
    }
    if (typeof args?.take === 'number') {
      rows = rows.slice(0, args.take);
    }
    return Promise.resolve(
      rows.map((r) => {
        const out = { ...r };
        if (args?.include?.notes) {
          const notes =
            this.notesTable.rows.find((n) => n.sessionId === r.id) ?? null;
          out.notes = notes ? { ...notes } : null;
        }
        return out;
      }),
    );
  }
}

class TranscriptSegmentTable {
  rows: Row[] = [];

  create({ data }: { data: Row }): Promise<Row> {
    this.rows.push({ ...data });
    return Promise.resolve({ ...data });
  }

  findUnique(args: {
    where: { id: string };
    select?: Select;
  }): Promise<Row | null> {
    const row = this.rows.find((r) => r.id === args.where.id) ?? null;
    return Promise.resolve(applySelect(row ? { ...row } : null, args.select));
  }

  count(args?: { where?: Row }): Promise<number> {
    if (!args?.where) return Promise.resolve(this.rows.length);
    return Promise.resolve(
      this.rows.filter((r) => matchWhere(r, args.where!)).length,
    );
  }

  findMany(args?: { where?: Row; orderBy?: Row }): Promise<Row[]> {
    let rows = [...this.rows];
    if (args?.where) rows = rows.filter((r) => matchWhere(r, args.where!));
    if (args?.orderBy) {
      const [key, dir] = Object.entries(args.orderBy)[0];
      rows.sort((a, b) =>
        dir === 'asc'
          ? Number(a[key]) - Number(b[key])
          : Number(b[key]) - Number(a[key]),
      );
    }
    return Promise.resolve(rows.map((r) => ({ ...r })));
  }
}

class MeetingNotesTable {
  rows: Row[] = [];

  create({ data }: { data: Row }): Promise<Row> {
    const row: Row = { updatedAt: new Date(), version: 1, ...data };
    this.rows.push(row);
    return Promise.resolve({ ...row });
  }

  async upsert(args: {
    where: { sessionId: string };
    create: Row;
    update: Row;
  }): Promise<Row> {
    const existing = this.rows.find(
      (r) => r.sessionId === args.where.sessionId,
    );
    if (existing) {
      for (const [key, val] of Object.entries(args.update)) {
        if (
          val &&
          typeof val === 'object' &&
          'increment' in (val as Row) &&
          typeof (val as Row).increment === 'number'
        ) {
          existing[key] =
            ((existing[key] as number) ?? 0) +
            ((val as Row).increment as number);
        } else {
          existing[key] = val;
        }
      }
      existing.updatedAt = new Date();
      return { ...existing };
    }
    return this.create({ data: args.create });
  }

  findUnique(args: { where: { sessionId: string } }): Promise<Row | null> {
    const row =
      this.rows.find((r) => r.sessionId === args.where.sessionId) ?? null;
    return Promise.resolve(row ? { ...row } : null);
  }
}

export class InMemoryPrisma {
  meetingSession = new MeetingSessionTable();
  transcriptSegment = new TranscriptSegmentTable();
  meetingNotes = new MeetingNotesTable();

  constructor() {
    this.meetingSession.segmentsTable = this.transcriptSegment;
    this.meetingSession.notesTable = this.meetingNotes;
  }

  $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> {
    return callback(this);
  }
}
