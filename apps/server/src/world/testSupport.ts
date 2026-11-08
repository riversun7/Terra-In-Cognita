// 2차맵 시험 도우미 — 시험 파일끼리 서로 import하지 않게 여기에 둔다(게임 앱 선언 파일에는 넣지 않는다: tsconfig.api.json)
import { performance } from "node:perf_hooks";
import {
  type BattleInit,
  SURFACE_GRASS,
  TEMP_TERRAIN_GENERATOR_VERSION,
  TERRAIN_SIZE,
  TERRAIN_VERTEX_SIZE,
  type TempTerrain,
} from "@terra/sim";
import { mapTerrainFromTemp } from "./mapTerrain.ts";
import { type PathOutcome, type PathService, createInlinePathService } from "./pathService.ts";
import { type SecondMap, createSecondMap } from "./secondMap.ts";
import { type WorldStats, emptyWorldStats } from "./worldStats.ts";

/** 아무 일도 하지 않는 로거 */
export const silentLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

/** 모든 칸이 풀밭(비용 1000)인 평평한 지형 — 경로를 손으로 계산할 수 있다 */
export function flatTerrain(seed = 1): TempTerrain {
  return {
    generatorVersion: TEMP_TERRAIN_GENERATOR_VERSION,
    seed,
    heights: new Int32Array(TERRAIN_VERTEX_SIZE * TERRAIN_VERTEX_SIZE).fill(100),
    surface: new Uint8Array(TERRAIN_SIZE * TERRAIN_SIZE).fill(SURFACE_GRASS),
  };
}

/** 결과를 붙잡아 둘 수 있는 경로 서비스. 붙잡은 동안에도 계산은 부탁한 때 바로 한다(그때의 격자로) */
export interface HeldPathService extends PathService {
  /** true면 결과를 release 때까지 돌려주지 않는다 */
  hold: boolean;
  requests: number;
  release(): void;
}

export function heldPathService(inner: PathService): HeldPathService {
  const held: { result: Promise<PathOutcome>; resolve: (outcome: PathOutcome) => void }[] = [];
  const service: HeldPathService = {
    hold: false,
    requests: 0,
    start: () => inner.start(),
    edit: (mapKey, version, edit) => inner.edit(mapKey, version, edit),
    add: (init) => inner.add(init),
    drop: (mapKey) => inner.drop(mapKey),
    queued: () => inner.queued(),
    close: () => inner.close(),
    request(job) {
      service.requests += 1;
      const result = inner.request(job);
      if (!service.hold) return result;
      return new Promise((resolve) => held.push({ result, resolve }));
    },
    release() {
      for (const { result, resolve } of held.splice(0)) void result.then(resolve);
    },
  };
  return service;
}

export interface TestMap {
  map: SecondMap;
  stats: WorldStats;
  paths: HeldPathService;
}

/** 같은 스레드 경로 서비스로 2차맵 하나를 만든다(시각은 Date.now — 가짜 타이머와 함께 쓴다) */
export function createTestMap(options: { terrain?: TempTerrain; mapKey?: number } = {}): TestMap {
  const stats = emptyWorldStats();
  const holder: { map?: SecondMap } = {};
  const paths = heldPathService(
    createInlinePathService(
      () => (holder.map ? [holder.map.replicaInit()] : []),
      () => performance.now(),
    ),
  );
  const mapKey = options.mapKey ?? 9;
  const map = createSecondMap({
    mapKey,
    terrain: mapTerrainFromTemp(mapKey, options.terrain ?? flatTerrain()),
    paths,
    now: () => Date.now(),
    stats,
    log: silentLog,
  });
  holder.map = map;
  paths.start();
  return { map, stats, paths };
}

const ZERO = Array.from({ length: 12 }, () => 0);
/** 시험 전투 유닛(체력 400, 근접) */
export function testFighter(id: number, side: number, party: number, x: number, y: number) {
  return {
    id,
    side,
    party,
    x,
    y,
    maxHp: 400,
    armorHp: 0,
    shieldHp: 0,
    attack: {
      kind: "physical" as const,
      // 스탯 공격력 0 + 무기 20 × (10 ÷ 적정 10) = 20(D-502 모양)
      statAttack: 0,
      weaponAttack: 20,
      attackPrimary: 10,
      attackAppropriateMilli: 10_000,
      weaponHitPm: 1000,
      weaponCritPm: 100,
      dex: 10,
      dexAppropriateMilli: 10_000,
      critMulPm: 1500,
      penetrationPm: 0,
      skillMulPm: 1000,
      buffPm: 1000,
      elements: ZERO,
      skillElementsPm: ZERO,
    },
    defense: {
      defenseRatePm: 100,
      defenseFlat: 1,
      elementalDefenseRatePm: 0,
      evadePm: 0,
      elements: ZERO,
      resistPm: ZERO,
    },
    range: 1,
    arc: false,
    attackIntervalMs: 500,
    moveIntervalMs: 500,
    staminaMax: 1000,
    staminaCost: 1,
    staminaScore: 80,
    staminaRegen: 180,
    mpMax: 0,
    mpCost: 0,
    mpRegen: 0,
    shieldRegen: 0,
    sight: 12,
    eye: 2880,
    air: false,
    commandCap: 0,
    cyborg: false,
    buildingMulPm: 1000,
    primaries: [0, 0, 0, 0, 0, 0],
    skills: [],
  };
}

/** 시험 조우 전투(32칸, 2 대 2). 유닛 ID·편의 주체(faction)를 바꿀 수 있다 */
export function testEncounter(
  ids: readonly [number, number, number, number] = [1, 2, 11, 12],
  factions: readonly [number, number] = [1, 2],
): BattleInit {
  const size = 32;
  return {
    id: 1,
    kind: "normal",
    seed: 77,
    map: {
      size,
      passable: new Uint8Array(size * size).fill(1),
      cover: new Uint8Array(size * size),
      height: new Int32Array(size * size),
      buildings: [],
    },
    sides: [
      { id: 1, faction: factions[0], defender: false, edge: 3 },
      { id: 2, faction: factions[1], defender: true, edge: 1 },
    ],
    parties: [
      { id: 1, side: 1, retreatHpPct: 0 },
      { id: 2, side: 2, retreatHpPct: 0 },
    ],
    units: [
      testFighter(ids[0], 1, 1, 12, 10),
      testFighter(ids[1], 1, 1, 12, 12),
      testFighter(ids[2], 2, 2, 18, 10),
      testFighter(ids[3], 2, 2, 18, 12),
    ],
  };
}
