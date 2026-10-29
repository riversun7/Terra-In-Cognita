// 초안 내보내기·가져오기 — ADR 38 9절 "내보내기·가져오기는 남긴다(반영·백업)"
// 내보내기 모양: { format: "terra-planet-draft", formatVersion: 1, exportedAt, generatorVersion, base, checks, planet }.
//   planet은 planets.json 항목 그대로, checks는 이 초안으로 기기에서 만든 결과 해시(면 레벨별). 반영할 때 Node에서 다시 견준다.
// 가져오기는 두 단계다. 코드는 메시지 키로 바꾼다(문장을 보이지 않는다).
//   1. parseDraftImport(글): 64KiB 상한 → JSON 읽기 → 바깥 모양을 손으로 확인 → 항목 크기(8KiB)·생성기가 받을 수 있는 모양.
//      코드: 기기만 too_large(글 64KiB 넘음)·not_json·unknown_format, 서버와 같은 entry_too_large·invalid_entry.
//   2. checkDraftForPack(항목, 팩): 서버 drafts.save와 같은 차례로 바이옴 참조(unknown_biome) → 행성 ID(unknown_planet) →
//      생성기 입력 확인(generator_rejected). 화면(WP-D)이 정의 조회 결과로 부르고, 통과해야 초안을 바꾼다.
//   서버와 같은 코드·상한은 @terra/shared planetDraftApi.ts 한 곳에 있다. 콘텐츠 형식 전체 검사(planetEntrySchema)는 서버만
//   한다(게임 앱은 zod·콘텐츠 패키지를 가져오지 않는다): 기기 검사를 통과해도 서버가 invalid_entry를 줄 수 있다.
//   내보낸 묶음 말고 항목 하나만 붙여 넣어도 받는다(planets.json에서 바로 복사한 경우: 기준 없음, 해시 없음).
// 해시·판 번호를 코드에 적지 않는다: 생성기 판은 부르는 쪽이 넘긴다(GENERATOR_VERSION).
import {
  PLANET_DRAFT_ENTRY_MAX_BYTES,
  PLANET_GENERATOR_FACE_LEVELS,
  type PlanetDraftRejectCode,
  planetDraftEntryBytes,
  resolvePlanetSettings,
} from "@terra/shared";
import {
  parsePlanetOverrides,
  parsePlanetPresets,
  planetInputFromDefinition,
  validatePlanetInput,
} from "@terra/planet/generator";
import { type DraftBase, type DraftEntry, isDraftEntry, isSeed } from "./editorModel.ts";

export const DRAFT_EXPORT_FORMAT = "terra-planet-draft";
export const DRAFT_EXPORT_FORMAT_VERSION = 1;
/** 가져오기 상한(UTF-8 바이트) */
export const DRAFT_IMPORT_MAX_BYTES = 64 * 1024;

/** 기기에서 만든 결과 해시 하나 */
export interface DraftCheck {
  readonly faceLevel: number;
  readonly hash: string;
}

export interface DraftExportBundle {
  readonly format: typeof DRAFT_EXPORT_FORMAT;
  readonly formatVersion: typeof DRAFT_EXPORT_FORMAT_VERSION;
  /** 내보낸 시각(ISO) */
  readonly exportedAt: string;
  /** 기기 생성기 판 */
  readonly generatorVersion: number;
  readonly base: DraftBase | null;
  /** 면 레벨 오름차순 */
  readonly checks: readonly DraftCheck[];
  readonly planet: DraftEntry;
}

/** 가져오기 글을 읽을 때만 나는 코드(기기): too_large = 글이 64KiB를 넘음, not_json, unknown_format = 바깥 묶음 모양이 틀림 */
export type DraftImportFormatCode = "too_large" | "not_json" | "unknown_format";
/** 가져오기 코드 = 글 읽기 코드 + 서버 drafts.save와 같은 받지 않음 코드 */
export type DraftImportCode = DraftImportFormatCode | PlanetDraftRejectCode;

/** 가져온 것. 항목 하나만 붙여 넣었으면 기준·해시·판·시각이 없다(bare) */
export interface DraftImport {
  readonly planet: DraftEntry;
  readonly base: DraftBase | null;
  readonly checks: readonly DraftCheck[];
  /** 내보낸 기기의 생성기 판(항목 하나면 null) */
  readonly generatorVersion: number | null;
  readonly exportedAt: string | null;
  readonly bare: boolean;
}

