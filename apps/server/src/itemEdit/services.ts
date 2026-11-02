// 아이템 편집기 요청 처리 — tRPC items.*(src/trpc/items.ts)가 권한(설정 칸 패널과 같은 tuning:read·write 두 겹)과 속도 제한을 거친 뒤
// 부른다. docs/adr/2026-11-01-item-editor.md 3·4절. 저장은 스킬 편집기와 같은 덮어쓰기 층·차례·판(contentEdit applyContentBatch)이다.
// - list: 요약 줄(권고 수·코드 참조 표시) + 분류 자료 + 고르기 창 자료(유닛 종류·스킬·효과·스탯 행) + 은퇴 ID + 잠든 줄
// - get: 항목 통째·팩 항목·덮어쓰기·쓰는 곳·권고. check: 묶음을 얹은 실효 팩 검사(코드가 붙은 문제) + 권고 + 끄면 멈추는 것
// - preview: 저장 전 초안을 그 세계의 실효 자료·계산식으로 셈한다(preview.ts). save: baseHash 묶음. history: 감사 기록 요약
import {
  type ItemEntry,
  type NecessityEntry,
  type RecipeEntry,
  type StatRowEntry,
  itemEntrySchema,
  necessityEntrySchema,
  readCategoryFile,
  recipeEntrySchema,
  statRowEntrySchema,
} from "@terra/content";
import type { ContentIssueView } from "@terra/shared/contentEdit";
import {
  ITEM_EDITOR_HISTORY_LIMIT,
  ITEM_EDIT_CATEGORIES,
  ITEM_LIMITS,
  type ItemCodeRef,
  type ItemEditCategory,
  type ItemEditorChange,
  type ItemEditorCheckResponse,
  type ItemEditorExportResponse,
  type ItemEditorGetResponse,
  type ItemEditorHistoryRow,
  type ItemEditorListResponse,
  type ItemEditorPreviewResponse,
  type ItemPreviewUnit,
  type ItemUsage,
  applyItemPatch,
} from "@terra/shared/itemEditor";
import { normalizeTuningNote } from "@terra/shared/tuning";
import { sql } from "drizzle-orm";
import { type ContentEditShared, applyContentBatch } from "../contentEdit/services.ts";
import { type ContentPut, type ContentSnapshot, contentKey } from "../contentEdit/state.ts";
import { readContentHistory, readContentHistoryEntry } from "../contentEdit/store.ts";
import { overrideViewOf } from "../contentEdit/views.ts";
import type { Database } from "../db/client.ts";
import { battleLabPresets } from "../db/schema.ts";
import type { RosterCatalog } from "../roster/catalog.ts";
import type { Viewer } from "../trpc/context.ts";
import { reasonedError } from "../trpc/init.ts";
import type { TuningShared } from "../tuning/services.ts";
import { type AdviceContext, itemAdvice } from "./advice.ts";
import { itemCodeRefs } from "./codeRefs.ts";
import { effectJsonOf, effectUsageOf } from "./effectViews.ts";
import { previewItem } from "./preview.ts";
import {
  itemJsonOf,
  itemRowOf,
  originOf,
  subcategoryJsonOf,
  tagJsonOf,
  taxonomyRows,
  weaponTypeJsonOf,
} from "./views.ts";

/** 받지 않은 요청(BAD_REQUEST)의 message. 무엇이 틀렸는지는 data.reason(@terra/shared ITEM_EDITOR_REASONS) */
export const ITEM_EDITOR_REJECTED = "ITEM_EDITOR_REJECTED";
/** 장비 파괴 문턱 설정 칸(F12, 49_Settings.md) */
const DESTROY_AT_ID = "f12_destroy_at";
/** 소모품 효과량 기본 ±오차 설정 칸(D-496 286, 출발 250‰ [임시]) */
const USE_VARIANCE_ID = "d496_use_variance";

