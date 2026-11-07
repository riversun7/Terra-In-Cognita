// 유닛·사이보그 화면 자료의 콘텐츠 팩 부분 — 전투 자료(스탯 표·장비·스킬·유닛 종류 칸)와 이름 표({ko, en}).
// 전투 자료는 서버 전투 변환(world/combatCatalog.ts)과 같은 @terra/sim combatCatalogFrom으로 만든다. 이름은 화면이 쓴다.
// 서버를 켤 때 한 번 만든다(main.ts → app.ts roster). 시험은 실제 팩(content/core)이나 시험 자료로 만든다.
// 스킬·장비·유닛 종류는 스킬 편집기 덮어쓰기를 얹은 실효 항목이다(읽을 때마다 접근자, docs/adr/2026-11-01-skill-editor.md 4절).
// society(설정 칸 실효 값을 얹은 계수표)·coefficients(전투 계수표)는 읽을 때마다 접근자에서 받는다(개발자 패널 덮어쓰기가 다음 요청부터 듣게,
// docs/adr/2026-11-01-dev-settings-panel.md 5·7절).
import {
  type EffectEntry,
  type FacilityEntry,
  type ItemEntry,
  type PackSource,
  type SkillEntry,
  type UnitKindEntry,
  effectEntrySchema,
  facilityEntrySchema,
  itemEntrySchema,
  parseJson,
  planetEntrySchema,
  skillEntrySchema,
  statRowEntrySchema,
  unitKindEntrySchema,
} from "@terra/content";
import type { LocalizedName, RosterNames } from "@terra/shared/roster";
import {
  type CombatCatalog,
  type CombatCoefficients,
  type SocietyCoefficients,
  type StatRow,
  TEST_COMBAT_CATALOG,
  TEST_COMBAT_COEFFICIENTS,
  TEST_SOCIETY_COEFFICIENTS,
  combatCatalogFrom,
  combatCoefficientsFrom,
  societyCoefficientsFrom,
  withStatTable,
} from "@terra/sim";
import { tuningOf } from "../world/combatCatalog.ts";

export interface RosterCatalog {
  /**
   * 전투 자료. 스탯 표는 그 세계의 실효 가중치 표, 스킬·장비·유닛 종류는 실효 항목이다(읽을 때마다 지금 값, 받아 두지 말고 요청마다 읽는다)
   */
  readonly combat: CombatCatalog;
  /** 이름 표 전체(응답에는 쓴 ID만 넣는다, namesFor) */
  readonly names: RosterNames;
  /**
   * 설정 칸 실효 값(팩 tuning + 그 세계의 덮어쓰기)을 얹은 세력·사회 계수표(사이보그 만렙·스킬 등급 상한·환생 비용 N7·N34,
   * 생활비 N38, D-440·D-441). 읽을 때마다 지금 값이다(rosterCatalogOf의 society 접근자). 받아 두지 말고 쓸 때 읽는다
   */
  readonly society: SocietyCoefficients;
  /**
   * 전투 계수표(설정 칸 실효 값·실효 계산식, 읽을 때마다 지금 값). 사이보그 화면의 공격 값·세계 전투 시작 사양이 판정과 같은 식으로
   * 셈한다(docs/adr/2026-11-03-item-holdings.md "바뀜 (2026-11-07, 입은 장비·버프 → 스탯·전투)")
   */
  readonly coefficients: CombatCoefficients;
}

function entriesOf<T>(source: PackSource, file: string, parse: (raw: unknown) => T): T[] {
  const text = source.files.get(file);
  if (text === undefined) return [];
  const value: unknown = parseJson(text);
  const entries: unknown =
    typeof value === "object" && value !== null ? Reflect.get(value, "entries") : undefined;
  if (!Array.isArray(entries)) return [];
  const list: readonly unknown[] = entries;
  return list.map(parse);
}

const nameTable = (entries: readonly { id: string; name: LocalizedName }[]): Record<string, LocalizedName> =>
  Object.fromEntries(entries.map((entry) => [entry.id, { ko: entry.name.ko, en: entry.name.en }]));

/**
 * 팩 항목 실효 값(스킬·장비·유닛 종류·효과 사전, 스킬·아이템 편집기 덮어쓰기 — src/contentEdit/state.ts ContentEditState.effective).
 * effects가 없으면 팩 효과 사전(시험)
 */
export interface RosterContentEntries {
  readonly skills: readonly SkillEntry[];
  readonly items: readonly ItemEntry[];
  readonly unitKinds: readonly UnitKindEntry[];
  readonly effects?: readonly EffectEntry[] | undefined;
  /** 시설(건물 편집기 덮어쓰기, 이름 표). 없으면 팩 시설 */
  readonly facilities?: readonly FacilityEntry[] | undefined;
}

/**
 * 검증을 통과한 팩의 파일에서 만든다(서버 시작 때). society: 설정 칸 실효 값 접근자(src/tuning/state.ts TuningState.society).
 * statTable: 가중치 표 실효 값 접근자(TuningState.statTable, 밸런스 화면 덮어쓰기 — docs/adr/2026-11-01-balance-screen.md 1절).
 * content: 스킬·장비·유닛 종류 실효 항목 접근자(ContentEditState.effective, 스킬 편집기 — docs/adr/2026-11-01-skill-editor.md 4절).
 * 없으면 팩 값 그대로(시험). combat·names는 읽을 때마다 지금 값을 든 묶음이다(값이 같으면 같은 객체)
 */
