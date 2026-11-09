// 2차맵 시험 도우미 — 시험 파일끼리 서로 import하지 않게 여기에 둔다(게임 앱 선언 파일에는 넣지 않는다: tsconfig.api.json)
import { performance } from "node:perf_hooks";
import {
  type BattleInit,
  JOB_NONE,
  type JobState,
  PHASE_WORK,
  SURFACE_GRASS,
  TEMP_TERRAIN_GENERATOR_VERSION,
  TERRAIN_SIZE,
  TERRAIN_VERTEX_SIZE,
  type TempTerrain,
  WALK_SPEED,
} from "@terra/sim";
import { mapTerrainFromTemp } from "./mapTerrain.ts";
import { type PathOutcome, type PathService, createInlinePathService } from "./pathService.ts";
import { type SecondMap, createSecondMap } from "./secondMap.ts";
import type { Settlement } from "./settlement.ts";
import { UNIT_KIND_HUMAN } from "./unitKinds.ts";
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

/**
 * 사용자에게 유닛 count개를 그 2차맵에 바로 세운다(시험 전용 — 기기 명령은 없다). 기본은 구인 카드로 고용한 것과 같은 휴먼(종류 4, 휴먼
 * 행 없음)이고 직무가 없다. job을 주면 그 직무로 켠다. 유닛 수가 바뀌기 전에 주인을 정산한다(상호작용 전 정산). 만든 유닛 ID.
 * (옛 개발 시험 명령 dev_spawn_units의 시험 일꾼 자리 — 사용자 지적 2026-11-09 "시험일꾼 다 없애라고"로 그 명령은 없앴다)
 */
export function addTestUnits(
  world: {
    readonly maps: ReadonlyMap<number, SecondMap>;
    readonly persistence?:
      | { readonly settlement: Settlement; readonly nextId: { unit(): number } }
      | undefined;
  },
  userId: string,
  mapKey: number,
  count: number,
  nowMs: number,
  options: { readonly kind?: number; readonly job?: number } = {},
): number[] {
  const p = world.persistence;
  const map = world.maps.get(mapKey);
  if (!p || !map) throw new Error("addTestUnits: no persistence or map");
  const owner = p.settlement.ownerOfUser(userId, nowMs);
  p.settlement.settleOwner(owner.id, nowMs);
  const made: number[] = [];
  for (let attempt = 0; made.length < count && attempt < count * 64; attempt++) {
    const id = p.nextId.unit();
    const cellX = 96 + ((attempt * 7) % 64);
    const cellY = 96 + Math.floor((attempt * 7) / 64) * 3;
    const unit = { id, size: 1 as const, speed: WALK_SPEED, cellX, cellY, ownerId: owner.id };
    if (!map.addUnit({ ...unit, kind: options.kind ?? UNIT_KIND_HUMAN })) continue;
    if (options.job !== undefined && options.job !== JOB_NONE) {
      const job: JobState = { job: options.job, phase: PHASE_WORK, progressMs: 0, fatigue: 0 };
      map.setJob(id, job);
    }
    made.push(id);
  }
  return made;
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
