import { describe, expect, it } from "vitest";
import {
  contentErrorOf,
  freeCopyId,
  mergeThreeWay,
  sameJson,
  stableJson,
  suggestId,
  valueAt,
  withValueAt,
} from "./contentEditorModel.ts";

describe("콘텐츠 편집기 공용 모델", () => {
  it("키 차례와 상관없이 같은 내용이면 같은 글", () => {
    expect(stableJson({ b: 1, a: { d: [2, { y: 1, x: 0 }], c: 3 } })).toBe(
      '{"a":{"c":3,"d":[2,{"x":0,"y":1}]},"b":1}',
    );
    expect(sameJson({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(sameJson([1, 2], [2, 1])).toBe(false);
  });

  it("3방향 합치기: 한쪽만 바꾼 칸은 그쪽 값, 다른 칸을 바꿨으면 둘 다 얹는다", () => {
    const base = { id: "sword", tier: 1, equip: { slot: "weapon", weapon: { hitPm: 900, range: 1 } } };
    const mine = { id: "sword", tier: 2, equip: { slot: "weapon", weapon: { hitPm: 900, range: 1 } } };
    const theirs = { id: "sword", tier: 1, equip: { slot: "weapon", weapon: { hitPm: 950, range: 1 } } };
    expect(mergeThreeWay(base, mine, theirs)).toEqual({
      merged: { id: "sword", tier: 2, equip: { slot: "weapon", weapon: { hitPm: 950, range: 1 } } },
      conflicts: [],
    });
    expect(mergeThreeWay(base, base, theirs).merged).toEqual(theirs);
    expect(mergeThreeWay(base, mine, base).merged).toEqual(mine);
  });

  it("3방향 합치기: 같은 칸을 양쪽이 다르게 바꾸면 내 값을 두고 점 경로를 알린다(배열은 통째)", () => {
    const base = { equip: { stats: [{ stat: "str", min: 1, max: 2 }], weapon: { hitPm: 900 } } };
    const mine = { equip: { stats: [{ stat: "str", min: 1, max: 5 }], weapon: { hitPm: 800 } } };
    const theirs = { equip: { stats: [{ stat: "dex", min: 1, max: 2 }], weapon: { hitPm: 950 } } };
    const result = mergeThreeWay(base, mine, theirs);
    expect(result.merged).toEqual(mine);
    expect(result.conflicts).toEqual(["equip.stats", "equip.weapon.hitPm"]);
    // 내가 칸을 빼고 저쪽은 그대로면 뺀 채로
    expect(mergeThreeWay({ a: 1, b: 2 }, { a: 1 }, { a: 1, b: 2 }).merged).toEqual({ a: 1 });
    // 지워진 항목(theirs null)과 내 초안은 통째 충돌
    expect(mergeThreeWay({ a: 1 }, { a: 2 }, null).conflicts).toEqual(["."]);
  });

  it("점 경로 읽기·쓰기(undefined면 칸을 뺀다, '.'은 통째)", () => {
    const value = { equip: { weapon: { hitPm: 900, range: 1 } } };
    expect(valueAt(value, "equip.weapon.hitPm")).toBe(900);
    expect(valueAt(value, "equip.none.x")).toBeUndefined();
    expect(withValueAt(value, "equip.weapon.hitPm", 950)).toEqual({
      equip: { weapon: { hitPm: 950, range: 1 } },
    });
    expect(withValueAt(value, "equip.weapon.range", undefined)).toEqual({
      equip: { weapon: { hitPm: 900 } },
    });
    expect(withValueAt(value, ".", { id: "x" })).toEqual({ id: "x" });
    expect(value.equip.weapon.hitPm).toBe(900);
  });

  it("ID 제안과 복제 ID는 쓸 수 없는 ID(있는 항목 + 은퇴 ID)를 피한다", () => {
    const taken = new Set(["iron_sword", "iron_sword_2", "iron_sword_copy"]);
    expect(suggestId("Iron Sword!", taken)).toBe("iron_sword_3");
    expect(suggestId("9 lives", new Set())).toBe("x_9_lives");
    expect(suggestId("한글", new Set())).toBe("");
    expect(freeCopyId("iron_sword", taken)).toBe("iron_sword_copy2");
  });

  it("오류 코드: 까닭은 reasons 가운데, 판 충돌·속도 제한·세션 끝·연결 실패", () => {
    const reasons = ["invalid_entry", "entry_changed"] as const;
    expect(
      contentErrorOf(
        { data: { code: "BAD_REQUEST", reason: "entry_changed", details: ["items/a", 3] } },
        reasons,
      ),
    ).toEqual({
      key: "entry_changed",
      details: ["items/a"],
      sessionEnded: false,
    });
    expect(contentErrorOf({ data: { code: "CONFLICT", reason: "revision_conflict" } }, reasons).key).toBe(
      "revision_conflict",
    );
    expect(contentErrorOf({ data: { code: "UNAUTHORIZED" } }, reasons)).toMatchObject({
      key: "unauthorized",
      sessionEnded: true,
    });
    expect(contentErrorOf({ data: { code: "BAD_REQUEST", reason: "other" } }, reasons).key).toBe("unknown");
    expect(contentErrorOf(new Error("fetch failed"), reasons).key).toBe("network");
  });
});
