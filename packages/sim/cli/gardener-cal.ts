// 정원사 웨이브 결과 맞추기(D-468, 49 C16a) — docs/adr/2026-11-01-gardener-r5b.md "바뀜 (D-468)"
// 웨이브 하나를 시뮬·서버와 같은 함수로 만든다: 세기(waveStrength) → 물리형(physicalPm·physicalCount) → 물리형 0이면 전투 없이 막힘,
// 아니면 웨이브 공성 전투(waveBattleInit + runWaveToEnd). 오염 합 구간마다 여러 전투 시드로 웨이브 승률을 잰다.
// 목표(C16a) = 오염 합 ≥ 기준(30,000)인 도시에 오는 웨이브의 약 1/3이 이김. 크리쳐 한 마리 = 수비 휴먼 한 명([임시], D-5024 전).
// 사용: pnpm --filter @terra/sim gardener:cal [--seeds 1,2,…] [--sums 10000,20000,30000,45000,60000]
//        [--defenders 10] [--tech 3] [--cities 4] [--humans 40] [--set 항목ID=값,…] [--grid base:4,6,8/divisor:200,100,50]
//        [--detail] [--stamina-cost N]
//   --set: 팩 설정 칸 값 위에 얹는다(예: c16_strength_base=6). --grid: 세기 기본 × 물리형 나눗수 조합마다 목표 구간 승률만 낸다.
//   --detail: 합마다(--grid면 조합마다) 끝난 까닭(넥서스·전멸·공성 크리쳐 다 잃음·공성 제한)과 전투 시간(평균·최대 초)·CPU(ms)도 낸다.
//   --stamina-cost: 모든 무기·타고난 무기의 기본 공격 스태미나 소모를 N으로(메모리에서만, 질문 274 견주기. 팩은 그대로).
//   걸린 시간은 표준 오류. 결과는 같은 입력이면 같다(전투 시드 = --seeds). CPU 값만 기계에 따라 다르다.
import { parseArgs } from "node:util";
import {
  createBattle,
  mix32,
  parseScenario,
  physicalCount,
  physicalPm,
  runWaveToEnd,
  societyCoefficientsFrom,
  combatCoefficientsFrom,
  waveBattleInit,
  waveStrength,
  type CombatCatalog,
  type GardenerCoefficients,
  type SimUnit,
  type WeaponSpec,
} from "../src/index.ts";
import { DEFAULT_PACK_DIR, readPack } from "./common.ts";

const { values } = parseArgs({
  options: {
    seeds: { type: "string", default: "1,2,3,4,5,6" },
    sums: { type: "string", default: "5000,15000,25000,30000,37500,45000,60000" },
    defenders: { type: "string", default: "10" },
    tech: { type: "string", default: "3" },
    cities: { type: "string", default: "4" },
    humans: { type: "string", default: "40" },
    set: { type: "string", default: "" },
    grid: { type: "string" },
    detail: { type: "boolean", default: false },
    "stamina-cost": { type: "string" },
  },
});

const list = (text: string): number[] =>
  text
    .split(",")
    .filter((part) => part.trim() !== "")
    .map(Number);
