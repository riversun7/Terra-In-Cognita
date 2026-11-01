// 실효 팩 — 팩 위에 그 세계의 항목 덮어쓰기(항목 통째)를 얹은 팩(docs/adr/2026-11-01-item-editor.md 4절, 설계안 5.2).
// 서버(덮어쓰기 접근자 apps/server/src/contentEdit/state.ts), 시뮬레이터 `--tuning`(내보내기 차이의 entries), `pnpm tuning:apply`가
// 같은 차례를 쓴다: 분류마다 팩 파일 차례로 같은 ID를 바꿔 넣고, 팩에 없는 ID(편집기에서 만든 항목)는 끝에 ID 차례(글자 단위)로
// 붙인다. 그래서 같은 차이면 서버와 시뮬이 같은 자료(시장 번호까지)로 돈다. Node API를 쓰지 않는다(해시는 "@terra/content/node").
import { type PackSource, parseJson } from "./pack.ts";

/** 항목 JSON(팩 파일 한 줄 모양) */
export type EntryJson = Readonly<Record<string, unknown>>;

/** 덮어쓰기 하나(분류·ID·항목 통째) */
export interface EntryOverride {
  readonly category: string;
  readonly id: string;
  readonly entry: EntryJson;
}

/** 분류 → 팩 파일 이름 */
export const categoryFile = (category: string): string => `${category}.json`;

const isObject = (value: unknown): value is EntryJson =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const idOf = (entry: EntryJson): string | undefined => {
  const id = entry.id;
  return typeof id === "string" ? id : undefined;
};

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** 분류 파일 → 파일 객체(entries 말고 다른 칸도 지킨다)와 항목 JSON 목록. 파일이 없거나 읽지 못하면 빈 목록 */
export function readCategoryFile(
  source: PackSource,
  category: string,
): { file: EntryJson; entries: EntryJson[] } {
  const text = source.files.get(categoryFile(category));
  let value: unknown = { entries: [] };
  try {
    if (text !== undefined) value = parseJson(text);
  } catch {
    // 팩 검사가 문법 오류를 따로 알린다. 여기서는 빈 분류로 본다
  }
  const file = isObject(value) ? value : { entries: [] };
  const entries: unknown = file.entries;
  const list: readonly unknown[] = Array.isArray(entries) ? entries : [];
  return { file, entries: list.filter(isObject) };
}

/**
 * 분류마다 실효 항목 JSON. overrides에 같은 분류·ID가 두 번 있으면 뒤의 것이 이긴다. 팩 항목과 같은 ID는 그 자리에 바꿔 넣고,
 * 팩에 없는 ID는 끝에 ID 차례로 붙인다
 */
export function effectiveEntries(
  source: PackSource,
  categories: readonly string[],
  overrides: Iterable<EntryOverride>,
): Map<string, EntryJson[]> {
  const byCategory = new Map<string, Map<string, EntryJson>>();
  for (const override of overrides) {
    const map = byCategory.get(override.category) ?? new Map<string, EntryJson>();
    map.set(override.id, override.entry);
    byCategory.set(override.category, map);
  }
  const out = new Map<string, EntryJson[]>();
  for (const category of categories) {
    const replaced = byCategory.get(category) ?? new Map<string, EntryJson>();
    const packIds = new Set<string>();
    const list: EntryJson[] = [];
    for (const entry of readCategoryFile(source, category).entries) {
      const id = idOf(entry);
      if (id !== undefined) packIds.add(id);
      list.push((id === undefined ? undefined : replaced.get(id)) ?? entry);
    }
    const created = [...replaced.keys()].filter((id) => !packIds.has(id)).toSorted(byCodeUnit);
    for (const id of created) {
      const entry = replaced.get(id);
      if (entry) list.push(entry);
    }
    out.set(category, list);
  }
  return out;
}

/** 실효 팩: 덮어쓴 분류 파일만 실효 항목으로 다시 쓴 PackSource(파일 객체의 다른 칸은 지킨다) */
export function effectiveSource(
  source: PackSource,
  overrides: Iterable<EntryOverride>,
  categories?: readonly string[],
): PackSource {
  const list = [...overrides];
  const touched = categories ?? [...new Set(list.map((override) => override.category))];
  const entries = effectiveEntries(source, touched, list);
  const files = new Map(source.files);
  const overridden = new Set(list.map((override) => override.category));
  for (const category of touched) {
    // 파일도 덮어쓰기도 없는 분류는 파일을 만들지 않는다(팩 모양 그대로)
    if (!source.files.has(categoryFile(category)) && !overridden.has(category)) continue;
    const { file } = readCategoryFile(source, category);
    files.set(categoryFile(category), JSON.stringify({ ...file, entries: entries.get(category) ?? [] }));
  }
  return { packId: source.packId, files };
}
