// 행성 초안 API 약속 시험 — 항목 크기, 받지 않음 코드. UTF-8 바이트 세기는 utf8.test.ts
import { describe, expect, it } from "vitest";
import {
  PLANET_DRAFT_ENTRY_MAX_BYTES,
  PLANET_DRAFT_REJECT_CODES,
  isPlanetDraftRejectCode,
  planetDraftEntryBytes,
  utf8ByteLength,
} from "./planetDraftApi.ts";
import { utf8ByteLength as utf8ByteLengthFromUtf8 } from "./utf8.ts";

describe("행성 초안 API 약속", () => {
  it("utf8ByteLength는 utf8.ts의 것을 그대로 다시 내보낸다(전에 이 파일에서 가져가던 코드용)", () => {
    expect(utf8ByteLength).toBe(utf8ByteLengthFromUtf8);
  });

  it("항목 크기 = 들여쓰기 없는 JSON의 UTF-8 바이트, 상한 8KiB", () => {
    expect(planetDraftEntryBytes({ id: "가" })).toBe('{"id":""}'.length + 3);
    expect(PLANET_DRAFT_ENTRY_MAX_BYTES).toBe(8192);
  });

  it("받지 않음 코드", () => {
    for (const code of PLANET_DRAFT_REJECT_CODES) expect(isPlanetDraftRejectCode(code)).toBe(true);
    expect(isPlanetDraftRejectCode("too_large")).toBe(false);
    expect(isPlanetDraftRejectCode(3)).toBe(false);
  });
});