export function rosterCatalogOf(
  source: PackSource,
  society?: () => SocietyCoefficients,
  statTable?: () => readonly StatRow[],
  content?: () => RosterContentEntries,
  coefficients?: () => CombatCoefficients,
): RosterCatalog {
  const statRows = entriesOf(source, "stat_rows.json", (raw) => statRowEntrySchema.parse(raw));
  const packEntries: RosterContentEntries = {
    items: entriesOf(source, "items.json", (raw) => itemEntrySchema.parse(raw)),
    skills: entriesOf(source, "skills.json", (raw) => skillEntrySchema.parse(raw)),
    unitKinds: entriesOf(source, "unit_kinds.json", (raw) => unitKindEntrySchema.parse(raw)),
  };
  const effects = entriesOf(source, "effects.json", (raw) => effectEntrySchema.parse(raw));
  const facilities = entriesOf(source, "facilities.json", (raw) => facilityEntrySchema.parse(raw));
  const planets = entriesOf(source, "planets.json", (raw) => planetEntrySchema.parse(raw));
  const packSociety = societyCoefficientsFrom(tuningOf(source));
  const current = society ?? (() => packSociety);
  // 계수표 접근자가 없으면(시험) 팩 설정 칸 값을 얹은 계수표(계산식은 기본 식)
  const packCoefficients = combatCoefficientsFrom(tuningOf(source));
  const coefficientsNow = coefficients ?? (() => packCoefficients);
  const entriesNow = content ?? (() => packEntries);
  /** 실효 항목 한 벌 → 전투 자료(팩 표)·이름 표 */
  const build = (entries: RosterContentEntries) => ({
    entries,
    combat: combatCatalogFrom({
      statRows,
      skills: entries.skills,
      items: entries.items,
      unitKinds: entries.unitKinds,
      // 효과 사전도 실효 값(아이템 편집기 효과 사전 탭, WP-6)
      effects: entries.effects ?? effects,
    }),
    names: {
      stats: nameTable(statRows.filter((row) => row.enabled)),
      items: nameTable(entries.items.filter((item) => item.enabled)),
      skills: nameTable(entries.skills.filter((skill) => skill.enabled)),
      // 시설은 늘 켜짐(켬·끔 없음, 팩 core@32)
      facilities: nameTable(entries.facilities ?? facilities),
      planets: nameTable(planets),
    },
  });
  // 실효 항목(스킬 편집기 판)이나 가중치 표(덮어쓰기 판)가 바뀌면 새 묶음을 만든다. 옛 묶음을 든 쪽은 그 요청 안에서만 쓴다
  let built = build(entriesNow());
  const latest = () => {
    const entries = entriesNow();
    if (built.entries !== entries) built = build(entries);
    return built;
  };
  let cache: { base: CombatCatalog; table: readonly StatRow[]; value: CombatCatalog } | undefined;
  const combatOf = (): CombatCatalog => {
    const base = latest().combat;
    const table = statTable?.() ?? base.statTable;
    // 표가 바뀌면 그 표를 실은 묶음(무기 적정은 1차 스탯이라 다시 셈하지 않는다, D-502)
    if (cache?.base !== base || cache.table !== table)
      cache = { base, table, value: withStatTable(base, table) };
    return cache.value;
  };
  return {
    get combat() {
      return combatOf();
    },
    get names() {
      return latest().names;
    },
    get society() {
      return current();
    },
    get coefficients() {
      return coefficientsNow();
    },
  };
}

const named = (ids: readonly string[]): Record<string, LocalizedName> =>
  Object.fromEntries(ids.map((id) => [id, { ko: id, en: id }]));

/** 팩 없이 띄운 서버·시험: 시험 전투 자료, 이름은 ID 그대로 */
export function testRosterCatalog(): RosterCatalog {
  const combat = TEST_COMBAT_CATALOG;
  return {
    combat,
    names: {
      stats: named(combat.statTable.map((row) => row.id)),
      items: named(combat.equipment.map((item) => item.id)),
      skills: named(combat.skills.map((skill) => skill.id)),
      facilities: {},
      planets: {},
    },
    society: TEST_SOCIETY_COEFFICIENTS,
    coefficients: TEST_COMBAT_COEFFICIENTS,
  };
}

function pick(
  table: Readonly<Record<string, LocalizedName>>,
  ids: Iterable<string>,
): Record<string, LocalizedName> {
  const out: Record<string, LocalizedName> = {};
  for (const id of ids) {
    const name = table[id];
    if (name) out[id] = name;
  }
  return out;
}

/** 응답에 쓴 ID의 이름만 고른다(모르는 ID는 빼고, 화면은 ID를 그대로 보인다) */
export function namesFor(
  catalog: RosterCatalog,
  used: {
    stats: Iterable<string>;
    items: Iterable<string>;
    skills: Iterable<string>;
    facilities: Iterable<string>;
    planets?: Iterable<string>;
  },
): RosterNames {
  return {
    stats: pick(catalog.names.stats, used.stats),
    items: pick(catalog.names.items, used.items),
    skills: pick(catalog.names.skills, used.skills),
    facilities: pick(catalog.names.facilities, used.facilities),
    planets: pick(catalog.names.planets, used.planets ?? []),
  };
}
