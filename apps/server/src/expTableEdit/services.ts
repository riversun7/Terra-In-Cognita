// 유닛 공통 경험치 테이블 편집기 요청 처리(tRPC expTable.*) — 권한(tuning:read·write 두 겹)과 속도 제한은 라우터가 먼저 본다.
// 다른 콘텐츠 편집기와 같은 덮어쓰기 층(ContentEditShared: 판·차례·감사·켤 때 고르기)을 쓴다.
// - list: 실효·팩·덮어쓰기·해시, 설정 칸 N7 기본 만렙·T4 휴먼 수명 최소/최대(ms), 은퇴 ID, 잠든 줄, 판.
// - check: 묶음을 얹은 실효 팩 전체를 팩 검사기로 본다(저장하지 않음).
// - save: baseHash 묶음(고치기·새 구간 추가·되돌리기·잠든 줄 버리기).
// - history: 감사 기록 요약 가운데 exp_table 줄이 든 것.
import type { ContentIssueView } from "@terra/shared/contentEdit";
import {
  EXP_TABLE_LIMITS,
  type ExpTableChange,
  type ExpTableCheckResponse,
  type ExpTableHistoryRow,
  type ExpTableListResponse,
} from "@terra/shared/expTable";
import { normalizeTuningNote } from "@terra/shared/tuning";
import { TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { issueView } from "../contentEdit/core.ts";
import { type ContentEditShared, applyContentBatch } from "../contentEdit/services.ts";
import type { ContentPut } from "../contentEdit/state.ts";
import { readContentHistory } from "../contentEdit/store.ts";
import type { Database } from "../db/client.ts";
import type { Viewer } from "../trpc/context.ts";
import { reasonedError } from "../trpc/init.ts";
import type { TuningShared } from "../tuning/services.ts";
import { expTableViews } from "./views.ts";

/** 받지 않은 요청(BAD_REQUEST)의 message. 무엇이 틀렸는지는 data.reason(@terra/shared EXP_TABLE_EDITOR_REASONS) */
export const EXP_TABLE_EDITOR_REJECTED = "EXP_TABLE_EDITOR_REJECTED";

const rejected = (reason: string, details?: readonly string[]) =>
  reasonedError("BAD_REQUEST", EXP_TABLE_EDITOR_REJECTED, reason, details);

export interface ExpTableEditorSaveInput {
  readonly expectedRevision: number;
  readonly changes: readonly ExpTableChange[];
  readonly note?: string | null | undefined;
}

export interface ExpTableEditorServices {
  list(): Promise<ExpTableListResponse>;
  check(changes: readonly ExpTableChange[]): Promise<ExpTableCheckResponse>;
  save(viewer: Viewer, input: ExpTableEditorSaveInput): Promise<ExpTableListResponse>;
  history(): Promise<{ rows: ExpTableHistoryRow[] }>;
}

const expTableIssue = (issue: ContentIssueView): boolean =>
  issue.file === null || issue.file.startsWith("exp_table");

function putsOf(changes: readonly ExpTableChange[]): {
  puts: ContentPut[];
  discard: { category: "exp_table"; id: string }[];
} {
  const puts: ContentPut[] = [];
  const discard: { category: "exp_table"; id: string }[] = [];
  for (const change of changes) {
    if (change.op === "discard_sleeping") {
      discard.push({ category: "exp_table", id: change.id });
      continue;
    }
    if (change.op === "revert") {
      puts.push({ category: "exp_table", id: change.id, entry: null, baseHash: change.baseHash });
      continue;
    }
    puts.push({
      category: "exp_table",
      id: change.entry.id,
      entry: {
        id: change.entry.id,
        level: change.entry.level,
        requiredExp: change.entry.requiredExp,
      },
      baseHash: change.baseHash,
    });
  }
  if (puts.length > EXP_TABLE_LIMITS.changesMax) throw rejected("invalid_entry", ["changes"]);
  return { puts, discard };
}

export function createExpTableEditorServices(deps: {
  db: Database;
  shared: ContentEditShared;
  tuning?: TuningShared | undefined;
  ip: string | null;
}): ExpTableEditorServices {
  const { db, shared } = deps;
  const { state } = shared;

  const list = (): Promise<ExpTableListResponse> => {
    const snapshot = state.snapshot();
    const society = deps.tuning?.state.society() ?? TEST_SOCIETY_COEFFICIENTS;
    return Promise.resolve({
      contentVersion: shared.pack.contentVersion,
      revision: snapshot.revision,
      entries: expTableViews(state, snapshot),
      baseMaxLevel: society.cyborg.maxLevel,
      lifespanMinMs: society.lifespanMinMs,
      lifespanMaxMs: society.lifespanMaxMs,
      retired: state.retiredIds("exp_table"),
      sleeping: state.sleepingRows().filter((row) => row.category === "exp_table"),
    });
  };

  return {
    list,

    check(changes) {
      const { puts } = putsOf(changes);
      const plan = state.plan(puts);
      if (!plan.ok) {
        const issues: ContentIssueView[] =
          plan.issues.length > 0
            ? plan.issues.filter(expTableIssue)
            : [
                {
                  level: "error",
                  file: null,
                  id: plan.id,
                  path: null,
                  code: plan.reason,
                  params: { details: plan.details.join(", ") },
                  message: plan.reason,
                },
              ];
        return Promise.resolve({ ok: false, issues: issues.length > 0 ? issues : plan.issues });
      }
      return Promise.resolve({ ok: true, issues: plan.warnings.map(issueView).filter(expTableIssue) });
    },

    async save(viewer, input) {
      const note = normalizeTuningNote(input.note);
      if (note === false) throw rejected("invalid_note");
      const { puts, discard } = putsOf(input.changes);
      await applyContentBatch(
        { db, shared, ip: deps.ip },
        viewer,
        { expectedRevision: input.expectedRevision, puts, discard, note },
        EXP_TABLE_EDITOR_REJECTED,
      );
      return list();
    },

    async history() {
      const rows = await readContentHistory(db, EXP_TABLE_LIMITS.historyLimit, { category: "exp_table" });
      return { rows };
    },
  };
}
