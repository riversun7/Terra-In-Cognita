// 도시 건물 배치 계획(전략 배치) — docs/adr/2026-11-11-city-building-layout.md, 사용자 요청(2026-11-11, 원문) "건물들도 바둑판 배열이 아닌
// 전략적으로 배치하도록하자. 정부건물은 파괴시 함락되니 중앙에 두고 주변 건물이 시간을 벌수있게, 숙소는 노동자 회복 루트, 창고와
// 원자재채집소와의 관계도 고려".
// 2차맵 배치 칸에서 도시 하나의 건물 자리를 정하는 순수 함수다(2차맵·DB를 모른다 — 땅은 LayoutGround로 받는다). NPC 시작 도시 씨앗
// (npcSeed.ts), 이미 선 NPC 건물 다시 놓기(cityRelayout.ts), 운영자 화면 미리 보기(cityLayoutView.ts)가 같은 함수를 부른다.
// 겹(가운데에서 바깥으로):
//   0. 행정 건물 = 도시 칸 가운데(못 놓으면 가장 가까운 자리). 둘레 plazaCells칸은 광장으로 비운다(경비대·사이보그·지도자가 선다).
//   1. 채집소(겉 겹): 가운데에서 gatherMin~gatherMax칸 띠 안, 그 시설이 맡는 원자재 오브젝트가 reach칸 안에 많은 곳. 같은 종류 채집소끼리
//      같은 오브젝트를 덜 나누게(이미 맡은 오브젝트는 낮게 센다 — 같은 칸을 다투는 규칙, docs/adr/2026-11-11-city-catchment.md).
//   2. 창고: 채집소를 방향(각도)으로 창고 수만큼 묶고, 묶음 방향의 가운데→채집소 길 위 storeRoutePm 지점(채집소 쪽 — 옮김 거리를 줄인다).
//   3. 숙소: 같은 방식으로 숙소 수만큼 묶고, 길 위 lodgeRoutePm 지점(가운데 쪽 — 일꾼이 일터와 가운데 사이에서 쉰다).
//   4. 나머지(가공·기타): 행정 건물에서 innerCells칸 고리 위, 이미 선 건물 사이 가장 큰 빈 각도의 가운데(둘레를 고르게 덮는다).
//   그래서 바깥에서 행정 건물로 오는 길에 채집소 → 창고 → 숙소 차례로 건물이 선다(시간을 번다). 건물 사이는 늘 margin칸 비워(길) 자기
//   유닛이 지나간다(완전히 막지 않는다 — 시험 cityLayout.test.ts가 본다).
// 땅을 본다: 놓을 수 있는 칸(물·막힌 지형·다른 건물 — 격자 검사), 이 도시 자리(가장 가까운 도시), 물가 조건, 오브젝트 칸을 덮지 않음,
// 지형 비용이 싼 칸을 고른다. 같은 입력·시드면 늘 같은 결과(결정적: 시드 난수·@terra/shared det 함수·정수 반올림).
import { createRng, detAtan2, detCos, detSin } from "@terra/shared";

/** 건물 몫 */
export type LayoutRole = "core" | "gather" | "storage" | "living" | "other";

export interface LayoutRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 놓을 건물 하나 */
export interface LayoutItem {
  readonly facility: string;
  readonly role: LayoutRole;
  readonly width: number;
  readonly height: number;
  /** 채집소: 맡는 오브젝트 종류(오브젝트 kind 번호들). 없거나 비면 방향만 흩는다 */
  readonly objectKinds?: readonly number[] | undefined;
  /** 부르는 쪽 표시(다시 놓기 = 건물 ID). 계획 결과에 그대로 실린다 */
  readonly key?: number | undefined;
}

/** 이미 선 이 도시 건물(옮기지 않는다 — 묶음·빈 각도 셈에만 쓴다) */
export interface LayoutExisting extends LayoutRect {
  readonly facility: string;
  readonly role: LayoutRole;
}

