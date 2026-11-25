// 팩 항목 실효 값 — 스킬·아이템·유닛 종류·아이템 분류 자료·시설 덮어쓰기 접근자 하나(docs/adr/2026-11-01-skill-editor.md 3·4절,
// docs/adr/2026-11-01-item-editor.md 4절, docs/adr/2026-11-02-building-editor.md).
// 실효 항목 = 팩 항목 위에 이 세계(DB)의 덮어쓰기(항목 통째). 팩에 없는 ID는 편집기에서 만든 항목이다(분류 파일 끝에 ID 차례로 붙는다).
// 설정 칸 접근자(src/tuning/state.ts)와 같은 결이다:
// - 스냅숏: 판·덮어쓰기·실효 항목(JSON·파싱한 것)을 든 바뀌지 않는 객체 하나. 바꾸기는 새 스냅숏을 대입 한 번으로 바꿔 끼운다.
// - plan(plan.ts): 묶음을 얹은 실효 팩 전체를 팩 검사기로 본다. selectAtBoot(boot.ts): 켤 때 DB 줄에서 고른다(잠재우기 포함).
// - 켜진 장비·스킬이 가리키는 꺼진 스킬·효과는 전투 자료에서 빠진다(@terra/sim combatCatalogFrom). 스냅숏마다 droppedReferences로 보인다.
// - 은퇴 ID = 팩 id-changes + 이 세계에서 지운 만든 항목(DB content_retired_ids). 새 항목 ID로 다시 쓰지 못한다.
// - 잠든 줄(지금 판이 읽지 못하는 새 판 줄·팩 ID와 겹친 만든 항목·모르는 분류)은 적용하지 않고 DB에 둔다(편집기 띠).
// 서버에서 팩 항목을 읽는 곳(전투 자료·유닛 화면·NPC 정원사 웨이브·전투 서비스·경제 목록)은 effective()를 쓸 때마다 부른다.
import {
  type CreatureClassEntry,
  type CreatureEntry,
  type EffectEntry,
  type ExpTableEntry,
  type FacilityEntry,
  type GatherTierEntry,
  type ItemEntry,
  type ItemSubcategoryEntry,
  type ItemTagEntry,
  type NationPresetEntry,
  type NationTierEntry,
  type PackSource,
  type SkillEntry,
  type UnitKindEntry,
  type WeaponTypeEntry,
  type CombatClassEntry,
  combatClassEntrySchema,
  creatureClassEntrySchema,
  creatureEntrySchema,
  effectEntrySchema,
  expTableEntrySchema,
  facilityEntrySchema,
  gatherTierEntrySchema,
  itemEntrySchema,
  itemSubcategoryEntrySchema,
  itemTagEntrySchema,
  nationPresetEntrySchema,
  nationTierEntrySchema,
  skillEntrySchema,
  unitKindEntrySchema,
  weaponTypeEntrySchema,
} from "@terra/content";
import {
  CONTENT_EDIT_CATEGORIES,
  type ContentEditCategory,
  type ContentSleepReason,
  type ContentSleepingRow,
} from "@terra/shared/contentEdit";
import { type DroppedReferences, droppedReferences } from "@terra/sim";
import {
  type ContentBootSelection,
  type ContentOverrideRecord,
  byKey,
  collides,
  selectAtBoot,
} from "./boot.ts";
import {
  type ContentCore,
  type EntryJson,
  type RawEntries,
  contentKey,
  createContentCore,
  entryHash,
  idOf,
} from "./core.ts";
import { upgradeLegacyRows } from "./legacy.ts";
import { type ContentPlan, type ContentPut, planContent } from "./plan.ts";

export { type ContentBootSelection, type ContentOverrideRecord } from "./boot.ts";
export { type EntryJson, contentKey, entryHash } from "./core.ts";
export { type ContentPlan, type ContentPut, type PlannedContentChange } from "./plan.ts";

