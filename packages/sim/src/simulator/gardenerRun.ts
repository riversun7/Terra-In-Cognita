// 정원사 실행(오염 층 + 도시 웨이브 + 유목 부대) — docs/adr/2026-11-01-gardener-r5b.md 4절
// 시뮬레이터(run.ts)와 서버 NPC 런타임(apps/server/src/npc/)이 같은 함수를 부른다. 다른 것은 부르는 쪽이 준다:
// 칸 모양(grid·cellOf: 시뮬 = 합성 격자, 서버 = 행성 칸 키·neighbors8), 웨이브 전투(fight: 시뮬 = runBattle로 바로 결과,
// 서버 = 전투 서비스에 넣고 "pending" → 끝나면 resolve), 시간 배율(서버 측정용 NPC_DAY_MS).
// 하루 끝(endOfDay): 오염원(휴먼·시설 일) → 하루 바뀜(숲·감소·퍼짐) → 도시마다 웨이브 굴림(예고·도착 예약) → 유목 부대 목표·떠돎.
// 전투 한 번(공성·반란·조우·웨이브)은 그때 그 칸에 +battle. 웨이브 도착: 수비 휴먼이 없으면 웨이브가 이긴다.
// 이기면 시작 도시는 건물 피해(society.damage), 다른 도시는 폐허(society.ruin, 떠도는 세력 D-464 217). 지면 그 도시 쉬는 시간.
// 굴림 수는 날마다 같다(도시마다 하나, 유목 부대마다 하나 — 무엇이 일어나든 다음 굴림이 밀리지 않게).
import { type GardenerCoefficients } from "../gardener/coefficients.ts";
import {
  type NomadParty,
  nomadFits,
  nomadSize,
  nomadTarget,
  roamCell,
  startingNomads,
} from "../gardener/nomads.ts";
import {
  type PollutionGrid,
  type PollutionLayer,
  addPollution,
  dailyPollutionStep,
  facilityPollution,
  humanPollution,
  influenceCells,
  influenceSum,
} from "../gardener/pollution.ts";
import {
  grantGardenerUnits,
  mothershipCap,
  physicalCount,
  physicalPm,
  waveArrivalMs,
  waveChancePm,
  waveStrength,
} from "../gardener/waves.ts";
import type { MetricsRecorder } from "./metrics.ts";
import type { SocietyRun } from "./societyTypes.ts";
import { type SimFaction, type SimUnit, type SimWorld, streamRng } from "./world.ts";

export const EVENT_WAVE = "wave";
export const EVENT_NOMAD = "nomad";
/** 난수 흐름 6 = 정원사(1~5는 world.ts·society.ts) */
export const STREAM_GARDENER = 6;

export type WaveState = "marching" | "fighting";

export interface GardenerWave {
  readonly id: number;
  readonly city: number;
  /** 생길 때 그 도시 주인(세기를 정한 세력) */
  readonly faction: number;
  readonly strength: number;
  readonly physical: number;
  readonly createdAtMs: number;
  readonly arriveAtMs: number;
  state: WaveState;
  /** 서버: 전투 서비스의 전투 ID(싸우는 중) */
  battleId: number | null;
  eventId: number | undefined;
}

/** 끝난 웨이브(서버가 결과 줄을 쓴다). outcome = damaged | ruined | repelled | disbanded */
export interface ResolvedWave {
  readonly wave: GardenerWave;
  readonly outcome: "damaged" | "ruined" | "repelled" | "disbanded";
  readonly atMs: number;
}

export interface GardenerSummary {
  readonly pollution: { readonly cells: number; readonly total: number; readonly max: number };
  readonly waves: {
    readonly noticed: number;
    readonly battles: number;
    readonly won: number;
    readonly failed: number;
    readonly undefended: number;
    /** 물리형 0마리라 넥서스를 부술 수 없어 전투 없이 막힌 웨이브(규칙으로 정해진 결과, ADR 4절) */
    readonly noSiege: number;
    readonly disbanded: number;
    readonly budgetSkipped: number;
    readonly strengthMax: number;
  };
  readonly nomads: { readonly marches: number; readonly raids: number; readonly retargets: number };
}

