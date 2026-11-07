// 2차맵 내 유닛 목록 도우미 시험(docs/adr/2026-11-07-unit-control.md) — 줄 이름·상태 한 마디(기본 언어 한국어), 고른 유닛 다룸(운영자·내 유닛·못 함·남의 유닛),
// 선택 안내 문장, 새 결과 코드 문구. 바뀜(기획 답 630~637): 목록 차례(637 나 — 유닛 화면 규칙), 남의 유닛 세력·종류(636 나), 다른 곳 수(632 다)
import type { MapUnit } from "@terra/shared/mapUnits";
import { describe, expect, it } from "vitest";
import { resultText } from "./mapMessages.ts";
import {
  canCommand,
  elsewhereText,
  selectionText,
  sortMapUnits,
  unitControlOf,
  unitName,
  unitStatusText,
} from "./mapUnits.ts";

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
    // 부상 이름은 부상 4단계(D-521) 단계 색: 2 = 노랑
    expect(unitStatusText(unit({ injury: 2 }), false)).toBe("노랑 부상");
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

  it("636 나: 시야 안 남의 유닛은 세력·종류까지(무소속·세력 이름 없음·남의 사이보그 본체)", () => {
    const faction = {
      id: 4,
      code: "npc_nation_01",
      kind: "npc" as const,
      name: { ko: "가 나라", en: "Nation A" },
    };
    expect(selectionText({ kind: "other" }, "", 9, false, { unitId: 9, kind: "human", faction })).toBe(
      "가 나라의 휴먼 #9(서 있음)입니다. 정보만 볼 수 있습니다.",
    );
    expect(
      selectionText({ kind: "other" }, "", 9, true, {
        unitId: 9,
        kind: "cyborg_body",
        faction: { ...faction, name: null, code: null },
      }),
    ).toBe("세력 #4의 사이보그 본체 #9(이동 중)입니다. 정보만 볼 수 있습니다.");
    expect(selectionText({ kind: "other" }, "", 9, false, { unitId: 9, kind: "human", faction: null })).toBe(
      "무소속 휴먼 #9(서 있음)입니다. 정보만 볼 수 있습니다.",
    );
  });

  it("637 나: 사이보그 본체 먼저, 그다음 유닛 화면처럼 손이 필요한 순(포로 → 부상 무거운 순 → 대기 → 쉼 → 일함), 같으면 이름·번호", () => {
    const sorted = sortMapUnits([
      unit({ unitId: 30, job: { kind: "test_gather", phase: "work" } }),
      unit({ unitId: 11 }),
      unit({ unitId: 5, kind: "guardian" }),
      unit({ unitId: 20, job: { kind: "test_gather", phase: "rest" } }),
      unit({ unitId: 2, injury: 1 }),
      unit({ unitId: 3, injury: 3, hold: "critical" }),
      unit({ unitId: 40, hold: "captive" }),
      unit({ unitId: 99, kind: "cyborg_body", name: "레온" }),
      unit({ unitId: 9 }),
    ]);
    expect(sorted.map((row) => row.unitId)).toEqual([99, 40, 3, 2, 5, 9, 11, 20, 30]);
  });

  it("632 다: 다른 곳 내 유닛 수 한 줄(0이면 없음)", () => {
    expect(elsewhereText(0)).toBeNull();
    expect(elsewhereText(3)).toBe("다른 곳에 내 유닛 3 — 유닛 화면에서 보기");
  });

  it("새 결과 코드(not_owner·unit_stays)도 문구가 있다", () => {
    expect(resultText("not_owner")).toBe("내 유닛이 아닙니다.");
    expect(resultText("unit_stays")).toContain("수호신");
  });
});
