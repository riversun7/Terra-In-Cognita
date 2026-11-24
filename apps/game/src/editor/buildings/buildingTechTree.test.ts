// 건물 테크트리 시각화 모델 시험 — 목적별 열 분류, 티어(위상 깊이) 계산, 명시적 실선·재료 추론 점선, 담은 변경 반영, 레벨 체인
import {
  type BuildingEditorFacility,
  type BuildingEditorItem,
  type BuildingEditorListResponse,
  type FacilityJson,
  OLD_FACILITY_BUILD_RULES,
} from "@terra/shared/buildingEditor";
import { describe, expect, it } from "vitest";
import { EMPTY_STAGE, stageFacility } from "./buildingModel.ts";
import {
  buildOrthogonalPath,
  buildSideExitPath,
  buildTechTree,
  formatStorageKg,
  matchesTechQuery,
  relatedNodesOf,
  techColumnOf,
} from "./buildingTechTree.ts";

const mkItem = (id: string, category: string, weight = 1000): BuildingEditorItem => ({
  id,
  name: { ko: id, en: id },
  category,
  tier: 0,
  subcategory: null,
  weight,
  lotSize: 1,
  enabled: true,
});

const mkFacility = (
  entry: FacilityJson,
  recipes: BuildingEditorFacility["recipes"] = [],
): BuildingEditorFacility => ({
  entry,
  origin: "pack",
  pack: entry,
  override: null,
  hash: "h".repeat(64),
  recipes,
});

function fixtureList(): BuildingEditorListResponse {
  const items: BuildingEditorItem[] = [
    mkItem("pine_log", "raw"),
    mkItem("stone", "raw"),
    mkItem("plank", "processed"),
    mkItem("brick", "processed"),
    mkItem("iron_ingot", "processed"),
  ];
  const facilities: BuildingEditorFacility[] = [
    mkFacility({
      id: "lumber_camp",
      name: { ko: "벌목장", en: "Lumber camp" },
      stage: "gather",
      category: "gathering",
      slotsPerLevel: 10,
      durability: 200,
      storageKg: 200,
      gather: { primary: "dex", secondary: "str", subcategory: "wood" },
      build: {
        mulPm: 1000,
        levels: [
          { from: 1, materials: [{ item: "pine_log", qty: 5 }] },
          { from: 2, materials: [{ item: "plank", qty: 5 }] },
        ],
      },
      footprint: { width: 3, height: 3 },
    }),
    mkFacility(
      {
        id: "sawmill",
        name: { ko: "제재소", en: "Sawmill" },
        stage: "process",
        category: "processing",
        slotsPerLevel: 10,
        durability: 200,
        build: {
          mulPm: 1000,
          levels: [
            { from: 1, materials: [{ item: "pine_log", qty: 8 }] },
            { from: 2, materials: [{ item: "plank", qty: 8 }] },
          ],
        },
        footprint: { width: 3, height: 3 },
      },
      [
        {
          id: "saw_planks",
          name: { ko: "판자 켜기", en: "Saw planks" },
          inputs: [{ item: "pine_log", qty: 3 }],
          outputs: [{ item: "plank", qty: 2 }],
          work: 500,
          enabled: true,
        },
      ],
    ),
    mkFacility({
      id: "workshop",
      name: { ko: "공방", en: "Workshop" },
      stage: "finish",
      category: "processing",
      slotsPerLevel: 10,
      durability: 250,
      build: {
        mulPm: 1000,
        levels: [
          { from: 1, materials: [{ item: "pine_log", qty: 10 }] },
          { from: 2, materials: [{ item: "plank", qty: 10 }] },
        ],
      },
      footprint: { width: 3, height: 3 },
    }),
    mkFacility({
      id: "government_hall",
      name: { ko: "행정 건물", en: "Government hall" },
      stage: "government",
      category: "administration",
      maxLevel: 3,
      slotsPerLevel: 0,
      durability: 1000,
      build: {
        mulPm: 1000,
        levels: [
          { from: 1, materials: [{ item: "pine_log", qty: 20 }] },
          { from: 2, materials: [{ item: "plank", qty: 20 }] },
        ],
      },
      footprint: { width: 4, height: 4 },
    }),
    mkFacility({
      id: "goods_exchange",
      name: { ko: "물자 거래소", en: "Goods exchange" },
      stage: "commerce",
      category: "commerce",
      maxLevel: 3,
      slotsPerLevel: 0,
      exchange: "goods",
      build: {
        mulPm: 1000,
        levels: [{ from: 1, materials: [{ item: "pine_log", qty: 10 }] }],
      },
      footprint: { width: 3, height: 3 },
    }),
    mkFacility({
      id: "warehouse",
      name: { ko: "중앙창고", en: "Warehouse" },
      stage: "storage",
      category: "storage",
      maxLevel: 5,
      slotsPerLevel: 0,
      storageKg: 100_000,
      build: {
        mulPm: 1000,
        levels: [
          { from: 1, materials: [{ item: "plank", qty: 20 }] },
          {
            from: 4,
            materials: [
              { item: "plank", qty: 16 },
              { item: "iron_ingot", qty: 4 },
            ],
          },
        ],
      },
      footprint: { width: 4, height: 4 },
    }),
    mkFacility({
      id: "custom_hall",
      name: { ko: "새 건물", en: "Custom hall" },
      stage: "living",
      category: "housing",
      maxLevel: 2,
      slotsPerLevel: 0,
      build: {
        mulPm: 1000,
        levels: [{ from: 1, materials: [{ item: "plank", qty: 10 }] }],
      },
      footprint: { width: 2, height: 2 },
    }),
  ];

  return {
    contentVersion: "core@152",
    revision: 1,
    facilities,
    gatherBands: [],
    items,
    subcategories: [{ id: "wood", name: { ko: "목재", en: "Wood" }, major: "raw", enabled: true }],
    weaponTypes: [],
    rules: OLD_FACILITY_BUILD_RULES,
    gatherLevelBonus: 10,
    sleeping: [],
  };
}