export type DraftImportResult =
  | { readonly ok: true; readonly draft: DraftImport }
  | { readonly ok: false; readonly code: DraftImportCode };

/** 내보낼 묶음(checks는 면 레벨 오름차순, 같은 레벨은 하나만) */
export function buildDraftExport(input: {
  readonly planet: DraftEntry;
  readonly base: DraftBase | null;
  readonly checks: readonly DraftCheck[];
  readonly generatorVersion: number;
  readonly exportedAt: Date;
}): DraftExportBundle {
  const byLevel = new Map<number, string>();
  for (const check of input.checks) byLevel.set(check.faceLevel, check.hash);
  const checks = [...byLevel.entries()]
    .map(([faceLevel, hash]) => ({ faceLevel, hash }))
    // oxlint-disable-next-line unicorn/no-array-sort -- 방금 만든 배열이라 원본을 바꿔도 된다
    .sort((a, b) => a.faceLevel - b.faceLevel);
  return {
    format: DRAFT_EXPORT_FORMAT,
    formatVersion: DRAFT_EXPORT_FORMAT_VERSION,
    exportedAt: input.exportedAt.toISOString(),
    generatorVersion: input.generatorVersion,
    base: input.base,
    checks,
    planet: input.planet,
  };
}

/** 사람이 읽고 붙여 넣기 좋은 JSON(들여쓰기 2칸) */
export function serializeDraftExport(bundle: DraftExportBundle): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

/** 파일로 받을 때의 이름: terra-planet-draft-<행성 ID>-<YYYYMMDD-HHMM>.json(UTC) */
export function draftExportFileName(planetId: string, exportedAt: Date): string {
  const stamp = exportedAt.toISOString().slice(0, 16).replaceAll("-", "").replace("T", "-").replace(":", "");
  return `${DRAFT_EXPORT_FORMAT}-${planetId}-${stamp}.json`;
}

/** UTF-8 바이트 수. UTF-16 한 단위는 UTF-8로 1바이트 이상이라 길이가 상한을 넘으면 세지 않는다 */
function tooLarge(text: string): boolean {
  if (text.length > DRAFT_IMPORT_MAX_BYTES) return true;
  return new TextEncoder().encode(text).byteLength > DRAFT_IMPORT_MAX_BYTES;
}

/** 콘텐츠 ID 규칙(AGENTS 4장, @terra/content ID_PATTERN과 같다. 게임 앱이 그 패키지를 가져오지 않아 옮겨 적는다) */
const CONTENT_ID = /^[a-z][a-z0-9_]{1,47}$/;
/** 결과 해시 모양(소문자 16진수). 길이는 넉넉히 받는다(해시 값·판을 적지 않으려고) */
const HASH = /^[0-9a-f]{8,64}$/;

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

/** 바이옴 참조 목록(콘텐츠 ID 문자열이 하나 이상). 아니면 null */
function biomeRefs(entry: DraftEntry): string[] | null {
  const { biomes } = entry;
  if (!Array.isArray(biomes) || biomes.length === 0) return null;
  const refs: readonly unknown[] = biomes;
  const ids: string[] = [];
  for (const ref of refs) {
    if (typeof ref !== "string" || !CONTENT_ID.test(ref)) return null;
    ids.push(ref);
  }
  return ids;
}

/**
 * 행성 항목의 크기·모양 문제(없으면 null): 직렬화한 크기가 8KiB를 넘으면 entry_too_large, 생성기가 받을 수 없는 모양
 * (ID·면 레벨 범위·시드·바이옴 ID 목록·프리셋 단계·덮어쓰기 키·범위·극 ≤ 적도)이면 invalid_entry. 콘텐츠 형식 전체는 서버가 본다
 */
export function entryProblem(value: unknown): "entry_too_large" | "invalid_entry" | null {
  if (!isDraftEntry(value)) return "invalid_entry";
  if (planetDraftEntryBytes(value) > PLANET_DRAFT_ENTRY_MAX_BYTES) return "entry_too_large";
  const { id, faceLevel, seed } = value;
  const [lowest, highest] = PLANET_GENERATOR_FACE_LEVELS;
  if (typeof id !== "string" || !CONTENT_ID.test(id)) return "invalid_entry";
  if (!isInteger(faceLevel) || faceLevel < lowest || faceLevel > highest) return "invalid_entry";
  if (!isSeed(seed) || biomeRefs(value) === null) return "invalid_entry";
  try {
    // 프리셋 단계 이름·덮어쓰기 키·정수·범위·극 ≤ 적도(생성기와 같은 표)
    resolvePlanetSettings(parsePlanetPresets(value.presets), parsePlanetOverrides(value.overrides));
  } catch {
    return "invalid_entry";
  }
  return null;
}

