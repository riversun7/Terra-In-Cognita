// 전투 보고서 기록 DB 작업 — battle_reports 표(docs/adr/2026-11-14-battle-report.md "기록").
// 추가만 한다(고치지 않는다). 줄 수 상한은 없다(기획 D-560 1380 "기록 상한 없음" — 옛 2,000줄 넘으면 오래된 것부터 지우기를 뺐다. 지우기는
// 없다 — DB 크기는 작업 기록에 적었다). 감사 기록은 시작·멈춤만 서비스가 남긴다. 읽을 때 입력(input)은 같은 스키마로 다시 검사한다(맞지 않으면 그 줄은 열 수 없다 — 다시 돌리기도 막힌다).
import type {
  BattleReportBody,
  BattleReportListInput,
  BattleReportListResponse,
  BattleReportMeta,
  BattleReportRecord,
  ReportMode,
  ReportStartInput,
} from "@terra/shared/battleReport";
import { REPORT_LIMITS } from "@terra/shared/battleReport";
import { and, desc, eq, gte, ilike, lt, or, type SQL } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { battleReports, users } from "../db/schema.ts";
import { reportStartSchema } from "./schema.ts";

export interface ReportInsert {
  readonly id: string;
  readonly input: ReportStartInput;
  readonly report: BattleReportBody;
  readonly contentVersion: string;
  readonly contentHash: string;
  readonly simVersion: number;
  readonly tuningRevision: number;
  readonly durationMs: number;
  readonly createdBy: string | null;
}

const metaColumns = {
  id: battleReports.id,
  name: battleReports.name,
  mode: battleReports.mode,
  runs: battleReports.runs,
  seed: battleReports.seed,
  variant: battleReports.variant,
  scorePm: battleReports.scorePm,
  scoreBPm: battleReports.scoreBPm,
  contentVersion: battleReports.contentVersion,
  contentHash: battleReports.contentHash,
  simVersion: battleReports.simVersion,
  tuningRevision: battleReports.tuningRevision,
  durationMs: battleReports.durationMs,
  createdAt: battleReports.createdAt,
  createdByName: users.name,
};

interface MetaRow {
  readonly id: string;
  readonly name: string;
  readonly mode: ReportMode;
  readonly runs: number;
  readonly seed: number;
  readonly variant: boolean;
  readonly scorePm: number;
  readonly scoreBPm: number | null;
  readonly contentVersion: string;
  readonly contentHash: string;
  readonly simVersion: number;
  readonly tuningRevision: number;
  readonly durationMs: number;
  readonly createdAt: Date;
  readonly createdByName: string | null;
}

function metaOf(row: MetaRow): BattleReportMeta {
  return {
    id: row.id,
    name: row.name,
    mode: row.mode,
    runs: row.runs,
    seed: row.seed,
    variant: row.variant,
    scorePm: row.scorePm,
    scoreBPm: row.scoreBPm,
    createdAtMs: row.createdAt.getTime(),
    createdBy: row.createdByName,
    contentVersion: row.contentVersion,
    contentHash: row.contentHash,
    simVersion: row.simVersion,
    tuningRevision: row.tuningRevision,
    durationMs: row.durationMs,
  };
}

/** 기록 하나를 넣는다(줄 수 상한 없음 — D-560 1380) */
export async function insertReport(db: Database, row: ReportInsert): Promise<void> {
  await db.insert(battleReports).values({
    id: row.id,
    name: row.input.name.trim(),
    note: row.input.note.trim(),
    mode: row.input.setup.mode,
    runs: row.input.runs,
    seed: row.input.seed,
    variant: row.input.variant !== null,
    scorePm: row.report.a.outcome.scorePm,
    scoreBPm: row.report.b?.outcome.scorePm ?? null,
    contentVersion: row.contentVersion,
    contentHash: row.contentHash,
    simVersion: row.simVersion,
    tuningRevision: row.tuningRevision,
    durationMs: row.durationMs,
    input: row.input,
    report: row.report,
    createdBy: row.createdBy,
  });
}

/** 목록(새것부터, 날짜·이름·종류로 거름, before = 그 기록보다 오래된 것) */
export async function listReports(
  db: Database,
  input: BattleReportListInput,
): Promise<BattleReportListResponse> {
  const limit = Math.min(REPORT_LIMITS.listMax, input.limit ?? REPORT_LIMITS.listMax);
  const where: SQL[] = [];
  if (input.fromMs !== undefined) where.push(gte(battleReports.createdAt, new Date(input.fromMs)));
  if (input.toMs !== undefined) where.push(lt(battleReports.createdAt, new Date(input.toMs)));
  const name = input.name?.trim();
  if (name) where.push(ilike(battleReports.name, `%${name.replaceAll(/[\\%_]/g, (ch) => `\\${ch}`)}%`));
  if (input.mode) where.push(eq(battleReports.mode, input.mode));
  if (input.before) {
    const [anchor] = await db
      .select({ createdAt: battleReports.createdAt })
      .from(battleReports)
      .where(eq(battleReports.id, input.before));
    if (anchor) {
      const older = or(
        lt(battleReports.createdAt, anchor.createdAt),
        and(eq(battleReports.createdAt, anchor.createdAt), lt(battleReports.id, input.before)),
      );
      if (older) where.push(older);
    }
  }
  const rows = await db
    .select(metaColumns)
    .from(battleReports)
    .leftJoin(users, eq(users.id, battleReports.createdBy))
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(battleReports.createdAt), desc(battleReports.id))
    .limit(limit + 1);
  const reports = rows.slice(0, limit).map((row) => metaOf(row));
  return { reports, next: rows.length > limit ? (reports.at(-1)?.id ?? null) : null };
}

/** 기록 하나(입력이 지금 스키마에 맞지 않으면 null) */
export async function readReport(db: Database, id: string): Promise<BattleReportRecord | null> {
  const [row] = await db
    .select({
      ...metaColumns,
      note: battleReports.note,
      input: battleReports.input,
      report: battleReports.report,
    })
    .from(battleReports)
    .leftJoin(users, eq(users.id, battleReports.createdBy))
    .where(eq(battleReports.id, id));
  if (!row) return null;
  const input = reportStartSchema.safeParse(row.input);
  if (!input.success) return null;
  const { note, report, input: _input, ...meta } = row;
  return {
    ...metaOf(meta),
    note,
    input: input.data,
    // 결과는 이 서버가 쓴 jsonb 그대로다(모양은 BattleReportBody)
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 서버가 쓴 값만 들어 있다
    report: report as BattleReportBody,
  };
}
