// 월드 쓰기 대기열 — docs/adr/2026-10-31-s3-server-stage.md 1절 (사용자 결정 U2 A)
// - 모든 월드 쓰기는 이 대기열 하나로 간다. 같은 행의 바뀜은 마지막 것만 쓴다(넣고 지우면 지우기만).
// - intervalMs(0.25초)마다 트랜잭션 하나로 커밋한다. 진행 중인 커밋은 늘 하나다(순서 보장).
// - 커밋은 타이머(다음 매크로 작업)에서만 시작한다. 그래서 한 번의 동기 처리(정산 한 번 등)에서 넣은 바뀜은
//   트랜잭션 사이에서 나뉘지 않는다.
// - durable(): 지금까지 넣은 것이 커밋되면 풀리는 약속. 기다리는 쪽이 있으면 durableDelayMs 모은 뒤 바로 커밋한다
//   (돈·물건·소유는 이것을 기다린 뒤 답한다. 이동은 기다리지 않는다).
// - 커밋이 실패하면 되돌린 묶음을 새 바뀜 밑에 다시 넣고 다시 해 본다. fatalAfterMs 넘게 실패하면 onFatal
//   (운영은 프로세스를 끝내고 컨테이너가 다시 켜서 DB에서 복구한다 — 메모리와 DB가 어긋난 채 돌지 않게).
import { performance } from "node:perf_hooks";
import { type Row, type TableSpec, WORLD_TABLES, WRITE_ORDER, type WorldTable } from "./tables.ts";

/** pg Pool에서 쓰는 것만(시험에서 바꿔 끼운다) */
export interface WriterClient {
  query(text: string, values?: unknown[]): Promise<unknown>;
  release(): void;
}
export interface WriterPool {
  connect(): Promise<WriterClient>;
}

export interface WorldWriterOptions {
  pool: WriterPool;
  log: { warn(obj: object, message: string): void; error(obj: object, message: string): void };
  onFatal: (error: unknown) => void;
  intervalMs?: number | undefined;
  durableDelayMs?: number;
  /** 이만큼 쌓이면 다음 매크로 작업에서 바로 커밋한다 */
  maxPending?: number;
  fatalAfterMs?: number;
}

export interface WorldWriter {
  upsert(table: WorldTable, row: Row): void;
  /** 열쇠 열만 있으면 된다 */
  remove(table: WorldTable, key: Row): void;
  /**
   * 넣는 바뀜(upsert·remove)을 지켜본다(메모리 거울이 표를 따라간다 — growth/store.ts). 대기열에 넣을 때 동기로 부른다(커밋 전).
   * 듣는 쪽이 던지면 그대로 올라간다. 시험용 가짜 대기열은 없어도 된다(그러면 거울이 따라가지 않는다)
   */
  observe?(listener: (table: WorldTable, row: Row, removed: boolean) => void): void;
  append(table: WorldTable, row: Row): void;
  /** 지금까지 넣은 바뀜이 커밋되면 풀린다 */
  durable(): Promise<void>;
  /** 남은 것을 모두 커밋한다(종료 신호) */
  drain(): Promise<void>;
  readonly pendingCount: number;
  /** 지난 호출 뒤 구간의 쓰기 지표(서버 1분 지표 한 줄에 붙인다) */
  takeMetrics(): Record<string, number>;
  /**
   * 시험용 kill -9 흉내: 쌓인 바뀜을 버리고 멈춘다. 진행 중인 커밋은 inFlight가 "commit"이면 그대로 끝나고
   * "rollback"이면 COMMIT 대신 되돌린다(COMMIT 전에 죽은 경우). 진행 중인 커밋이 끝나면 풀린다.
   */
  crash(inFlight: "commit" | "rollback"): Promise<void>;
}

/** 문장 하나의 행 수 상한(매개변수 65,535개 안) */
const ROWS_PER_STATEMENT = 500;

interface KeyedChange {
  remove: boolean;
  row: Row;
}

interface Batch {
  keyed: Map<WorldTable, Map<string, KeyedChange>>;
  appends: Map<WorldTable, Row[]>;
  count: number;
  waiters: (() => void)[];
}

function emptyBatch(): Batch {
  return { keyed: new Map(), appends: new Map(), count: 0, waiters: [] };
}

function keyOf(spec: TableSpec, row: Row): string {
  return spec.key.map((column) => String(row[column])).join(":");
}

