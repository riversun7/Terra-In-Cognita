// 시험 세계 새로 시작(reset-world) — 계정·감사 기록·개발 도구 자료만 남기고 세계 표를 모두 비운다.
// docs/adr/2026-11-08-world-reset.md, 기획 질문 645 답 "다) 제대로 다시"(사용자 결정 2026-11-08).
// - 남길 표 목록(WORLD_RESET_KEEP)만 적는다. 그 밖의 public 표는 나중에 생긴 세계 표까지 모두 지운다.
// - 한 트랜잭션: 다른 연결 확인 → 행 수 세기 → 외래 키 확인 → 지울 표의 TRUNCATE 거절 트리거(원장 추가만)를 잠깐 끄기
//   → TRUNCATE … RESTART IDENTITY → 트리거 다시 켜기 → 감사 기록(world.reset) → 커밋. 중간에 실패하면 아무것도 바뀌지 않는다.
// - 월드 잠금은 없다(서버는 DB에 잠금을 잡지 않는다). 그래서 같은 DB에 다른 연결이 있으면(앱 서버가 떠 있으면) 거절한다.
//   워크플로(.github/workflows/world-reset.yml)가 백업 → 앱 멈춤 → 이 명령 → 앱 켜기 차례로 돈다.
// - 출력에는 표 이름과 행 수만 쓴다(환경 변수·접속 주소·비밀값을 쓰지 않는다).
import { parseArgs } from "node:util";
import type { Pool, PoolClient } from "pg";

/** --confirm에 정확히 이 글을 줘야 지운다 */
export const RESET_CONFIRM = "RESET-WORLD";

/** 다른 연결이 끊기기를 기다리는 기본 시간(초). 앱 컨테이너를 멈춘 직후 연결이 아직 남아 있을 수 있다 */
export const DEFAULT_WAIT_SEC = 15;
const MAX_WAIT_SEC = 300;

/**
 * 남길 표와 까닭(ADR 2026-11-08-world-reset 2절). 여기 없는 public 표는 모두 지운다.
 * 계정·감사 기록·운영 기록·개발 도구 자료(세계 밖에서 사람이 만든 것)만 남긴다. 세계에서 생긴 것(사이보그·세력·원장 등)은 지운다.
 */
export const WORLD_RESET_KEEP: Readonly<Record<string, string>> = {
  users: "계정(Better Auth)",
  sessions: "로그인 세션(남기면 다시 로그인하지 않아도 된다)",
  accounts: "로그인 수단·비밀번호 해시(Better Auth)",
  verifications: "Better Auth 확인 값",
  account_recovery: "복구 이메일",
  user_settings: "계정 설정(테마·언어·메뉴·홈)",
  ops_grants: "운영 권한 체크박스(계정마다, docs/adr/2026-11-08-operator-console.md)",
  ops_switches: "운영 스위치(조회 감사 기록 켜기·끄기, docs/adr/2026-11-08-operator-roles-log-switch.md)",
  audit_log: "감사 기록(추가만, 트리거가 TRUNCATE를 막는다 — PROTECTED)",
  planet_drafts: "행성 편집기 초안",
  planet_draft_revisions: "행성 편집기 초안 판 기록",
  planet_library: "행성 보관함(팀 공용)",
  planet_library_versions: "행성 보관함 저장 판",
  star_systems: "항성계 편집기 보관함",
  tuning_overrides: "설정 칸 패널 덮어쓰기",
  tuning_revision: "설정 칸 판",
  formula_overrides: "계산식 편집기 덮어쓰기",
  content_overrides: "스킬·아이템·건물 편집기 저장",
  content_override_revision: "편집기 저장 판",
  content_retired_ids: "편집기에서 지운 ID(다시 쓰지 않는다)",
  nation_emblems:
    "시작 국가 설정 편집기에서 올린 국가 마크(프리셋 ID마다, docs/adr/2026-11-10-nation-editor.md)",
  battle_lab_presets: "전투 실험실 프리셋",
  battle_reports: "전투 보고서 기록(밸런스 화면, docs/adr/2026-11-14-battle-report.md — 설정·결과·팩 판)",
  world_nation_placements:
    "고정 NPC 국가 자리(세계 배치 화면, D-528 — 세력 코드로 적어 새 세계가 처음부터 그 자리에 선다)",
  client_errors: "기기 오류 기록(운영)",
  client_perf_samples: "기기 성능 기록(운영)",
};