export interface LayoutObject {
  readonly x: number;
  readonly y: number;
  readonly kind: number;
}

/** 땅(2차맵 몫). 계획하는 동안 놓은 자리는 place로 알린다(다음 검사가 본다) */
export interface LayoutGround {
  /** 이 직사각형(둘레 길 포함)을 놓을 수 있나 — 지형·건물·범위 */
  canPlace(rect: LayoutRect): boolean;
  /** 계획한 건물을 땅에 적는다(가상) */
  place(rect: LayoutRect): void;
  /** 이 칸이 이 도시 자리인가(가장 가까운 도시) */
  owns(x: number, y: number): boolean;
  /** 시설 조건(물가 등)이 맞나. 없으면 늘 맞다 */
  readonly fits?: ((facility: string, x: number, y: number) => boolean) | undefined;
  /** 건물 칸(둘레 길 빼고)에 지금 유닛이 서 있나. 없으면 늘 false */
  readonly occupied?: ((rect: LayoutRect) => boolean) | undefined;
  /** 배치 칸 지형 비용(천분율, 0 = 막힘). 없으면 모두 1000 */
  readonly costAt?: ((x: number, y: number) => number) | undefined;
  readonly objects: readonly LayoutObject[];
}

/** 설정 칸(세계 씨앗 계수표 city_layout_*, [임시]) */
export interface CityLayoutRules {
  readonly plazaCells: number;
  readonly innerCells: number;
  readonly gatherMinCells: number;
  readonly gatherMaxCells: number;
  readonly gatherReachCells: number;
  readonly storeRoutePm: number;
  readonly lodgeRoutePm: number;
  readonly jitterCells: number;
}

/** 출발값(설정 칸 출발값과 같다) */
export const CITY_LAYOUT_DEFAULTS: CityLayoutRules = {
  plazaCells: 3,
  innerCells: 9,
  gatherMinCells: 20,
  gatherMaxCells: 42,
  gatherReachCells: 14,
  storeRoutePm: 750,
  lodgeRoutePm: 350,
  jitterCells: 2,
};

/** 건물 사이에 비우는 칸(길) — 옛 씨앗 SEED_MARGIN과 같다 */
export const LAYOUT_MARGIN = 2;
/** 목표 칸 둘레에서 자리를 찾는 반경(칸) */
export const LAYOUT_SPOT_SEARCH = 12;
/** 채집소 후보 격자 간격(칸) */
const GATHER_LATTICE = 2;
/** 이미 맡은 오브젝트의 점수(‰, 안 맡은 것 = 1000) */
const CLAIMED_WEIGHT = 250;
/** 채집소 후보: 띠 안쪽 끝에서 한 칸 멀어질 때마다 빼는 점수 */
const GATHER_FAR_PENALTY = 15;
/**
 * 채집 구역 가운데 후보: 이미 고른 구역 가운데와 각도가 벌어질수록 더하는 점수(라디안당, 반 바퀴까지). 오브젝트 하나 = 1000점.
 * 구역이 둘 이상이면 행정 건물의 다른 쪽에 서서 겹(창고·숙소)이 여러 쪽을 막는다
 */
const DISTRICT_SPREAD_PER_RAD = 3000;
/** 채집소 후보: 자기 구역 가운데에서 한 칸 멀어질 때마다 빼는 점수(채집소가 구역에 모여 창고 하나가 맡는다) */
const DISTRICT_PULL = 150;
/** 채집소 후보: 위에서부터 이만큼 자리 찾기를 해 본다 */
const GATHER_TRIES = 12;
/** 황금각(라디안) — 오브젝트가 없을 때 채집소 방향을 흩는다 */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export interface PlannedBuilding extends LayoutRect {
  readonly facility: string;
  readonly role: LayoutRole;
  /** 창고·숙소: 맡은 채집소 묶음 번호(없으면 undefined) */
  readonly group?: number | undefined;
  /** 그 건물 항목의 key */
  readonly key?: number | undefined;
}

