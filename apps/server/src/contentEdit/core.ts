// 팩 항목 덮어쓰기의 팩 쪽 바탕 — 켤 때 한 번 만들고 바뀌지 않는다(docs/adr/2026-11-01-skill-editor.md 2절, 2026-11-01-item-editor.md 4절).
// 팩 항목·해시·ID 변경표(은퇴 ID)·실효 항목 만들기(@terra/content effectiveEntries: 팩 차례 → 만든 항목 ID 차례)·실효 팩 전체 검사.
// 접근자(state.ts)·묶음 검사(plan.ts)·켤 때 고르기(boot.ts)가 같이 쓴다.
import {
  type ContentIssue,
  type IdChanges,
  type PackSource,
  categoryFile,
  effectiveEntries,
  idChangesSchema,
  parseJson,
  readCategoryFile,
  validatePack,
} from "@terra/content";
import { hashEntry } from "@terra/content/node";
import { isSettingsObject } from "@terra/shared";
import {
  CONTENT_EDIT_CATEGORIES,
  type ContentEditCategory,
  type ContentIssueView,
} from "@terra/shared/contentEdit";

/** 항목 JSON(팩 파일 한 줄 모양) */
export type EntryJson = Readonly<Record<string, unknown>>;

/** 분류마다 실효 항목 JSON(파일 차례 + 만든 항목) */
export type RawEntries = Readonly<Record<ContentEditCategory, readonly EntryJson[]>>;

export const contentKey = (category: string, id: string): string => `${category}/${id}`;

/** 항목 JSON의 정규 해시(키 차례와 상관없이 같은 내용이면 같다, 내보내기 from과 같은 값) */
export const entryHash = (entry: unknown): string => hashEntry(entry);

export function idOf(entry: EntryJson): string | undefined {
  const id = entry.id;
  return typeof id === "string" ? id : undefined;
}

/** 팩 검사 문제 → 화면 모양 */
export function issueView(issue: ContentIssue): ContentIssueView {
  return {
    level: issue.level,
    file: issue.file ?? null,
    id: issue.id ?? null,
    path: issue.path ?? null,
    code: issue.code ?? null,
    params: issue.params ?? {},
    message: issue.message,
  };
}

export interface ContentCore {
  readonly source: PackSource;
  /** 지금 팩 판(manifest version, 읽지 못하면 0) */
  readonly packVersion: number;
  /** 줄의 판(core@N)이 지금 팩보다 새로운가(팩 ID가 같고 N이 더 크다) */
  newerThanPack(contentVersion: string): boolean;
  /** 덮어쓰기가 없는 실효 항목 = 팩 항목 */
  readonly packRaw: RawEntries;
  packEntry(category: ContentEditCategory, id: string): EntryJson | undefined;
  /** 팩 항목 해시(팩에 없으면 null) */
  packHash(category: ContentEditCategory, id: string): string | null;
  /** 팩 id-changes의 옛 ID(지우거나 바꾼 것). 새 항목 ID로 다시 쓰지 못한다 */
  retiredPack(category: ContentEditCategory): readonly string[];
  /** 덮어쓰기 → 분류마다 실효 항목 JSON */
  rawOf(overrides: Iterable<{ category: string; id: string; entry: EntryJson }>): RawEntries;
  /** 실효 팩 전체를 팩 검사기(스키마·참조·아이템 사이 규칙·ID 변경표)로 본다. 문제 목록(오류·경고) */
  validate(raw: RawEntries): ContentIssue[];
  /** 팩 레시피·생필품이 가리키는 아이템: 아이템 ID → 가리키는 곳(`<분류>/<ID>`). 편집기의 대분류 잠금·쓰는 곳이 본다 */
  readonly packItemRefs: ReadonlyMap<string, readonly string[]>;
}

/** 팩 manifest의 판(읽지 못하면 0) */
function manifestVersion(source: PackSource): number {
  const text = source.files.get("manifest.json");
  try {
    const value: unknown = text === undefined ? null : parseJson(text);
    const version: unknown = isSettingsObject(value) ? value.version : undefined;
    return typeof version === "number" && Number.isSafeInteger(version) ? version : 0;
  } catch {
    return 0;
  }
}

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? Reflect.get(value, key) : undefined;