/** 서버가 켤 때 한 번 만든 것(두 편집기가 같은 덮어쓰기 층 ContentEditShared를 쓴다) */
export interface ItemEditShared {
  readonly content: ContentEditShared;
  readonly tuning: TuningShared | undefined;
  readonly roster: RosterCatalog;
  /** 팩 레시피·생필품·가중치 표 행(덮어쓰지 않는다) */
  readonly recipes: readonly RecipeEntry[];
  readonly necessities: readonly NecessityEntry[];
  readonly statRows: readonly StatRowEntry[];
  readonly codeRefs: ReadonlyMap<string, readonly ItemCodeRef[]>;
}

/** 팩 분류 하나를 JSON 그대로 스키마로 읽는다(검증한 팩이라 실패하지 않는다) */
function parseCategory<T>(shared: ContentEditShared, category: string, parse: (raw: unknown) => T): T[] {
  return readCategoryFile(shared.state.core.source, category).entries.map(parse);
}

export function createItemEditShared(options: {
  content: ContentEditShared;
  tuning: TuningShared | undefined;
  roster: RosterCatalog;
}): ItemEditShared {
  const { content } = options;
  return {
    ...options,
    recipes: parseCategory(content, "recipes", (raw) => recipeEntrySchema.parse(raw)),
    necessities: parseCategory(content, "necessities", (raw) => necessityEntrySchema.parse(raw)),
    statRows: parseCategory(content, "stat_rows", (raw) => statRowEntrySchema.parse(raw)),
    codeRefs: itemCodeRefs(),
  };
}

export interface ItemEditorSaveInput {
  readonly expectedRevision: number;
  readonly changes: readonly ItemEditorChange[];
  readonly note?: string | null | undefined;
}

export interface ItemEditorServices {
  list(): Promise<ItemEditorListResponse>;
  get(id: string): Promise<ItemEditorGetResponse>;
  /** 실효 아이템 통째(대량 도구 내보내기·가져오기 차이, WP-7) */
  exportEntries(): Promise<ItemEditorExportResponse>;
  check(changes: readonly ItemEditorChange[]): Promise<ItemEditorCheckResponse>;
  preview(entry: unknown, unit: ItemPreviewUnit | undefined): Promise<ItemEditorPreviewResponse>;
  save(viewer: Viewer, input: ItemEditorSaveInput): Promise<ItemEditorListResponse>;
  history(id: string | undefined): Promise<{ rows: ItemEditorHistoryRow[] }>;
  historyEntry(
    auditId: number,
    category: ItemEditCategory,
    id: string,
  ): Promise<{ entry: Record<string, unknown> | null }>;
}

const rejected = (reason: string, details?: readonly string[]) =>
  reasonedError("BAD_REQUEST", ITEM_EDITOR_REJECTED, reason, details);

/** 이름 있는 항목 → 쓰는 곳 한 줄 */
const named = (entry: { id: string; name: { ko: string; en: string }; enabled: boolean }) => ({
  id: entry.id,
  name: { ko: entry.name.ko, en: entry.name.en },
  enabled: entry.enabled,
});

/**
 * 화면 바꿈 → 덮어쓰기 묶음(잠든 줄 버리기는 따로). 여러 개 고치기(patch, WP-7)는 지금 실효 항목에 그 칸만 얹은 항목 통째로 바꾸고
 * baseHash는 지금 해시다(그사이 누가 바꾸면 차례 안에서 entry_changed). 모르는 ID면 unknown_entry, 묶음 상한을 넘으면 invalid_entry
 */
