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
import type { NpcState } from "./state.ts";
import { type GrantedItem, rewardRecordOf } from "./waveRewards.ts";

/** 정원사 크리쳐 전투 유닛 ID 시작(세계 유닛 ID와 겹치지 않게, 시뮬과 같은 값) */
const WAVE_CREATURE_ID_BASE = 1_900_000_000;
/** 웨이브 공성 전투맵·넥서스·수비 인원(49 C3, 시뮬 시나리오 기본과 같다, 질문 218 가) */
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
      const init = waveBattleInit(
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
          nexusDurability: WAVE_NEXUS,
          maxDefenders: WAVE_DEFENDERS,
          // 공성 제한 시간(C2): 설정 칸 실효 값(전투 서비스는 시험 계수표로 전투를 만든다)
          limitMs: combat.limitMs.siege,
        },
        o.catalog(),
        combat,
      );
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