export interface CityLayoutPlan {
  /** 놓을 차례(앞에서부터 놓는다) */
  readonly placed: readonly PlannedBuilding[];
  /** 자리를 못 찾은 것 */
  readonly missing: readonly LayoutItem[];
  /** 행정 건물 자리(이미 선 것이나 계획한 것. 없으면 도시 칸 1×1) */
  readonly hall: LayoutRect;
}

export interface CityLayoutInput {
  /** 도시 칸(가운데) */
  readonly center: { readonly x: number; readonly y: number };
  readonly items: readonly LayoutItem[];
  readonly existing: readonly LayoutExisting[];
  readonly ground: LayoutGround;
  readonly rules: CityLayoutRules;
  /** 도시마다 다른 시드(같은 도시는 늘 같은 배치, 도시마다 다른 모양) */
  readonly seed: number;
  /** 배치 칸 한 변 */
  readonly size: number;
}

/** 직사각형 가운데 칸 */
export function rectCenter(rect: LayoutRect): { x: number; y: number } {
  return { x: rect.x + (rect.width >> 1), y: rect.y + (rect.height >> 1) };
}

/** 직사각형을 사방 n칸 넓힌다 */
export function grow(rect: LayoutRect, n: number): LayoutRect {
  return { x: rect.x - n, y: rect.y - n, width: rect.width + 2 * n, height: rect.height + 2 * n };
}

/** 두 직사각형이 겹치나 */
export function overlaps(a: LayoutRect, b: LayoutRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

const dist2 = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

/** 각도(라디안, −π ~ π)를 0 ~ 2π로 */
const wrap = (angle: number) => (angle < 0 ? angle + 2 * Math.PI : angle);

/** 행정 건물 가운데에서 본 각도(0 ~ 2π) */
function angleOf(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return wrap(detAtan2(to.y - from.y, to.x - from.x));
}

/**
 * 점들을 각도 차례로 k개 묶음으로 나눈다: 가장 큰 빈 각도에서 끊어 한 줄로 편 뒤 앞에서부터 고르게 자른다. 묶음마다 점 차례 번호들.
 * 점이 k보다 적으면 묶음 수 = 점 수(빈 묶음 없음)
 */
export function splitByAngle(
  origin: { x: number; y: number },
  points: readonly { x: number; y: number }[],
  k: number,
): number[][] {
  if (points.length === 0 || k <= 0) return [];
  const sorted = points
    .map((point, index) => ({ index, angle: angleOf(origin, point) }))
    .toSorted((a, b) => a.angle - b.angle || a.index - b.index);
  let cut = 0;
  let widest = -1;
  for (let i = 0; i < sorted.length; i++) {
    const here = sorted[i]?.angle ?? 0;
    const next = i + 1 < sorted.length ? (sorted[i + 1]?.angle ?? 0) : (sorted[0]?.angle ?? 0) + 2 * Math.PI;
    if (next - here > widest) {
      widest = next - here;
      cut = (i + 1) % sorted.length;
    }
  }
  const line = [...sorted.slice(cut), ...sorted.slice(0, cut)];
  const groups = Math.min(k, line.length);
  const out: number[][] = [];
  for (let g = 0; g < groups; g++) {
    const from = Math.floor((g * line.length) / groups);
    const to = Math.floor(((g + 1) * line.length) / groups);
    out.push(line.slice(from, to).map((entry) => entry.index));
  }
  return out;
}

/** 묶음 점들의 평균 방향(단위 벡터)과 평균 거리. 점이 가운데와 같으면 undefined */
function meanRay(
  origin: { x: number; y: number },
  points: readonly { x: number; y: number }[],
): { dx: number; dy: number; distance: number } | undefined {
  let sx = 0;
  let sy = 0;
  let total = 0;
  for (const point of points) {
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length === 0) continue;
    sx += dx / length;
    sy += dy / length;
    total += length;
  }
  const norm = Math.sqrt(sx * sx + sy * sy);
  if (norm === 0 || points.length === 0) return undefined;
  return { dx: sx / norm, dy: sy / norm, distance: total / points.length };
}

