// 도시 건물 배치 계획 시험 — 가짜 땅(256칸, 막힌 띠, 원자재 무리)으로 결정성·겹(행정 건물 가운데 → 숙소 → 창고 → 채집소)·옮김 거리·
// 출퇴근 길·갇힘 없음·땅 조건을 본다. 값은 형식 확인용이다.
import { describe, expect, it } from "vitest";
import {
  CITY_LAYOUT_DEFAULTS,
  type LayoutGround,
  type LayoutItem,
  type LayoutObject,
  type LayoutRect,
  LAYOUT_MARGIN,
  grow,
  overlaps,
  planCityLayout,
  rectCenter,
  splitByAngle,
} from "./cityLayout.ts";
import { layoutMetrics } from "./cityLayoutMetrics.ts";

const SIZE = 256;
const CENTER = { x: 128, y: 128 };

/** 가짜 땅: blocked(x, y)인 칸은 막힘, 놓은 건물은 막힘 */
function fakeGround(options: {
  readonly blocked?: (x: number, y: number) => boolean;
  readonly objects?: readonly LayoutObject[];
  readonly owns?: (x: number, y: number) => boolean;
  readonly fits?: ((facility: string, x: number, y: number) => boolean) | undefined;
}): LayoutGround & { readonly placedRects: LayoutRect[] } {
  const placedRects: LayoutRect[] = [];
  const free = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < SIZE && y < SIZE && !(options.blocked?.(x, y) ?? false);
  return {
    placedRects,
    objects: options.objects ?? [],
    canPlace(rect) {
      for (let y = rect.y; y < rect.y + rect.height; y++)
        for (let x = rect.x; x < rect.x + rect.width; x++) if (!free(x, y)) return false;
      return !placedRects.some((other) => overlaps(rect, other));
    },
    place(rect) {
      placedRects.push(rect);
    },
    owns: options.owns ?? (() => true),
    fits: options.fits,
  };
}

/** (cx, cy) 둘레 반경 r 안에 간격 step으로 오브젝트 무리 */
function cluster(kind: number, cx: number, cy: number, r = 6, step = 4): LayoutObject[] {
  const out: LayoutObject[] = [];
  for (let y = cy - r; y <= cy + r; y += step)
    for (let x = cx - r; x <= cx + r; x += step) out.push({ x, y, kind });
  return out;
}

const item = (facility: string, role: LayoutItem["role"], size: number, kinds?: number[]): LayoutItem => ({
  facility,
  role,
  width: size,
  height: size,
  objectKinds: kinds,
});

/** 시작 도시 한 벌: 행정 건물·창고 2·숙소 2·벌목장 2(종류 0)·광산 1(종류 1)·농장 1(종류 2)·공방 1 */
const ITEMS: LayoutItem[] = [
  item("government_hall", "core", 3),
  item("storehouse", "storage", 3),
  item("storehouse", "storage", 3),
  item("lodging", "living", 3),
  item("lodging", "living", 3),
  item("lumber_camp", "gather", 3, [0]),
  item("lumber_camp", "gather", 3, [0]),
  item("mine", "gather", 3, [1]),
  item("farm", "gather", 4, [2]),
  item("workshop", "other", 2),
];

/** 숲 무리 둘(동·북), 바위 무리(남서), 밭 무리(서) */
const OBJECTS: LayoutObject[] = [
  ...cluster(0, 160, 128),
  ...cluster(0, 128, 96),
  ...cluster(1, 104, 152),
  ...cluster(2, 96, 128),
];

function plan(seed: number, ground = fakeGround({ objects: OBJECTS })) {
  return planCityLayout({
    center: CENTER,
    items: ITEMS,
    existing: [],
    ground,
    rules: CITY_LAYOUT_DEFAULTS,
    seed,
    size: SIZE,
  });
}

const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});
/** 시험 땅의 세로 막힌 띠(x 140~146) */
const blocked = (x: number) => x >= 140 && x <= 146;