/** 실효 항목(파싱한 것, 켜짐·꺼짐 포함. 전투 자료 변환이 켜진 것만 고른다) */
export interface ContentEffective {
  readonly skills: readonly SkillEntry[];
  readonly items: readonly ItemEntry[];
  readonly unitKinds: readonly UnitKindEntry[];
  readonly itemSubcategories: readonly ItemSubcategoryEntry[];
  readonly itemTags: readonly ItemTagEntry[];
  readonly weaponTypes: readonly WeaponTypeEntry[];
  /** 효과 사전(아이템 편집기 WP-6 효과 사전 탭이 덮어쓴다) */
  readonly effects: readonly EffectEntry[];
  /** 시설(건물 편집기가 덮어쓴다, docs/adr/2026-11-02-building-editor.md). 경제 목록·유닛 화면 이름·아이템 편집기 채집 미리 보기가 읽는다 */
  readonly facilities: readonly FacilityEntry[];
  /** 1차 생산 스탯 구간별 티어 확률 분포(49 N43, D-513, 건물 편집기가 덮어쓴다). 채집 미리 보기·생산 시뮬이 읽는다 */
  readonly gatherTiers: readonly GatherTierEntry[];
  /** 크리처(크리처 편집기가 덮어쓴다, /dev/creatures) */
  readonly creatures: readonly CreatureEntry[];
  /**
   * 국가 프리셋(시작 국가 설정 편집기가 덮어쓴다, /dev/nations — docs/adr/2026-11-10-nation-editor.md). 세계 씨앗·NPC 사회·경제 목록의
   * 나라 화폐가 읽는다(src/npc/presets.ts livePresets)
   */
  readonly nationPresets: readonly NationPresetEntry[];
  /**
   * 전투 클래스 표(생산 편집기 전투 클래스 탭이 덮어쓴다, /dev/production — docs/adr/2026-11-11-production-six.md, D-529). 유닛 추천
   * (trpc units.guide)이 읽는다. 판정에 쓰지 않는다
   */
  readonly combatClasses: readonly CombatClassEntry[];
  /** 국력 등급 표(같은 편집기의 등급 탭 — docs/adr/2026-11-10-nation-editor.md "바뀜 (2026-11-11)"). 국가 프리셋의 powerTier가 가리킨다 */
  readonly nationTiers: readonly NationTierEntry[];
  /** 유닛 공통 경험치 테이블(/dev/exp-table, 48 §2.4 · 49 N8). 사이보그·휴먼·크리쳐 레벨업 구간 경험치 표 */
  readonly expTable: readonly ExpTableEntry[];
  /** 크리쳐 분류 트리(크리쳐 편집기 도감의 분류 편집, docs/adr/2026-11-25-creature-codex-groups.md 6절). 크리쳐의 category가 가리킨다 */
  readonly creatureClasses: readonly CreatureClassEntry[];
}

export interface ContentSnapshot {
  /** 덮어쓰기 판(DB content_override_revision) */
  readonly revision: number;
  /** 듣는 덮어쓰기(키 `<분류>/<ID>`) */
  readonly overrides: ReadonlyMap<string, ContentOverrideRecord>;
  /** 실효 항목 JSON(분류마다 파일 차례 + 만든 항목) */
  readonly raw: RawEntries;
  readonly effective: ContentEffective;
}

/** 켤 때 받은 잠든 줄 정보(install이 지금도 잠들었는지 다시 본다) */
export interface ContentSleepingInput {
  /** 새 판 줄 키(뒤의 install도 그 줄이 아직 새 판이면 넣지 않는다. 이 판에서 다시 저장해 판이 바뀐 줄은 깨어난다) */
  readonly newer?: Iterable<string> | undefined;
  /** 이 판이 모르는 분류의 줄(읽지도 지우지도 않는다) */
  readonly foreign?: readonly ContentSleepingRow[] | undefined;
}