const scenario = parseScenario({
  id: "gardener_cal",
  factions: [{ code: "cal", count: 1, fixed: true, cities: 1, workers: 1, credit: "0", tech: 1 }],
  npc: {},
});
const pack = readPack(DEFAULT_PACK_DIR, scenario);
/** --stamina-cost: 무기 칸 staminaCost만 바꾼 전투 자료(메모리에서만) */
function withStaminaCost(catalog: CombatCatalog, cost: number | undefined): CombatCatalog {
  if (cost === undefined) return catalog;
  const weapon = (spec: WeaponSpec): WeaponSpec => ({ ...spec, staminaCost: cost });
  return {
    ...catalog,
    equipment: catalog.equipment.map((item) =>
      item.weapon ? { ...item, weapon: weapon(item.weapon) } : item,
    ),
    unitKinds: catalog.unitKinds.map((kind) => ({
      ...kind,
      naturalWeapon: weapon(kind.naturalWeapon),
      naturalElementalWeapon: weapon(kind.naturalElementalWeapon),
    })),
  };
}
const staminaCost = values["stamina-cost"];
const combatCatalog = withStaminaCost(
  pack.combat,
  staminaCost === undefined ? undefined : Number(staminaCost),
);
if (staminaCost !== undefined) console.log(`기본 공격 스태미나 소모 = ${staminaCost}(메모리에서만 덮어씀)`);
const base = new Map(pack.tuning);
for (const pair of values.set.split(",").filter((part) => part.includes("="))) {
  const [id, value] = pair.split("=");
  if (id) base.set(id.trim(), Number(value));
}
const seeds = list(values.seeds);
const sums = list(values.sums);
const defendersN = Number(values.defenders);
const tech = Number(values.tech);
const scale = { cities: Number(values.cities), humans: Number(values.humans), treasury: 0n };

const unit = (id: number): SimUnit => ({
  id,
  city: 1,
  owner: 1,
  job: { job: 0, phase: 0, progressMs: 0, fatigue: 0 },
  pos: { x: 0, y: 0 },
  tripStep: 0,
  eventId: undefined,
  satisfactionMilli: 60_000,
  bornAtMs: 0,
  lifespanMs: 0,
  parents: [],
  rebirths: 0,
});
const defenders = Array.from({ length: defendersN }, (_, index) => unit(index + 1));

/** 웨이브 하나의 끝: 막힘(물리형 0) · 웨이브 승(넥서스·전멸) · 수비 승(전멸·공성 크리쳐 다 잃음·공성 제한) */
type WaveEnd = "blocked" | "nexus" | "wipe" | "defWipe" | "spent" | "limit";
interface WaveOutcome {
  readonly end: WaveEnd;
  /** 전투 시간(게임 ms, 막힘은 0)과 계산 CPU(ms) */
  readonly battleMs: number;
  readonly cpuMs: number;
}

/** 오염 합 하나·시드 하나의 웨이브 */
function waveOutcome(tuning: ReadonlyMap<string, number>, sum: number, seed: number): WaveOutcome {
  const g: GardenerCoefficients = societyCoefficientsFrom(tuning).gardener;
  const combat = combatCoefficientsFrom(tuning);
  const strength = waveStrength(scale, g);
  const physical = physicalCount(strength, physicalPm(sum, g));
  if (physical === 0) return { end: "blocked", battleMs: 0, cpuMs: 0 };
  const cpuFrom = performance.now();
  const init = waveBattleInit(
    {
      battleId: 1,
      seed: mix32(seed ^ Math.imul(sum, 0x9e37_79b1)),
      defenderFaction: 1,
      defenders,
      defenderTech: tech,
      strength,
      physical,
      creatureTech: tech,
      firstCreatureId: 1_900_000_000,
      mapSize: 128,
      nexusDurability: 2000,
      maxDefenders: defendersN,
    },
    combatCatalog,
    combat,
  );
  const { state, result } = runWaveToEnd(createBattle(init, combat), []);
  const cpuMs = performance.now() - cpuFrom;
  const endTick = result?.endTick ?? state.tick;
  const battleMs = endTick * combat.tickMs;
  const end: WaveEnd =
    result?.winner === 1
      ? result.reason === "nexus"
        ? "nexus"
        : "wipe"
      : result?.reason === "wipe"
        ? "defWipe"
        : endTick < state.limitTicks
          ? "spent"
          : "limit";
  return { end, battleMs, cpuMs };
}

/** 웨이브가 이겼나 */
const won = (outcome: WaveOutcome): boolean => outcome.end === "nexus" || outcome.end === "wipe";

