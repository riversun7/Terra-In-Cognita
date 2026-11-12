// 성벽 고리 — 질문 1048 가(성벽 시설이 공격을 늦춘다), D-533 "정부 건물 중앙(파괴 = 함락), 둘레 건물이 공격을 늦춤",
// docs/adr/2026-11-11-city-building-layout.md "바뀜 (2026-11-12)". 측정(apps/server/bench/siegeLayout.ts): 성벽 없이 실제 배치만으로는 공격 편이
// 건물을 돌아가 넥서스에 닿는 시각이 열린 맵과 같았다(둘레 16방위 중 약 4방위만 건물).
// - 고리: 행정 건물 칸에서 체비쇼프 거리 R(설정 칸 city_wall_ring_cells)인 네모 고리. 변마다(위·오른·아래·왼) 틈(city_wall_gates개,
//   폭 city_wall_gate_cells)을 고르게 남기고 나머지에 성벽(팩 city_wall, 발자국 길이 × 1, 세로 변은 90° 돌림)을 앞에서부터 놓는다.
//   놓을 수 없는 칸(건물·막힌 지형·유닛)은 건너뛴다.
// - 2차맵에서 틈은 사람이 지나가는 길이다. 공성 전투에서는 고리의 빈 칸(틈·남은 칸)이 성문(수비 편만 지나감)으로 닫힌다(cityGates).
// - NPC 시작 도시 씨앗이 모자랄 때 한 번(그 도시에 성벽이 하나도 없을 때만 — 멱등). 정수만 쓴다.
import { CONDITION_FULL } from "@terra/shared/facilityRuntime";
import { type BuildingPlacement, type WorldSeedCoefficients, footprintRect } from "@terra/sim";
import type { SiegeGate, SiegeRect } from "@terra/sim/siegeArena";
import type { SecondMap } from "../world/secondMap.ts";
import type { FacilityCatalog } from "./catalog.ts";
import type { FacilityService } from "./service.ts";
import type { FacilityRecord } from "./state.ts";

/** 성벽 시설 ID(팩 core) */
export const CITY_WALL_FACILITY = "city_wall";
/** 성벽 단계(팩 FACILITY_STAGES) */
export const DEFENSE_STAGE = "defense";

export interface CityWallRules {
  readonly enabled: boolean;
  readonly ringCells: number;
  readonly gates: number;
  readonly gateCells: number;
}

const int = (value: number, low: number, high: number) => Math.min(high, Math.max(low, Math.trunc(value)));

/** 설정 칸 → 규칙(범위 밖이면 자른다) */
export function cityWallRulesOf(seed: WorldSeedCoefficients): CityWallRules {
  return {
    enabled: Math.trunc(seed.cityWallMode) === 1,
    ringCells: int(seed.cityWallRingCells, 2, 16),
    gates: int(seed.cityWallGates, 1, 8),
    gateCells: int(seed.cityWallGateCells, 1, 6),
  };
}

interface Cell {
  readonly x: number;
  readonly y: number;
}

/**
 * 고리의 네 변(위 → 오른 → 아래 → 왼, 시계 방향으로 이어진다). 위·아래 변이 모서리를 가진다.
 * 위: 왼 → 오른, 오른: 위 → 아래, 아래: 오른 → 왼, 왼: 아래 → 위
 */
export function ringSides(hall: SiegeRect, r: number): Cell[][] {
  const x0 = hall.x - r;
  const x1 = hall.x + hall.width - 1 + r;
  const y0 = hall.y - r;
  const y1 = hall.y + hall.height - 1 + r;
  const top: Cell[] = [];
  const right: Cell[] = [];
  const bottom: Cell[] = [];
  const left: Cell[] = [];
  for (let x = x0; x <= x1; x++) top.push({ x, y: y0 });
  for (let y = y0 + 1; y < y1; y++) right.push({ x: x1, y });
  for (let x = x1; x >= x0; x--) bottom.push({ x, y: y1 });
  for (let y = y1 - 1; y > y0; y--) left.push({ x: x0, y });
  return [top, right, bottom, left];
}

/** 변마다 틈 칸 번호(변 안 차례): 틈 수를 변에 고르게(앞 변부터 하나씩 더), 변 안에서는 같은 간격 */
export function gateIndices(sides: readonly (readonly Cell[])[], rules: CityWallRules): Set<number>[] {
  return sides.map((side, index) => {
    const count = Math.floor(rules.gates / 4) + (index < rules.gates % 4 ? 1 : 0);
    const out = new Set<number>();
    for (let k = 0; k < count; k++) {
      const middle = Math.floor(((k + 1) * side.length) / (count + 1));
      const start = middle - (rules.gateCells >> 1);
      for (let i = start; i < start + rules.gateCells; i++) if (i >= 0 && i < side.length) out.add(i);
    }
    return out;
  });
}

/**
 * 성벽 자리: 변마다 틈이 아닌 칸을 앞에서부터 길이 length 토막으로(놓을 수 없는 칸이 끼면 그 뒤에서 다시). 세로 변(오른·왼)은 90° 돌림.
 * canPlace = 그 자리에 놓을 수 있나(건물·지형·유닛)
 */
