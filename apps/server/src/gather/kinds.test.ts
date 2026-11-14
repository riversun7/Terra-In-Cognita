// 원자재 오브젝트 종류(팩 → 서버 모양) 시험 — docs/adr/2026-11-11-city-catchment.md: 여섯 채집 시설이 모두 땅에 묶인 자리를 맡는다
import { GATHER_PLOT_SURFACES } from "@terra/content";
import { loadContentPack } from "@terra/content/node";
import { TERRAIN_SURFACE } from "@terra/protocol";
import { mapPropArtCode } from "@terra/shared";
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

  it("노두(질문 1083 나): 돌·구리 노두는 outcrop, 광산이 맡고 직접 캔다, 기기 그림 번호가 있고 앞 종류 차례는 그대로(끝에 더함)", () => {
    const byId = new Map(kinds.map((kind) => [kind.id, kind]));
    expect(byId.get("stone_outcrop")).toMatchObject({
      source: "outcrop",
      item: "stone",
      facility: "mine",
      direct: true,
      art: mapPropArtCode("outcrop_stone"),
    });
    expect(byId.get("copper_outcrop")).toMatchObject({
      source: "outcrop",
      item: "copper_ore",
      facility: "mine",
      art: mapPropArtCode("outcrop_copper"),
    });
    expect(byId.get("stone_outcrop")?.surfaces).toContain(TERRAIN_SURFACE.grass);
    // 노두는 지형별 오브젝트(2026-11-12 D-536) 앞이고, 관목 땔감(목재 몫 노두)은 그 뒤 맨 끝이다: 앞 종류 차례는 그대로
    const ids = kinds.map((kind) => kind.id);
    expect(ids.indexOf("copper_outcrop")).toBe(ids.indexOf("stone_outcrop") + 1);
    // 그 뒤에 자연 채집물 소품 자리 여덟(기획 D-540 1224 가 — 장식 소품 그림에 서는 prop 종류)
    const wild = [
      "ice_chunk_water",
      "salt_deposit",
      "vine_fiber",
      "peat_cut",
      "berry_patch",
      "fruit_pick",
      "shell_pick",
      "fossil_dig",
    ];
    expect(ids.slice(-wild.length)).toEqual(wild);
    expect(ids.at(-wild.length - 1)).toBe("brushwood");
    expect(kinds.slice(-wild.length).every((kind) => kind.source === "prop" && kind.facility === null)).toBe(
      true,
    );
    expect(
      kinds
        .slice(ids.indexOf("copper_outcrop") + 1, -wild.length - 1)
        .every((kind) => kind.source === "site" || kind.source === "school"),
    ).toBe(true);
    // 바다 오브젝트(기획 D-540 1222): 어군 넷은 낚시 사다리 굴림, 고래 무리는 고래 고기·기름 굴림표, 난파선은 굴림표
    for (const id of ["school_lake", "school_coastal", "school_shelf", "school_deep"])
      expect(byId.get(id)).toMatchObject({ ladder: true, facility: "fishing_spot" });
    expect(byId.get("whale_pod")).toMatchObject({
      item: "whale_meat",
      table: [
        { item: "whale_meat", weightPm: 700 },
        { item: "whale_oil", weightPm: 300 },
      ],
    });
    expect(byId.get("shipwreck")?.table?.map((row) => row.item)).toContain("copper_ingot");
    expect(byId.get("hydro_vent")?.table).toBeUndefined();
    // 관목 땔감(사용자 결정 2026-11-12 기본 재료 바닥 보장): 목재 몫을 곱하는 노두, 벌목장이 맡고 소나무 원목
    expect(byId.get("brushwood")).toMatchObject({
      source: "outcrop",
      share: "wood",
      item: "pine_log",
      facility: "lumber_camp",
      direct: true,
      art: mapPropArtCode("log"),
    });
    expect(byId.get("stone_outcrop")?.share).toBe("ore");
    expect(
      kinds
        .filter((kind) => kind.source === "prop" || kind.source === "rock" || kind.source === "plot")
        .every((kind) => kind.art === 0),
    ).toBe(true);
  });

  it("지형별 오브젝트(D-536): site·school은 그림·바이옴 표가 있고, 물 위 자리·낚는 거리 0 어군은 배로만", () => {
    const byId = new Map(kinds.map((kind) => [kind.id, kind]));
    expect(byId.get("tide_rock")).toMatchObject({
      source: "site",
      item: "stone",
      coast: true,
      shore: 1,
      boat: false,
    });
    expect(byId.get("tide_rock")?.biomes?.get("ocean_coastal")).toBe(120);
    expect(byId.get("shipwreck")).toMatchObject({ source: "site", boat: true });
    expect(byId.get("school_coastal")).toMatchObject({
      source: "school",
      reach: 6,
      boat: false,
      facility: "fishing_spot",
    });
    expect(byId.get("school_deep")).toMatchObject({ source: "school", reach: 0, boat: true });
    for (const kind of kinds.filter((entry) => entry.source === "site" || entry.source === "school"))
      expect(kind.art).toBeGreaterThan(0);
  });
});
