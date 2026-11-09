// 기준 유닛 고르기 시험(docs/adr/2026-11-08-seamless-second-map.md WP-1)
import { describe, expect, it } from "vitest";
import {
  type AnchorInput,
  blockedWithoutUnits,
  bottomSheetOf,
  chooseAnchor,
  commandUnit,
} from "./anchorUnit.ts";

const base: AnchorInput = {
  operator: false,
  freeView: false,
  selected: null,
  selectedFollowable: false,
  lastPicked: null,
  units: [{ unitId: 7 }, { unitId: 3 }, { unitId: 9 }],
  cyborgUnitId: 3,
};

describe("기준 유닛 고르기", () => {
  it("아무것도 고르지 않았으면 이 맵의 내 사이보그", () => {
    expect(chooseAnchor(base)).toBe(3);
  });

  it("사이보그가 이 맵에 없으면 목록 첫 유닛", () => {
    expect(chooseAnchor({ ...base, cyborgUnitId: null })).toBe(7);
    expect(chooseAnchor({ ...base, cyborgUnitId: 42 })).toBe(7);
  });

  it("목록을 받기 전이면 사이보그(엔진이 받으면 붙는다)", () => {
    expect(chooseAnchor({ ...base, units: null })).toBe(3);
    expect(chooseAnchor({ ...base, units: null, cyborgUnitId: null })).toBeNull();
  });

  it("다룰 수 있는 유닛을 고르면 그 유닛", () => {
    expect(chooseAnchor({ ...base, selected: 9, selectedFollowable: true })).toBe(9);
  });

  it("남의 유닛을 고르면 앞의 기준(마지막으로 고른 내 유닛)", () => {
    expect(chooseAnchor({ ...base, selected: 500, lastPicked: 9 })).toBe(9);
    expect(chooseAnchor({ ...base, selected: 500 })).toBe(3);
  });

  it("마지막으로 고른 유닛이 이 맵을 떠났으면 사이보그로", () => {
    expect(chooseAnchor({ ...base, lastPicked: 77 })).toBe(3);
  });

  it("운영자 자유 시점이면 없음, 자유 시점이 아니면 목록 밖 유닛도", () => {
    expect(
      chooseAnchor({ ...base, operator: true, freeView: true, selected: 9, selectedFollowable: true }),
    ).toBeNull();
    expect(chooseAnchor({ ...base, operator: true, lastPicked: 500 })).toBe(500);
    // 자유 시점은 운영자만: 플레이어에게 켜져 있어도 무시
    expect(chooseAnchor({ ...base, freeView: true })).toBe(3);
  });
});

describe("내 유닛 없는 2차맵", () => {
  it("플레이어는 목록을 받은 뒤 비었으면 막는다", () => {
    expect(blockedWithoutUnits({ operator: false, units: [] })).toBe(true);
    expect(blockedWithoutUnits({ operator: false, units: null })).toBe(false);
    expect(blockedWithoutUnits({ operator: false, units: [1] })).toBe(false);
    expect(blockedWithoutUnits({ operator: true, units: [] })).toBe(false);
  });
});

describe("명령을 받을 유닛(사용자 지적 2026-11-09 문제3)", () => {
  it("고른 유닛을 다룰 수 있으면 그 유닛 — 안내 줄과 건물 판이 같은 유닛", () => {
    expect(commandUnit({ shown: 9, shownCommandable: true, anchor: 9, cyborgUnitId: 3 })).toBe(9);
    // 운영자 자유 시점: 기준 유닛은 없지만 고른 유닛을 그대로 쓴다(옛: 사이보그로 갔다)
    expect(commandUnit({ shown: 500, shownCommandable: true, anchor: null, cyborgUnitId: 3 })).toBe(500);
  });

  it("남의 유닛을 살펴보는 중이면 기준 유닛, 그것도 없으면 내 사이보그", () => {
    expect(commandUnit({ shown: 500, shownCommandable: false, anchor: 9, cyborgUnitId: 3 })).toBe(9);
    expect(commandUnit({ shown: 500, shownCommandable: false, anchor: null, cyborgUnitId: 3 })).toBe(3);
    expect(
      commandUnit({ shown: null, shownCommandable: false, anchor: null, cyborgUnitId: null }),
    ).toBeNull();
  });
});

describe("아래 판 하나(사용자 지적 2026-11-09 문제4)", () => {
  it("누른 건물·오브젝트 판이 먼저, 그다음 내 유닛 목록, 아니면 근처 판", () => {
    expect(bottomSheetOf({ gatherOpen: true, unitsOpen: true })).toBe("gather");
    expect(bottomSheetOf({ gatherOpen: false, unitsOpen: true })).toBe("units");
    expect(bottomSheetOf({ gatherOpen: false, unitsOpen: false })).toBe("nearby");
  });
});
