// NPC 사회 런타임의 정원사(서버) — docs/adr/2026-11-01-gardener-r5b.md 5절
// 시뮬레이터와 같은 @terra/sim attachGardener를 거울 세계에 붙인다. 서버에서 다른 것:
// - 칸 = 행성 칸 키(면 레벨 F9 = 2차맵 키), 이웃 = @terra/planet neighbors8(큐브 모서리 칸은 7칸).
// - 웨이브 전투 = 서버 전투 서비스(battles.ts, 빨리감기 + 끝 시각에 결과 적용: 수비 휴먼 부상·안전한 곳으로, 포로 없음).
//   전투가 끝나면 월드가 알려 주고(onBattleEnded), 다음 틱에 웨이브 결과(피해·폐허·쉬는 시간)를 거울 세계에 넣는다.
//   전투 서비스가 없으면(시험 일부) 시뮬과 같은 빨리감기를 그 자리에서 한다.
// - 상태 저장: 칸 오염(planet_pollution), 웨이브(gardener_waves), 쉬는 시간(world_cities), 모함 칸·유목 부대(npc_society.gardener).
// - 숲 칸 판정 없음(행성 값을 메인 스레드에 두지 않는다, D-464 224 가). 시설 일 없음(서버에 NPC 생산 시설이 아직 없다).
// - 정원사 2(ADR "바뀜 (2026-11-07, 정원사 2)"): 정원 세력 관계도·명성은 npc_society.gardener에 세력(소유 주체 ID)마다,
//   웨이브 종류(도시·보호 레이드)·막아 낸 웨이브의 보상 기록은 gardener_waves(kind·reward). 보상 아이템은 grantReward가 장부에 낸다.
import { type CellKey, EARTH_FACE_LEVEL, FACES, cellKey, isCellKey, neighbors8 } from "@terra/planet";
import {
  type BattleInit,
  type CombatCatalog,
  type CombatCoefficients,
  type Edge,
  type GardenerCoefficients,
  type GardenerRun,
  type GardenerWave,
  type MetricsRecorder,
  type NomadParty,
  type PollutionGrid,
  STREAM_GARDENER,
  type SimEvent,
  type SimLoop,
  type SimWorld,
  type SocietyRun,
  type WaveReward,
  attachGardener,
  createBattle,
  mix32,
  runWaveToEnd,
  startingNomads,
  streamRng,
  waveBattleInit,
} from "@terra/sim";
import { cellCenter, cellCorners } from "@terra/planet/projection";
import {
  SIEGE_NEXUS_ID,
  type SiegeLayout,
  edgeToward,
  siegeArena,
  waveAttackEdge,
} from "@terra/sim/siegeArena";
import { type WorldBattleInit, waveSiegeTargets } from "../world/battleTargets.ts";
import type { NpcState } from "./state.ts";
import { type GrantedItem, rewardRecordOf } from "./waveRewards.ts";

/** 정원사 크리쳐 전투 유닛 ID 시작(세계 유닛 ID와 겹치지 않게, 시뮬과 같은 값) */
const WAVE_CREATURE_ID_BASE = 1_900_000_000;
/** 웨이브 공성 전투맵·넥서스(열린 맵일 때만 — 배치가 있으면 행정 건물 내구도)·수비 인원(49 C3, 시뮬 시나리오 기본과 같다, 질문 218 가) */
const WAVE_MAP_SIZE = 128;
const WAVE_NEXUS = 2000;
const WAVE_DEFENDERS = 10;