/** 레시피 입력·출력, 생필품이 가리키는 아이템 */
function itemRefsOf(source: PackSource): Map<string, string[]> {
  const refs = new Map<string, string[]>();
  const add = (item: unknown, where: string): void => {
    if (typeof item !== "string") return;
    refs.set(item, [...(refs.get(item) ?? []), where]);
  };
  for (const recipe of readCategoryFile(source, "recipes").entries) {
    const where = contentKey("recipes", String(recipe.id));
    for (const key of ["inputs", "outputs"]) {
      const stacks: unknown = recipe[key];
      if (Array.isArray(stacks)) for (const stack of stacks) add(field(stack, "item"), where);
    }
  }
  for (const necessity of readCategoryFile(source, "necessities").entries)
    add(necessity.item, contentKey("necessities", String(necessity.id)));
  return refs;
}

export function createContentCore(source: PackSource): ContentCore {
  const packVersion = manifestVersion(source);
  const newerThanPack = (contentVersion: string): boolean => {
    const match = /^(.+)@(\d+)$/.exec(contentVersion);
    return match !== null && match[1] === source.packId && Number(match[2]) > packVersion;
  };
  const packById = new Map<string, EntryJson>();
  const packHashes = new Map<string, string>();
  const fileObjects = new Map<ContentEditCategory, EntryJson>();
  for (const category of CONTENT_EDIT_CATEGORIES) {
    const read = readCategoryFile(source, category);
    fileObjects.set(category, read.file);
    for (const entry of read.entries) {
      const id = idOf(entry);
      if (id === undefined) continue;
      packById.set(contentKey(category, id), entry);
      packHashes.set(contentKey(category, id), entryHash(entry));
    }
  }
  let idChanges: IdChanges = { renamed: [], removed: [] };
  try {
    const text = source.files.get("id-changes.json");
    if (text !== undefined) idChanges = idChangesSchema.parse(parseJson(text));
  } catch {
    // 팩 검사를 통과한 팩이라 오지 않는다. 와도 빈 표로 본다(ID 다시 쓰기는 팩 검사가 막는다)
  }
  const retired = new Map<ContentEditCategory, string[]>();
  for (const category of CONTENT_EDIT_CATEGORIES)
    retired.set(category, [
      ...idChanges.removed.filter((r) => r.category === category).map((r) => r.id),
      ...idChanges.renamed.filter((r) => r.category === category).map((r) => r.from),
    ]);

  const rawOf = (overrides: Iterable<{ category: string; id: string; entry: EntryJson }>): RawEntries => {
    const entries = effectiveEntries(source, CONTENT_EDIT_CATEGORIES, overrides);
    const out: Record<ContentEditCategory, readonly EntryJson[]> = {
      skills: [],
      items: [],
      unit_kinds: [],
      item_subcategories: [],
      item_tags: [],
      weapon_types: [],
      effects: [],
      facilities: [],
      gather_tiers: [],
      creatures: [],
      nation_presets: [],
      combat_classes: [],
      nation_tiers: [],
      exp_table: [],
      creature_classes: [],
    };
    for (const category of CONTENT_EDIT_CATEGORIES) out[category] = entries.get(category) ?? [];
    return out;
  };

  const validate = (raw: RawEntries): ContentIssue[] => {
    const files = new Map(source.files);
    for (const category of CONTENT_EDIT_CATEGORIES) {
      // 파일도 항목도 없는 분류는 파일을 만들지 않는다(팩 모양 그대로)
      if (!source.files.has(categoryFile(category)) && raw[category].length === 0) continue;
      files.set(
        categoryFile(category),
        JSON.stringify({ ...fileObjects.get(category), entries: raw[category] }),
      );
    }
    try {
      return validatePack({ packId: source.packId, files }).issues;
    } catch (error) {
      return [{ stage: "schema", level: "error", message: String(error) }];
    }
  };

  return {
    source,
    packVersion,
    newerThanPack,
    packRaw: rawOf([]),
    packEntry: (category, id) => packById.get(contentKey(category, id)),
    packHash: (category, id) => packHashes.get(contentKey(category, id)) ?? null,
    retiredPack: (category) => retired.get(category) ?? [],
    rawOf,
    validate,
    packItemRefs: itemRefsOf(source),
  };
}
