// 2차맵 내 유닛 목록 도우미 시험(docs/adr/2026-11-07-unit-control.md) — 줄 이름·상태 한 마디(기본 언어 한국어), 고른 유닛 다룸(운영자·내 유닛·못 함·남의 유닛),
// 선택 안내 문장, 새 결과 코드 문구
import type { MapUnit } from "@terra/shared/mapUnits";
import { describe, expect, it } from "vitest";
import { resultText } from "./mapMessages.ts";
import { canCommand, selectionText, unitControlOf, unitName, unitStatusText } from "./mapUnits.ts";

function unit(overrides: Partial<MapUnit>): MapUnit {
  return {
    unitId: 7,
    kind: "human",
    name: null,
    cellX: 1,
    cellY: 2,
    moving: false,
    job: null,
    injury: 0,
    hold: null,
    ...overrides,
  };
}

describe("줄 이름·상태", () => {
  it("사이보그 본체는 이름 · 내 사이보그(이름을 모르면 내 사이보그), 그 밖은 종류 #번호", () => {
    expect(unitName(unit({ kind: "cyborg_body", name: "레온" }))).toBe("레온 · 내 사이보그");
    expect(unitName(unit({ kind: "cyborg_body" }))).toBe("내 사이보그");
    expect(unitName(unit({ kind: "human", unitId: 42 }))).toBe("휴먼 #42");
    expect(unitName(unit({ kind: "guardian", unitId: 3 }))).toBe("수호신 #3");
  });

  it("상태: 까닭 > 이동 중 > 부상 > 직무 > 대기", () => {
    expect(unitStatusText(unit({ hold: "guardian" }), true)).toBe("도시에 머묾");
    expect(unitStatusText(unit({ hold: "captive" }), false)).toBe("포로로 잡힘");
    expect(unitStatusText(unit({ injury: 2 }), true)).toBe("이동 중");
    expect(unitStatusText(unit({ injury: 2 }), false)).toBe("중상");
    expect(unitStatusText(unit({ job: { kind: "test_gather", phase: "rest" } }), false)).toBe(
      "채집 · 쉬는 중",
    );
    expect(unitStatusText(unit({}), false)).toBe("대기");
  });
});

describe("고른 유닛 다룸", () => {
  it("운영자 모드면 무엇이든, 아니면 내 유닛(목록 또는 시야 전송 표시)만, 까닭이 있으면 못 함", () => {
    expect(unitControlOf({ operator: true, mine: undefined, ownByFeed: false })).toEqual({
      kind: "operator",
    });
    expect(unitControlOf({ operator: true, mine: unit({ hold: "guardian" }), ownByFeed: true })).toEqual({
      kind: "operator",
    });
    expect(unitControlOf({ operator: false, mine: unit({}), ownByFeed: false })).toEqual({ kind: "own" });
    expect(unitControlOf({ operator: false, mine: undefined, ownByFeed: true })).toEqual({ kind: "own" });
    expect(unitControlOf({ operator: false, mine: unit({ hold: "critical" }), ownByFeed: true })).toEqual({
      kind: "hold",
      hold: "critical",
    });
    expect(unitControlOf({ operator: false, mine: undefined, ownByFeed: false })).toEqual({ kind: "other" });
    expect(canCommand({ kind: "operator" })).toBe(true);
    expect(canCommand({ kind: "own" })).toBe(true);
    expect(canCommand({ kind: "hold", hold: "captive" })).toBe(false);
    expect(canCommand({ kind: "other" })).toBe(false);
  });

  it("선택 안내: 남의 유닛은 정보만(움직임), 운영자는 표시, 수호신은 머문다", () => {
    expect(selectionText({ kind: "other" }, "", 9, true)).toBe(
      "다른 주인의 유닛 #9(이동 중)입니다. 정보만 볼 수 있습니다.",
    );
    expect(selectionText({ kind: "operator" }, "유닛 #9", 9, false)).toContain("운영자:");
    expect(selectionText({ kind: "own" }, "휴먼 #7", 7, false)).toBe(
      "휴먼 #7 선택됨. 땅을 누르면 그곳으로 보냅니다.",
    );
    expect(selectionText({ kind: "hold", hold: "guardian" }, "수호신 #3", 3, false)).toContain("머물러");
  });

  it("새 결과 코드(not_owner·unit_stays)도 문구가 있다", () => {
    expect(resultText("not_owner")).toBe("내 유닛이 아닙니다.");
    expect(resultText("unit_stays")).toContain("수호신");
  });
});