export interface ContentEditState {
  snapshot(): ContentSnapshot;
  revision(): number;
  appliedCount(): number;
  /** 지금 실효 항목(스냅숏마다 같은 객체) */
  effective(): ContentEffective;
  /** 지금 실효 효과 사전(= effective().effects. 스킬·아이템 편집기의 효과 고르기, WP-6부터 덮어쓴 값) */
  readonly effects: readonly EffectEntry[];
  /** 팩 항목(덮어쓰기 없음, 파싱한 것) */
  readonly pack: ContentEffective;
  /** 팩 쪽 바탕(팩 항목·해시·실효 팩 검사) */
  readonly core: ContentCore;
  /** 팩 항목(JSON). 없으면 undefined */
  packEntry(category: ContentEditCategory, id: string): EntryJson | undefined;
  packHash(category: ContentEditCategory, id: string): string | null;
  /** 지금 실효 항목 해시(없으면 null). 저장 묶음의 baseHash와 견준다 */
  hashOf(category: ContentEditCategory, id: string): string | null;
  /** 한 번 쓰고 지운(또는 이름을 바꾼) ID — 팩 id-changes + 이 세계에서 지운 만든 항목. 새 항목 ID로 다시 쓰지 못한다 */
  retiredIds(category: ContentEditCategory): readonly string[];
  /** 이 세계에서 지운 만든 항목 ID를 더한다(켤 때 DB에서, 저장 뒤 은퇴시킨 것) */
  addRetired(rows: Iterable<{ readonly category: string; readonly id: string }>): void;
  /** 이 세계에서 은퇴시킨 ID만(내보내기 retiredIds) */
  worldRetired(): readonly { readonly category: ContentEditCategory; readonly id: string }[];
  plan(puts: readonly ContentPut[]): ContentPlan;
  selectAtBoot(rows: readonly ContentOverrideRecord[]): ContentBootSelection;
  /**
   * 새 스냅숏으로 바꿔 끼운다. records = DB 줄 전부(잠든 줄 포함: 지금도 잠들었는지 다시 보고 넣지 않는다).
   * sleeping: 켤 때 잠재운 새 판 줄 키와 모르는 분류 줄(켤 때만 준다)
   */
  install(records: Iterable<ContentOverrideRecord>, revision: number, sleeping?: ContentSleepingInput): void;
  /**
   * 스냅숏을 바꿔 끼운 뒤(install — 켤 때 한 번, 저장할 때마다) 부를 함수를 건다. 실효 값을 따로 들고 있는 곳이 맞춰 고친다
   * (국가 프리셋 목록 — src/npc/presets.ts createLivePresets). 듣는 함수가 던져도 저장은 그대로다
   */
  subscribe(listener: () => void): void;
  /** 지금 팩 판(manifest version) */
  readonly packVersion: number;
  /** 줄의 판(core@N)이 지금 팩보다 새로운가(팩 ID가 같고 N이 더 크다) */
  newerThanPack(contentVersion: string): boolean;
  /** 지금 스냅숏에서 거른 꺼진 참조(켜진 장비 → 꺼진 스킬, 켜진 스킬 → 꺼진 효과) */
  droppedReferences(): DroppedReferences;
  /** 잠든 줄 수 */
  sleepingCount(): number;
  /** 잠든 줄(편집기 띠) */
  sleepingRows(): readonly ContentSleepingRow[];
  /** 잠든 줄 하나의 DB 항목(버리기 감사 기록, 새 ID로 옮기기). 없으면 undefined */
  sleepingRecord(category: string, id: string): ContentOverrideRecord | undefined;
}

/** 항목을 파싱한다(검사를 통과한 JSON이라 던지지 않는다. 던지면 부르는 쪽이 받는다) */
function parseEffective(raw: RawEntries): ContentEffective {
  return {
    skills: raw.skills.map((entry) => skillEntrySchema.parse(entry)),
    items: raw.items.map((entry) => itemEntrySchema.parse(entry)),
    unitKinds: raw.unit_kinds.map((entry) => unitKindEntrySchema.parse(entry)),
    itemSubcategories: raw.item_subcategories.map((entry) => itemSubcategoryEntrySchema.parse(entry)),
    itemTags: raw.item_tags.map((entry) => itemTagEntrySchema.parse(entry)),
    weaponTypes: raw.weapon_types.map((entry) => weaponTypeEntrySchema.parse(entry)),
    effects: raw.effects.map((entry) => effectEntrySchema.parse(entry)),
    facilities: raw.facilities.map((entry) => facilityEntrySchema.parse(entry)),
    gatherTiers: raw.gather_tiers.map((entry) => gatherTierEntrySchema.parse(entry)),
    creatures: raw.creatures.map((entry) => creatureEntrySchema.parse(entry)),
    nationPresets: raw.nation_presets.map((entry) => nationPresetEntrySchema.parse(entry)),
    combatClasses: raw.combat_classes.map((entry) => combatClassEntrySchema.parse(entry)),
    nationTiers: raw.nation_tiers.map((entry) => nationTierEntrySchema.parse(entry)),
    expTable: raw.exp_table.map((entry) => expTableEntrySchema.parse(entry)),
    creatureClasses: raw.creature_classes.map((entry) => creatureClassEntrySchema.parse(entry)),
  };
}

const isEditCategory = (value: string): value is ContentEditCategory =>
  (CONTENT_EDIT_CATEGORIES as readonly string[]).includes(value);

/** 실효 항목에서 거른 꺼진 참조(효과 사전도 실효 값, WP-6) */
const referencesOf = (effective: ContentEffective): DroppedReferences =>
  droppedReferences({ statRows: [], ...effective });