export function planCityWalls(
  hall: SiegeRect,
  rules: CityWallRules,
  length: number,
  canPlace: (placement: BuildingPlacement) => boolean,
): BuildingPlacement[] {
  const sides = ringSides(hall, rules.ringCells);
  const gates = gateIndices(sides, rules);
  const out: BuildingPlacement[] = [];
  sides.forEach((side, index) => {
    const vertical = index === 1 || index === 3;
    let i = 0;
    while (i + length <= side.length) {
      let blocked = false;
      for (let j = i; j < i + length; j++) if (gates[index]?.has(j)) blocked = true;
      const run = side.slice(i, i + length);
      const xs = run.map((cell) => cell.x);
      const ys = run.map((cell) => cell.y);
      const placement: BuildingPlacement = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: length,
        height: 1,
        rotation: vertical ? 90 : 0,
      };
      if (!blocked && canPlace(placement)) {
        out.push(placement);
        i += length;
      } else i += 1;
    }
  });
  return out;
}

/**
 * 공성 전투의 성문: 그 도시 성벽 고리(거리 = 성벽 칸이 가장 많이 놓인 거리)의 빈 칸(건물이 없는 칸)을 고리 차례로 이어진 덩이마다 하나.
 * 내구도 = 그 고리 성벽 가운데 가장 큰 값. 성벽이 없으면 빈 목록
 */
export function cityGates(
  hall: SiegeRect,
  walls: readonly (SiegeRect & { readonly durability: number })[],
  occupied: (x: number, y: number) => boolean,
): SiegeGate[] {
  if (walls.length === 0) return [];
  const counts = new Map<number, number>();
  for (const wall of walls)
    for (let y = wall.y; y < wall.y + wall.height; y++)
      for (let x = wall.x; x < wall.x + wall.width; x++) {
        const dx = Math.max(hall.x - x, x - (hall.x + hall.width - 1), 0);
        const dy = Math.max(hall.y - y, y - (hall.y + hall.height - 1), 0);
        const d = Math.max(dx, dy);
        counts.set(d, (counts.get(d) ?? 0) + 1);
      }
  let ring = 0;
  let most = -1;
  for (const [d, n] of [...counts].toSorted((a, b) => a[0] - b[0]))
    if (n > most) {
      ring = d;
      most = n;
    }
  if (ring <= 0) return [];
  const durability = walls.reduce((max, wall) => Math.max(max, wall.durability), 0);
  const cells = ringSides(hall, ring).flat();
  const free = cells.map((cell) => !occupied(cell.x, cell.y));
  // 고리는 이어져 있다: 빈 칸이 아닌 곳에서 시작해 한 바퀴 돈다(모두 비었으면 한 덩이)
  const start = free.indexOf(false);
  if (start < 0) return [{ cells, durability }];
  const gates: SiegeGate[] = [];
  let current: Cell[] = [];
  for (let k = 1; k <= cells.length; k++) {
    const index = (start + k) % cells.length;
    const cell = cells[index];
    if (free[index] && cell) current.push(cell);
    else if (current.length > 0) {
      gates.push({ cells: current, durability });
      current = [];
    }
  }
  return gates;
}

export interface CityWallSeedInput {
  readonly map: SecondMap;
  readonly cityId: number;
  readonly ownerId: number;
  readonly hall: SiegeRect;
  readonly rules: CityWallRules;
  readonly catalog: FacilityCatalog;
  readonly service: Pick<FacilityService, "facilities" | "seedBuilt">;
  readonly nowMs: number;
}

/** 그 도시에 성벽이 하나도 없으면 고리를 세운다(세운 수). 규칙이 꺼졌거나 팩에 성벽이 없으면 0 */
export function seedCityWalls(input: CityWallSeedInput): number {
  const def = input.catalog.facility(CITY_WALL_FACILITY);
  if (!input.rules.enabled || !def?.footprint) return 0;
  for (const record of input.service.facilities.values())
    if (record.cityId === input.cityId && record.facilityId === CITY_WALL_FACILITY) return 0;
  const length = Math.max(def.footprint.width, def.footprint.height);
  const plan = planCityWalls(
    input.hall,
    input.rules,
    length,
    (placement) => input.map.canPlace(placement) && !input.map.unitInRect(footprintRect(placement)),
  );
  let placed = 0;
  for (const placement of plan) {
    const result = input.map.placeBuilding(placement, input.ownerId);
    if (!result.ok || result.buildingId === undefined) continue;
    const record: FacilityRecord = {
      buildingId: result.buildingId,
      facilityId: def.id,
      level: 1,
      conditionPpm: CONDITION_FULL,
      conditionAtMs: input.nowMs,
      builtAtMs: input.nowMs,
      builtBy: null,
      cityId: input.cityId,
    };
    input.service.seedBuilt(record);
    placed += 1;
  }
  return placed;
}
