// 정원사 실행(오염 층 + 도시 웨이브 + 유목 부대) — docs/adr/2026-11-01-gardener-r5b.md 4절
// 시뮬레이터(run.ts)와 서버 NPC 런타임(apps/server/src/npc/)이 같은 함수를 부른다. 다른 것은 부르는 쪽이 준다:
// 칸 모양(grid·cellOf: 시뮬 = 합성 격자, 서버 = 행성 칸 키·neighbors8), 웨이브 전투(fight: 시뮬 = runBattle로 바로 결과,
// 서버 = 전투 서비스에 넣고 "pending" → 끝나면 resolve), 시간 배율(서버 측정용 NPC_DAY_MS).
// 하루 끝(endOfDay): 오염원(휴먼·시설 일) → 하루 바뀜(숲·감소·퍼짐) → 도시마다 웨이브 굴림(예고·도착 예약) → 유목 부대 목표·떠돎.
// 전투 한 번(공성·반란·조우·웨이브)은 그때 그 칸에 +battle. 웨이브 도착: 수비 휴먼이 없으면 웨이브가 이긴다.
// 이기면 시작 도시는 건물 피해(society.damage), 다른 도시는 폐허(society.ruin, 떠도는 세력 D-464 217). 지면 그 도시 쉬는 시간.
// 굴림 수는 날마다 같다(도시마다 하나, 유목 부대마다 하나 — 무엇이 일어나든 다음 굴림이 밀리지 않게).
// 정원사 2("바뀜 (2026-11-07)"): 하루 끝에 전쟁 중인 세력의 도시 칸 오염(D-509) → 세력 오염·관계도(gardenerFactions.ts, 49 N52) →
// 도시 굴림은 관계도 단계 배율을 곱하고, 웨이브는 세력 오염이 높은 세력부터 모함 몫을 받는다(목표 순위, D-509). 세기에 세력 오염 항.
// 필수 NPC 세력의 도시를 친 세력에게 보호 레이드(protect, D-500: 보상 없음). 막아 낸 도시 웨이브는 보상(D-499, onReward).
import type { GardenerCoefficients } from "../gardener/coefficients.ts";
import {
  type NomadParty,
  nomadFits,
  nomadSize,
  nomadTarget,
  roamCell,
  startingNomads,
} from "../gardener/nomads.ts";
import {
  type PollutionLayer,
  addPollution,
  dailyPollutionStep,
  facilityPollution,
  humanPollution,
  influenceCells,
  influenceSum,
  purify,
} from "../gardener/pollution.ts";
import { clampRelation, relationChancePm, relationStage } from "../gardener/relations.ts";
import { NO_REWARD, type WaveReward, waveReward } from "../gardener/rewards.ts";
import {
  type FactionScale,
  grantGardenerUnits,
  mothershipCap,
  physicalCount,
  physicalPm,
  raidStrength,
  waveArrivalMs,
  waveChancePm,
  waveStrength,
} from "../gardener/waves.ts";
import {
  factionPollutionOf,
  oldestCityOf,
  relationCounts,
  relationOf,
  updateRelations,
} from "./gardenerFactions.ts";
import type { GardenerOptions, GardenerRun, GardenerWave, ResolvedWave } from "./gardenerTypes.ts";
import { type SimCity, type SimFaction, type SimUnit, streamRng } from "./world.ts";

export type {
  GardenerOptions,
  GardenerRestore,
  GardenerRun,
  GardenerSummary,
  GardenerWave,
  ResolvedWave,
  WaveState,
} from "./gardenerTypes.ts";

export const EVENT_WAVE = "wave";
export const EVENT_NOMAD = "nomad";
/** 난수 흐름 6 = 정원사(1~5는 world.ts·society.ts) */
export const STREAM_GARDENER = 6;

