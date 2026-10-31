// 유닛·사이보그 화면 자료의 콘텐츠 팩 부분 — 전투 자료(스탯 표·장비·스킬·유닛 종류 칸)와 이름 표({ko, en}).
// 전투 자료는 서버 전투 변환(world/combatCatalog.ts)과 같은 @terra/sim combatCatalogFrom으로 만든다. 이름은 화면이 쓴다.
// 서버를 켤 때 한 번 만든다(main.ts → app.ts roster). 시험은 실제 팩(content/core)이나 시험 자료로 만든다.
import {
  type PackSource,
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
import { type CombatCatalog, TEST_COMBAT_CATALOG, combatCatalogFrom } from "@terra/sim";

export interface RosterCatalog {
  readonly combat: CombatCatalog;
  /** 이름 표 전체(응답에는 쓴 ID만 넣는다, namesFor) */
  readonly names: RosterNames;
  /** 아이템 기준 가격(최소 단위, 팩 baseValue). 없으면 0 */
  readonly baseValue: ReadonlyMap<string, number>;
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

/** 검증을 통과한 팩의 파일에서 만든다(서버 시작 때) */
export function rosterCatalogOf(source: PackSource): RosterCatalog {
  const statRows = entriesOf(source, "stat_rows.json", (raw) => statRowEntrySchema.parse(raw));
  const items = entriesOf(source, "items.json", (raw) => itemEntrySchema.parse(raw));
  const skills = entriesOf(source, "skills.json", (raw) => skillEntrySchema.parse(raw));
  const facilities = entriesOf(source, "facilities.json", (raw) => facilityEntrySchema.parse(raw));
  const planets = entriesOf(source, "planets.json", (raw) => planetEntrySchema.parse(raw));
  const combat = combatCatalogFrom({
    statRows,
    effects: entriesOf(source, "effects.json", (raw) => effectEntrySchema.parse(raw)),
    skills,
    items,
    unitKinds: entriesOf(source, "unit_kinds.json", (raw) => unitKindEntrySchema.parse(raw)),
  });
  return {
    combat,
    names: {
      stats: nameTable(statRows.filter((row) => row.enabled)),
      items: nameTable(items.filter((item) => item.enabled)),
      skills: nameTable(skills.filter((skill) => skill.enabled)),
      facilities: nameTable(facilities.filter((facility) => facility.enabled)),
      planets: nameTable(planets),
    },
    baseValue: new Map(items.map((item) => [item.id, item.baseValue])),
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
    baseValue: new Map(),
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
