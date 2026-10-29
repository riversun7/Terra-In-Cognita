// 행성 초안 항목 검사 시험 — 받지 않음 코드와 그 차례(@terra/shared planetDraftApi.ts), 크기 상한, DB에 담을 수 없는 글자
import {
  PLANET_DRAFT_ENTRY_MAX_BYTES,
  PLANET_DRAFT_REJECT_CODES,
  type PlanetDraftRejectCode,
  planetDraftEntryBytes,
} from "@terra/shared";
import { describe, expect, it } from "vitest";
import {
  EDITOR_PLANET_ID,
  TEST_PLANET_ID,
  isJsonObject,
  loadPack,
  packEditorBuild,
  rawPlanet,
} from "./testSupport.ts";
import type { JsonObject } from "./types.ts";
import { checkDraftEntry, draftPackContext, isStorableText } from "./validate.ts";

const loaded = loadPack();
const pack = draftPackContext(packEditorBuild(loaded).definitions);
const valid = (): JsonObject => rawPlanet(loaded, EDITOR_PLANET_ID);

/** 편집 전용 행성의 프리셋(복사) */
function validPresets(): JsonObject {
  const { presets } = valid();
  if (!isJsonObject(presets)) throw new Error("presets");
  return presets;
}

/** 편집 전용 행성의 바이옴 ID 목록(복사) */
function validBiomes(): string[] {
  const { biomes } = valid();
  if (!Array.isArray(biomes)) throw new Error("biomes");
  const list: readonly unknown[] = biomes;
  return list.filter((id) => typeof id === "string");
}

/** JSON.parse가 만든 "__proto__" 자기 키(객체 리터럴로는 만들 수 없다) */
const protoEntry: unknown = JSON.parse('{"__proto__": {"x": 1}}');

/** 검사 결과 코드(통과면 null) */
function code(entry: unknown, planetId = EDITOR_PLANET_ID): PlanetDraftRejectCode | null {
  const result = checkDraftEntry(entry, planetId, pack);
  return result.ok ? null : result.code;
}

/** 직렬화 크기가 bytes가 되게 설명(ko)을 늘린 항목 */
function sized(bytes: number): JsonObject {
  const entry = valid();
  const description = { ko: "", en: "Placeholder data." };
  entry.description = description;
  description.ko = "a".repeat(bytes - planetDraftEntryBytes(entry));
  return entry;
}

