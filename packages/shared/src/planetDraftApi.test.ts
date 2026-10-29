// 행성 초안 API 약속 시험 — UTF-8 바이트 세기, 항목 크기, 받지 않음 코드
import { describe, expect, it } from "vitest";
import {
  PLANET_DRAFT_ENTRY_MAX_BYTES,
  PLANET_DRAFT_REJECT_CODES,
  isPlanetDraftRejectCode,
  planetDraftEntryBytes,
  utf8ByteLength,
} from "./planetDraftApi.ts";

describe("행성 초안 API 약속", () => {
  it("UTF-8 바이트: 1·2·3·4바이트 문자, 짝 없는 대리 문자는 3바이트", () => {
    expect(utf8ByteLength("a")).toBe(1);
    expect(utf8ByteLength("é")).toBe(2);
    expect(utf8ByteLength("가")).toBe(3);
    expect(utf8ByteLength("😀")).toBe(4);
    expect(utf8ByteLength("\ud800")).toBe(3);
    expect(utf8ByteLength("\udc00a")).toBe(4);
    expect(utf8ByteLength("")).toBe(0);
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
