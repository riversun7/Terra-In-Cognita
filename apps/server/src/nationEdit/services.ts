// 시작 국가 설정 편집기 요청 처리(tRPC nations.*) — docs/adr/2026-11-10-nation-editor.md. 권한(tuning:read·write 두 겹)과 속도 제한은
// 라우터가 먼저 본다. 스킬·아이템·건물·크리처 편집기와 같은 덮어쓰기 층(ContentEditShared: 판·차례·감사·켤 때 고르기)을 쓴다.
// - list: 국가 프리셋(실효·팩·덮어쓰기·해시·올린 마크·서는 차례), 세계 씨앗 설정 칸의 지금 값("기본값 N"), 도시 직무·특산 고르기 창, 잠든 줄.
// - check: 묶음을 얹은 실효 팩 전체를 팩 검사기로 본다(저장하지 않음 — 약어·화폐 약어 겹침도 팩 검사기가 본다, @terra/content checkNations).
// - save: baseHash 묶음(고치기·되돌리기·잠든 줄 버리기). 팩에 없는 ID(만들기)와 켬·끔 바꾸기는 받지 않는다(국가 차례가 켜진 프리셋의
//   차례라, 끄거나 더하면 이미 선 세계의 국가 코드가 어긋난다).
// - uploadEmblem·removeEmblem: 올린 국가 마크(PNG 256 × 256, 20만 바이트 이하 — png.ts가 본다). 감사 기록.
// - applyToWorld: 이 세계의 세력 정체성·화폐 표시에 다시 넣는다(applyWorld.ts). dryRun이면 계획만.
import { type RecipeEntry, readCategoryFile, recipeEntrySchema } from "@terra/content";
import type { ContentIssueView } from "@terra/shared/contentEdit";
import {
  NATION_LIST_LIMITS,
  type NationApplyResponse,
  type NationEditorChange,
  type NationEditorCheckResponse,
  type NationEditorHistoryRow,
  type NationEditorListResponse,
} from "@terra/shared/nationEditor";
import { normalizeTuningNote } from "@terra/shared/tuning";
import { writeAudit } from "../auth/store.ts";
import { issueView } from "../contentEdit/core.ts";
import { type ContentEditShared, applyContentBatch } from "../contentEdit/services.ts";
import type { ContentPut } from "../contentEdit/state.ts";
import { readContentHistory } from "../contentEdit/store.ts";
import type { Database } from "../db/client.ts";
import { nationPresetsFrom } from "../npc/presets.ts";
import type { Viewer } from "../trpc/context.ts";
import { reasonedError } from "../trpc/init.ts";
import type { TuningShared } from "../tuning/services.ts";
import { planNationApply, writeNationApply } from "./applyWorld.ts";
import { loadEmblemInfo, removeEmblem, saveEmblem, sha256Hex } from "./emblems.ts";
import { checkEmblemPng, decodeBase64 } from "./png.ts";
import { facilityOptions, itemOptions, nationViews, recipeOptions, seedDefaultsOf } from "./views.ts";

/** 받지 않은 요청(BAD_REQUEST)의 message. 무엇이 틀렸는지는 data.reason(@terra/shared NATION_EDITOR_REASONS) */
export const NATION_EDITOR_REJECTED = "NATION_EDITOR_REJECTED";

const rejected = (reason: string, details?: readonly string[]) =>
  reasonedError("BAD_REQUEST", NATION_EDITOR_REJECTED, reason, details);

export interface NationEditorSaveInput {
  readonly expectedRevision: number;
  readonly changes: readonly NationEditorChange[];
  readonly note?: string | null | undefined;
}