/** npc_society.gardener(jsonb) 모양. relations·renown = [세력 소유 주체 ID, 값](정원사 2, 없던 옛 줄은 빈 표) */
interface StoredGardener {
  readonly mothershipCell: number;
  readonly nextWaveId: number;
  readonly relations: readonly (readonly [number, number])[];
  readonly renown: readonly (readonly [number, number])[];
  readonly nomads: readonly {
    readonly id: number;
    readonly kind: "scout" | "legion";
    readonly cell: number;
    readonly target: number | null;
    readonly arriveAtMs: number | null;
    readonly size: number;
    readonly excluded: readonly (readonly [number, number])[];
  }[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const int = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;

/** [정수, 정수] 짝 목록(모양이 틀린 짝은 건너뛴다) */
function intPairs(value: unknown): [number, number][] {
  const out: [number, number][] = [];
  const pairs: readonly unknown[] = Array.isArray(value) ? value : [];
  for (const pair of pairs) {
    if (!Array.isArray(pair)) continue;
    const entry: readonly unknown[] = pair;
    const a = int(entry[0]);
    const b = int(entry[1]);
    if (a !== undefined && b !== undefined) out.push([a, b]);
  }
  return out;
}

/** 표 → 키 차례 짝 목록(jsonb 글자가 넣은 차례와 상관없이 같게) */
const sortedPairs = (map: ReadonlyMap<number, number>): [number, number][] =>
  [...map].toSorted((a, b) => a[0] - b[0]);

/** 저장한 정원사 상태를 읽는다(모양이 틀리면 undefined → 새로 차린다) */
export function parseStoredGardener(value: unknown): StoredGardener | undefined {
  if (!isRecord(value)) return undefined;
  const mothershipCell = int(value.mothershipCell);
  const nextWaveId = int(value.nextWaveId);
  const nomads = value.nomads;
  if (mothershipCell === undefined || nextWaveId === undefined || !Array.isArray(nomads)) return undefined;
  const list: StoredGardener["nomads"][number][] = [];
  const items: readonly unknown[] = nomads;
  for (const raw of items) {
    if (!isRecord(raw)) return undefined;
    const id = int(raw.id);
    const cell = int(raw.cell);
    const size = int(raw.size) ?? 0;
    const kind = raw.kind === "legion" ? "legion" : raw.kind === "scout" ? "scout" : undefined;
    if (id === undefined || cell === undefined || kind === undefined) return undefined;
    const excluded = intPairs(raw.excluded);
    list.push({
      id,
      kind,
      cell,
      target: int(raw.target) ?? null,
      arriveAtMs: int(raw.arriveAtMs) ?? null,
      size,
      excluded,
    });
  }
  return {
    mothershipCell,
    nextWaveId,
    nomads: list,
    relations: intPairs(value.relations),
    renown: intPairs(value.renown),
  };
}

/** 지금 정원사 상태 → npc_society.gardener(jsonb 글자) */
export function storedGardenerOf(run: GardenerRun, mothershipCell: number): string {
  const stored: StoredGardener = {
    mothershipCell,
    nextWaveId: run.nextWaveId(),
    relations: sortedPairs(run.relations),
    renown: sortedPairs(run.renown),
    nomads: run.nomads.map((party) => ({
      id: party.id,
      kind: party.kind,
      cell: party.cell,
      target: party.target,
      arriveAtMs: party.arriveAtMs,
      size: party.size,
      excluded: [...party.excluded].toSorted((a, b) => a[0] - b[0]),
    })),
  };
  return JSON.stringify(stored);
}

/** 행성 칸 이웃(면 레벨 F9 칸 키) */
export const PLANET_GRID: PollutionGrid = {
  neighbors: (cell) => (isCellKey(cell) ? neighbors8(cell) : []),
};

/** [임시] 모함 칸: (세계 시드)로 고른 F9 칸(D-379 "정원 행성마다 1척", 자리는 기획 없음 — 질문 221 가) */
export function pickMothershipCell(seed: number): CellKey {
  const rng = streamRng(seed, STREAM_GARDENER, 1, 0);
  const span = 2 ** EARTH_FACE_LEVEL;
  const face = FACES[rng.nextInt(FACES.length)] ?? 0;
  return cellKey(face, EARTH_FACE_LEVEL, rng.nextInt(span), rng.nextInt(span));
}

/**
 * 웨이브가 들어오는 변(질문 1067 가 — 1·2차맵 진군 표시 D-196과 같은 방향): 도시 칸(2차맵 키)에서 모함 칸으로의 방향을 그 2차맵 축으로 옮긴다.
 * 2차맵 x = 면 i가 커지는 쪽, 행(y) = 면 j가 작아지는 쪽(planet secondMap/layout.ts). 축 방향 = 칸 꼭짓점의 i·j 변 차이, 방향 = (모함 칸 중심 −
 * 도시 칸 중심)을 그 축에 비춘 값(edgeToward). 칸 키가 아니거나 같은 칸이면 시드로 고른다(waveAttackEdge)
 */
export function waveEdgeOnPlanet(
  cityCell: number | undefined,
  mothershipCell: number,
  seed: number,
  waveId: number,
): Edge {
  if (
    cityCell !== undefined &&
    isCellKey(cityCell) &&
    isCellKey(mothershipCell) &&
    cityCell !== mothershipCell
  ) {
    const [c00, c10, c11, c01] = cellCorners(cityCell);
    const from = cellCenter(cityCell);
    const to = cellCenter(mothershipCell);
    let dx = 0;
    let dy = 0;
    for (let k = 0; k < 3; k++) {
      const d = (to[k] ?? 0) - (from[k] ?? 0);
      // i 쪽 = (i+1 변) − (i 변), j 쪽 = (j+1 변) − (j 변)
      dx += d * ((c10[k] ?? 0) + (c11[k] ?? 0) - (c00[k] ?? 0) - (c01[k] ?? 0));
      dy -= d * ((c11[k] ?? 0) + (c01[k] ?? 0) - (c00[k] ?? 0) - (c10[k] ?? 0));
    }
    const edge = edgeToward(dx, dy);
    if (edge !== undefined) return edge;
  }
  return waveAttackEdge(seed, waveId);
}

export interface ServerGardenerOptions {
  readonly world: SimWorld;
  readonly state: NpcState;
  readonly seed: number;
  readonly startMs: number;
  readonly loop: SimLoop<SimEvent>;
  readonly recorder: MetricsRecorder;
  readonly society: SocietyRun;
  readonly rules: () => GardenerCoefficients;
  readonly combatRules: () => CombatCoefficients;
  /** 전투 자료(웨이브 전투를 열 때마다 읽는다: 스킬 편집기·가중치 표 덮어쓰기가 다음 웨이브부터 든다) */
  readonly catalog: () => CombatCatalog;
  /** 도시 → 칸(2차맵 키). 폐허가 된 도시도 안다 */
  readonly cellOf: (cityId: number) => number | undefined;
  /** 세력 행 ID → 소유 주체 ID(웨이브 행의 세력) */
  readonly ownerOfRow: (rowId: number) => number | undefined;
  readonly treasuryOf: (ownerId: number) => bigint;
  /** 측정용 하루 줄이기 배율(NPC_DAY_MS ÷ 24시간). 예고·쉬는 시간에 곱한다 */
  readonly timeScale: number;
  /** 전투 서비스에 웨이브 전투를 넣는다. 없으면 그 자리에서 빨리감기 */
  readonly startBattle?: ((init: BattleInit) => Promise<number>) | undefined;
  /**
   * 막아 낸 도시 웨이브의 보상 아이템을 그 세력 소유 주체 장부에 낸다(D-499, waveRewards.ts). 준 것 목록. 없으면 아이템 없이 명성만
   */
  readonly grantReward?:
    | ((ownerId: number, reward: WaveReward, atMs: number) => readonly GrantedItem[])
    | undefined;
  /**
   * 그 도시에 싸울 수 있는 수호신이 있나(기획 답 472 가 — 신전 서비스). 있으면 수비 휴먼이 없어도 웨이브 전투를 연다(도시 방어가 전투 시작
   * 자료에 수호신을 수비 편으로 넣는다, temple/cityDefense.ts). 없으면 수비 휴먼이 없는 도시는 전투 없이 진다
   */
  readonly hasGuardians?: ((cityId: number) => boolean) | undefined;
  /**
   * 도시의 실제 2차맵 건물 배치(D-533·질문 1046 가, facilities/siegeLayout.ts). 있으면 웨이브 공성 전투맵 = 그 구역(넥서스 = 행정 건물),
   * 없으면(행정 건물 없음·2차맵 없음) 옛 열린 맵
   */
  readonly siegeLayout?: ((cityId: number) => SiegeLayout | undefined) | undefined;
  /**
   * 2차맵 건물이 세계 시설인가(질문 1114 가 — 웨이브 공성 전투맵의 성벽·둘레 시설을 전투 결과 목표로 단다, world/battleTargets.ts). 없으면 목표를
   * 달지 않는다(넥서스 = 행정 건물은 정원사 결과 규칙)
   */
  readonly isFacility?: ((buildingId: number) => boolean) | undefined;
  readonly log: { warn(obj: object, message: string): void; error(obj: object, message: string): void };
}

export interface ServerGardener {
  readonly run: GardenerRun;
  readonly mothershipCell: number;
  /** 전투 서비스가 끝낸 전투(그 웨이브면 다음 틱에 결과를 넣는다). 처리했으면 true */
  battleEnded(battleId: number, attackerWon: boolean): boolean;
  /** 쌓인 결과(전투 끝·전투를 못 연 웨이브)를 넣는다. 넣은 수 */
  applyPending(nowMs: number): number;
  /** 바뀐 웨이브 ID(전투 ID를 받았다) — 저장이 다시 쓴다 */
  takeDirtyWaves(): number[];
  /** 끝난 웨이브의 보상 기록(gardener_waves.reward jsonb 글자, 꺼내면 지운다). 없으면 null */
  takeRewardRecord(waveId: number): string | null;
}

export function attachServerGardener(o: ServerGardenerOptions): ServerGardener {
  const stored = parseStoredGardener(o.state.society?.gardener);
  const mothershipCell = stored?.mothershipCell ?? pickMothershipCell(o.seed);
  const pending: { waveId: number; won: boolean | null }[] = [];
  const dirty = new Set<number>();
  const rewardRecords = new Map<number, string>();
  const waves: GardenerWave[] = o.state.waves.map((row) => ({
    id: row.id,
    kind: row.kind,
    city: row.cityId,
    faction: row.factionRowId === null ? 0 : (o.ownerOfRow(row.factionRowId) ?? 0),
    strength: row.strength,
    physical: row.physical,
    createdAtMs: row.createdAtMs,
    arriveAtMs: row.arriveAtMs,
    state: row.state,
    battleId: row.battleId,
    eventId: undefined,
  }));
  const nomads: NomadParty[] = stored
    ? stored.nomads.map((party) => ({ ...party, excluded: new Map(party.excluded) }))
    : startingNomads(mothershipCell, o.rules());
  const cooldownUntil = new Map<number, number>();
  for (const city of o.state.cities)
    if (city.waveCooldownUntilMs > 0) cooldownUntil.set(city.id, city.waveCooldownUntilMs);
  const maxStored = o.state.waves.reduce((max, row) => Math.max(max, row.id), 0);

  const run = attachGardener({
    world: o.world,
    rules: o.rules,
    grid: PLANET_GRID,
    cellOf: o.cellOf,
    mothershipCell,
    recorder: o.recorder,
    society: o.society,
    schedule: (atMs, kind, subject) => o.loop.schedule(Math.max(atMs, o.loop.nowMs), { kind, subject }),
    cancel: (eventId) => o.loop.cancel(eventId),
    treasuryOf: (faction) => o.treasuryOf(faction.id),
    hasGuardians: o.hasGuardians,
    timeScale: o.timeScale,
    seed: o.seed,
    restore: {
      layer: new Map(o.state.pollution.map((row) => [row.cellKey, row.value])),
      waves,
      cooldownUntil,
      nomads,
      nextWaveId: Math.max(stored?.nextWaveId ?? 1, o.state.maxWaveId + 1, maxStored + 1),
      nowMs: o.startMs,
      relations: new Map(stored?.relations ?? []),
      renown: new Map(stored?.renown ?? []),
    },
    onReward: (wave, ownerId, reward, nowMs) => {
      rewardRecords.set(wave.id, rewardRecordOf(reward, o.grantReward?.(ownerId, reward, nowMs) ?? []));
    },
    fight: (wave, defenders) => {
      const city = o.world.cities.get(wave.city);
      const owner = city ? o.world.factions.get(city.owner) : undefined;
      if (!owner) return true;
      const combat = o.combatRules();
      const layout = o.siegeLayout?.(wave.city);
      const waveInit = waveBattleInit(
        {
          battleId: wave.id,
          seed: mix32(o.seed ^ Math.imul(wave.id, 0x2545_f491) ^ 0x6a09_e667),
          defenderFaction: owner.id,
          defenders,
          defenderTech: owner.tech,
          strength: wave.strength,
          physical: wave.physical,
          creatureTech: owner.tech,
          firstCreatureId: WAVE_CREATURE_ID_BASE,
          mapSize: WAVE_MAP_SIZE,
          // 배치가 있으면 행정 건물의 지금 내구도(질문 1069 가, waveBattleInit), 없으면(열린 맵) 이 값
          nexusDurability: WAVE_NEXUS,
          maxDefenders: WAVE_DEFENDERS,
          // 공성 제한 시간(C2): 설정 칸 실효 값(전투 서비스는 시험 계수표로 전투를 만든다)
          limitMs: combat.limitMs.siege,
          layout,
          attackEdge: waveEdgeOnPlanet(o.cellOf(wave.city), mothershipCell, o.seed, wave.id),
        },
        o.catalog(),
        combat,
      );
      // 성벽·둘레 시설 목표(질문 1114 가): 전투에서 깎인 만큼 세계 시설도 깎인다. 넥서스(행정 건물)는 막아 냈을 때만 깎이고(질문 1190 나 —
      // 수리 대상), 웨이브가 이기면 정원사 결과 규칙(D-230)이 정한다
      const isFacility = o.isFacility;
      const targets =
        layout && isFacility
          ? waveSiegeTargets(siegeArena(layout, WAVE_MAP_SIZE, 1).sources, isFacility, SIEGE_NEXUS_ID)
          : [];
      const init: WorldBattleInit = targets.length > 0 ? { ...waveInit, targets } : waveInit;
      if (!o.startBattle) {
        const { result } = runWaveToEnd(createBattle(init, combat), []);
        return result?.winner === 1;
      }
      o.startBattle(init)
        .then((battleId) => {
          const live = run.waves.get(wave.id);
          if (!live) return;
          live.battleId = battleId;
          dirty.add(wave.id);
        })
        .catch((error: unknown) => {
          o.log.error({ err: error, waveId: wave.id }, "gardener wave battle failed to start");
          pending.push({ waveId: wave.id, won: null });
        });
      return "pending";
    },
  });

  // 다시 켰을 때 싸우던 웨이브: 결과가 이미 적혔으면 넣고, 전투 ID가 없으면(전투를 열기 전에 죽음) 흩는다
  for (const row of o.state.waves) {
    if (row.state !== "fighting") continue;
    if (row.battleWinner !== null) pending.push({ waveId: row.id, won: row.battleWinner === 1 });
    else if (row.battleId === null) pending.push({ waveId: row.id, won: null });
  }

  return {
    run,
    mothershipCell,
    battleEnded(battleId, attackerWon) {
      for (const wave of run.waves.values())
        if (wave.battleId === battleId) {
          pending.push({ waveId: wave.id, won: attackerWon });
          return true;
        }
      return false;
    },
    applyPending(nowMs) {
      const list = pending.splice(0, pending.length);
      for (const entry of list) {
        if (entry.won === null) run.disband(entry.waveId, nowMs);
        else run.resolve(entry.waveId, entry.won, nowMs);
      }
      return list.length;
    },
    takeDirtyWaves() {
      const out = [...dirty];
      dirty.clear();
      return out;
    },
    takeRewardRecord(waveId) {
      const record = rewardRecords.get(waveId) ?? null;
      rewardRecords.delete(waveId);
      return record;
    },
  };
}