/** 지우면 안 되는 표(목록에서 빠지면 계획 단계에서 멈춘다) */
const MUST_KEEP = ["audit_log", "users", "accounts"] as const;

export interface ResetPlan {
  /** 남길 표(DB에 있는 것만, 이름 차례) */
  keep: string[];
  /** 지울 표(이름 차례) */
  wipe: string[];
  /** 남길 목록에 있지만 DB에 없는 표(이름이 바뀌었을 수 있다 — 경고) */
  missingKeep: string[];
}

/** DB의 public 표 이름을 남길 표·지울 표로 나눈다 */
export function planWorldReset(
  tables: readonly string[],
  keepList: Readonly<Record<string, string>> = WORLD_RESET_KEEP,
): ResetPlan {
  for (const name of MUST_KEEP) {
    if (!Object.hasOwn(keepList, name)) throw new Error(`keep list must contain ${name}`);
  }
  const present = new Set(tables);
  const sorted = [...present].toSorted();
  return {
    keep: sorted.filter((name) => Object.hasOwn(keepList, name)),
    wipe: sorted.filter((name) => !Object.hasOwn(keepList, name)),
    missingKeep: Object.keys(keepList)
      .filter((name) => !present.has(name))
      .toSorted(),
  };
}

export interface ResetArgs {
  dryRun: boolean;
  waitSec: number;
}

/** reset-world 인자(명령 이름 뒤). 틀리면 사용자에게 보일 문구를 돌려준다 */
export function parseResetArgs(
  argv: readonly string[],
): { ok: true; args: ResetArgs } | { ok: false; message: string } {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: false,
      strict: true,
      options: {
        confirm: { type: "string" },
        "dry-run": { type: "boolean", default: false },
        wait: { type: "string" },
      },
    });
  } catch {
    return { ok: false, message: "reset-world: 알 수 없는 옵션이 있습니다." };
  }
  const dryRun = parsed.values["dry-run"] === true;
  const waitText = parsed.values.wait;
  let waitSec = DEFAULT_WAIT_SEC;
  if (typeof waitText === "string") {
    if (!/^\d{1,3}$/.test(waitText) || Number(waitText) > MAX_WAIT_SEC) {
      return { ok: false, message: `reset-world: --wait는 0~${MAX_WAIT_SEC}초입니다.` };
    }
    waitSec = Number(waitText);
  }
  // 미리 보기는 아무것도 바꾸지 않으므로 확인 글이 없어도 된다
  if (!dryRun && parsed.values.confirm !== RESET_CONFIRM) {
    return {
      ok: false,
      message: `reset-world는 세계 표를 모두 지웁니다. 하려면 --confirm ${RESET_CONFIRM}을 정확히 붙입니다(미리 보기는 --dry-run).`,
    };
  }
  return { ok: true, args: { dryRun, waitSec } };
}

/** 같은 DB의 다른 연결(앱 서버 등). 이름(application_name)과 상태만 */
export interface OtherSession {
  applicationName: string;
  state: string;
}

export interface TableRows {
  table: string;
  rows: number;
}

export interface WorldResetResult {
  kept: TableRows[];
  wiped: TableRows[];
  missingKeep: string[];
  /** 잠깐 끈 TRUNCATE 거절 트리거("표.트리거") */
  pausedTriggers: string[];
  /** false = 미리 보기(아무것도 바꾸지 않음) */
  applied: boolean;
}

/** 거절(종료 코드 3): 다른 연결이 있다, 남길 표가 지울 표를 가리킨다 */
export class WorldResetRefused extends Error {}

export interface ResetOptions {
  /** 감사 기록에 남길 실행자(TIC_ACTOR) */
  actor: string;
  dryRun: boolean;
  /** 다른 연결이 끊기기를 기다리는 시간(초) */
  waitSec: number;
  sleep?: ((ms: number) => Promise<void>) | undefined;
}