describe("초안 항목 검사", () => {
  it("팩 행성 항목은 그대로 통과하고, 받은 JSON을 그대로 돌려준다", () => {
    for (const id of [EDITOR_PLANET_ID, TEST_PLANET_ID]) {
      const entry = rawPlanet(loaded, id);
      expect(checkDraftEntry(entry, id, pack)).toEqual({ ok: true, entry });
    }
    // 덮어쓰기·이모지 이름(4바이트 글자)도 된다
    expect(
      code({ ...valid(), name: { ko: "편집 😀", en: "Edit 😀" }, overrides: { landPercent: 40 } }),
    ).toBeNull();
  });

  it("크기 상한: 직렬화 8KiB까지 받고 넘으면 entry_too_large", () => {
    expect(planetDraftEntryBytes(sized(PLANET_DRAFT_ENTRY_MAX_BYTES))).toBe(PLANET_DRAFT_ENTRY_MAX_BYTES);
    expect(code(sized(PLANET_DRAFT_ENTRY_MAX_BYTES))).toBeNull();
    expect(code(sized(PLANET_DRAFT_ENTRY_MAX_BYTES + 1))).toBe("entry_too_large");
    // 직렬화하다 호출 스택이 넘치는 항목(아주 깊게 겹친 배열, JSON 본문으로는 1MiB 안에 든다)도 entry_too_large
    const deep: unknown = JSON.parse(`${"[".repeat(200_000)}${"]".repeat(200_000)}`);
    expect(() => planetDraftEntryBytes(deep)).toThrow(RangeError);
    expect(code({ ...valid(), description: deep })).toBe("entry_too_large");
    // 한국어는 글자당 3바이트로 센다(UTF-8)
    const korean = valid();
    korean.description = { ko: "가".repeat(2800), en: "x" };
    expect(code(korean)).toBe("entry_too_large");
  });

  it.each<[string, unknown]>([
    ["객체가 아님(null)", null],
    ["객체가 아님(배열)", []],
    ["객체가 아님(문자열)", "s2_editor_planet"],
    ["없음", undefined],
    ["모르는 필드", { ...valid(), extra: 1 }],
    ["필드 빠짐(seed)", { ...valid(), seed: undefined }],
    ["ID 형식", { ...valid(), id: "S2-Editor" }],
    ["면 레벨 범위(10)", { ...valid(), faceLevel: 10 }],
    ["시드 범위(u32 밖)", { ...valid(), seed: 2 ** 32 }],
    ["시드 정수 아님", { ...valid(), seed: 1.5 }],
    ["프리셋 단계 이름", { ...valid(), presets: { ...validPresets(), seaLevel: "huge" } }],
    ["덮어쓰기 범위", { ...valid(), overrides: { landPercent: 101 } }],
    ["모르는 덮어쓰기", { ...valid(), overrides: { gravity: 2 } }],
    ["극 기온 > 적도 기온", { ...valid(), overrides: { poleTemperatureC: 30, equatorTemperatureC: 10 } }],
    ["바이옴 두 번", { ...valid(), biomes: ["ocean_deep", "ocean_deep"] }],
    ["이름 영어 빠짐", { ...valid(), name: { ko: "행성" } }],
    ["__proto__ 키", protoEntry],
    ["NUL 글자", { ...valid(), name: { ko: "행성\u0000", en: "Planet" } }],
    ["짝 없는 대리 문자", { ...valid(), name: { ko: "행성", en: "Planet \ud800" } }],
  ])("%s → invalid_entry", (_name, entry) => {
    expect(code(entry)).toBe("invalid_entry");
  });

  it("요청한 행성과 항목 ID가 다르면 invalid_entry(다른 팩 행성 ID여도)", () => {
    expect(code(valid(), TEST_PLANET_ID)).toBe("invalid_entry");
    expect(code(rawPlanet(loaded, TEST_PLANET_ID), EDITOR_PLANET_ID)).toBe("invalid_entry");
  });

  it("팩에 없는 바이옴 → unknown_biome, 팩에 없는 행성 → unknown_planet, 생성기가 받지 않음 → generator_rejected", () => {
    expect(code({ ...valid(), biomes: [...validBiomes(), "lava_field"] })).toBe("unknown_biome");
    expect(code({ ...valid(), id: "s2_other_planet" }, "s2_other_planet")).toBe("unknown_planet");
    // 호수 규칙이 없는 바이옴 표(콘텐츠 형식은 맞다)
    expect(code({ ...valid(), biomes: ["ocean_deep", "tundra"] })).toBe("generator_rejected");
  });

  it("차례: 크기 → 모양 → 바이옴 → 행성 → 생성기 (앞의 것이 먼저 나온다)", () => {
    const unknownEverything = { ...valid(), id: "s2_other_planet", biomes: ["ocean_deep", "lava_field"] };
    // 크기가 넘으면 다른 문제가 있어도 entry_too_large
    const large = { ...unknownEverything, extra: "x".repeat(PLANET_DRAFT_ENTRY_MAX_BYTES) };
    expect(code(large, "s2_other_planet")).toBe("entry_too_large");
    // 모양이 틀리면(모르는 필드) 바이옴·행성보다 먼저
    expect(code({ ...unknownEverything, extra: 1 }, "s2_other_planet")).toBe("invalid_entry");
    // 바이옴이 행성보다 먼저
    expect(code(unknownEverything, "s2_other_planet")).toBe("unknown_biome");
    // 행성이 생성기보다 먼저(호수 없는 표 + 팩에 없는 행성)
    expect(
      code({ ...valid(), id: "s2_other_planet", biomes: ["ocean_deep", "tundra"] }, "s2_other_planet"),
    ).toBe("unknown_planet");
  });

  it("공용 약속의 받지 않음 코드를 모두 낸다", () => {
    const seen = new Set<string>();
    for (const [entry, planetId] of [
      [sized(PLANET_DRAFT_ENTRY_MAX_BYTES + 1), EDITOR_PLANET_ID],
      [null, EDITOR_PLANET_ID],
      [{ ...valid(), biomes: ["lava_field"] }, EDITOR_PLANET_ID],
      [{ ...valid(), id: "s2_other_planet" }, "s2_other_planet"],
      [{ ...valid(), biomes: ["ocean_deep", "tundra"] }, EDITOR_PLANET_ID],
    ] as const) {
      const found = code(entry, planetId);
      if (found) seen.add(found);
    }
    expect([...seen]).toEqual([...PLANET_DRAFT_REJECT_CODES]);
  });

  it("DB(jsonb)에 담을 수 있는 글자: NUL·짝 없는 대리 문자만 안 된다", () => {
    for (const text of ["", "a", "가", "😀", "😀b", "\n\t\u0001"])
      expect(isStorableText(text), text).toBe(true);
    for (const text of ["\u0000", "a\u0000", "\ud800", "\ud800a", "\udc00", "a\udc00\ud800"]) {
      expect(isStorableText(text), JSON.stringify(text)).toBe(false);
    }
  });
});
