// 건물 편집기 요청 처리(tRPC buildings.*) — docs/adr/2026-11-02-building-editor.md. 권한(tuning:read·write 두 겹)과 속도 제한은
// 라우터가 먼저 본다. 스킬·아이템 편집기와 같은 덮어쓰기 층(ContentEditShared: 판·차례·감사·켤 때 고르기)을 쓴다.
// - list: 시설(실효·팩·덮어쓰기·해시·이 시설 레시피), 재료 고르기 창(실효 아이템), 채집 중분류, 수리 줄 무기 종류(D-512 323),
//   건설 시간 규칙(설정 칸 M14 실효 값)·채집 레벨 보너스(N43), 잠든 시설 줄, 판.
// - check: 묶음을 얹은 실효 팩 전체를 팩 검사기로 본다(저장하지 않음). 오류가 없으면 시설 파일의 권고(꺼진 재료 등)를 보낸다.
// - save: baseHash 묶음(고치기·끄기·되돌리기·잠든 줄 버리기). 팩에 없는 ID(만들기)는 받지 않는다(레시피 편집이 없어 시설만 만들 수 없다).
// - history: 감사 기록 요약 가운데 시설 줄이 든 것.
import { type RecipeEntry, readCategoryFile, recipeEntrySchema } from "@terra/content";
import {
  BUILDING_EDITOR_HISTORY_LIMIT,
  BUILDING_EDIT_CATEGORIES,
  type BuildingEditCategory,
  type BuildingEditorChange,
  type BuildingEditorCheckResponse,
  type BuildingEditorHistoryRow,
  type BuildingEditorListResponse,
} from "@terra/shared/buildingEditor";
import type { ContentIssueView } from "@terra/shared/contentEdit";
import { normalizeTuningNote } from "@terra/shared/tuning";
import { TEST_SOCIETY_COEFFICIENTS, fishTierRangesOf } from "@terra/sim";
import type { Database } from "../db/client.ts";
import { issueView } from "../contentEdit/core.ts";
import { type ContentEditShared, applyContentBatch } from "../contentEdit/services.ts";
import type { ContentPut } from "../contentEdit/state.ts";
import { readContentHistory } from "../contentEdit/store.ts";
import type { Viewer } from "../trpc/context.ts";
import { reasonedError } from "../trpc/init.ts";
import type { TuningShared } from "../tuning/services.ts";
import {
  combatClassViews,
  facilityViews,
  gatherBandViews,
  itemOptions,
  subcategoryOptions,
  weaponTypeOptions,
} from "./views.ts";

/** 받지 않은 요청(BAD_REQUEST)의 message. 무엇이 틀렸는지는 data.reason(@terra/shared BUILDING_EDITOR_REASONS) */
export const BUILDING_EDITOR_REJECTED = "BUILDING_EDITOR_REJECTED";

const rejected = (reason: string, details?: readonly string[]) =>
  reasonedError("BAD_REQUEST", BUILDING_EDITOR_REJECTED, reason, details);

export interface BuildingEditorSaveInput {
  readonly expectedRevision: number;
  readonly changes: readonly BuildingEditorChange[];
  readonly note?: string | null | undefined;
}

export interface BuildingEditorServices {
  list(): Promise<BuildingEditorListResponse>;
  check(changes: readonly BuildingEditorChange[]): Promise<BuildingEditorCheckResponse>;
  save(viewer: Viewer, input: BuildingEditorSaveInput): Promise<BuildingEditorListResponse>;
  history(): Promise<{ rows: BuildingEditorHistoryRow[] }>;
}

/** 시설·채집 확률표 쪽 문제인가(시설·확률표 파일·모르는 파일) */
const facilityIssue = (issue: ContentIssueView): boolean =>
  issue.file === null ||
  issue.file.startsWith("facilities") ||
  issue.file.startsWith("gather_tiers") ||
  issue.file.startsWith("combat_classes");

/**
 * 화면 바꿈 → 덮어쓰기 묶음(잠든 줄 버리기는 따로). 지금 실효 시설·확률표에 없는 ID는 unknown_entry(만들기 없음), 같은 ID 두 번은 plan이
 * duplicate_entry로 거절한다
 */
function putsOf(
  changes: readonly BuildingEditorChange[],
  knownFacilities: ReadonlySet<string>,
  knownBands: ReadonlySet<string>,
  knownClasses: ReadonlySet<string>,
): { puts: ContentPut[]; discard: { category: BuildingEditCategory; id: string }[] } {
  const puts: ContentPut[] = [];
  const discard: { category: BuildingEditCategory; id: string }[] = [];
  for (const change of changes) {
    if (change.op === "discard_sleeping") {
      discard.push({ category: change.category ?? "facilities", id: change.id });
      continue;
    }
    if (change.op === "put_gather_band" || change.op === "revert_gather_band") {
      const id = change.op === "put_gather_band" ? change.entry.id : change.id;
      if (!knownBands.has(id)) throw rejected("unknown_entry", [`gather_tiers/${id}`]);
      puts.push({
        category: "gather_tiers",
        id,
        entry: change.op === "put_gather_band" ? Object.fromEntries(Object.entries(change.entry)) : null,
        baseHash: change.baseHash,
      });
      continue;
    }
    if (change.op === "put_combat_class" || change.op === "revert_combat_class") {
      const id = change.op === "put_combat_class" ? change.entry.id : change.id;
      if (!knownClasses.has(id)) throw rejected("unknown_entry", [`combat_classes/${id}`]);
      puts.push({
        category: "combat_classes",
        id,
        entry: change.op === "put_combat_class" ? Object.fromEntries(Object.entries(change.entry)) : null,
        baseHash: change.baseHash,
      });
      continue;
    }
    const id = change.op === "put" ? change.entry.id : change.id;
    if (!knownFacilities.has(id)) throw rejected("unknown_entry", [`facilities/${id}`]);
    puts.push({
      category: "facilities",
      id,
      entry: change.op === "put" ? Object.fromEntries(Object.entries(change.entry)) : null,
      baseHash: change.baseHash,
    });
  }
  return { puts, discard };
}