const quoteIdent = (name: string): string => `"${name.replaceAll('"', '""')}"`;
const qualified = (name: string): string => `public.${quoteIdent(name)}`;
const total = (rows: readonly TableRows[]): number => rows.reduce((sum, t) => sum + t.rows, 0);

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

async function otherSessions(client: PoolClient): Promise<OtherSession[]> {
  const result = await client.query<{ application_name: string | null; state: string | null }>(
    `select application_name, state from pg_stat_activity
     where datname = current_database() and pid <> pg_backend_pid() and backend_type = 'client backend'`,
  );
  return result.rows.map((row) => ({
    applicationName: row.application_name ?? "",
    state: row.state ?? "",
  }));
}

function describeSessions(sessions: readonly OtherSession[]): string {
  const names = [...new Set(sessions.map((s) => s.applicationName || "(이름 없음)"))].toSorted();
  return `같은 DB에 다른 연결이 ${sessions.length}개 있습니다(${names.join(", ")}). 앱 서버(tic-app)를 먼저 멈춥니다.`;
}

/** 트랜잭션 밖에서 다른 연결이 끊기기를 기다린다(pg_stat_activity는 트랜잭션 안에서 처음 읽은 값을 다시 준다) */
async function waitForOtherSessions(client: PoolClient, options: ResetOptions): Promise<void> {
  const sleep = options.sleep ?? defaultSleep;
  for (let waited = 0; ; waited += 1) {
    const sessions = await otherSessions(client);
    if (sessions.length === 0) return;
    if (waited >= options.waitSec) throw new WorldResetRefused(describeSessions(sessions));
    await sleep(1_000);
  }
}

async function publicTables(client: PoolClient): Promise<string[]> {
  const result = await client.query<{ name: string }>(
    `select relname as name from pg_class
     where relnamespace = 'public'::regnamespace and relkind in ('r', 'p') and not relispartition`,
  );
  return result.rows.map((row) => row.name);
}

async function countRows(client: PoolClient, table: string): Promise<number> {
  const result = await client.query<{ n: string }>(`select count(*)::text as n from ${qualified(table)}`);
  return Number(result.rows[0]?.n ?? 0);
}

/** 지울 표를 가리키는 외래 키 가운데 지우지 않는 표에서 오는 것(있으면 TRUNCATE가 실패하거나 남길 표까지 비운다) */
async function keptReferences(client: PoolClient, wipe: ReadonlySet<string>): Promise<string[]> {
  const result = await client.query<{ name: string; src: string; src_public: boolean; dst: string }>(
    `select con.conname as name, src.relname as src, src.relnamespace = 'public'::regnamespace as src_public,
            dst.relname as dst
     from pg_constraint con
     join pg_class src on src.oid = con.conrelid
     join pg_class dst on dst.oid = con.confrelid
     where con.contype = 'f' and dst.relnamespace = 'public'::regnamespace`,
  );
  return result.rows
    .filter((row) => wipe.has(row.dst) && !(row.src_public && wipe.has(row.src)))
    .map((row) => `${row.src} → ${row.dst} (${row.name})`)
    .toSorted();
}

/** 지울 표에 걸린, 켜져 있는 TRUNCATE 트리거(원장 추가만 트리거 등). 감사 기록 트리거는 남길 표라 여기 오지 않는다 */
async function truncateTriggers(
  client: PoolClient,
  wipe: readonly string[],
): Promise<{ table: string; trigger: string }[]> {
  const result = await client.query<{ table_name: string; trigger_name: string }>(
    `select c.relname as table_name, t.tgname as trigger_name
     from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relnamespace = 'public'::regnamespace and not t.tgisinternal and t.tgenabled <> 'D'
       and (t.tgtype::int & 32) <> 0 and c.relname = any($1::text[])
     order by c.relname, t.tgname`,
    [wipe],
  );
  return result.rows.map((row) => ({ table: row.table_name, trigger: row.trigger_name }));
}

/**
 * 세계 표를 모두 비운다(dryRun이면 세기만 하고 되돌린다). 연결 하나만 쓴다(다른 연결 확인이 자기 풀을 세지 않게).
 * 거절이면 WorldResetRefused를 던진다
 */
