// 초안 내보내기·가져오기 — ADR 38 9절 "내보내기·가져오기는 남긴다(반영·백업)"
// 내보내기 모양: { format: "terra-planet-draft", formatVersion: 1, exportedAt, generatorVersion, base, checks, planet }.
//   planet은 planets.json 항목 그대로, checks는 이 초안으로 기기에서 만든 결과 해시(면 레벨별). 반영할 때 Node에서 다시 견준다.
// 가져오기: 64KiB 상한 → JSON 읽기 → 바깥 모양을 손으로 확인 → 코드(too_large, not_json, unknown_format, invalid_entry).
//   행성 항목은 생성기가 받을 수 있는 모양인지만 본다(프리셋·덮어쓰기·시드·면 레벨·바이옴 목록). 콘텐츠 형식 전체 검사는
//   서버 drafts.save가 한다(게임 앱은 zod·콘텐츠 패키지를 가져오지 않는다). 내보낸 묶음 말고 항목 하나만 붙여 넣어도 받는다
//   (planets.json에서 바로 복사한 경우: 기준 없음, 해시 없음).
// 해시·판 번호를 코드에 적지 않는다: 생성기 판은 부르는 쪽이 넘긴다(GENERATOR_VERSION).
import { PLANET_GENERATOR_FACE_LEVELS, resolvePlanetSettings } from "@terra/shared";
import { parsePlanetOverrides, parsePlanetPresets } from "@terra/planet/generator";
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

export type DraftImportCode = "too_large" | "not_json" | "unknown_format" | "invalid_entry";

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

/** 생성기가 받을 수 있는 행성 항목 모양인가(콘텐츠 형식 전체는 서버가 본다) */
export function isImportableEntry(value: unknown): value is DraftEntry {
  if (!isDraftEntry(value)) return false;
  const { id, faceLevel, seed, biomes } = value;
  const [lowest, highest] = PLANET_GENERATOR_FACE_LEVELS;
  if (typeof id !== "string" || !CONTENT_ID.test(id)) return false;
  if (!isInteger(faceLevel) || faceLevel < lowest || faceLevel > highest) return false;
  if (!isSeed(seed)) return false;
  if (!Array.isArray(biomes) || biomes.length === 0) return false;
  const refs: readonly unknown[] = biomes;
  if (!refs.every((ref) => typeof ref === "string" && CONTENT_ID.test(ref))) return false;
  try {
    // 프리셋 단계 이름·덮어쓰기 키·정수·범위·극 ≤ 적도(생성기와 같은 표)
    resolvePlanetSettings(parsePlanetPresets(value.presets), parsePlanetOverrides(value.overrides));
  } catch {
    return false;
  }
  return true;
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
    if (!isImportableEntry(data)) return { ok: false, code: "invalid_entry" };
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
  if (!isImportableEntry(planet)) return { ok: false, code: "invalid_entry" };
  return { ok: true, draft: { planet, base, checks, generatorVersion, exportedAt, bare: false } };
}
