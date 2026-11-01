// 팩 항목 실효 값 — 스킬·장비·유닛 종류 덮어쓰기 접근자 하나(docs/adr/2026-11-01-skill-editor.md 3·4절)
// 실효 항목 = 팩 항목 위에 이 세계(DB)의 덮어쓰기(항목 통째). 팩에 없는 ID는 편집기에서 만든 항목이다(분류 파일 끝에 ID 차례로 붙는다).
// 설정 칸 접근자(src/tuning/state.ts)와 같은 결이다:
// - 스냅숏: 판·덮어쓰기·실효 항목(JSON·파싱한 것)을 든 바뀌지 않는 객체 하나. 바꾸기는 새 스냅숏을 대입 한 번으로 바꿔 끼운다.
// - plan: 묶음을 얹은 실효 팩 전체를 팩 검사기(@terra/content validatePack: 스키마·참조·ID 변경표)로 본다. 메모리는 바꾸지 않는다.
// - selectAtBoot: 켤 때 DB 줄에서 "가장 나중에 바꾼 것"을 고른다(저장 때 팩 항목 해시 ≠ 지금 해시면 팩이 이김). 던지지 않는다.
//   지금 팩보다 새 판(core@N+1)에서 저장한 줄은 지우지 않고 잠재운다(되돌림 배포가 새 칸·새 참조를 읽지 못해도 줄을 잃지 않게, 감사
//   content.slept). 잠든 줄은 적용하지 않고 DB에 두며, 그 판을 다시 켜면 보통 규칙으로 다시 고른다.
// - 켜진 장비·스킬이 가리키는 꺼진 스킬·효과는 전투 자료에서 빠진다(@terra/sim combatCatalogFrom). 스냅숏마다 droppedReferences로 보인다.
// 서버에서 스킬·무기·유닛 종류를 읽는 곳(전투 자료·유닛 화면·NPC 정원사 웨이브·전투 서비스)은 effective()를 쓸 때마다 부른다.
import {
  type EffectEntry,
  type IdChanges,
  type ItemEntry,
  type PackSource,
  type SkillEntry,
  type UnitKindEntry,
  formatIssue,
  hasErrors,
  idChangesSchema,
  itemEntrySchema,
  parseJson,
  skillEntrySchema,
  unitKindEntrySchema,
  validatePack,
} from "@terra/content";
import { hashEntry } from "@terra/content/node";
import { hasUnstorableText, isSettingsObject } from "@terra/shared";
import { type DroppedReferences, droppedReferences } from "@terra/sim";
import {
  CONTENT_EDIT_CATEGORIES,
  type ContentDropReason,
  type ContentEditCategory,
} from "@terra/shared/skillEditor";

/** 항목 JSON(팩 파일 한 줄 모양) */
export type EntryJson = Readonly<Record<string, unknown>>;

/** DB 줄(덮어쓰기 하나) */
export interface ContentOverrideRecord {
  readonly category: ContentEditCategory;
  readonly id: string;
  readonly entry: EntryJson;
  /** 저장할 때의 팩 항목 해시(팩에 없던 항목이면 null) */
  readonly packHash: string | null;
  readonly contentVersion: string;
  readonly note: string | null;
  readonly updatedById: string | null;
  readonly updatedByName: string | null;
  readonly updatedAtMs: number;
}

/** 실효 항목(파싱한 것, 켜짐·꺼짐 포함. 전투 자료 변환이 켜진 것만 고른다) */
export interface ContentEffective {
  readonly skills: readonly SkillEntry[];
  readonly items: readonly ItemEntry[];
  readonly unitKinds: readonly UnitKindEntry[];
}

export interface ContentSnapshot {
  /** 덮어쓰기 판(DB content_override_revision) */
  readonly revision: number;
  /** 듣는 덮어쓰기(키 `<분류>/<ID>`) */
  readonly overrides: ReadonlyMap<string, ContentOverrideRecord>;
  /** 실효 항목 JSON(분류마다 파일 차례 + 만든 항목) */
  readonly raw: Readonly<Record<ContentEditCategory, readonly EntryJson[]>>;
  readonly effective: ContentEffective;
}