export async function resetWorld(pool: Pool, options: ResetOptions): Promise<WorldResetResult> {
  const client = await pool.connect();
  try {
    if (!options.dryRun) await waitForOtherSessions(client, options);
    await client.query("begin");
    // 잠금을 오래 기다리지 않는다(누가 표를 쥐고 있으면 실패 → 다시 확인)
    await client.query("set local lock_timeout = '10s'");
    if (!options.dryRun) {
      // 기다린 뒤 트랜잭션을 여는 사이에 다시 붙은 연결이 있으면 거절한다
      const late = await otherSessions(client);
      if (late.length > 0) throw new WorldResetRefused(describeSessions(late));
    }
    const plan = planWorldReset(await publicTables(client));
    const kept: TableRows[] = [];
    for (const table of plan.keep) kept.push({ table, rows: await countRows(client, table) });
    const wiped: TableRows[] = [];
    for (const table of plan.wipe) wiped.push({ table, rows: await countRows(client, table) });
    const blocking = await keptReferences(client, new Set(plan.wipe));
    if (blocking.length > 0) {
      throw new WorldResetRefused(
        `남길 표가 지울 표를 외래 키로 가리킵니다(남길 목록을 고쳐야 합니다): ${blocking.join(", ")}`,
      );
    }
    const triggers = await truncateTriggers(client, plan.wipe);
    const result: WorldResetResult = {
      kept,
      wiped,
      missingKeep: plan.missingKeep,
      pausedTriggers: triggers.map((t) => `${t.table}.${t.trigger}`),
      applied: !options.dryRun,
    };
    if (options.dryRun) {
      await client.query("rollback");
      return result;
    }
    for (const { table, trigger } of triggers) {
      await client.query(`alter table ${qualified(table)} disable trigger ${quoteIdent(trigger)}`);
    }
    // 지울 표를 한 문장에 모두 적는다 → CASCADE가 필요 없다. CASCADE를 쓰지 않아서, 남길 표가 지울 표를 가리키면
    // (위 확인을 지나쳐도) PostgreSQL이 TRUNCATE를 거절한다 — 남길 표가 말없이 비워지는 일이 없다
    if (plan.wipe.length > 0) {
      await client.query(`truncate table ${plan.wipe.map(qualified).join(", ")} restart identity`);
    }
    for (const { table, trigger } of triggers) {
      await client.query(`alter table ${qualified(table)} enable trigger ${quoteIdent(trigger)}`);
    }
    await client.query(
      `insert into audit_log (actor_kind, action, before, after, meta) values ('cli', 'world.reset', $1, $2, $3)`,
      [
        JSON.stringify({ rows: Object.fromEntries(wiped.map((t) => [t.table, t.rows])) }),
        JSON.stringify({
          wipedTables: wiped.length,
          wipedRows: total(wiped),
          keptTables: kept.map((t) => t.table),
          pausedTriggers: result.pausedTriggers,
          restartIdentity: true,
        }),
        JSON.stringify({ actor: options.actor, command: "reset-world" }),
      ],
    );
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** 결과를 사람이 읽는 줄로(표 이름·행 수만) */
export function formatResetResult(result: WorldResetResult): string[] {
  const lines = [
    result.applied
      ? `세계를 비웠습니다: 지운 표 ${result.wiped.length}개(행 ${total(result.wiped)}개), 남긴 표 ${result.kept.length}개(행 ${total(result.kept)}개)`
      : `미리 보기(바꾸지 않음): 지울 표 ${result.wiped.length}개(행 ${total(result.wiped)}개), 남길 표 ${result.kept.length}개(행 ${total(result.kept)}개)`,
    result.applied ? "지운 표(지우기 전 행 수):" : "지울 표(지금 행 수):",
    ...result.wiped.map((t) => `  - ${t.table} ${t.rows}`),
    result.applied ? "남긴 표(행 수):" : "남길 표(행 수):",
    ...result.kept.map((t) => `  = ${t.table} ${t.rows}`),
  ];
  if (result.pausedTriggers.length > 0) {
    lines.push(`잠깐 끄고 다시 켠 TRUNCATE 거절 트리거: ${result.pausedTriggers.join(", ")}`);
  }
  if (result.applied) lines.push("감사 기록 world.reset을 남겼습니다. 앱을 켜면 세계를 새로 만듭니다.");
  return lines;
}
