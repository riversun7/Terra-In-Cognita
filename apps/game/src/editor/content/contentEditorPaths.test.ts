import { describe, expect, it } from "vitest";
import { canSetAt, getAt, joinPath, leafDiff, pathParts, setAt, underPath } from "./contentEditorPaths.ts";

describe("콘텐츠 편집기 칸 경로", () => {
  it("점·대괄호 경로를 마디로 나누고 다시 잇는다", () => {
    expect(pathParts("equip.stats[0].min")).toEqual(["equip", "stats", 0, "min"]);
    expect(pathParts("build.levels.1.from")).toEqual(["build", "levels", 1, "from"]);
    expect(pathParts("gradePm[3]")).toEqual(["gradePm", 3]);
    expect(pathParts("")).toEqual([]);
    expect(joinPath(["equip", "stats", 0, "min"])).toBe("equip.stats[0].min");
  });

  it("값 읽기: 객체·배열을 따라가고 없으면 undefined", () => {
    const value = { equip: { stats: [{ stat: "str", min: 1 }] }, name: { ko: "칼" } };
    expect(getAt(value, "equip.stats[0].min")).toBe(1);
    expect(getAt(value, "equip.stats[1].min")).toBeUndefined();
    expect(getAt(value, "name.en")).toBeUndefined();
    expect(getAt(value, "name.ko.x")).toBeUndefined();
  });

  it("값 넣기: 새 값을 돌려주고 원래 값은 그대로. undefined는 객체 칸을 뺀다. 부모가 없으면 그대로", () => {
    const value = { tier: 1, weight: 5, equip: { stats: [{ min: 1 }, { min: 2 }] } };
    const next = setAt(value, "equip.stats[1].min", 9);
    expect(next).toEqual({ tier: 1, weight: 5, equip: { stats: [{ min: 1 }, { min: 9 }] } });
    expect(value.equip.stats[1]?.min).toBe(2);
    expect(setAt(value, "weight", undefined)).toEqual({
      tier: 1,
      equip: { stats: [{ min: 1 }, { min: 2 }] },
    });
    expect(setAt(value, "perish.shelfLifeMs", 5)).toBe(value);
    expect(setAt(value, "equip.stats[5].min", 5)).toBe(value);
    expect(canSetAt(value, "equip.stats[1].min")).toBe(true);
    expect(canSetAt(value, "equip.stats[2]")).toBe(false);
    expect(canSetAt(value, "lotSize")).toBe(true);
  });

  it("끝 칸 차이: 객체는 키마다, 배열은 차례마다, 한쪽만 있는 묶음은 그 안의 칸 모두", () => {
    const pack = { tier: 1, name: { ko: "칼", en: "Sword" }, gradePm: [1000, 1100] };
    const draft = {
      tier: 2,
      name: { en: "Sword", ko: "칼" },
      gradePm: [1000, 1200, 1300],
      perish: { days: 1 },
    };
    expect(leafDiff(pack, draft)).toEqual(["gradePm[1]", "gradePm[2]", "perish.days", "tier"]);
    expect(leafDiff(pack, pack)).toEqual([]);
    expect(leafDiff(1, 2)).toEqual(["."]);
  });

  it("앞머리 안인가", () => {
    expect(underPath("equip.slot", "equip")).toBe(true);
    expect(underPath("equip[0]", "equip")).toBe(true);
    expect(underPath("equip", "equip")).toBe(true);
    expect(underPath("equipment", "equip")).toBe(false);
    expect(underPath("tier", "")).toBe(true);
  });
});
