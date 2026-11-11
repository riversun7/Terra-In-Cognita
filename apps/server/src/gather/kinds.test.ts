// 원자재 오브젝트 종류(팩 → 서버 모양) 시험 — docs/adr/2026-11-11-city-catchment.md: 여섯 채집 시설이 모두 땅에 묶인 자리를 맡는다
import { GATHER_PLOT_SURFACES } from "@terra/content";
import { loadContentPack } from "@terra/content/node";
import { TERRAIN_SURFACE } from "@terra/protocol";
import { CATCHMENT_MATERIALS, MATERIAL_FACILITY } from "@terra/shared/catchment";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { gatherKindsFromPack, plotSurfaceCode } from "./kinds.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.pack) throw new Error("content pack");
const kinds = gatherKindsFromPack(loaded.pack);

describe("원자재 오브젝트 종류", () => {
  it("팩 지표 이름 차례 = 지형 칸 지표 번호(@terra/protocol TERRAIN_SURFACE)", () => {
    expect(GATHER_PLOT_SURFACES.map(plotSurfaceCode)).toEqual(GATHER_PLOT_SURFACES.map((_, index) => index));
    expect(Object.keys(TERRAIN_SURFACE)).toHaveLength(GATHER_PLOT_SURFACES.length);
  });

  it("여섯 채집 시설(1차 생산 여섯 가지)마다 그 시설이 맡는 오브젝트 종류가 있다", () => {
    for (const material of CATCHMENT_MATERIALS)
      expect(kinds.some((kind) => kind.facility === MATERIAL_FACILITY[material])).toBe(true);
  });

  it("밭·목초지·물터는 plot, 직접 캐지 못함, 밭·목초지는 기후(원자재) 조건", () => {
    const byId = new Map(kinds.map((kind) => [kind.id, kind]));
    expect(byId.get("crop_field")).toMatchObject({
      source: "plot",
      facility: "farm",
      material: "crop",
      direct: false,
    });
    expect(byId.get("pasture")).toMatchObject({ source: "plot", facility: "ranch", material: "livestock" });
    expect(byId.get("fishing_water")).toMatchObject({
      source: "plot",
      facility: "fishing_spot",
      material: null,
      surfaces: [TERRAIN_SURFACE.water, TERRAIN_SURFACE.shallowWater],
    });
    // 나무·바위·광맥·약초 덤불은 그대로 직접 캔다
    expect(kinds.filter((kind) => kind.source !== "plot").every((kind) => kind.direct)).toBe(true);
  });
});