describe("목적별 열 분류(techColumnOf)", () => {
  it("processing 분류는 stage에 따라 가공(process)과 제조(manufacture) 열로 나눈다", () => {
    const list = fixtureList();
    expect(techColumnOf(list.facilities[0]!.entry)).toBe("gathering");
    expect(techColumnOf(list.facilities[1]!.entry)).toBe("process");
    expect(techColumnOf(list.facilities[2]!.entry)).toBe("manufacture");
    expect(techColumnOf(list.facilities[3]!.entry)).toBe("administration");
    expect(techColumnOf(list.facilities[4]!.entry)).toBe("commerce");
    expect(techColumnOf(list.facilities[5]!.entry)).toBe("storage");
  });
});

describe("테크트리 그래프 계산(buildTechTree)", () => {
  it("기초 자원 시설은 T0, 명시적 선행과 가공 재료 필요 시설은 아래 티어로 배치한다", () => {
    const graph = buildTechTree(fixtureList(), EMPTY_STAGE);
    expect(graph.byId.get("lumber_camp")?.tier).toBe(0);
    expect(graph.byId.get("government_hall")?.tier).toBe(0);
    expect(graph.byId.get("sawmill")?.tier).toBe(1);
    expect(graph.byId.get("goods_exchange")?.tier).toBe(1);
    expect(graph.byId.get("workshop")?.tier).toBe(2);
    // 중앙창고: Lv1에 plank 필요(sawmill T1 → T2), 정부 Lv2 선행
    expect(graph.byId.get("warehouse")?.tier).toBe(2);
    // 시안에 없는 새 건물도 Lv1에 plank가 필요하므로 sawmill(T1) 아래 T2 + 점선 연결선 생성
    expect(graph.byId.get("custom_hall")?.tier).toBe(2);
    expect(
      graph.edges.some(
        (edge) =>
          edge.kind === "material" &&
          edge.from === "sawmill" &&
          edge.to === "custom_hall" &&
          edge.items?.includes("plank"),
      ),
    ).toBe(true);
  });

  it("담은 변경(stage)으로 Lv1 재료를 가공품으로 바꾸면 테크트리 티어와 점선 연결선이 바로 바뀐다", () => {
    const list = fixtureList();
    const hall = list.facilities.find((row) => row.entry.id === "government_hall")!;
    const edited: FacilityJson = {
      ...hall.entry,
      build: {
        mulPm: 1000,
        levels: [{ from: 1, materials: [{ item: "plank", qty: 10 }] }],
      },
    };
    const staged = stageFacility(EMPTY_STAGE, "government_hall", {
      op: "put",
      entry: edited,
      base: hall.entry,
      baseHash: hall.hash,
    });
    const graph = buildTechTree(list, staged);
    // government_hall이 plank를 요구 → sawmill(T1) 아래 T2로 내려가고, goods_exchange도 T3으로 밀린다
    expect(graph.byId.get("government_hall")?.staged).toBe(true);
    expect(graph.byId.get("government_hall")?.tier).toBe(2);
    expect(graph.byId.get("goods_exchange")?.tier).toBe(3);
  });

  it("레벨 체인에 재료 구간 전환·수치 증분·창고 용량·채집 보너스가 정확히 담긴다", () => {
    const graph = buildTechTree(fixtureList(), EMPTY_STAGE);
    const lumber = graph.byId.get("lumber_camp")!;
    expect(lumber.levels).toHaveLength(5);
    expect(lumber.levels[0]).toMatchObject({
      level: 1,
      bandChanged: false,
      materialKind: "raw",
      slots: 10,
      slotsDelta: 10,
      durability: 200,
      storageKg: 200,
      gatherBonus: 0,
    });
    expect(lumber.levels[1]).toMatchObject({
      level: 2,
      bandChanged: true,
      materialKind: "processed",
      slots: 20,
      slotsDelta: 10,
      durability: 240,
      durabilityDelta: 40,
      storageKg: 240,
      storageDeltaKg: 40,
      gatherBonus: 10,
      gatherBonusDelta: 10,
    });

    const warehouse = graph.byId.get("warehouse")!;
    expect(warehouse.levels[0]?.storageKg).toBe(100_000);
    expect(warehouse.levels[3]?.bandChanged).toBe(true);
    expect(formatStorageKg(100_000)).toBe("100t");
    expect(formatStorageKg(1500)).toBe("1.5t");
    expect(formatStorageKg(300)).toBe("300kg");
  });

  it("순환 선행 조건이 있어도 무한 루프 없이 끝난다", () => {
    const graph = buildTechTree(fixtureList(), EMPTY_STAGE, {
      draft: {
        lumber_camp: { requires: [{ facilityId: "sawmill" }] },
        sawmill: { requires: [{ facilityId: "lumber_camp" }] },
      },
    });
    expect(graph.nodes.length).toBeGreaterThan(0);
  });
});