/** 웨이브 승률(‰, 웨이브가 없으면 0) */
const rate = (bucket: { waves: number; won: number }): number =>
  bucket.waves === 0 ? 0 : Math.floor((bucket.won * 1000) / bucket.waves);

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
  const relations = new Map(o.restore?.relations ?? []);
  const renown = new Map(o.restore?.renown ?? []);
  let factionPollution = new Map<number, number>();
  /** 도시 → 오늘 모은 시설 일(레벨 × 오염 값 × ms) */
  const workToday = new Map<number, number>();
  const counts = {
    protectionNoticed: 0,
    protectionWon: 0,
    protectionRepelled: 0,
    protectionSkipped: 0,
    rewardWaves: 0,
    renown: 0,
    genes: 0,
    materials: 0,
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

  /** 웨이브 세기를 정하는 세력 규모(D-322) + 지난 하루 끝 세력 오염(D-509) */
  const scaleOf = (faction: SimFaction): FactionScale => ({
    cities: faction.cities.size,
    humans: faction.units.size,
    treasury: o.treasuryOf(faction),
    pollution: factionPollution.get(faction.id) ?? 0,
  });

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
    reward: WaveReward = NO_REWARD,
  ): void => {
    if (wave.eventId !== undefined) o.cancel(wave.eventId);
    waves.delete(wave.id);
    resolvedOut.push({ wave, outcome, atMs: nowMs, reward });
    o.recorder.wave(nowMs, {
      kind: wave.kind,
      phase: "result",
      wave: wave.id,
      city: wave.city,
      outcome,
      ...(reward === NO_REWARD ? {} : { reward }),
    });
  };

  /** 웨이브 → 생길 때 영향권 오염 합(목표 승률 셈, 이어 돌린 웨이브는 모른다) */
  const sumOf = new Map<number, number>();
  const outcomes = { band: { waves: 0, won: 0 }, below: { waves: 0, won: 0 } };
  const resolve = (waveId: number, won: boolean, nowMs: number): void => {
    const wave = waves.get(waveId);
    if (!wave) return;
    const c = o.rules();
    const city = world.cities.get(wave.city);
    const sum = sumOf.get(wave.id);
    sumOf.delete(wave.id);
    if (sum !== undefined) {
      const bucket = sum >= c.targetSum ? outcomes.band : outcomes.below;
      bucket.waves += 1;
      if (won) bucket.won += 1;
    }
    const protection = wave.kind === "protection";
    if (won) {
      counts.won += 1;
      if (protection) counts.protectionWon += 1;
      const start = city?.start === true;
      if (city && start) o.society.damage(city.id, nowMs);
      else if (city) o.society.ruin(city.id, nowMs);
      finish(wave, start ? "damaged" : "ruined", nowMs);
      return;
    }
    counts.failed += 1;
    // 보호 레이드는 막아도 아무것도 얻지 않는다(쉬는 시간도 없음, D-500 "보상은 없어야 그걸 노리고 공격하는 세력이 없어짐")
    if (protection) {
      counts.protectionRepelled += 1;
      finish(wave, "repelled", nowMs);
      return;
    }
    cooldownUntil.set(wave.city, nowMs + scaled(c.cooldownMs));
    const reward = waveReward(wave.kind, wave.strength, c);
    const owner = city ? world.factions.get(city.owner) : undefined;
    if (owner?.alive && (reward.renown > 0 || reward.genes > 0 || reward.materials > 0)) {
      counts.rewardWaves += 1;
      counts.renown += reward.renown;
      counts.genes += reward.genes;
      counts.materials += reward.materials;
      renown.set(owner.id, (renown.get(owner.id) ?? 0) + reward.renown);
      o.onReward?.(wave, owner.id, reward, nowMs);
      finish(wave, "repelled", nowMs, reward);
    } else finish(wave, "repelled", nowMs);
  };

  const arrive = (waveId: number, nowMs: number): void => {
    const wave = waves.get(waveId);
    if (!wave || wave.state !== "marching") return;
    wave.eventId = undefined;
    const city = world.cities.get(wave.city);
    const owner = city ? world.factions.get(city.owner) : undefined;
    // 보호 레이드는 그 공격자만 친다: 그 도시 주인이 바뀌었으면 흩어진다
    if (!city || !owner?.alive || (wave.kind === "protection" && owner.id !== wave.faction)) {
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
    protect(attacker, target, cityId, nowMs) {
      if (!target.fixed || !attacker.alive || attacker.id === target.id) return false;
      const c = o.rules();
      const want = raidStrength(scaleOf(attacker), c);
      // 세기 배율 0(서버 웨이브 끔 스위치) = 레이드 없음
      if (want <= 0) return false;
      const home = oldestCityOf(attacker, o.cellOf);
      if (home === undefined || [...waves.values()].some((wave) => wave.city === home)) {
        counts.protectionSkipped += 1;
        return false;
      }
      const strength = grantGardenerUnits(want, inUse(), c);
      if (strength === 0) {
        counts.budgetSkipped += 1;
        return false;
      }
      const wave: GardenerWave = {
        id: nextWave,
        kind: "protection",
        city: home,
        faction: attacker.id,
        strength,
        physical: physicalCount(strength, c.raidPhysicalPm),
        createdAtMs: nowMs,
        arriveAtMs: waveArrivalMs(nowMs, 0, { ...c, noticeMs: scaled(c.noticeMs) }),
        state: "marching",
        battleId: null,
        eventId: undefined,
      };
      nextWave += 1;
      wave.eventId = o.schedule(wave.arriveAtMs, EVENT_WAVE, wave.id);
      waves.set(wave.id, wave);
      counts.protectionNoticed += 1;
      counts.strengthMax = Math.max(counts.strengthMax, strength);
      o.recorder.wave(nowMs, {
        kind: "protection",
        phase: "notice",
        wave: wave.id,
        city: home,
        faction: attacker.id,
        target: target.id,
        attacked: cityId,
        strength,
        physical: wave.physical,
        arriveAtMs: wave.arriveAtMs,
      });
      return true;
    },
    purify(cityId) {
      const c = o.rules();
      const cell = o.cellOf(cityId);
      if (cell === undefined) return;
      purify(layer, cell, c);
      const owner = world.factions.get(world.cities.get(cityId)?.owner ?? -1);
      if (owner?.alive)
        relations.set(
          owner.id,
          clampRelation(relationOf(relations, owner, c) + c.relationPurifyGain, owner.fixed, c),
        );
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
      // 전쟁 중인 세력의 도시 칸(D-509 "전쟁이면 훨씬 크게"): 전투 한 번(+battle)과 따로 하루마다
      for (const faction of [...world.factions.values()].toSorted((a, b) => a.id - b.id))
        if (faction.alive && faction.wars.size > 0)
          for (const cityId of [...faction.cities].toSorted((a, b) => a - b)) addAt(cityId, c.warDaily);
      layer = dailyPollutionStep(layer, grid, c, o.isForest);
      // 세력 오염(D-509) → 관계도(49 N52, D-510)
      factionPollution = factionPollutionOf(world, layer, grid, o.cellOf, c.influenceRadius);
      updateRelations(world, relations, factionPollution, c);

      // 도시 웨이브: 도시마다 굴림 하나(진군 중인 도시도 굴림은 뺀다 — 굴림 수를 같게). 확률 = 칸 오염(C14) × 관계도 단계 배율
      const rng = streamRng(o.seed, STREAM_GARDENER, 0, day);
      const busy = new Set([...waves.values()].map((wave) => wave.city));
      const hits: { city: SimCity; owner: SimFaction; sum: number; chance: number }[] = [];
      for (const city of [...world.cities.values()].toSorted((a, b) => a.id - b.id)) {
        const roll = rng.nextInt(1000);
        const cell = o.cellOf(city.id);
        const owner = world.factions.get(city.owner);
        if (cell === undefined || !owner?.alive || busy.has(city.id)) continue;
        const sum = influenceSum(layer, cell, grid, c.influenceRadius);
        const stage = relationStage(relationOf(relations, owner, c), c);
        const chance = relationChancePm(
          waveChancePm(sum, (cooldownUntil.get(city.id) ?? 0) > nowMs, c),
          stage,
          c,
        );
        if (roll < chance) hits.push({ city, owner, sum, chance });
      }
      // 목표 순위(D-509): 세력 오염이 높은 세력의 도시부터 모함 몫을 받는다(같으면 도시 ID 차례)
      const rank = (faction: SimFaction): number => factionPollution.get(faction.id) ?? 0;
      hits.sort((a, b) => rank(b.owner) - rank(a.owner) || a.city.id - b.city.id);
      for (const { city, owner, sum, chance } of hits) {
        const want = waveStrength(scaleOf(owner), c);
        const strength = grantGardenerUnits(want, inUse(), c);
        if (strength === 0) {
          counts.budgetSkipped += 1;
          continue;
        }
        const pm = physicalPm(sum, c);
        const wave: GardenerWave = {
          id: nextWave,
          kind: "city",
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
        sumOf.set(wave.id, sum);
        counts.noticed += 1;
        counts.strengthMax = Math.max(counts.strengthMax, strength);
        o.recorder.wave(nowMs, {
          kind: "city",
          phase: "notice",
          wave: wave.id,
          city: city.id,
          faction: owner.id,
          sum,
          factionSum: rank(owner),
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
      o.recorder.gardener(day, {
        cells: layer.size,
        total,
        max,
        waves: waves.size,
        inUse: inUse(),
        // 세력마다 [세력 ID, 세력 오염, 관계도](세력 ID 차례, 49 N52·D-509)
        factions: [...factionPollution.keys()].map((id) => [
          id,
          factionPollution.get(id) ?? 0,
          relations.get(id) ?? 0,
        ]),
      });
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
    relations,
    renown,
    get factionPollution() {
      return factionPollution;
    },
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
        protection: {
          noticed: counts.protectionNoticed,
          won: counts.protectionWon,
          repelled: counts.protectionRepelled,
          skipped: counts.protectionSkipped,
        },
        relations: relationCounts(world, relations, o.rules()),
        rewards: {
          waves: counts.rewardWaves,
          renown: counts.renown,
          genes: counts.genes,
          materials: counts.materials,
        },
        target: {
          sumAtLeast: o.rules().targetSum,
          goalPm: o.rules().targetWinPm,
          band: { ...outcomes.band, winPm: rate(outcomes.band) },
          below: { ...outcomes.below, winPm: rate(outcomes.below) },
        },
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