/** INSERT … VALUES …, … [ON CONFLICT (열쇠) DO UPDATE] */
function insertStatement(spec: TableSpec, rows: readonly Row[]): { text: string; values: unknown[] } {
  const values: unknown[] = [];
  const tuples = rows.map((row) => {
    const slots = spec.columns.map((column) => {
      values.push(row[column] ?? null);
      return `$${values.length}`;
    });
    return `(${slots.join(", ")})`;
  });
  let text = `insert into "${spec.name}" (${spec.columns.map((c) => `"${c}"`).join(", ")}) values ${tuples.join(", ")}`;
  if (spec.key.length > 0) {
    const updates = spec.columns.filter((c) => !spec.key.includes(c)).map((c) => `"${c}" = excluded."${c}"`);
    text += ` on conflict (${spec.key.map((c) => `"${c}"`).join(", ")}) do update set ${updates.join(", ")}`;
  }
  return { text, values };
}

/** UPDATE … SET … WHERE 열쇠 = …(행마다 한 문장, 고치기만 하는 표) */
function updateStatement(spec: TableSpec, row: Row): { text: string; values: unknown[] } {
  const values: unknown[] = [];
  const sets = spec.columns
    .filter((c) => !spec.key.includes(c))
    .map((c) => {
      values.push(row[c] ?? null);
      return `"${c}" = $${values.length}`;
    });
  const where = spec.key.map((c) => {
    values.push(row[c]);
    return `"${c}" = $${values.length}`;
  });
  return { text: `update "${spec.name}" set ${sets.join(", ")} where ${where.join(" and ")}`, values };
}

/** DELETE … WHERE (열쇠 = …) OR … */
function deleteStatement(spec: TableSpec, rows: readonly Row[]): { text: string; values: unknown[] } {
  const values: unknown[] = [];
  const conditions = rows.map((row) => {
    const parts = spec.key.map((column) => {
      values.push(row[column]);
      return `"${column}" = $${values.length}`;
    });
    return `(${parts.join(" and ")})`;
  });
  return { text: `delete from "${spec.name}" where ${conditions.join(" or ")}`, values };
}

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += ROWS_PER_STATEMENT) out.push(items.slice(i, i + ROWS_PER_STATEMENT));
  return out;
}