describe("연관 노드 탐색(relatedNodesOf)", () => {
  it("선택한 노드의 상위 선행과 하위 해금을 모두 찾고 점선 토글을 따른다", () => {
    const graph = buildTechTree(fixtureList(), EMPTY_STAGE);
    const withMat = relatedNodesOf("sawmill", graph.edges, true);
    expect([...withMat.upstream]).toEqual(["lumber_camp"]);
    expect(withMat.downstream.has("workshop")).toBe(true);
    expect(withMat.downstream.has("warehouse")).toBe(true);
    expect(withMat.downstream.has("custom_hall")).toBe(true);

    const explicitOnly = relatedNodesOf("sawmill", graph.edges, false);
    expect([...explicitOnly.upstream]).toEqual(["lumber_camp"]);
    expect(explicitOnly.downstream.has("workshop")).toBe(true);
    // custom_hall은 점선(재료)으로만 이어져 있으므로 끄면 빠진다
    expect(explicitOnly.downstream.has("custom_hall")).toBe(false);
  });
});

describe("직각 회로선·검색 도우미", () => {
  it("같은 열은 수직 직선, 다른 열은 둥근 모서리 직각(Q) 경로를 만든다", () => {
    expect(buildOrthogonalPath(100, 10, 100, 110, 60)).toBe("M 100.0 10.0 L 100.0 110.0");
    const elbow = buildOrthogonalPath(100, 10, 260, 150, 80, 10);
    expect(elbow).toContain("Q 100.0 80.0");
    expect(elbow).toContain("Q 260.0 80.0");
    const side = buildSideExitPath(200, 50, 340, 180, 24, 10);
    expect(side).toContain("Q 340.0 50.0");
  });

  it("검색어는 이름·ID·레벨 모듈·재료 이름까지 찾는다", () => {
    const list = fixtureList();
    const graph = buildTechTree(list, EMPTY_STAGE);
    const itemNames = new Map(list.items.map((item) => [item.id, item.name.ko]));
    const warehouse = graph.byId.get("warehouse")!;
    expect(matchesTechQuery(warehouse, "", itemNames, "ko")).toBe(true);
    expect(matchesTechQuery(warehouse, "중앙창고", itemNames, "ko")).toBe(true);
    expect(matchesTechQuery(warehouse, "철골", itemNames, "ko")).toBe(true);
    expect(matchesTechQuery(warehouse, "plank", itemNames, "ko")).toBe(true);
    expect(matchesTechQuery(warehouse, "없는이름", itemNames, "ko")).toBe(false);
  });
});