export interface GardenerRestore {
  readonly layer: PollutionLayer;
  readonly waves: readonly GardenerWave[];
  readonly cooldownUntil: ReadonlyMap<number, number>;
  readonly nomads: readonly NomadParty[];
  readonly nextWaveId: number;
  /** 이어 돌린 시각(지난 도착은 이 시각으로 다시 건다) */
  readonly nowMs: number;
}

export interface GardenerOptions {
  readonly world: SimWorld;
  /** 지금 계수(서버는 설정 칸 실효 값을 부를 때마다 읽는다) */
  readonly rules: () => GardenerCoefficients;
  readonly grid: PollutionGrid;
  /** 도시 → 1차맵 칸(폐허가 된 도시도 칸을 안다) */
  readonly cellOf: (cityId: number) => number | undefined;
  readonly isForest?: ((cell: number) => boolean) | undefined;
  /** 모함 칸(유목 부대 처음 자리, D-379) */
  readonly mothershipCell: number;
  readonly recorder: MetricsRecorder;
  readonly society: SocietyRun;
  readonly schedule: (atMs: number, kind: string, subject: number) => number;
  readonly cancel: (eventId: number) => void;
  /** 웨이브 공성 전투: true = 웨이브가 이김, false = 짐, "pending" = 나중에 resolve(서버) */
  readonly fight: (wave: GardenerWave, defenders: readonly SimUnit[], nowMs: number) => boolean | "pending";
  /** 세력 국고(질문 220 가: 그 세력 화폐 그대로) */
  readonly treasuryOf: (faction: SimFaction) => bigint;
  /** 시간 배율(예고·쉬는 시간·유목 제외 기간에 곱한다). 서버 측정용 하루 줄이기(NPC_DAY_MS)만 1 아래로 쓴다 */
  readonly timeScale?: number | undefined;
  readonly seed: number;
  /** 이어 돌리기(서버): 저장한 상태 */
  readonly restore?: GardenerRestore | undefined;
}

export interface GardenerRun {
  /** 시설이 생산했다(레벨 × 오염 값 × 일한 ms) — 하루 끝에 1시간 단위로 내림해 더한다 */
  addWork(cityId: number, weightedWorkMs: number): void;
  /** 전투 한 번(그 도시 칸에 +battle) */
  addBattle(cityId: number): void;
  endOfDay(nowMs: number, day: number): void;
  /** 예약 처리(EVENT_WAVE·EVENT_NOMAD). 그 종류가 아니면 false */
  handle(kind: string, subject: number, nowMs: number): boolean;
  /** 싸우던 웨이브의 결과(서버: 전투가 끝났을 때) */
  resolve(waveId: number, won: boolean, nowMs: number): void;
  /** 웨이브를 흩는다(서버: 전투를 열지 못했을 때). 쉬는 시간은 걸지 않는다 */
  disband(waveId: number, nowMs: number): void;
  /** 지난 호출 뒤 끝난 웨이브(꺼내면 비운다) */
  takeResolved(): ResolvedWave[];
  readonly layer: () => PollutionLayer;
  readonly waves: ReadonlyMap<number, GardenerWave>;
  readonly cooldownUntil: ReadonlyMap<number, number>;
  readonly nomads: readonly NomadParty[];
  nextWaveId(): number;
  /** 진군·전투 중인 정원사 유닛 수(모함 몫) */
  inUse(): number;
  summary(): GardenerSummary;
  check(): string[];
}