function putsOf(
  changes: readonly ItemEditorChange[],
  state: ContentSnapshotReader,
): {
  puts: ContentPut[];
  discard: { category: ItemEditCategory; id: string }[];
} {
  const puts: ContentPut[] = [];
  const discard: { category: ItemEditCategory; id: string }[] = [];
  for (const change of changes) {
    if (change.op === "discard_sleeping") {
      discard.push({ category: change.category, id: change.id });
      continue;
    }
    if (change.op === "revert") {
      puts.push({ category: change.category, id: change.id, entry: null, baseHash: change.baseHash });
      continue;
    }
    if (change.op === "patch") {
      const items = new Map(state.effective().items.map((item) => [item.id, item]));
      const missing = change.ids.filter((id) => !items.has(id));
      if (missing.length > 0) throw rejected("unknown_entry", missing);
      for (const id of new Set(change.ids)) {
        const item = items.get(id);
        if (!item) continue;
        const before = itemJsonOf(item);
        const after = applyItemPatch(before, change.patch);
        if (after === before) continue;
        puts.push({ category: "items", id, entry: toRecord(after), baseHash: state.hashOf("items", id) });
      }
      continue;
    }
    const id = change.entry.id;
    if (typeof id !== "string") throw rejected("invalid_entry", ["id"]);
    puts.push({ category: change.category, id, entry: change.entry, baseHash: change.baseHash });
  }
  if (puts.length > ITEM_LIMITS.changesMax) throw rejected("invalid_entry", ["changes"]);
  return { puts, discard };
}

/** 항목 JSON → 보낼 객체 */
const toRecord = (value: object): Record<string, unknown> => Object.fromEntries(Object.entries(value));

/** putsOf가 읽는 지금 실효 항목·해시 */
interface ContentSnapshotReader {
  effective(): { readonly items: readonly ItemEntry[] };
  hashOf(category: "items", id: string): string | null;
}