/** angle과 angles 가운데 가장 가까운 것의 각도 차(라디안, 0 ~ π). 비면 0 */
function angularGap(angles: readonly number[], angle: number): number {
  let gap = angles.length === 0 ? 0 : Math.PI;
  for (const other of angles) {
    const diff = Math.abs(angle - other);
    gap = Math.min(gap, diff > Math.PI ? 2 * Math.PI - diff : diff);
  }
  return gap;
}

/** 정수 칸으로 반올림(−0 없이) */
const cell = (value: number) => Math.round(value) + 0;

/** 도시 건물 배치 계획(위 머리 주석) */
export function planCityLayout(input: CityLayoutInput): CityLayoutPlan {
  const { ground, rules, size, center } = input;
  const rng = createRng(input.seed);
  const placed: PlannedBuilding[] = [];
  const missing: LayoutItem[] = [];
  const objectCells = new Set(ground.objects.map((object) => object.y * size + object.x));
  const jitter = () =>
    rules.jitterCells > 0 ? rng.nextInt(2 * rules.jitterCells + 1) - rules.jitterCells : 0;

  const existingCore = input.existing.find((building) => building.role === "core");
  let hall: LayoutRect = existingCore ?? { x: center.x, y: center.y, width: 1, height: 1 };
  let plaza = grow(hall, rules.plazaCells);

  /** 둘레 길 포함 직사각형이 범위 안인가 */
  const inside = (rect: LayoutRect) =>
    rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= size && rect.y + rect.height <= size;

  /** 자리 하나가 맞나(겹 조건 band = 행정 건물 가운데에서 거리 제곱 범위) */
  const valid = (
    item: LayoutItem,
    rect: LayoutRect,
    band: { readonly min2: number; readonly max2: number } | undefined,
  ): boolean => {
    const margin = grow(rect, LAYOUT_MARGIN);
    if (!inside(margin)) return false;
    if (item.role !== "core" && overlaps(margin, plaza)) return false;
    const middle = rectCenter(rect);
    if (band) {
      const d2 = dist2(middle, rectCenter(hall));
      if (d2 < band.min2 || d2 > band.max2) return false;
    }
    if (!ground.owns(middle.x, middle.y)) return false;
    for (let yy = rect.y; yy < rect.y + rect.height; yy++)
      for (let xx = rect.x; xx < rect.x + rect.width; xx++) if (objectCells.has(yy * size + xx)) return false;
    if (!ground.canPlace(margin) || ground.occupied?.(rect) === true) return false;
    return !ground.fits || ground.fits(item.facility, rect.x, rect.y);
  };

  /** 그 자리 지형 비용 벌점(평균 비용이 1000을 넘는 만큼 — 거친 땅을 피한다) */
  const roughness = (rect: LayoutRect): number => {
    if (!ground.costAt) return 0;
    let sum = 0;
    for (let yy = rect.y; yy < rect.y + rect.height; yy++)
      for (let xx = rect.x; xx < rect.x + rect.width; xx++) sum += ground.costAt(xx, yy);
    return Math.max(0, Math.trunc(sum / (rect.width * rect.height)) - 1000);
  };

  /** 목표 칸 둘레에서 가장 가까운 맞는 자리(가까운 고리부터, 고리 안에서는 거리² × 4 + 거친 땅 벌점이 작은 것) */
  const spotNear = (
    item: LayoutItem,
    target: { x: number; y: number },
    band?: { readonly min2: number; readonly max2: number },
    search = LAYOUT_SPOT_SEARCH,
  ): LayoutRect | undefined => {
    for (let r = 0; r <= search; r++) {
      let best: { rect: LayoutRect; score: number } | undefined;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const rect = {
            x: target.x + dx - (item.width >> 1),
            y: target.y + dy - (item.height >> 1),
            width: item.width,
            height: item.height,
          };
          if (!valid(item, rect, band)) continue;
          const score = (dx * dx + dy * dy) * 4 + roughness(rect);
          if (!best || score < best.score) best = { rect, score };
        }
      if (best) return best.rect;
    }
    return undefined;
  };

  /** 띠 안 격자 칸을 aim에서 가까운 차례로 훑어 첫 맞는 자리 */
  const scanBand = (
    item: LayoutItem,
    aim: { x: number; y: number },
    within: { readonly min2: number; readonly max2: number },
  ): LayoutRect | undefined => {
    const max = Math.ceil(Math.sqrt(within.max2));
    const hallMiddle = rectCenter(hall);
    const cells: { x: number; y: number; d: number }[] = [];
    for (let dy = -max; dy <= max; dy += GATHER_LATTICE)
      for (let dx = -max; dx <= max; dx += GATHER_LATTICE) {
        const d2 = dx * dx + dy * dy;
        if (d2 < within.min2 || d2 > within.max2) continue;
        const at = { x: hallMiddle.x + dx, y: hallMiddle.y + dy };
        cells.push({ ...at, d: dist2(at, aim) });
      }
    cells.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
    for (const at of cells) {
      const rect = spotNear(item, at, within, 1);
      if (rect) return rect;
    }
    return undefined;
  };

  const commit = (item: LayoutItem, rect: LayoutRect, group?: number) => {
    ground.place(rect);
    placed.push({ ...rect, facility: item.facility, role: item.role, group, key: item.key });
  };

  // 0. 행정 건물: 도시 칸 가운데
  for (const item of input.items.filter((entry) => entry.role === "core")) {
    if (existingCore || placed.some((building) => building.role === "core")) {
      missing.push(item);
      continue;
    }
    const rect = spotNear(item, center);
    if (!rect) {
      missing.push(item);
      continue;
    }
    commit(item, rect);
    hall = rect;
    plaza = grow(hall, rules.plazaCells);
  }
  const hallCenter = rectCenter(hall);

  // 1. 채집소(겉 겹)
  const band = {
    min2: rules.gatherMinCells * rules.gatherMinCells,
    max2: rules.gatherMaxCells * rules.gatherMaxCells,
  };
  const reach2 = rules.gatherReachCells * rules.gatherReachCells;
  const far = rules.gatherMaxCells + rules.gatherReachCells;
  const far2 = far * far;
  const claimed = new Set<number>();
  const baseAngle = (rng.nextInt(3600) * Math.PI) / 1800;
  const gatherItems = input.items.filter((entry) => entry.role === "gather");
  const storageItems = input.items.filter((entry) => entry.role === "storage");

  /** 띠 안 격자 칸마다 점수를 매겨 높은 차례(점수 0 이하는 뺀다). 같은 점수는 시드 굴림 */
  const rankBand = (score: (at: { x: number; y: number }, d2: number) => number) => {
    const out: { x: number; y: number; score: number }[] = [];
    for (let dy = -rules.gatherMaxCells; dy <= rules.gatherMaxCells; dy += GATHER_LATTICE)
      for (let dx = -rules.gatherMaxCells; dx <= rules.gatherMaxCells; dx += GATHER_LATTICE) {
        const d2 = dx * dx + dy * dy;
        if (d2 < band.min2 || d2 > band.max2) continue;
        const at = { x: hallCenter.x + dx, y: hallCenter.y + dy };
        if (at.x < 0 || at.y < 0 || at.x >= size || at.y >= size || !ground.owns(at.x, at.y)) continue;
        const value = score(at, d2);
        if (value > 0) out.push({ ...at, score: value * 64 + rng.nextInt(64) });
      }
    return out.toSorted((a, b) => b.score - a.score || a.y - b.y || a.x - b.x);
  };

  // 1a. 채집 구역: 창고 수만큼(적어도 하나, 채집소 수까지). 구역 가운데 = 띠 안에서 채집소들이 맡는 원자재가 많은 곳, 구역끼리 각도를 벌린다.
  //     채집소는 자기 구역 가운데 가까이 모여(창고 하나가 그 구역을 맡는다 — 옮김 거리), 구역마다 창고·숙소가 행정 건물로 가는 길을 막는다
  const allKinds = new Set(gatherItems.flatMap((entry) => entry.objectKinds ?? []));
  const near = ground.objects
    .map((object, index) => ({ object, index }))
    .filter(({ object }) => dist2(object, hallCenter) <= far2);
  const districtCount = Math.max(1, Math.min(gatherItems.length, storageItems.length));
  const anchors: { x: number; y: number }[] = [];
  for (let d = 0; d < (gatherItems.length > 0 ? districtCount : 0); d++) {
    const taken = anchors.map((at) => angleOf(hallCenter, at));
    const best = rankBand((at, d2) => {
      let score = 0;
      for (const { object } of near)
        if (allKinds.has(object.kind) && dist2(object, at) <= reach2) score += 1000;
      if (score === 0) return 0;
      score -= GATHER_FAR_PENALTY * Math.max(0, Math.round(Math.sqrt(d2)) - rules.gatherMinCells);
      return score + Math.round(DISTRICT_SPREAD_PER_RAD * angularGap(taken, angleOf(hallCenter, at)));
    })[0];
    if (best) anchors.push({ x: best.x, y: best.y });
    else {
      // 원자재가 없으면 띠 가운데 반경에서 황금각으로 흩은 방향
      const radius = (rules.gatherMinCells + rules.gatherMaxCells) >> 1;
      const angle = baseAngle + GOLDEN_ANGLE * d;
      anchors.push({
        x: hallCenter.x + cell(detCos(angle) * radius),
        y: hallCenter.y + cell(detSin(angle) * radius),
      });
    }
  }

  // 1b. 채집소: 구역을 돌아가며(같은 종류가 다른 구역으로 가 같은 칸을 덜 다툰다), 맡는 원자재가 reach 안에 많고 구역 가운데에 가까운 곳
  const districtOf = new Map<LayoutRect, number>();
  gatherItems.forEach((item, order) => {
    const district = order % Math.max(1, anchors.length);
    const anchor = anchors[district] ?? hallCenter;
    const kinds = new Set(item.objectKinds ?? []);
    const mine = near.filter(({ object }) => kinds.has(object.kind));
    let rect: LayoutRect | undefined;
    if (mine.length > 0) {
      const ranked = rankBand((at, d2) => {
        let score = 0;
        for (const { object, index } of mine)
          if (dist2(object, at) <= reach2) score += claimed.has(index) ? CLAIMED_WEIGHT : 1000;
        if (score === 0) return 0;
        score -= GATHER_FAR_PENALTY * Math.max(0, Math.round(Math.sqrt(d2)) - rules.gatherMinCells);
        return score - DISTRICT_PULL * Math.round(Math.sqrt(dist2(at, anchor)));
      });
      for (const candidate of ranked.slice(0, GATHER_TRIES)) {
        rect = spotNear(item, candidate, band, 4);
        if (rect) break;
      }
    }
    if (!rect) {
      // 원자재가 없거나 그 둘레에 못 놓으면: 구역 가운데 둘레, 그래도 없으면(물가 조건 등) 띠 전체를 그쪽에서 가까운 차례로
      const aim = { x: anchor.x + jitter(), y: anchor.y + jitter() };
      rect = spotNear(item, aim, band) ?? scanBand(item, aim, band);
    }
    if (!rect) {
      missing.push(item);
      return;
    }
    commit(item, rect);
    const last = placed.at(-1);
    if (last) districtOf.set(last, district);
    const middle = rectCenter(rect);
    for (const { object, index } of mine) if (dist2(object, middle) <= reach2) claimed.add(index);
  });

  // 2·3. 창고·숙소: 행정 건물 → 채집소 묶음 길 위. 창고 묶음 = 채집 구역(이미 선 채집소는 가장 가까운 구역 가운데로), 숙소 묶음 = 각도로 나눔
  const allStations = [
    ...input.existing.filter((building) => building.role === "gather"),
    ...placed.filter((building) => building.role === "gather"),
  ];
  const stations = allStations.map(rectCenter);
  const storageGroups: number[][] =
    anchors.length === 0
      ? splitByAngle(hallCenter, stations, storageItems.length)
      : anchors.map((_, district) =>
          allStations.flatMap((building, index) => {
            const own = districtOf.get(building);
            const nearestAnchor =
              own ??
              anchors
                .map((at, k) => ({ k, d: dist2(at, rectCenter(building)) }))
                .toSorted((a, b) => a.d - b.d || a.k - b.k)[0]?.k;
            return nearestAnchor === district ? [index] : [];
          }),
        );
  const onRoute = (role: LayoutRole, routePm: number, groups: readonly number[][]) => {
    const items = input.items.filter((entry) => entry.role === role);
    items.forEach((item, index) => {
      const members = groups[index];
      const ray =
        members && members.length > 0
          ? meanRay(
              hallCenter,
              members.map((at) => stations[at] ?? hallCenter),
            )
          : undefined;
      if (!ray) {
        fillGap(item);
        return;
      }
      const reach = Math.max(rules.plazaCells + 2, (ray.distance * routePm) / 1000);
      const target = {
        x: hallCenter.x + cell(ray.dx * reach) + jitter(),
        y: hallCenter.y + cell(ray.dy * reach) + jitter(),
      };
      const rect = spotNear(item, target);
      if (rect) commit(item, rect, index);
      else missing.push(item);
    });
  };

  /** 행정 건물 둘레 고리(innerCells) 위, 선 건물 사이 가장 큰 빈 각도의 가운데 */
  function fillGap(item: LayoutItem): void {
    const angles = [...input.existing.filter((building) => building.role !== "core"), ...placed]
      .filter((building) => building.role !== "core")
      .map((building) => angleOf(hallCenter, rectCenter(building)))
      .toSorted((a, b) => a - b);
    let angle = baseAngle;
    if (angles.length > 0) {
      let widest = -1;
      for (let i = 0; i < angles.length; i++) {
        const here = angles[i] ?? 0;
        const next = i + 1 < angles.length ? (angles[i + 1] ?? 0) : (angles[0] ?? 0) + 2 * Math.PI;
        if (next - here > widest) {
          widest = next - here;
          angle = here + (next - here) / 2;
        }
      }
    }
    const target = {
      x: hallCenter.x + cell(detCos(angle) * rules.innerCells) + jitter(),
      y: hallCenter.y + cell(detSin(angle) * rules.innerCells) + jitter(),
    };
    const rect = spotNear(item, target);
    if (rect) commit(item, rect);
    else missing.push(item);
  }

  onRoute("storage", rules.storeRoutePm, storageGroups);
  // 숙소 묶음 수 = 채집 구역 수까지(구역마다 길 위 하나). 남는 숙소는 빈 각도를 채운다(행정 건물의 다른 쪽도 막는다)
  const lodgingCount = input.items.filter((entry) => entry.role === "living").length;
  onRoute(
    "living",
    rules.lodgeRoutePm,
    splitByAngle(hallCenter, stations, Math.min(lodgingCount, Math.max(1, anchors.length))),
  );
  // 4. 나머지: 빈 각도 채우기
  for (const item of input.items.filter((entry) => entry.role === "other")) fillGap(item);

  return { placed, missing, hall };
}