/** 크기·모양이 맞는 행성 항목인가(entryProblem이 없음) */
export function isImportableEntry(value: unknown): value is DraftEntry {
  return entryProblem(value) === null;
}

/** 팩(정의 조회 결과): 행성 ID들과 바이옴 항목들 */
export interface DraftPackContext {
  readonly planetIds: readonly string[];
  readonly biomes: readonly unknown[];
}

/**
 * 가져온 항목을 서버 drafts.save와 같은 차례로 본다(초안을 바꾸기 전에): 크기·모양 → 바이옴 참조 → 행성 ID → 생성기 입력.
 * 문제가 없으면 null. 콘텐츠 형식 전체(planetEntrySchema)는 서버만 보므로 통과해도 서버가 invalid_entry를 줄 수 있다
 */
export function checkDraftForPack(entry: DraftEntry, pack: DraftPackContext): PlanetDraftRejectCode | null {
  const shape = entryProblem(entry);
  if (shape) return shape;
  const known = new Set<string>();
  for (const biome of pack.biomes) {
    const id = isDraftEntry(biome) ? biome.id : undefined;
    if (typeof id === "string") known.add(id);
  }
  if (!(biomeRefs(entry) ?? []).every((id) => known.has(id))) return "unknown_biome";
  if (typeof entry.id !== "string" || !pack.planetIds.includes(entry.id)) return "unknown_planet";
  try {
    validatePlanetInput(planetInputFromDefinition(entry, pack.biomes));
  } catch {
    return "generator_rejected";
  }
  return null;
}

function isBase(value: unknown): value is DraftBase {
  if (!isDraftEntry(value)) return false;
  const { contentVersion, definitionHash, generatorVersion } = value;
  return (
    typeof contentVersion === "string" &&
    typeof definitionHash === "string" &&
    isInteger(generatorVersion) &&
    generatorVersion >= 0
  );
}

function parseChecks(value: unknown): DraftCheck[] | null {
  if (!Array.isArray(value)) return null;
  const items: readonly unknown[] = value;
  const checks: DraftCheck[] = [];
  for (const item of items) {
    if (!isDraftEntry(item)) return null;
    const { faceLevel, hash } = item;
    if (!isInteger(faceLevel) || typeof hash !== "string" || !HASH.test(hash)) return null;
    checks.push({ faceLevel, hash });
  }
  return checks;
}

/** 내보낸 묶음(또는 항목 하나) 글 → 가져온 것. 틀리면 코드 */
export function parseDraftImport(text: string): DraftImportResult {
  if (tooLarge(text)) return { ok: false, code: "too_large" };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, code: "not_json" };
  }
  if (!isDraftEntry(data)) return { ok: false, code: "unknown_format" };
  if (data.format === undefined && data.presets !== undefined) {
    // 항목 하나(planets.json에서 복사): 기준·해시 없이 받는다
    const problem = entryProblem(data);
    if (problem) return { ok: false, code: problem };
    const draft: DraftImport = {
      planet: data,
      base: null,
      checks: [],
      generatorVersion: null,
      exportedAt: null,
      bare: true,
    };
    return { ok: true, draft };
  }
  if (data.format !== DRAFT_EXPORT_FORMAT || data.formatVersion !== DRAFT_EXPORT_FORMAT_VERSION) {
    return { ok: false, code: "unknown_format" };
  }
  const { exportedAt, generatorVersion, planet } = data;
  const checks = parseChecks(data.checks);
  const base = data.base === null ? null : isBase(data.base) ? data.base : undefined;
  if (typeof exportedAt !== "string" || !isInteger(generatorVersion) || base === undefined || !checks) {
    return { ok: false, code: "unknown_format" };
  }
  const problem = entryProblem(planet);
  if (problem || !isDraftEntry(planet)) return { ok: false, code: problem ?? "invalid_entry" };
  return { ok: true, draft: { planet, base, checks, generatorVersion, exportedAt, bare: false } };
}