/** 묶음의 한 칸: entry null = 덮어쓰기 지움(팩 항목으로, 만든 항목은 사라짐) */
export interface ContentPut {
  readonly category: ContentEditCategory;
  readonly id: string;
  readonly entry: EntryJson | null;
}

export interface PlannedContentChange {
  readonly category: ContentEditCategory;
  readonly id: string;
  /** 앞·뒤 덮어쓰기 항목(null = 덮어쓰기 없음) */
  readonly before: EntryJson | null;
  readonly after: EntryJson | null;
  /** 지금 팩 항목 해시(팩에 없으면 null) */
  readonly packHash: string | null;
}

export type ContentPlan =
  | { readonly ok: true; readonly changes: readonly PlannedContentChange[] }
  | {
      readonly ok: false;
      readonly reason: "invalid_entry" | "unknown_entry" | "retired_id" | "duplicate_entry";
      readonly id: string | null;
      /** 팩 검사 문제(사람이 읽는 줄, 최대 20) */
      readonly details: readonly string[];
    };

export interface ContentBootSelection {
  readonly keep: readonly ContentOverrideRecord[];
  readonly packWon: readonly ContentOverrideRecord[];
  readonly dropped: readonly { readonly row: ContentOverrideRecord; readonly reason: ContentDropReason }[];
  /** 지금 팩보다 새 판에서 저장했는데 지금 판이 읽지 못하는 줄(지우지 않고 적용하지 않는다, 감사 content.slept) */
  readonly slept: readonly ContentOverrideRecord[];
}

export interface ContentEditState {
  snapshot(): ContentSnapshot;
  revision(): number;
  appliedCount(): number;
  /** 지금 실효 항목(스냅숏마다 같은 객체) */
  effective(): ContentEffective;
  /** 팩의 효과 사전(덮어쓰지 않는다, 편집기의 특수 효과 고르기) */
  readonly effects: readonly EffectEntry[];
  /** 팩 항목(덮어쓰기 없음, 파싱한 것) */
  readonly pack: ContentEffective;
  /** 팩 항목(JSON). 없으면 undefined */
  packEntry(category: ContentEditCategory, id: string): EntryJson | undefined;
  packHash(category: ContentEditCategory, id: string): string | null;
  /** 한 번 쓰고 지운(또는 이름을 바꾼) ID — 새 항목 ID로 다시 쓰지 못한다(팩 id-changes) */
  retiredIds(category: ContentEditCategory): readonly string[];
  plan(puts: readonly ContentPut[]): ContentPlan;
  selectAtBoot(rows: readonly ContentOverrideRecord[]): ContentBootSelection;
  /**
   * 새 스냅숏으로 바꿔 끼운다. sleeping: 켤 때 잠재운 줄 키(뒤의 install도 그 줄이 아직 새 판이면 넣지 않는다. 이 판에서 다시 저장해
   * 판이 바뀐 줄은 깨어난다)
   */
  install(records: Iterable<ContentOverrideRecord>, revision: number, sleeping?: Iterable<string>): void;
  /** 지금 팩 판(manifest version) */
  readonly packVersion: number;
  /** 줄의 판(core@N)이 지금 팩보다 새로운가(팩 ID가 같고 N이 더 크다) */
  newerThanPack(contentVersion: string): boolean;
  /** 지금 스냅숏에서 거른 꺼진 참조(켜진 장비 → 꺼진 스킬, 켜진 스킬 → 꺼진 효과) */
  droppedReferences(): DroppedReferences;
  /** 잠든 줄 수 */
  sleepingCount(): number;
}

export const contentKey = (category: string, id: string): string => `${category}/${id}`;

/** 항목 JSON의 정규 해시(키 차례와 상관없이 같은 내용이면 같다, 내보내기 from과 같은 값) */
export const entryHash = (entry: unknown): string => hashEntry(entry);