export function createBuildingEditorServices(deps: {
  db: Database;
  shared: ContentEditShared;
  tuning: TuningShared | undefined;
  ip: string | null;
}): BuildingEditorServices {
  const { db, shared } = deps;
  const { state } = shared;
  // 레시피는 팩 그대로(덮어쓰지 않는다, 읽기 전용 줄)
  const recipes: readonly RecipeEntry[] = readCategoryFile(state.core.source, "recipes").entries.map((raw) =>
    recipeEntrySchema.parse(raw),
  );
  const knownFacilities = (): Set<string> => new Set(state.effective().facilities.map((entry) => entry.id));
  const knownBands = (): Set<string> => new Set(state.effective().gatherTiers.map((entry) => entry.id));
  const knownClasses = (): Set<string> => new Set(state.effective().combatClasses.map((entry) => entry.id));

  const list = (): Promise<BuildingEditorListResponse> => {
    const snapshot = state.snapshot();
    // 설정 칸 실효 값(덮어쓰기)을 쓸 때마다 읽는다. 설정 칸 층이 없는 서버(시험)는 팩 값
    const society = deps.tuning?.state.society() ?? TEST_SOCIETY_COEFFICIENTS;
    const rules = society.facilityBuild;
    return Promise.resolve({
      contentVersion: shared.pack.contentVersion,
      revision: snapshot.revision,
      facilities: facilityViews(state, snapshot, recipes),
      gatherBands: gatherBandViews(state, snapshot),
      items: itemOptions(snapshot.effective.items),
      subcategories: subcategoryOptions(snapshot.effective.itemSubcategories),
      weaponTypes: weaponTypeOptions(snapshot.effective.weaponTypes),
      rules: {
        msPerKg: rules.msPerKg,
        timeFactorPm: [...rules.timeFactorPm],
      },
      gatherLevelBonus: society.gatherLevelBonus,
      gatherRules: {
        progressDivisor: society.productionMainDivisor,
        yieldPerStatPm: society.productionSubYieldPm,
        tierProgressBase: society.gatherTierProgressBase,
        tierProgressStep: society.gatherTierProgressStep,
        tickMs: society.gatherTickMs,
        oreGrams: society.gatherOreGrams,
        defaultStat: Math.floor(Math.max(0, society.cyborg.initialSum) / 6),
        // 예상 채집 확률표(D-534, 생산 편집기 "예상 확률" 탭)
        growthPm: society.cyborg.growthPm,
        kMinPm: society.cyborg.kMinPm,
        kMaxPm: society.cyborg.kMaxPm,
        maxLevel: society.cyborg.maxLevel,
        levelBonus: society.gatherLevelBonus,
        conditionCap: society.condition.cap,
        // 낚시터 물 종류 티어 범위("예상 확률" 탭 물 종류 고르기, 기획 D-542 질문 1365 나)
        fishTiers: fishTierRangesOf(society.worldSeed),
      },
      combatClasses: combatClassViews(state, snapshot),
      classRule: {
        threeStatPm: society.combatClass.threeStatPm,
        generalistPm: society.combatClass.generalistPm,
      },
      sleeping: state
        .sleepingRows()
        .filter((row) => (BUILDING_EDIT_CATEGORIES as readonly string[]).includes(row.category)),
    });
  };

  return {
    list,

    check(changes) {
      const { puts } = putsOf(changes, knownFacilities(), knownBands(), knownClasses());
      const plan = state.plan(puts);
      if (!plan.ok) {
        // entry_changed 등 검사기 밖의 까닭도 문제 한 줄로 보인다(코드 = 까닭)
        const issues: ContentIssueView[] =
          plan.issues.length > 0
            ? plan.issues.filter(facilityIssue)
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
        // 시설 밖 오류만 있으면(다른 분류가 깨짐) 그대로 보인다(빈 목록이 "통과"로 보이지 않게)
        return Promise.resolve({ ok: false, issues: issues.length > 0 ? issues : plan.issues });
      }
      return Promise.resolve({ ok: true, issues: plan.warnings.map(issueView).filter(facilityIssue) });
    },

    async save(viewer, input) {
      const note = normalizeTuningNote(input.note);
      if (note === false) throw rejected("invalid_note");
      const { puts, discard } = putsOf(input.changes, knownFacilities(), knownBands(), knownClasses());
      await applyContentBatch(
        { db, shared, ip: deps.ip },
        viewer,
        { expectedRevision: input.expectedRevision, puts, discard, note },
        BUILDING_EDITOR_REJECTED,
      );
      return list();
    },

    async history() {
      const [fac, tiers, classes] = await Promise.all([
        readContentHistory(db, BUILDING_EDITOR_HISTORY_LIMIT, { category: "facilities" }),
        readContentHistory(db, BUILDING_EDITOR_HISTORY_LIMIT, { category: "gather_tiers" }),
        readContentHistory(db, BUILDING_EDITOR_HISTORY_LIMIT, { category: "combat_classes" }),
      ]);
      const seen = new Set<number>();
      const rows = [...fac, ...tiers, ...classes]
        .toSorted((a, b) => (b.auditId ?? 0) - (a.auditId ?? 0))
        .filter((row) => {
          if (row.auditId === null) return true;
          if (seen.has(row.auditId)) return false;
          seen.add(row.auditId);
          return true;
        })
        .slice(0, BUILDING_EDITOR_HISTORY_LIMIT);
      return { rows };
    },
  };
}