export interface NationEditorServices {
  list(): Promise<NationEditorListResponse>;
  check(changes: readonly NationEditorChange[]): Promise<NationEditorCheckResponse>;
  save(viewer: Viewer, input: NationEditorSaveInput): Promise<NationEditorListResponse>;
  history(): Promise<{ rows: NationEditorHistoryRow[] }>;
  uploadEmblem(viewer: Viewer, input: { id: string; pngBase64: string }): Promise<NationEditorListResponse>;
  removeEmblem(viewer: Viewer, input: { id: string }): Promise<NationEditorListResponse>;
  applyToWorld(viewer: Viewer, input: { dryRun: boolean }): Promise<NationApplyResponse>;
}

/** 앱에 하나(서버 설정에서 오는 값) */
export interface NationEditShared {
  /** 이 서버의 고정 국가 수(NPC_TEST_NATIONS). NPC 사회를 끈 서버는 null */
  readonly testNations: number | null;
}

const nationIssue = (issue: ContentIssueView): boolean =>
  issue.file === null || issue.file.startsWith("nation_presets");

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? Reflect.get(value, key) : undefined;

export function createNationEditorServices(deps: {
  db: Database;
  shared: ContentEditShared;
  tuning: TuningShared | undefined;
  nation: NationEditShared | undefined;
  ip: string | null;
}): NationEditorServices {
  const { db, shared } = deps;
  const { state } = shared;
  const pool = db.$client;
  // 레시피는 팩 그대로(덮어쓰지 않는다)
  const recipes: readonly RecipeEntry[] = readCategoryFile(state.core.source, "recipes").entries.map((raw) =>
    recipeEntrySchema.parse(raw),
  );
  const known = (): Map<string, { enabled: boolean; currencyCode: string }> =>
    new Map(
      state
        .effective()
        .nationPresets.map((entry) => [
          entry.id,
          { enabled: entry.enabled, currencyCode: entry.currency.code },
        ]),
    );
  const actorOf = (viewer: Viewer) => ({
    kind: "admin" as const,
    id: viewer.id,
    ip: deps.ip,
    meta: { roles: viewer.roles },
  });

  const list = async (): Promise<NationEditorListResponse> => {
    const snapshot = state.snapshot();
    const uploaded = await loadEmblemInfo(pool);
    return {
      contentVersion: shared.pack.contentVersion,
      revision: snapshot.revision,
      nations: nationViews(state, snapshot, uploaded, deps.nation?.testNations ?? null),
      defaults: seedDefaultsOf(deps.tuning?.state.society().worldSeed),
      facilities: facilityOptions(snapshot.effective.facilities),
      recipes: recipeOptions(recipes),
      items: itemOptions(snapshot.effective.items),
      sleeping: state.sleepingRows().filter((row) => row.category === "nation_presets"),
      testNations: deps.nation?.testNations ?? null,
      worldTools: true,
    };
  };

  /**
   * 화면 바꿈 → 덮어쓰기 묶음. 지금 실효 프리셋에 없는 ID는 unknown_entry(만들기 없음), 켬·끔과 화폐 코드를 바꾼 항목은 invalid_entry
   * (국가 차례·원장 자산 코드는 고치지 않는다)
   */
  const putsOf = (
    changes: readonly NationEditorChange[],
  ): { puts: ContentPut[]; discard: { category: "nation_presets"; id: string }[] } => {
    const ids = known();
    const puts: ContentPut[] = [];
    const discard: { category: "nation_presets"; id: string }[] = [];
    for (const change of changes) {
      if (change.op === "discard_sleeping") {
        discard.push({ category: "nation_presets", id: change.id });
        continue;
      }
      const id = change.op === "put" ? change.entry.id : change.id;
      const now = ids.get(id);
      if (!now) throw rejected("unknown_entry", [`nation_presets/${id}`]);
      if (change.op === "revert") {
        puts.push({ category: "nation_presets", id, entry: null, baseHash: change.baseHash });
        continue;
      }
      if (change.entry.enabled !== now.enabled) throw rejected("invalid_entry", [id, "enabled"]);
      if (field(change.entry.currency, "code") !== now.currencyCode)
        throw rejected("invalid_entry", [id, "currency.code"]);
      puts.push({
        category: "nation_presets",
        id,
        entry: Object.fromEntries(Object.entries(change.entry)),
        baseHash: change.baseHash,
      });
    }
    if (puts.length > NATION_LIST_LIMITS.changesMax) throw rejected("invalid_entry", ["changes"]);
    return { puts, discard };
  };

  /** 묶음 검사: 팩 검사기. 오류가 있으면 ok = false */
  const checkPuts = (puts: readonly ContentPut[]): NationEditorCheckResponse => {
    const plan = state.plan(puts);
    if (!plan.ok) {
      const issues: ContentIssueView[] =
        plan.issues.length > 0
          ? plan.issues.filter(nationIssue)
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
      return { ok: false, issues: issues.length > 0 ? issues : plan.issues };
    }
    return { ok: true, issues: plan.warnings.map(issueView).filter(nationIssue) };
  };

  return {
    list,

    check(changes) {
      return Promise.resolve(checkPuts(putsOf(changes).puts));
    },

    async save(viewer, input) {
      const note = normalizeTuningNote(input.note);
      if (note === false) throw rejected("invalid_note");
      const { puts, discard } = putsOf(input.changes);
      await applyContentBatch(
        { db, shared, ip: deps.ip },
        viewer,
        { expectedRevision: input.expectedRevision, puts, discard, note },
        NATION_EDITOR_REJECTED,
      );
      return list();
    },

    async history() {
      const rows = await readContentHistory(db, NATION_LIST_LIMITS.historyLimit, {
        category: "nation_presets",
      });
      return { rows };
    },

    async uploadEmblem(viewer, input) {
      if (!known().has(input.id)) throw rejected("unknown_entry", [`nation_presets/${input.id}`]);
      const png = decodeBase64(input.pngBase64);
      if (!png) throw rejected("emblem_not_png");
      const problem = checkEmblemPng(png);
      if (problem) throw rejected(problem);
      const sha256 = sha256Hex(png);
      const before = await saveEmblem(pool, { presetId: input.id, png, sha256, userId: viewer.id });
      await writeAudit(db, {
        actor: actorOf(viewer),
        action: "nation.emblem_upload",
        targetId: null,
        before: before === null ? null : { sha256: before },
        after: { preset: input.id, sha256, bytes: png.length },
      });
      shared.log.info(
        { preset: input.id, sha256, bytes: png.length, actor: viewer.loginId },
        "nation emblem",
      );
      return list();
    },

    async removeEmblem(viewer, input) {
      const before = await removeEmblem(pool, input.id);
      if (before !== null)
        await writeAudit(db, {
          actor: actorOf(viewer),
          action: "nation.emblem_remove",
          targetId: null,
          before: { preset: input.id, sha256: before },
          after: null,
        });
      return list();
    },

    async applyToWorld(viewer, input) {
      const presets = nationPresetsFrom(state.effective().nationPresets);
      let rows = await planNationApply(pool, presets);
      if (!input.dryRun)
        rows = await writeNationApply(pool, rows, {
          actorId: viewer.id,
          nowMs: shared.now(),
          onWritten: (row) =>
            writeAudit(db, {
              actor: {
                ...actorOf(viewer),
                meta: {
                  roles: viewer.roles,
                  preset: row.preset,
                  ...(row.kind === "faction" ? { factionId: row.factionId } : { asset: row.asset }),
                },
              },
              action: row.kind === "faction" ? "nation.apply_faction" : "nation.apply_currency",
              targetId: null,
              before: { ...row.before },
              after: { ...row.after },
            }),
        });
      const updated = rows.filter((row) => row.action === "update").length;
      const skipped = rows.filter((row) => row.action.startsWith("skip")).length;
      if (!input.dryRun)
        shared.log.info({ updated, skipped, actor: viewer.loginId }, "nation presets applied to world");
      return { dryRun: input.dryRun, rows, updated, skipped };
    },
  };
}
