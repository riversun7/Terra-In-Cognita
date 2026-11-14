import { describe, expect, it } from "vitest";
import { type GearCyborg, type GearUnits, gearSources } from "./unitGear.ts";

const names = { stats: {}, items: {}, skills: {}, facilities: {}, planets: {} };
const unit = (id: string, name: string, preview = false): GearUnits["units"][number] => ({
  id,
  name,
  type: "human",
  preview,
  slots: [],
});

describe("gearSources", () => {
  it("사이보그 줄을 앞에(본체 칸·이름), 세계 유닛은 이름 차례, 시안·같은 ID는 뺀다", () => {
    const units: GearUnits = {
      units: [unit("w9", "Zed"), unit("w5", "Amy"), unit("p1", "Pre", true), unit("w3", "Dup")],
      names,
    };
    const cyborg: GearCyborg = { name: "Cy", names, body: { slots: [{ slot: "head" }, { slot: "core" }] } };
    const list = gearSources(units, cyborg, 3);
    expect(list.map((source) => [source.unitId, source.label, source.cyborg])).toEqual([
      [3, "Cy", true],
      [5, "Amy", false],
      [9, "Zed", false],
    ]);
    expect(list[0]?.layout).toEqual(["head", "core"]);
  });

  it("사이보그 본체·유닛 ID가 없으면 세계 유닛만", () => {
    const units: GearUnits = { units: [unit("w5", "Amy")], names };
    const cyborg: GearCyborg = { name: "Cy", names, body: null };
    expect(gearSources(units, cyborg, 3).map((source) => source.unitId)).toEqual([5]);
    expect(gearSources(units, null, null).map((source) => source.unitId)).toEqual([5]);
  });
});