/** 끝난 까닭 수·전투 시간·CPU 한 줄(--detail) */
function detailOf(outcomes: readonly WaveOutcome[]): string {
  const count = (end: WaveEnd) => outcomes.filter((outcome) => outcome.end === end).length;
  const fought = outcomes.filter((outcome) => outcome.end !== "blocked");
  const avg = (pick: (outcome: WaveOutcome) => number) =>
    fought.length === 0 ? 0 : fought.reduce((total, outcome) => total + pick(outcome), 0) / fought.length;
  const max = (pick: (outcome: WaveOutcome) => number) => Math.max(0, ...fought.map(pick));
  return [
    `막힘 ${count("blocked")}`,
    `웨이브 승 넥서스 ${count("nexus")}·전멸 ${count("wipe")}`,
    `수비 승 전멸 ${count("defWipe")}·크리쳐 다 잃음 ${count("spent")}·공성 제한 ${count("limit")}`,
    `전투 ${fought.length}번 평균 ${(avg((o) => o.battleMs) / 1000).toFixed(1)}초·최대 ${(max((o) => o.battleMs) / 1000).toFixed(1)}초`,
    `CPU 평균 ${Math.round(avg((o) => o.cpuMs))}ms·최대 ${Math.round(max((o) => o.cpuMs))}ms`,
  ].join(" · ");
}

const started = performance.now();
const target = societyCoefficientsFrom(base).gardener;
if (values.grid !== undefined) {
  // 세기 기본 × 물리형 나눗수: 목표 구간(합 ≥ 기준) 합마다 승률
  const parts = Object.fromEntries(
    values.grid.split("/").map((part) => {
      const [key, nums] = part.split(":");
      return [key ?? "", list(nums ?? "")];
    }),
  );
  const band = sums.filter((sum) => sum >= target.targetSum);
  console.log(`목표 구간 합 ${band.join(",")} · 시드 ${seeds.length} · 수비 ${defendersN} · 기술 ${tech}`);
  for (const b of parts.base ?? [target.strengthBase])
    for (const d of parts.divisor ?? [target.physicalDivisor]) {
      const tuning = new Map(base);
      tuning.set("c16_strength_base", b);
      tuning.set("c17_physical_divisor", d);
      let wins = 0;
      let n = 0;
      const per: string[] = [];
      const all: WaveOutcome[] = [];
      for (const sum of band) {
        const outcomes = seeds.map((seed) => waveOutcome(tuning, sum, seed));
        const w = outcomes.filter(won).length;
        all.push(...outcomes);
        wins += w;
        n += seeds.length;
        per.push(`${sum}:${w}/${seeds.length}`);
      }
      console.log(
        `base ${b} divisor ${d}: ${wins}/${n} = ${Math.round((1000 * wins) / Math.max(1, n))}‰  (${per.join(" ")})`,
      );
      if (values.detail) console.log(`  ${detailOf(all)}`);
    }
} else {
  const g = target;
  console.log(
    `세기 ${waveStrength(scale, g)}(기본 ${g.strengthBase}) · 물리형 나눗수 ${g.physicalDivisor} · 수비 ${defendersN} · 기술 ${tech} · 시드 ${seeds.length} · 목표 ${g.targetWinPm}‰ @ 합 ≥ ${g.targetSum}`,
  );
  let bandWins = 0;
  let bandN = 0;
  for (const sum of sums) {
    const outcomes = seeds.map((seed) => waveOutcome(base, sum, seed));
    const w = outcomes.filter(won).length;
    const physical = physicalCount(waveStrength(scale, g), physicalPm(sum, g));
    console.log(
      `합 ${sum}: 물리형 ${physical} · 웨이브 승 ${w}/${seeds.length} = ${Math.round((1000 * w) / seeds.length)}‰`,
    );
    if (values.detail) console.log(`  ${detailOf(outcomes)}`);
    if (sum >= g.targetSum) {
      bandWins += w;
      bandN += seeds.length;
    }
  }
  console.log(
    `목표 구간(합 ≥ ${g.targetSum}): ${bandWins}/${bandN} = ${Math.round((1000 * bandWins) / Math.max(1, bandN))}‰`,
  );
}
console.error(`wall=${Math.round(performance.now() - started)}ms`);