export function createContentEditState(source: PackSource): ContentEditState {
  const core = createContentCore(source);
  const pack = parseEffective(core.packRaw);
  let current: ContentSnapshot = { revision: 0, overrides: new Map(), raw: core.packRaw, effective: pack };
  /** 지금 스냅숏의 실효 항목 해시(필요할 때 한 번씩 셈한다) */
  let hashes = new Map<string, string>();
  /** 켤 때 잠재운 새 판 줄 키 */
  let newerAsleep = new Set<string>();
  let foreign: readonly ContentSleepingRow[] = [];
  /** DB 줄 전부(잠든 줄 포함, 마지막 install) */
  let allRecords: readonly ContentOverrideRecord[] = [];
  const retired = new Map<ContentEditCategory, Set<string>>();
  let dropped = referencesOf(pack);
  const listeners: (() => void)[] = [];
  const notify = (): void => {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // 듣는 쪽 문제로 저장을 막지 않는다
      }
    }
  };

  const hashOf = (category: ContentEditCategory, id: string): string | null => {
    const key = contentKey(category, id);
    const cached = hashes.get(key);
    if (cached !== undefined) return cached;
    const entry = current.raw[category].find((item) => idOf(item) === id);
    if (!entry) return null;
    const hash = entryHash(entry);
    hashes.set(key, hash);
    return hash;
  };
  const isRetired = (category: ContentEditCategory, id: string): boolean =>
    core.retiredPack(category).includes(id) || (retired.get(category)?.has(id) ?? false);
  /** 지금 잠든 줄인가: 켤 때 잠재운 새 판 줄이 그대로 새 판이거나, 만든 항목과 같은 ID가 팩에 있다 */
  const sleepReason = (record: ContentOverrideRecord): ContentSleepReason | null => {
    if (newerAsleep.has(contentKey(record.category, record.id)) && core.newerThanPack(record.contentVersion))
      return "newer_pack";
    return collides(core, record) ? "id_collision" : null;
  };

  return {
    get effects() {
      return current.effective.effects;
    },
    pack,
    core,
    snapshot: () => current,
    revision: () => current.revision,
    appliedCount: () => current.overrides.size,
    effective: () => current.effective,
    packEntry: (category, id) => core.packEntry(category, id),
    packHash: (category, id) => core.packHash(category, id),
    hashOf,
    retiredIds: (category) => [...core.retiredPack(category), ...(retired.get(category) ?? [])],
    addRetired(rows) {
      for (const row of rows) {
        if (!isEditCategory(row.category)) continue;
        const set = retired.get(row.category) ?? new Set<string>();
        set.add(row.id);
        retired.set(row.category, set);
      }
    },
    worldRetired: () =>
      CONTENT_EDIT_CATEGORIES.flatMap((category) =>
        [...(retired.get(category) ?? [])].toSorted().map((id) => ({ category, id })),
      ),
    packVersion: core.packVersion,
    newerThanPack: (contentVersion) => core.newerThanPack(contentVersion),
    droppedReferences: () => dropped,
    sleepingCount: () => allRecords.filter((record) => sleepReason(record) !== null).length + foreign.length,
    sleepingRows: () => [
      ...allRecords.flatMap((record): ContentSleepingRow[] => {
        const reason = sleepReason(record);
        return reason
          ? [{ category: record.category, id: record.id, reason, contentVersion: record.contentVersion }]
          : [];
      }),
      ...foreign,
    ],
    sleepingRecord: (category, id) =>
      allRecords.find(
        (record) => record.category === category && record.id === id && sleepReason(record) !== null,
      ),

    plan: (puts) =>
      planContent({ core, overrides: current.overrides, raw: current.raw, hashOf, isRetired }, puts),

    selectAtBoot: (rows) => {
      // 옛 모양 줄은 지금 모양으로 고쳐 읽고 고른다(legacy.ts, 팩 core@26)
      const legacy = upgradeLegacyRows(core, rows);
      return { ...selectAtBoot(core, legacy.rows), upgraded: legacy.upgraded };
    },

    install(records, revision, sleeping) {
      if (sleeping?.newer) newerAsleep = new Set(sleeping.newer);
      if (sleeping?.foreign) foreign = sleeping.foreign;
      const list = upgradeLegacyRows(
        core,
        [...records].filter((record) => isEditCategory(record.category)),
      ).rows.toSorted(byKey);
      allRecords = list;
      const map = new Map<string, ContentOverrideRecord>();
      for (const record of list) {
        const key = contentKey(record.category, record.id);
        // 잠든 줄은 넣지 않는다(새 판 줄은 이 판에서 다시 저장하면 판이 바뀌어 깨어난다)
        if (sleepReason(record) !== null) continue;
        newerAsleep.delete(key);
        map.set(key, record);
      }
      const raw = core.rawOf(map.values());
      let effective: ContentEffective;
      try {
        effective = parseEffective(raw);
      } catch {
        // 검사를 통과한 줄만 오므로 오지 않는다. 와도 팩 항목으로 돈다(서버가 멈추지 않게)
        current = { revision, overrides: new Map(), raw: core.packRaw, effective: pack };
        hashes = new Map();
        dropped = referencesOf(pack);
        notify();
        return;
      }
      // 대입 한 번: 읽는 쪽은 앞 스냅숏이나 이 스냅숏만 본다
      current = { revision, overrides: map, raw, effective };
      hashes = new Map();
      dropped = referencesOf(effective);
      notify();
    },
    subscribe(listener) {
      listeners.push(listener);
    },
  };
}