export function createItemEditorServices(deps: {
  db: Database;
  shared: ItemEditShared;
  ip: string | null;
}): ItemEditorServices {
  const { db, shared } = deps;
  const content = shared.content;
  const { state } = content;

  const destroyAt = (): number | null => shared.tuning?.state.values().get(DESTROY_AT_ID) ?? null;
  const adviceContext = (effective = state.effective()): AdviceContext => ({
    effective,
    effects: state.effects,
    statRows: shared.statRows,
    statTable: shared.roster.combat.statTable,
    recipes: shared.recipes,
    necessities: shared.necessities,
    destroyAt: destroyAt(),
  });
  /** 스냅숏·설정 판·가중치 표마다 한 번 셈한 권고 */
  let adviceCache:
    | {
        snapshot: ContentSnapshot;
        destroyAt: number | null;
        table: unknown;
        byId: Map<string, ContentIssueView[]>;
      }
    | undefined;
  const adviceOf = (snapshot: ContentSnapshot): Map<string, ContentIssueView[]> => {
    const at = destroyAt();
    const table = shared.roster.combat.statTable;
    if (adviceCache?.snapshot === snapshot && adviceCache.destroyAt === at && adviceCache.table === table)
      return adviceCache.byId;
    const ctx = adviceContext(snapshot.effective);
    const byId = new Map(snapshot.effective.items.map((item) => [item.id, itemAdvice(ctx, item)]));
    adviceCache = { snapshot, destroyAt: at, table, byId };
    return byId;
  };

  const list = (): ItemEditorListResponse => {
    const snapshot = state.snapshot();
    const { effective } = snapshot;
    const advice = adviceOf(snapshot);
    const storage = new Map(effective.itemSubcategories.map((sub) => [sub.id, sub.storage]));
    const food = new Set(effective.itemSubcategories.filter((sub) => sub.food === true).map((sub) => sub.id));
    return {
      contentVersion: content.pack.contentVersion,
      revision: snapshot.revision,
      items: effective.items.map((item) =>
        itemRowOf(
          state,
          snapshot,
          item,
          {
            advice: advice.get(item.id)?.length ?? 0,
            codeRef: (shared.codeRefs.get(item.id) ?? []).length > 0,
            foodSubcategories: food,
          },
          (id) => (id === undefined ? undefined : storage.get(id)),
        ),
      ),
      subcategories: taxonomyRows(
        state,
        snapshot,
        "item_subcategories",
        effective.itemSubcategories,
        subcategoryJsonOf,
      ),
      tags: taxonomyRows(state, snapshot, "item_tags", effective.itemTags, tagJsonOf),
      weaponTypes: taxonomyRows(state, snapshot, "weapon_types", effective.weaponTypes, weaponTypeJsonOf),
      unitKinds: effective.unitKinds.map((kind) => ({
        id: kind.id,
        name: { ko: kind.name.ko, en: kind.name.en },
        slots: [...kind.slots],
        enabled: kind.enabled,
      })),
      skills: effective.skills.map((skill) => ({
        id: skill.id,
        name: { ko: skill.name.ko, en: skill.name.en },
        base: skill.base,
        weaponField: skill.weaponField ?? null,
        bareHand: skill.bareHand === true,
        enabled: skill.enabled,
      })),
      effects: effective.effects.map((effect) => ({
        id: effect.id,
        name: { ko: effect.name.ko, en: effect.name.en },
        kind: effect.kind,
        stat: effect.stat ?? null,
        valueMode: effect.valueMode,
        durationMs: effect.durationMs,
        stacking: effect.stacking,
        status: effect.status ?? null,
        enabled: effect.enabled,
        exclusive: effect.exclusive ?? null,
      })),
      statRows: shared.statRows.map((row) => ({
        id: row.id,
        name: { ko: row.name.ko, en: row.name.en },
        shape: row.shape,
        enabled: row.enabled,
      })),
      retired: {
        items: state.retiredIds("items"),
        item_subcategories: state.retiredIds("item_subcategories"),
        item_tags: state.retiredIds("item_tags"),
        weapon_types: state.retiredIds("weapon_types"),
        effects: state.retiredIds("effects"),
      },
      sleeping: state
        .sleepingRows()
        .filter((row) => (ITEM_EDIT_CATEGORIES as readonly string[]).includes(row.category)),
      // 효과 사전 탭(WP-6): 항목 통째·출처·해시와 효과마다 쓰는 아이템·스킬
      effectRows: taxonomyRows(state, snapshot, "effects", effective.effects, effectJsonOf),
      effectUsage: effectUsageOf(effective),
    };
  };

  /** 전투 실험실 팀 프리셋 중 이 아이템을 쓰는 것(DB, 유닛 하나·파티 둘 다) */
  const presetsUsing = async (id: string): Promise<string[]> => {
    const weapon = JSON.stringify({ weapon: { id } });
    const gear = JSON.stringify({ equipment: [{ item: id }] });
    const rows = await db
      .select({ name: battleLabPresets.nameKo })
      .from(battleLabPresets)
      .where(
        sql`${battleLabPresets.data} @> ${weapon}::jsonb or ${battleLabPresets.data} @> ${gear}::jsonb
          or ${battleLabPresets.data} @> ${JSON.stringify({ units: [{ weapon: { id } }] })}::jsonb
          or ${battleLabPresets.data} @> ${JSON.stringify({ units: [{ equipment: [{ item: id }] }] })}::jsonb`,
      )
      .limit(50);
    return rows.map((row) => row.name);
  };

  const usageOf = async (item: ItemEntry | undefined, id: string): Promise<ItemUsage> => {
    const { effective } = state.snapshot();
    const allowed = item?.equip?.kinds ? new Set(item.equip.kinds.map((kind) => kind.id)) : null;
    const slot = item?.equip?.slot;
    return {
      madeBy: shared.recipes
        .filter((recipe) => recipe.outputs.some((stack) => stack.item.id === id))
        .map(named),
      usedIn: shared.recipes
        .filter((recipe) => recipe.inputs.some((stack) => stack.item.id === id))
        .map(named),
      necessities: shared.necessities.filter((need) => need.item.id === id).map(named),
      spoilsFrom: effective.items
        .filter((entry) => entry.perish?.spoilsTo.id === id)
        .map((entry) => entry.id),
      skills: (item?.equip?.skills ?? []).map((ref) => ref.id),
      wearers:
        slot === undefined
          ? []
          : effective.unitKinds
              .filter((kind) => kind.slots.includes(slot) && (!allowed || allowed.has(kind.id)))
              .map((kind) => kind.id),
      presets: await presetsUsing(id),
      codeRefs: shared.codeRefs.get(id) ?? [],
    };
  };

  return {
    list: () => Promise.resolve(list()),

    async get(id) {
      const snapshot = state.snapshot();
      const item = snapshot.effective.items.find((entry) => entry.id === id);
      const pack = state.pack.items.find((entry) => entry.id === id);
      return {
        revision: snapshot.revision,
        entry: item ? itemJsonOf(item) : null,
        pack: pack ? itemJsonOf(pack) : null,
        origin: item ? originOf(state, snapshot, "items", id) : null,
        hash: item ? state.hashOf("items", id) : null,
        override: overrideViewOf(snapshot.overrides.get(contentKey("items", id))),
        usage: await usageOf(item, id),
        advice: adviceOf(snapshot).get(id) ?? [],
      };
    },

    exportEntries() {
      const snapshot = state.snapshot();
      return Promise.resolve({
        contentVersion: content.pack.contentVersion,
        revision: snapshot.revision,
        entries: snapshot.effective.items.map(itemJsonOf),
      });
    },

    check(changes) {
      const { puts } = putsOf(changes, state);
      const plan = state.plan(puts);
      if (!plan.ok) {
        // entry_changed 등 검사기 밖의 까닭도 문제 한 줄로 보인다(코드 = 까닭)
        const issues =
          plan.issues.length > 0
            ? plan.issues
            : [
                {
                  level: "error" as const,
                  file: null,
                  id: plan.id,
                  path: null,
                  code: plan.reason,
                  params: { details: plan.details.join(", ") },
                  message: plan.reason,
                },
              ];
        return Promise.resolve({ ok: false, issues, advice: {}, cascade: {} });
      }
      // 묶음을 얹은 실효 항목으로 권고를 셈한다(바뀐 아이템만)
      const items = plan.raw.items.map((raw) => itemEntrySchema.parse(raw));
      const effective = { ...state.effective(), items };
      const ctx = adviceContext(effective);
      const advice: Record<string, ContentIssueView[]> = {};
      const cascade: Record<string, { recipes: string[]; necessities: string[] }> = {};
      for (const put of puts) {
        if (put.category !== "items") continue;
        const item = items.find((entry) => entry.id === put.id);
        if (!item) continue;
        advice[contentKey("items", put.id)] = itemAdvice(ctx, item);
        if (!item.enabled)
          cascade[contentKey("items", put.id)] = {
            recipes: shared.recipes
              .filter(
                (recipe) =>
                  recipe.enabled && [...recipe.inputs, ...recipe.outputs].some((s) => s.item.id === put.id),
              )
              .map((recipe) => recipe.id),
            necessities: shared.necessities
              .filter((need) => need.enabled && need.item.id === put.id)
              .map((need) => need.id),
          };
      }
      return Promise.resolve({ ok: true, issues: [], advice, cascade });
    },

    preview(entry, unit) {
      const combat = shared.roster.combat;
      const values = new Map(state.effective().items.map((item) => [item.id, item.baseValue]));
      const variance = shared.tuning?.state.values().get(USE_VARIANCE_ID) ?? 0;
      return Promise.resolve(
        previewItem(
          { combat, tuning: shared.tuning?.state, effects: state.effects, recipes: shared.recipes, values },
          entry,
          unit,
          variance,
        ),
      );
    },

    async save(viewer, input) {
      const note = normalizeTuningNote(input.note);
      if (note === false) throw rejected("invalid_note");
      const { puts, discard } = putsOf(input.changes, state);
      await applyContentBatch(
        { db, shared: content, ip: deps.ip },
        viewer,
        { expectedRevision: input.expectedRevision, puts, discard, note },
        ITEM_EDITOR_REJECTED,
      );
      return list();
    },

    async history(id) {
      return {
        rows: await readContentHistory(
          db,
          ITEM_EDITOR_HISTORY_LIMIT,
          id === undefined ? undefined : { category: "items", id },
        ),
      };
    },

    async historyEntry(auditId, category, id) {
      return { entry: await readContentHistoryEntry(db, auditId, { category, id }) };
    },
  };
}