const FILE_OF: Readonly<Record<ContentEditCategory, string>> = {
  skills: "skills.json",
  items: "items.json",
  unit_kinds: "unit_kinds.json",
};

const DETAILS_MAX = 20;

/** 분류 파일 → 파일 객체(entries 말고 다른 칸도 지킨다)와 항목 JSON 목록 */
function readCategory(source: PackSource, file: string): { file: EntryJson; entries: EntryJson[] } {
  const text = source.files.get(file);
  const value: unknown = text === undefined ? { entries: [] } : parseJson(text);
  const fileObject = isSettingsObject(value) ? value : { entries: [] };
  const entries: unknown = fileObject.entries;
  const list: readonly unknown[] = Array.isArray(entries) ? entries : [];
  return { file: fileObject, entries: list.filter(isSettingsObject) };
}

function idOf(entry: EntryJson): string | undefined {
  const id = entry.id;
  return typeof id === "string" ? id : undefined;
}

const byKey = (a: ContentOverrideRecord, b: ContentOverrideRecord): number => {
  const ka = contentKey(a.category, a.id);
  const kb = contentKey(b.category, b.id);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
};

/** 항목을 파싱한다(검사를 통과한 JSON이라 던지지 않는다. 던지면 부르는 쪽이 받는다) */
function parseEffective(raw: Readonly<Record<ContentEditCategory, readonly EntryJson[]>>): ContentEffective {
  return {
    skills: raw.skills.map((entry) => skillEntrySchema.parse(entry)),
    items: raw.items.map((entry) => itemEntrySchema.parse(entry)),
    unitKinds: raw.unit_kinds.map((entry) => unitKindEntrySchema.parse(entry)),
  };
}

/** 덮어쓰기 줄 → 키 `<분류>/<ID>` → 항목 JSON */
const recordsMap = (records: Iterable<ContentOverrideRecord>): Map<string, EntryJson> =>
  new Map([...records].map((record) => [contentKey(record.category, record.id), record.entry]));

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