export function createWorldWriter(options: WorldWriterOptions): WorldWriter {
  const intervalMs = options.intervalMs ?? 250;
  const durableDelayMs = options.durableDelayMs ?? 20;
  const maxPending = options.maxPending ?? 2_000;
  const fatalAfterMs = options.fatalAfterMs ?? 30_000;
  const { pool, log } = options;

  let pending = emptyBatch();
  let inFlight = false;
  let inFlightDone: Promise<void> = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timerAt = Number.POSITIVE_INFINITY;
  let crashed: "commit" | "rollback" | undefined;
  /** 넣는 바뀜을 지켜보는 쪽(observe) */
  const observers: ((table: WorldTable, row: Row, removed: boolean) => void)[] = [];
  let failingSince: number | undefined;
  let fatal = false;
  let retryDelayMs = 0;
  const metrics = { batches: 0, rows: 0, commitMsMax: 0, commitMsTotal: 0, failures: 0 };

  const schedule = (delayMs: number): void => {
    if (crashed || fatal) return;
    const at = performance.now() + delayMs;
    if (timer && timerAt <= at) return;
    if (timer) clearTimeout(timer);
    timerAt = at;
    timer = setTimeout(() => {
      timer = undefined;
      timerAt = Number.POSITIVE_INFINITY;
      void flush();
    }, delayMs);
  };

  const touched = (): void => {
    pending.count += 1;
    schedule(pending.count >= maxPending ? 0 : intervalMs);
  };

  const keyedOf = (table: WorldTable): Map<string, KeyedChange> => {
    let map = pending.keyed.get(table);
    if (!map) {
      map = new Map();
      pending.keyed.set(table, map);
    }
    return map;
  };

  const commit = async (batch: Batch): Promise<void> => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      for (const table of WRITE_ORDER) {
        const spec = WORLD_TABLES[table];
        const upserts = [...(batch.keyed.get(table)?.values() ?? [])]
          .filter((c) => !c.remove)
          .map((c) => c.row);
        const rows = [...upserts, ...(batch.appends.get(table) ?? [])];
        if ("updateOnly" in spec && spec.updateOnly) {
          for (const row of rows) {
            const statement = updateStatement(spec, row);
            await client.query(statement.text, statement.values);
          }
          continue;
        }
        for (const part of chunks(rows)) {
          const statement = insertStatement(spec, part);
          await client.query(statement.text, statement.values);
        }
      }
      for (const table of WRITE_ORDER.toReversed()) {
        const spec = WORLD_TABLES[table];
        const removes = [...(batch.keyed.get(table)?.values() ?? [])]
          .filter((c) => c.remove)
          .map((c) => c.row);
        for (const part of chunks(removes)) {
          const statement = deleteStatement(spec, part);
          await client.query(statement.text, statement.values);
        }
      }
      if (crashed === "rollback") throw new Error("world writer crashed before commit (test)");
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  };

  /** 실패한 묶음을 지금 쌓인 것 밑에 다시 넣는다(새 값이 이긴다) */
  const restore = (batch: Batch): void => {
    for (const [table, changes] of batch.keyed) {
      const target = keyedOf(table);
      for (const [key, change] of changes) {
        if (!target.has(key)) {
          target.set(key, change);
          pending.count += 1;
        }
      }
    }
    for (const [table, rows] of batch.appends) {
      pending.appends.set(table, [...rows, ...(pending.appends.get(table) ?? [])]);
      pending.count += rows.length;
    }
    pending.waiters.unshift(...batch.waiters);
  };

  async function flush(): Promise<void> {
    if (inFlight || crashed || fatal) return;
    if (pending.count === 0) {
      for (const resolve of pending.waiters.splice(0)) resolve();
      return;
    }
    const batch = pending;
    pending = emptyBatch();
    inFlight = true;
    const started = performance.now();
    const committing = commit(batch);
    inFlightDone = committing.then(
      () => undefined,
      () => undefined,
    );
    try {
      await committing;
      const ms = performance.now() - started;
      metrics.batches += 1;
      metrics.rows += batch.count;
      metrics.commitMsTotal += ms;
      metrics.commitMsMax = Math.max(metrics.commitMsMax, ms);
      failingSince = undefined;
      retryDelayMs = 0;
      inFlight = false;
      if (crashed) return;
      for (const resolve of batch.waiters) resolve();
    } catch (error) {
      inFlight = false;
      if (crashed) return;
      metrics.failures += 1;
      restore(batch);
      failingSince ??= performance.now();
      if (performance.now() - failingSince > fatalAfterMs) {
        fatal = true;
        log.error({ err: error }, "world writer failed for too long");
        options.onFatal(error);
        return;
      }
      log.warn({ err: error, pending: pending.count }, "world writer commit failed, retrying");
      retryDelayMs = Math.min(4_000, retryDelayMs === 0 ? 500 : retryDelayMs * 2);
      schedule(retryDelayMs);
      return;
    }
    if (pending.count > 0) schedule(pending.waiters.length > 0 ? durableDelayMs : intervalMs);
    else if (pending.waiters.length > 0) void flush();
  }

  return {
    upsert(table, row) {
      if (crashed) return;
      const spec = WORLD_TABLES[table];
      const map = keyedOf(table);
      const key = keyOf(spec, row);
      if (!map.has(key)) touched();
      map.set(key, { remove: false, row });
      for (const listener of observers) listener(table, row, false);
    },
    remove(table, key) {
      if (crashed) return;
      const spec = WORLD_TABLES[table];
      const map = keyedOf(table);
      const id = keyOf(spec, key);
      if (!map.has(id)) touched();
      map.set(id, { remove: true, row: key });
      for (const listener of observers) listener(table, key, true);
    },
    observe(listener) {
      observers.push(listener);
    },
    append(table, row) {
      if (crashed) return;
      let rows = pending.appends.get(table);
      if (!rows) {
        rows = [];
        pending.appends.set(table, rows);
      }
      rows.push(row);
      touched();
    },
    durable() {
      // 죽은(시험) 쓰기 대기열의 약속은 풀리지 않는다(kill -9 뒤 답이 가지 않는 것과 같다)
      if (crashed || fatal) return new Promise(() => undefined);
      return new Promise((resolve) => {
        pending.waiters.push(resolve);
        schedule(durableDelayMs);
      });
    },
    async drain() {
      for (;;) {
        if (crashed || fatal || (pending.count === 0 && !inFlight)) return;
        await new Promise<void>((resolve) => {
          pending.waiters.push(resolve);
          schedule(0);
        });
      }
    },
    get pendingCount() {
      return pending.count;
    },
    takeMetrics() {
      const out = {
        dbBatches: metrics.batches,
        dbRows: metrics.rows,
        dbCommitMsMax: Math.round(metrics.commitMsMax),
        dbCommitMsAvg: metrics.batches > 0 ? Math.round(metrics.commitMsTotal / metrics.batches) : 0,
        dbFailures: metrics.failures,
        dbPending: pending.count,
      };
      metrics.batches = 0;
      metrics.rows = 0;
      metrics.commitMsMax = 0;
      metrics.commitMsTotal = 0;
      metrics.failures = 0;
      return out;
    },
    crash(inFlightMode) {
      crashed = inFlightMode;
      if (timer) clearTimeout(timer);
      timer = undefined;
      pending = emptyBatch();
      return inFlightDone;
    },
  };
}