describe("도시 건물 배치 계획", () => {
  it("같은 시드면 같은 배치, 다른 시드면 다른 모양(흔들기)", () => {
    expect(plan(7).placed).toEqual(plan(7).placed);
    const seven = plan(7).placed.map((building) => `${building.x},${building.y}`);
    const eight = plan(8).placed.map((building) => `${building.x},${building.y}`);
    expect(seven).not.toEqual(eight);
  });

  it("행정 건물은 도시 칸 가운데, 광장(둘레 길 포함)에는 다른 건물이 없고 모두 놓인다", () => {
    const result = plan(3);
    expect(result.missing).toEqual([]);
    expect(result.placed).toHaveLength(ITEMS.length);
    expect(result.hall).toEqual({ x: 127, y: 127, width: 3, height: 3 });
    const plaza = grow(result.hall, CITY_LAYOUT_DEFAULTS.plazaCells + LAYOUT_MARGIN);
    for (const building of result.placed)
      if (building.role !== "core") expect(overlaps(building, plaza)).toBe(false);
    // 건물 사이는 늘 둘레 길만큼 빈다
    for (const a of result.placed)
      for (const b of result.placed) if (a !== b) expect(overlaps(grow(a, LAYOUT_MARGIN), b)).toBe(false);
  });

  it("겹: 숙소 < 창고 < 채집소(행정 건물에서 거리), 채집소는 띠 안·맡는 원자재 곁, 같은 종류는 다른 무리", () => {
    const result = plan(11);
    const hall = rectCenter(result.hall);
    const of = (role: string) => result.placed.filter((b) => b.role === role).map(rectCenter);
    const stations = of("gather");
    for (const at of stations) {
      const r = d(at, hall);
      expect(r).toBeGreaterThanOrEqual(CITY_LAYOUT_DEFAULTS.gatherMinCells - 1);
      expect(r).toBeLessThanOrEqual(CITY_LAYOUT_DEFAULTS.gatherMaxCells + 1);
    }
    const maxLodge = Math.max(...of("living").map((at) => d(at, hall)));
    const minStore = Math.min(...of("storage").map((at) => d(at, hall)));
    const minStation = Math.min(...stations.map((at) => d(at, hall)));
    expect(maxLodge).toBeLessThan(minStore);
    expect(minStore).toBeLessThan(minStation);
    // 채집소마다 맡는 원자재가 reach 안에
    for (const building of result.placed.filter((b) => b.role === "gather")) {
      const kind = ITEMS.find((entry) => entry.facility === building.facility)?.objectKinds?.[0];
      const near = OBJECTS.filter(
        (o) => o.kind === kind && d(o, rectCenter(building)) <= CITY_LAYOUT_DEFAULTS.gatherReachCells,
      );
      expect(near.length).toBeGreaterThan(0);
    }
    // 벌목장 둘은 다른 숲 무리(동 160,128 · 북 128,96)
    const camps = result.placed.filter((b) => b.facility === "lumber_camp").map(rectCenter);
    const east = camps.filter((at) => d(at, { x: 160, y: 128 }) < d(at, { x: 128, y: 96 }));
    expect(east).toHaveLength(1);
  });

  it("옮김 거리·출퇴근: 창고는 행정 건물보다 채집소에 가깝고, 숙소는 일터와 가운데 사이(돌아감 1.3배 안), 갇힌 건물 없음", () => {
    const result = plan(5);
    const metrics = layoutMetrics({
      center: CENTER,
      buildings: result.placed,
      plazaCells: CITY_LAYOUT_DEFAULTS.plazaCells,
      size: SIZE,
    });
    expect(metrics.hallOffset).toBe(0);
    expect(metrics.haul).not.toBeNull();
    expect(metrics.hallToStation).not.toBeNull();
    expect(metrics.haul ?? 99).toBeLessThan(metrics.hallToStation ?? 0);
    expect(metrics.commutePm ?? 9999).toBeLessThanOrEqual(1300);
    expect(metrics.walledIn).toBe(0);
    expect(metrics.sectors).toBeGreaterThanOrEqual(5);
  });

  it("땅 조건: 막힌 칸·오브젝트 칸을 덮지 않고, 이 도시 자리만, 물가 조건을 지킨다", () => {
    // 가운데 오른쪽 세로 막힌 띠(x 140~146), 도시 자리는 y < 200, 농장은 x < 128에만
    const ground = fakeGround({
      blocked,
      objects: OBJECTS,
      owns: (_x, y) => y < 200,
      fits: (facility, x) => facility !== "farm" || x < 128,
    });
    const result = plan(9, ground);
    for (const building of result.placed) {
      for (let y = building.y; y < building.y + building.height; y++)
        for (let x = building.x; x < building.x + building.width; x++) {
          expect(blocked(x)).toBe(false);
          expect(OBJECTS.some((o) => o.x === x && o.y === y)).toBe(false);
        }
      expect(rectCenter(building).y).toBeLessThan(200);
      if (building.facility === "farm") expect(building.x).toBeLessThan(128);
    }
  });

  it("오브젝트가 없으면 채집소는 띠 위에 방향을 흩고, 이미 선 건물(옛 세계)은 옮기지 않고 피한다", () => {
    const existing = [
      { facility: "government_hall", role: "core" as const, x: 100, y: 100, width: 3, height: 3 },
    ];
    const ground = fakeGround({});
    ground.place(existing[0] ?? { x: 0, y: 0, width: 1, height: 1 });
    const result = planCityLayout({
      center: CENTER,
      items: ITEMS.filter((entry) => entry.role !== "core"),
      existing,
      ground,
      rules: CITY_LAYOUT_DEFAULTS,
      seed: 1,
      size: SIZE,
    });
    expect(result.hall).toMatchObject({ x: 100, y: 100 });
    expect(result.missing).toEqual([]);
    const stations = result.placed.filter((b) => b.role === "gather").map(rectCenter);
    expect(stations).toHaveLength(4);
    // 창고 둘 = 채집 구역 둘: 구역(채집소 2곳씩)은 행정 건물의 서로 다른 쪽(구역 가운데 각도 차 > 90°)에 모인다
    const hall = { x: 101, y: 101 };
    const angle = (at: { x: number; y: number }) => Math.atan2(at.y - hall.y, at.x - hall.x);
    const [s0, s1, s2, s3] = stations;
    if (!s0 || !s1 || !s2 || !s3) throw new Error("stations");
    // 구역은 차례로 돌아가며 받는다(0·2 → 구역 0, 1·3 → 구역 1)
    const diff = Math.abs(angle(mid(s0, s2)) - angle(mid(s1, s3)));
    expect(Math.min(diff, 2 * Math.PI - diff)).toBeGreaterThan(Math.PI / 2);
    expect(d(s0, s2)).toBeLessThan(d(s0, s1));
  });

  it("도시 칸 둘레가 막혀도(호수) 넓혀 찾아 행정 건물을 세우고 나머지도 그 둘레에 놓는다", () => {
    const lake = (x: number, y: number) => (x - 128) * (x - 128) + (y - 128) * (y - 128) < 20 * 20;
    const result = plan(4, fakeGround({ blocked: lake, objects: OBJECTS }));
    expect(result.missing).toEqual([]);
    expect(result.placed).toHaveLength(ITEMS.length);
    expect(d(rectCenter(result.hall), CENTER)).toBeGreaterThanOrEqual(20);
    for (const building of result.placed) expect(lake(building.x, building.y)).toBe(false);
  });

  it("각도 묶음: 가장 큰 빈 각도에서 끊어 고르게 나눈다", () => {
    const points = [
      { x: 10, y: 0 },
      { x: 10, y: 2 },
      { x: -10, y: 0 },
      { x: -10, y: 1 },
    ];
    const groups = splitByAngle({ x: 0, y: 0 }, points, 2).map((g) => g.toSorted((a, b) => a - b));
    expect(groups.toSorted((a, b) => (a[0] ?? 0) - (b[0] ?? 0))).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(splitByAngle({ x: 0, y: 0 }, points, 9)).toHaveLength(4);
    expect(splitByAngle({ x: 0, y: 0 }, [], 2)).toEqual([]);
  });
});