export function attachGardener(o: GardenerOptions): GardenerRun {
  const { world, grid } = o;
  const scale = o.timeScale ?? 1;
  const scaled = (ms: number): number => Math.max(1, Math.round(ms * scale));
  let layer: PollutionLayer = new Map(o.restore?.layer ?? []);
  const waves = new Map<number, GardenerWave>((o.restore?.waves ?? []).map((wave) => [wave.id, { ...wave }]));
  const cooldownUntil = new Map(o.restore?.cooldownUntil ?? []);
  const nomads: NomadParty[] =
    o.restore?.nomads.map((party) => ({ ...party, excluded: new Map(party.excluded) })) ??
    startingNomads(o.mothershipCell, o.rules());
  let nextWave = o.restore?.nextWaveId ?? 1;
  /** 도시 → 오늘 모은 시설 일(레벨 × 오염 값 × ms) */
  const workToday = new Map<number, number>();
  const counts = {
    noticed: 0,
    battles: 0,
    won: 0,
    failed: 0,
    undefended: 0,
    noSiege: 0,
    disbanded: 0,
    budgetSkipped: 0,
    strengthMax: 0,
    marches: 0,
    raids: 0,
    retargets: 0,
  };

  const inUse = (): number => {
    let sum = 0;
    for (const wave of waves.values()) sum += wave.strength;
    for (const party of nomads) if (party.target !== null) sum += party.size;
    return sum;
  };

  // 이어 돌리기: 진군 중인 웨이브·유목 부대의 도착을 다시 건다(지났으면 지금)
  const resumeAt = (atMs: number): number => Math.max(atMs, o.restore?.nowMs ?? atMs);
  for (const wave of waves.values())
    if (wave.state === "marching") wave.eventId = o.schedule(resumeAt(wave.arriveAtMs), EVENT_WAVE, wave.id);
  for (const party of nomads)
    if (party.target !== null && party.arriveAtMs !== null)
      o.schedule(resumeAt(party.arriveAtMs), EVENT_NOMAD, party.id);

  const unitsIn = (cityId: number): SimUnit[] => {
    const out: SimUnit[] = [];
    for (const unit of world.units.values()) if (unit.city === cityId) out.push(unit);
    return out.toSorted((a, b) => a.id - b.id);
  };

  const addAt = (cityId: number, amount: number): void => {
    const cell = o.cellOf(cityId);
    if (cell !== undefined && amount !== 0) addPollution(layer, cell, amount, o.rules());
  };

  const resolvedOut: ResolvedWave[] = [];
  const finish = (
    wave: GardenerWave,
    outcome: ResolvedWave["outcome"],
    nowMs: number,
    extra: object = {},
  ): void => {
    if (wave.eventId !== undefined) o.cancel(wave.eventId);
    waves.delete(wave.id);
    resolvedOut.push({ wave, outcome, atMs: nowMs });
    o.recorder.wave(nowMs, {
      kind: "city",
      phase: "result",
      wave: wave.id,
      city: wave.city,
      outcome,
      ...extra,
    });
  };

  const resolve = (waveId: number, won: boolean, nowMs: number): void => {
    const wave = waves.get(waveId);
    if (!wave) return;
    const c = o.rules();
    const city = world.cities.get(wave.city);
    if (won) {
      counts.won += 1;
      const start = city?.start === true;
      if (city && start) o.society.damage(city.id, nowMs);
      else if (city) o.society.ruin(city.id, nowMs);
      finish(wave, start ? "damaged" : "ruined", nowMs);
    } else {
      counts.failed += 1;
      cooldownUntil.set(wave.city, nowMs + scaled(c.cooldownMs));
      finish(wave, "repelled", nowMs);
    }
  };

  const arrive = (waveId: number, nowMs: number): void => {
    const wave = waves.get(waveId);
    if (!wave || wave.state !== "marching") return;
    wave.eventId = undefined;
    const city = world.cities.get(wave.city);
    const owner = city ? world.factions.get(city.owner) : undefined;
    if (!city || !owner?.alive) {
      counts.disbanded += 1;
      finish(wave, "disbanded", nowMs);
      return;
    }
    const defenders = unitsIn(city.id);
    if (defenders.length === 0) {
      counts.undefended += 1;
      resolve(wave.id, true, nowMs);
      return;
    }
    // 물리형이 없으면 넥서스를 부술 수 없다(건물은 물리 피해만, D-5043). 공성 수비 편은 넥서스가 서 있는 동안 지지 않으므로
    // (전투 규칙 battle.ts 끝 조건) 결과는 늘 수비 승(시간 초과)이다. 공성 제한 시간 전체를 빨리감기하면 비싸다(ADR 4절 잰 값)
    if (wave.physical === 0) {
      counts.noSiege += 1;
      resolve(wave.id, false, nowMs);
      return;
    }
    counts.battles += 1;
    addAt(city.id, o.rules().battle);
    const result = o.fight(wave, defenders, nowMs);
    if (result === "pending") wave.state = "fighting";
    else resolve(wave.id, result, nowMs);
  };

  /** 모든 살아 있는 도시의 영향권 칸(유목 부대가 고르지 않는 칸) */
  const influenceSet = (c: GardenerCoefficients): Set<number> => {
    const out = new Set<number>();
    for (const city of world.cities.values()) {
      const cell = o.cellOf(city.id);
      if (cell !== undefined)
        for (const other of influenceCells(cell, grid, c.influenceRadius)) out.add(other);
    }
    return out;
  };

  const march = (
    party: NomadParty,
    nowMs: number,
    c: GardenerCoefficients,
    inInfluence: Set<number>,
  ): boolean => {
    const target = nomadTarget(layer, party.cell, grid, c, {
      kind: party.kind,
      inInfluence: (cell) => inInfluence.has(cell),
      excluded: party.excluded,
      nowMs,
    });
    if (target === null) return false;
    const granted = grantGardenerUnits(nomadSize(party.kind, layer.get(target) ?? 0, c), inUse(), c);
    if (granted === 0) {
      counts.budgetSkipped += 1;
      return false;
    }
    party.target = target;
    party.size = granted;
    party.arriveAtMs = nowMs + scaled(c.nomadNoticeMs);
    o.schedule(party.arriveAtMs, EVENT_NOMAD, party.id);
    counts.marches += 1;
    o.recorder.wave(nowMs, {
      kind: party.kind,
      phase: "notice",
      party: party.id,
      cell: target,
      size: granted,
      arriveAtMs: party.arriveAtMs,
    });
    return true;
  };

  const nomadArrive = (partyId: number, nowMs: number): void => {
    const party = nomads.find((entry) => entry.id === partyId);
    if (!party || party.target === null || party.arriveAtMs === null || nowMs < party.arriveAtMs) return;
    const c = o.rules();
    const target = party.target;
    party.cell = target;
    party.target = null;
    party.arriveAtMs = null;
    party.size = 0;
    // 목표 오염이 문턱 아래로 내려갔으면(정화) 그 자리에서 다시 고른다(D-320)
    if (!nomadFits(party.kind, layer.get(target) ?? 0, c)) {
      counts.retargets += 1;
      march(party, nowMs, c, influenceSet(c));
      return;
    }
    // 영향권 밖에 지킬 유닛·시설 층이 아직 없다: 싸움 없이 "오염원 파괴"(부술 것 없음, 질문 221 가)
    counts.raids += 1;
    o.recorder.wave(nowMs, {
      kind: party.kind,
      phase: "result",
      party: party.id,
      cell: target,
      outcome: "unopposed",
    });
  };

  return {
    addWork(cityId, weightedWorkMs) {
      workToday.set(cityId, (workToday.get(cityId) ?? 0) + weightedWorkMs);
    },
    addBattle(cityId) {
      addAt(cityId, o.rules().battle);
    },
    endOfDay(nowMs, day) {
      const c = o.rules();
      // 오염원: 휴먼(도시마다 하루), 시설 일(오늘 모은 몫)
      const humans = new Map<number, number>();
      for (const unit of world.units.values()) humans.set(unit.city, (humans.get(unit.city) ?? 0) + 1);
      for (const city of [...world.cities.values()].toSorted((a, b) => a.id - b.id))
        addAt(city.id, humanPollution(humans.get(city.id) ?? 0, c));
      for (const cityId of [...workToday.keys()].toSorted((a, b) => a - b))
        addAt(cityId, facilityPollution(workToday.get(cityId) ?? 0));
      workToday.clear();
      layer = dailyPollutionStep(layer, grid, c, o.isForest);

      // 도시 웨이브: 도시마다 굴림 하나(진군 중인 도시도 굴림은 뺀다 — 굴림 수를 같게)
      const rng = streamRng(o.seed, STREAM_GARDENER, 0, day);
      const busy = new Set([...waves.values()].map((wave) => wave.city));
      for (const city of [...world.cities.values()].toSorted((a, b) => a.id - b.id)) {
        const roll = rng.nextInt(1000);
        const cell = o.cellOf(city.id);
        const owner = world.factions.get(city.owner);
        if (cell === undefined || !owner?.alive || busy.has(city.id)) continue;
        const sum = influenceSum(layer, cell, grid, c.influenceRadius);
        const chance = waveChancePm(sum, (cooldownUntil.get(city.id) ?? 0) > nowMs, c);
        if (roll >= chance) continue;
        const want = waveStrength(
          { cities: owner.cities.size, humans: owner.units.size, treasury: o.treasuryOf(owner) },
          c,
        );
        const strength = grantGardenerUnits(want, inUse(), c);
        if (strength === 0) {
          counts.budgetSkipped += 1;
          continue;
        }
        const pm = physicalPm(sum, c);
        const wave: GardenerWave = {
          id: nextWave,
          city: city.id,
          faction: owner.id,
          strength,
          physical: physicalCount(strength, pm),
          createdAtMs: nowMs,
          arriveAtMs: waveArrivalMs(nowMs, 0, { ...c, noticeMs: scaled(c.noticeMs) }),
          state: "marching",
          battleId: null,
          eventId: undefined,
        };
        nextWave += 1;
        wave.eventId = o.schedule(wave.arriveAtMs, EVENT_WAVE, wave.id);
        waves.set(wave.id, wave);
        counts.noticed += 1;
        counts.strengthMax = Math.max(counts.strengthMax, strength);
        o.recorder.wave(nowMs, {
          kind: "city",
          phase: "notice",
          wave: wave.id,
          city: city.id,
          faction: owner.id,
          sum,
          chancePm: chance,
          strength,
          physical: wave.physical,
          arriveAtMs: wave.arriveAtMs,
        });
      }
      // Map은 돌면서 지금 항목을 지워도 된다
      for (const [cityId, until] of cooldownUntil) if (until <= nowMs) cooldownUntil.delete(cityId);

      // 유목 부대: 목표가 없으면 고르고, 없으면 떠돈다(부대마다 굴림 하나)
      const inInfluence = influenceSet(c);
      for (const party of nomads) {
        const roll = rng.nextInt(0x1_0000);
        for (const [cell, until] of party.excluded) if (until <= nowMs) party.excluded.delete(cell);
        if (party.target !== null) continue;
        if (!march(party, nowMs, c, inInfluence))
          party.cell = roamCell(party.cell, grid, c.nomadDetect, roll);
      }

      let total = 0;
      let max = 0;
      for (const value of layer.values()) {
        total += value;
        max = Math.max(max, value);
      }
      o.recorder.gardener(day, { cells: layer.size, total, max, waves: waves.size, inUse: inUse() });
    },
    handle(kind, subject, nowMs) {
      if (kind === EVENT_WAVE) arrive(subject, nowMs);
      else if (kind === EVENT_NOMAD) nomadArrive(subject, nowMs);
      else return false;
      return true;
    },
    resolve,
    disband(waveId, nowMs) {
      const wave = waves.get(waveId);
      if (!wave) return;
      counts.disbanded += 1;
      finish(wave, "disbanded", nowMs);
    },
    takeResolved() {
      return resolvedOut.splice(0, resolvedOut.length);
    },
    layer: () => layer,
    waves,
    cooldownUntil,
    nomads,
    nextWaveId: () => nextWave,
    inUse,
    summary() {
      let total = 0;
      let max = 0;
      for (const value of layer.values()) {
        total += value;
        max = Math.max(max, value);
      }
      return {
        pollution: { cells: layer.size, total, max },
        waves: {
          noticed: counts.noticed,
          battles: counts.battles,
          won: counts.won,
          failed: counts.failed,
          undefended: counts.undefended,
          noSiege: counts.noSiege,
          disbanded: counts.disbanded,
          budgetSkipped: counts.budgetSkipped,
          strengthMax: counts.strengthMax,
        },
        nomads: { marches: counts.marches, raids: counts.raids, retargets: counts.retargets },
      };
    },
    check() {
      const c = o.rules();
      const problems: string[] = [];
      if (inUse() > mothershipCap(c))
        problems.push(`G1 gardener units in use over the mothership cap: ${inUse()}`);
      let badCells = 0;
      for (const value of layer.values())
        if (!Number.isInteger(value) || value < 1 || value > c.cellMax) badCells += 1;
      if (badCells > 0) problems.push(`G2 pollution cells out of range: ${badCells}`);
      let unscheduled = 0;
      for (const wave of waves.values())
        if (wave.state === "marching" && wave.eventId === undefined) unscheduled += 1;
      if (unscheduled > 0) problems.push(`G3 marching waves without an arrival: ${unscheduled}`);
      return problems;
    },
  };
}
