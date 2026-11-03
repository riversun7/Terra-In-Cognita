// 정원사 웨이브 결과 맞추기(D-468, 49 C16a) — docs/adr/2026-11-01-gardener-r5b.md "바뀜 (D-468)"
// 웨이브 하나를 시뮬·서버와 같은 함수로 만든다: 세기(waveStrength) → 물리형(physicalPm·physicalCount) → 물리형 0이면 전투 없이 막힘,
// 아니면 웨이브 공성 전투(waveBattleInit + runWaveToEnd). 오염 합 구간마다 여러 전투 시드로 웨이브 승률을 잰다.
// 목표(C16a) = 오염 합 ≥ 기준(30,000)인 도시에 오는 웨이브의 약 1/3이 이김. 크리쳐 한 마리 = 수비 휴먼 한 명([임시], D-5024 전).
// 사용: pnpm --filter @terra/sim gardener:cal [--seeds 1,2,…] [--sums 10000,20000,30000,45000,60000]
//        [--defenders 10] [--tech 3] [--cities 4] [--humans 40] [--set 항목ID=값,…] [--grid base:4,6,8/divisor:200,100,50]
//   --set: 팩 설정 칸 값 위에 얹는다(예: c16_strength_base=6). --grid: 세기 기본 × 물리형 나눗수 조합마다 목표 구간 승률만 낸다.
//   걸린 시간은 표준 오류. 결과는 같은 입력이면 같다(전투 시드 = --seeds).
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
  type GardenerCoefficients,
  type SimUnit,
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
  recruit: null,
  rebirths: 0,
});
const defenders = Array.from({ length: defendersN }, (_, index) => unit(index + 1));

/** 오염 합 하나·시드 하나의 웨이브: 이겼나(물리형 0이면 전투 없이 막힘) */
function waveWins(tuning: ReadonlyMap<string, number>, sum: number, seed: number): boolean {
  const g: GardenerCoefficients = societyCoefficientsFrom(tuning).gardener;
  const combat = combatCoefficientsFrom(tuning);
  const strength = waveStrength(scale, g);
  const physical = physicalCount(strength, physicalPm(sum, g));
  if (physical === 0) return false;
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
    pack.combat,
    combat,
  );
  const { result } = runWaveToEnd(createBattle(init, combat), []);
  return result?.winner === 1;
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
      for (const sum of band) {
        let w = 0;
        for (const seed of seeds) if (waveWins(tuning, sum, seed)) w += 1;
        wins += w;
        n += seeds.length;
        per.push(`${sum}:${w}/${seeds.length}`);
      }
      console.log(
        `base ${b} divisor ${d}: ${wins}/${n} = ${Math.round((1000 * wins) / Math.max(1, n))}‰  (${per.join(" ")})`,
      );
    }
} else {
  const g = target;
  console.log(
    `세기 ${waveStrength(scale, g)}(기본 ${g.strengthBase}) · 물리형 나눗수 ${g.physicalDivisor} · 수비 ${defendersN} · 기술 ${tech} · 시드 ${seeds.length} · 목표 ${g.targetWinPm}‰ @ 합 ≥ ${g.targetSum}`,
  );
  let bandWins = 0;
  let bandN = 0;
  for (const sum of sums) {
    let w = 0;
    for (const seed of seeds) if (waveWins(base, sum, seed)) w += 1;
    const physical = physicalCount(waveStrength(scale, g), physicalPm(sum, g));
    console.log(
      `합 ${sum}: 물리형 ${physical} · 웨이브 승 ${w}/${seeds.length} = ${Math.round((1000 * w) / seeds.length)}‰`,
    );
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