export function createContentEditState(
  source: PackSource,
  effects: readonly EffectEntry[],
): ContentEditState {
  const packVersion = manifestVersion(source);
  /** 줄의 판이 지금 팩보다 새로운가: "<팩 ID>@<정수>"이고 팩 ID가 같으며 정수가 크다 */
  const newerThanPack = (contentVersion: string): boolean => {
    const match = /^(.+)@(\d+)$/.exec(contentVersion);
    return match !== null && match[1] === source.packId && Number(match[2]) > packVersion;
  };
  const files = new Map<ContentEditCategory, { file: EntryJson; entries: EntryJson[] }>();
  const packById = new Map<string, EntryJson>();
  const packHashes = new Map<string, string>();
  for (const category of CONTENT_EDIT_CATEGORIES) {
    const read = readCategory(source, FILE_OF[category]);
    files.set(category, read);
    for (const entry of read.entries) {
      const id = idOf(entry);
      if (id === undefined) continue;
      packById.set(contentKey(category, id), entry);
      packHashes.set(contentKey(category, id), entryHash(entry));
    }
  }
  const idChangesText = source.files.get("id-changes.json");
  let idChanges: IdChanges = { renamed: [], removed: [] };
  try {
    if (idChangesText !== undefined) idChanges = idChangesSchema.parse(parseJson(idChangesText));
  } catch {
    // 팩 검사를 통과한 팩이라 오지 않는다. 와도 빈 표로 본다(ID 다시 쓰기는 팩 검사가 막는다)
  }
  const retired = new Map<ContentEditCategory, string[]>();
  for (const category of CONTENT_EDIT_CATEGORIES)
    retired.set(category, [
      ...idChanges.removed.filter((r) => r.category === category).map((r) => r.id),
      ...idChanges.renamed.filter((r) => r.category === category).map((r) => r.from),
    ]);

  /** 덮어쓰기 표 → 분류마다 실효 항목 JSON(파일 차례로 바꿔 넣고, 팩에 없는 항목은 끝에 ID 차례로) */
  const rawOf = (overrides: ReadonlyMap<string, EntryJson>) => {
    const out: Record<ContentEditCategory, EntryJson[]> = { skills: [], items: [], unit_kinds: [] };
    for (const category of CONTENT_EDIT_CATEGORIES) {
      const read = files.get(category);
      const packIds = new Set<string>();
      for (const entry of read?.entries ?? []) {
        const id = idOf(entry);
        if (id !== undefined) packIds.add(id);
        out[category].push((id !== undefined ? overrides.get(contentKey(category, id)) : undefined) ?? entry);
      }
      const created = [...overrides]
        .filter(([key]) => key.startsWith(`${category}/`) && !packIds.has(key.slice(category.length + 1)))
        .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([, entry]) => entry);
      out[category].push(...created);
    }
    return out;
  };

  /** 실효 팩 전체를 팩 검사기로 본다. 오류가 없으면 빈 목록 */
  const validate = (raw: Readonly<Record<ContentEditCategory, readonly EntryJson[]>>): string[] => {
    const next = new Map(source.files);
    for (const category of CONTENT_EDIT_CATEGORIES) {
      const read = files.get(category);
      next.set(FILE_OF[category], JSON.stringify({ ...read?.file, entries: raw[category] }));
    }
    try {
      const result = validatePack({ packId: source.packId, files: next });
      if (!hasErrors(result.issues)) return [];
      return result.issues
        .filter((issue) => issue.level === "error")
        .slice(0, DETAILS_MAX)
        .map((issue) => formatIssue(issue));
    } catch (error) {
      return [String(error)];
    }
  };

  const packRaw = rawOf(new Map());
  const pack = parseEffective(packRaw);
  let current: ContentSnapshot = { revision: 0, overrides: new Map(), raw: packRaw, effective: pack };
  let sleeping = new Set<string>();
  /** 실효 항목의 꺼진 참조(스냅숏마다 한 번) */
  const referencesOf = (effective: ContentEffective): DroppedReferences =>
    droppedReferences({ statRows: [], effects, ...effective });
  let dropped = referencesOf(pack);

  return {
    effects,
    pack,
    snapshot: () => current,
    revision: () => current.revision,
    appliedCount: () => current.overrides.size,
    effective: () => current.effective,
    packEntry: (category, id) => packById.get(contentKey(category, id)),
    packHash: (category, id) => packHashes.get(contentKey(category, id)) ?? null,
    retiredIds: (category) => retired.get(category) ?? [],
    packVersion,
    newerThanPack,
    droppedReferences: () => dropped,
    sleepingCount: () => sleeping.size,

    plan(puts) {
      const snapshot = current;
      const seen = new Set<string>();
      const next = recordsMap(snapshot.overrides.values());
      const planned: PlannedContentChange[] = [];
      for (const put of puts) {
        const key = contentKey(put.category, put.id);
        if (seen.has(key)) return { ok: false, reason: "duplicate_entry", id: put.id, details: [] };
        seen.add(key);
        const packed = packById.get(key);
        const before = snapshot.overrides.get(key)?.entry ?? null;
        if (put.entry !== null) {
          if (idOf(put.entry) !== put.id)
            return { ok: false, reason: "invalid_entry", id: put.id, details: ["id"] };
          if (hasUnstorableText(put.entry))
            return { ok: false, reason: "invalid_entry", id: put.id, details: ["text"] };
          if (!packed && (retired.get(put.category) ?? []).includes(put.id))
            return { ok: false, reason: "retired_id", id: put.id, details: [] };
        } else if (!packed && !before) {
          // 덮어쓰기도 팩 항목도 없는 칸 되돌리기: 할 일이 없다
          continue;
        }
        // 팩 항목과 같은 내용이면 덮어쓰기를 두지 않는다(되돌리기와 같다)
        const after =
          put.entry === null || (packed !== undefined && entryHash(packed) === entryHash(put.entry))
            ? null
            : put.entry;
        if (
          (after === null && before === null) ||
          (after && before && entryHash(after) === entryHash(before))
        )
          continue;
        if (after === null) next.delete(key);
        else next.set(key, after);
        planned.push({
          category: put.category,
          id: put.id,
          before,
          after,
          packHash: packHashes.get(key) ?? null,
        });
      }
      if (planned.length === 0) return { ok: true, changes: [] };
      const problems = validate(rawOf(next));
      if (problems.length > 0) return { ok: false, reason: "invalid_entry", id: null, details: problems };
      return { ok: true, changes: planned };
    },

    selectAtBoot(rows) {
      const packWon: ContentOverrideRecord[] = [];
      const lost: { row: ContentOverrideRecord; reason: ContentDropReason }[] = [];
      const slept: ContentOverrideRecord[] = [];
      const candidates: ContentOverrideRecord[] = [];
      /** 맞지 않는 줄: 새 판 줄은 잠재우고(지우지 않음), 같거나 옛 판 줄은 지운다 */
      const reject = (row: ContentOverrideRecord, reason: ContentDropReason): void => {
        if (newerThanPack(row.contentVersion)) slept.push(row);
        else lost.push({ row, reason });
      };
      const ordered = rows.toSorted((a, b) => a.updatedAtMs - b.updatedAtMs || byKey(a, b));
      for (const row of ordered) {
        const key = contentKey(row.category, row.id);
        const hash = packHashes.get(key);
        if (hash !== undefined) {
          // 가장 나중에 바꾼 것이 이긴다: 저장 뒤에 팩 항목이 바뀌었거나(배포·되돌림 배포) 저장 때 팩에 없던 항목이 팩에 생겼다
          if (row.packHash !== hash) {
            packWon.push(row);
            continue;
          }
        } else if (row.packHash !== null && !newerThanPack(row.contentVersion)) {
          // 저장 때는 팩에 있던 항목이 새 팩에서 빠졌다(지웠거나 이름을 바꿈). 새 판 줄(되돌림)은 검사를 거쳐 쓰거나 잠재운다
          lost.push({ row, reason: "unknown_entry" });
          continue;
        }
        if (idOf(row.entry) !== row.id) {
          reject(row, "invalid_entry");
          continue;
        }
        candidates.push(row);
      }
      let keep: ContentOverrideRecord[] = candidates;
      if (candidates.length > 0 && validate(rawOf(recordsMap(candidates))).length > 0) {
        // 한꺼번에는 맞지 않는다: 저장 차례로 하나씩 얹어 맞지 않는 줄을 뺀다(새 판 줄은 잠재운다)
        keep = [];
        for (const row of candidates) {
          if (validate(rawOf(recordsMap([...keep, row]))).length === 0) keep.push(row);
          else reject(row, "invalid_entry");
        }
      }
      return { keep, packWon, dropped: lost, slept };
    },

    install(records, revision, asleep) {
      if (asleep) sleeping = new Set(asleep);
      const map = new Map<string, ContentOverrideRecord>();
      for (const record of [...records].toSorted(byKey)) {
        if (!(CONTENT_EDIT_CATEGORIES as readonly string[]).includes(record.category)) continue;
        const key = contentKey(record.category, record.id);
        // 잠든 줄은 그 판에서 저장한 그대로면 넣지 않는다(이 판에서 다시 저장하면 판이 바뀌어 깨어난다)
        if (sleeping.has(key)) {
          if (newerThanPack(record.contentVersion)) continue;
          sleeping.delete(key);
        }
        map.set(key, record);
      }
      const raw = rawOf(recordsMap(map.values()));
      let effective: ContentEffective;
      try {
        effective = parseEffective(raw);
      } catch {
        // 검사를 통과한 줄만 오므로 오지 않는다. 와도 팩 항목으로 돈다(서버가 멈추지 않게)
        current = { revision, overrides: new Map(), raw: packRaw, effective: pack };
        dropped = referencesOf(pack);
        return;
      }
      // 대입 한 번: 읽는 쪽은 앞 스냅숏이나 이 스냅숏만 본다
      current = { revision, overrides: map, raw, effective };
      dropped = referencesOf(effective);
    },
  };
}
