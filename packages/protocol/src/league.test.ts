// 가문 연맹 메시지(기획 D-587 4·5·6, 질문 2502·2503) 스키마 시험 — 판, 왕복, 가문 열쇠 꼴
import { describe, expect, it } from "vitest";
import {
  HOUSE_LEAGUE_PROTOCOL_VERSION,
  HOUSE_LEAGUE_RESULT_CODES,
  MIN_SUPPORTED_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  ProtocolError,
  decodeClientMessage,
  decodeServerMessage,
  encodeMessage,
} from "./index.ts";

function decodes(decode: (text: string) => unknown, message: unknown): boolean {
  try {
    decode(JSON.stringify(message));
    return true;
  } catch (error) {
    if (error instanceof ProtocolError) return false;
    throw error;
  }
}

describe("가문 연맹 메시지", () => {
  it("판: 프로토콜 64(묶음 1117d, 줄기 판 103) — 지금 판 안, 받는 가장 낮은 판 = 지금 − 1", () => {
    expect(HOUSE_LEAGUE_PROTOCOL_VERSION).toBe(64);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(HOUSE_LEAGUE_PROTOCOL_VERSION);
    expect(MIN_SUPPORTED_PROTOCOL_VERSION).toBe(PROTOCOL_VERSION - 1);
  });

  it("왕복: 만들기·투표, 결과 성공·실패", () => {
    const found = { t: "house_league" as const, id: 1, action: "found" as const };
    expect(decodeClientMessage(encodeMessage(found))).toEqual(found);
    const vote = { t: "house_league" as const, id: 2, action: "vote" as const, leagueId: 5, house: "n:12" };
    expect(decodeClientMessage(encodeMessage(vote))).toEqual(vote);
    const ok = { t: "house_league_result" as const, id: 1, ok: true as const, leagueId: 5 };
    expect(decodeServerMessage(encodeMessage(ok))).toEqual(ok);
    for (const code of HOUSE_LEAGUE_RESULT_CODES) {
      expect(decodes(decodeServerMessage, { t: "house_league_result", id: 2, ok: false, code })).toBe(true);
    }
  });

  it("가문 열쇠 꼴이 틀리면 받지 않는다", () => {
    for (const house of ["x:1", "p:0", "n:", "p:01"]) {
      expect(
        decodes(decodeClientMessage, { t: "house_league", id: 3, action: "delegate", leagueId: 1, house }),
      ).toBe(false);
    }
  });
});
