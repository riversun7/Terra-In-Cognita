// 행성 초안 항목 검사 — planetEditor.drafts.save·restore가 저장하기 전에 부른다(ADR 2026-10-29-planet-editor-stage1 9절).
// 차례와 코드는 기기 가져오기와 같은 약속(@terra/shared planetDraftApi.ts PLANET_DRAFT_REJECT_CODES):
//   entry_too_large(직렬화 8KiB 초과) → invalid_entry(콘텐츠 형식 planetEntrySchema, DB에 담을 수 없는 글자, 요청한 행성과
//   다른 ID) → unknown_biome(팩에 없는 바이옴) → unknown_planet(팩에 없는 행성) → generator_rejected(validatePlanetInput)
// 검사를 통과한 항목은 콘텐츠 팩 항목과 같은 모양이다(모르는 필드 없음). 저장은 받은 JSON 그대로 한다.
import { planetEntrySchema } from "@terra/content";
import { planetInputFromDefinition, validatePlanetInput } from "@terra/planet/generator";
import {
  PLANET_DRAFT_ENTRY_MAX_BYTES,
  type PlanetDraftRejectCode,
  planetDraftEntryBytes,
} from "@terra/shared";
import type { JsonObject, PlanetEditorDefinitions } from "./types.ts";

/** 검사에 쓰는 팩 정보(정의 조회 자료에서 만든다) */
export interface DraftPackContext {
  readonly planetIds: ReadonlySet<string>;
  readonly biomeIds: ReadonlySet<string>;
  /** 원본 바이옴 항목(생성기 입력을 만든다) */
  readonly biomes: readonly unknown[];
}

export function draftPackContext(definitions: PlanetEditorDefinitions): DraftPackContext {
  const biomeIds = new Set<string>();
  for (const biome of definitions.biomes) if (typeof biome.id === "string") biomeIds.add(biome.id);
  return {
    planetIds: new Set(definitions.planets.map((planet) => planet.id)),
    biomeIds,
    biomes: definitions.biomes,
  };
}

export type DraftEntryCheck =
  | { readonly ok: true; readonly entry: JsonObject }
  | { readonly ok: false; readonly code: PlanetDraftRejectCode };

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * DB(jsonb)에 담을 수 있는 글자인지: U+0000과 짝 없는 대리 문자(UTF-16)는 PostgreSQL jsonb가 받지 않는다
 * (Verified: PostgreSQL 16 "unsupported Unicode escape sequence", "Unicode low surrogate must follow a high surrogate").
 * 그대로 두면 저장이 DB 오류(500)가 되므로 항목 모양 문제(invalid_entry)로 먼저 막는다
 */
export function isStorableText(text: string): boolean {
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code === 0) return false;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

/** JSON 값 안의 모든 문자열(객체 키 포함)이 담을 수 있는 글자인지 */
function isStorableJson(value: unknown): boolean {
  if (typeof value === "string") return isStorableText(value);
  if (Array.isArray(value)) {
    const items: readonly unknown[] = value;
    return items.every(isStorableJson);
  }
  if (isJsonObject(value)) {
    return Object.entries(value).every(([key, item]) => isStorableText(key) && isStorableJson(item));
  }
  return true;
}

/**
 * 직렬화 크기가 상한을 넘는지. 직렬화하지 못하면(본문 상한 1MiB 안에서 아주 깊게 겹친 배열 등 — JSON.stringify는 재귀라
 * 호출 스택이 넘친다) 넘는 것으로 본다: 그런 항목은 상한 안에 들 수 없다
 */
function isTooLarge(entry: unknown): boolean {
  try {
    return planetDraftEntryBytes(entry) > PLANET_DRAFT_ENTRY_MAX_BYTES;
  } catch {
    return true;
  }
}

/** 초안 항목 하나를 검사한다. planetId = 요청한 행성(초안 열쇠). 항목의 id가 다르면 invalid_entry */
export function checkDraftEntry(entry: unknown, planetId: string, pack: DraftPackContext): DraftEntryCheck {
  if (isTooLarge(entry)) return { ok: false, code: "entry_too_large" };
  if (!isJsonObject(entry) || !isStorableJson(entry)) return { ok: false, code: "invalid_entry" };
  const parsed = planetEntrySchema.safeParse(entry);
  if (!parsed.success || parsed.data.id !== planetId) return { ok: false, code: "invalid_entry" };
  if (!parsed.data.biomes.every((ref) => pack.biomeIds.has(ref.id)))
    return { ok: false, code: "unknown_biome" };
  if (!pack.planetIds.has(parsed.data.id)) return { ok: false, code: "unknown_planet" };
  try {
    validatePlanetInput(planetInputFromDefinition(entry, pack.biomes));
  } catch {
    return { ok: false, code: "generator_rejected" };
  }
  return { ok: true, entry };
}
