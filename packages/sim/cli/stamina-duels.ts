// 스태미나 견주기(질문 274·D-511) — docs/research/2026-11-03-gardener-stamina-measure.md, ADR combat-core "바뀜 (274 스태미나 적정 스탯 개념)"
// 밸런스 화면 대결과 같은 판(statFighterSpecs → duelInit → runBattle, 시드 가르기도 runDuels와 같다)을 팩 가중치 표·설정 칸·
// 계산식·무기로 돌려, 새 사이보그(1차 모두 10, Lv 1)끼리 맨손·시험 검 대결이 걸리는 시간을 지금 스태미나 값과 다른 값에서 잰다.
// 다른 값은 메모리에서만 얹는다(팩·판정 코드는 그대로, 값은 개발자 페이지에서 맞춘다 D-511). 대조로 Lv 30 균형형(1차 모두 39, Lv 30)
// 검 대 검과, 적정 비율 확인(같은 1차 39를 Lv 60으로 = 적정 STA 69, 점수 39 → 비율 0.57) 검 대 검도 잰다.
// 사용: pnpm --filter @terra/sim duel:stamina [--runs 20] [--seed 1] [--limit 600] [--map 64] [--only now,basic_free]
//   결과는 같은 입력이면 같다. 걸린 시간은 표준 오류.
import { parseArgs } from "node:util";
import {
  type CombatCoefficients,
  type CombatUnitSpec,
  type Primaries,
  type WeaponSpec,
  UNARMED,
  combatCoefficientsFrom,
  combatFormulaSetFrom,
  duelInit,
  mix32,
  parseScenario,
  runBattle,
  specStaminaCostMilli,
  staminaAppropriateOf,
  statFighterSpecs,
} from "../src/index.ts";
import { DEFAULT_PACK_DIR, readPack } from "./common.ts";

const { values } = parseArgs({
  options: {
    runs: { type: "string", default: "20" },
    seed: { type: "string", default: "1" },
    limit: { type: "string", default: "600" },
    map: { type: "string", default: "64" },
    only: { type: "string", default: "" },
  },
});

/** 스태미나 설정 한 벌: 무기 기본 공격 소모·설정 칸·소모 식을 메모리에서 바꾼다 */
interface StaminaSetting {
  readonly id: string;
  readonly label: string;
  /** 모든 무기(맨손 포함)의 기본 공격 소모(무기 칸 staminaCost). 없으면 팩 값 */
  readonly weaponCost?: number;
  readonly tuning?: Readonly<Record<string, number>>;
  /** 계산식 stamina_cost 대체 글 */
  readonly costFormula?: string;
}

const SETTINGS: readonly StaminaSetting[] = [
  {
    id: "now",
    label: "팩: 무기 소모 10 × max(0.5, 적정 STA(레벨 식) ÷ STA 점수), 회복 720/분 × min(2, 점수 ÷ 적정)",
  },
  { id: "basic_free", label: "옛 모의 배틀: 기본 공격 소모 0", weaponCost: 0 },
];

const scenario = parseScenario({
  id: "stamina_duels",
  factions: [{ code: "cal", count: 1, fixed: true, cities: 1, workers: 1, credit: "0", tech: 1 }],
  npc: {},
});
const pack = readPack(DEFAULT_PACK_DIR, scenario);
const unarmed = pack.combat.unitKinds.find((kind) => kind.id === "human")?.naturalWeapon ?? UNARMED;
const packSword = pack.combat.equipment.find((item) => item.id === "test_sword")?.weapon;
if (!packSword) throw new Error("팩에 test_sword 무기가 없습니다");
const sword: WeaponSpec = packSword;
const runs = Number(values.runs);
const seedBase = Number(values.seed);
const limitMs = Number(values.limit) * 1000;
const mapSize = Number(values.map);
const only = values.only.split(",").filter((id) => id.trim() !== "");

const even = (value: number): Primaries => ({
  str: value,
  vit: value,
  int: value,
  wis: value,
  dex: value,
  agi: value,
});
const NEW = even(10);
const LV30 = even(39);

interface Side {
  readonly primaries: Primaries;
  readonly weapon: "bare" | "sword";
  readonly count: number;
  /** 레벨(적정 STA·맨손 적정). 없으면 1 */
  readonly level?: number;
}
interface Matchup {
  readonly label: string;
  readonly a: Side;
  readonly b: Side;
}
const MATCHUPS: readonly Matchup[] = [
  {
    label: "새 맨손 1:1",
    a: { primaries: NEW, weapon: "bare", count: 1 },
    b: { primaries: NEW, weapon: "bare", count: 1 },
  },
  {
    label: "새 검 1:1",
    a: { primaries: NEW, weapon: "sword", count: 1 },
    b: { primaries: NEW, weapon: "sword", count: 1 },
  },
  {
    label: "새 맨손 3:3",
    a: { primaries: NEW, weapon: "bare", count: 3 },
    b: { primaries: NEW, weapon: "bare", count: 3 },
  },
  {
    label: "새 검 3:3",
    a: { primaries: NEW, weapon: "sword", count: 3 },
    b: { primaries: NEW, weapon: "sword", count: 3 },
  },
  {
    label: "새 검 대 새 맨손 1:1",
    a: { primaries: NEW, weapon: "sword", count: 1 },
    b: { primaries: NEW, weapon: "bare", count: 1 },
  },
  {
    label: "Lv30 검 3:3(대조)",
    a: { primaries: LV30, weapon: "sword", count: 3, level: 30 },
    b: { primaries: LV30, weapon: "sword", count: 3, level: 30 },
  },
  {
    label: "Lv30 검 3:3, 같은 1차로 Lv 60(적정 비율 0.57) 대 Lv 30",
    a: { primaries: LV30, weapon: "sword", count: 3, level: 60 },
    b: { primaries: LV30, weapon: "sword", count: 3, level: 30 },
  },
  {
    label: "Lv30 검 1:1, 같은 1차로 Lv 60 대 Lv 30",
    a: { primaries: LV30, weapon: "sword", count: 1, level: 60 },
    b: { primaries: LV30, weapon: "sword", count: 1, level: 30 },
  },
];

/** 설정 한 벌의 계수표와 무기 */
function prepared(setting: StaminaSetting): {
  c: CombatCoefficients;
  weapon: (kind: Side["weapon"]) => WeaponSpec;
} {
  const tuning = new Map(pack.tuning);
  for (const [id, value] of Object.entries(setting.tuning ?? {})) tuning.set(id, value);
  const formulas =
    setting.costFormula === undefined
      ? pack.combatFormulas
      : combatFormulaSetFrom({
          ...Object.fromEntries(pack.formulaEntries.map((entry) => [entry.id, entry.expression])),
          stamina_cost: setting.costFormula,
        });
  const c = combatCoefficientsFrom(tuning, undefined, formulas);
  const withCost = (weapon: WeaponSpec): WeaponSpec =>
    setting.weaponCost === undefined ? weapon : { ...weapon, staminaCost: setting.weaponCost };
  return { c, weapon: (kind) => withCost(kind === "bare" ? unarmed : sword) };
}

/** 한 편의 전투 사양(밸런스 화면과 같은 변환) */
function specs(side: Side, weapon: WeaponSpec, c: CombatCoefficients): CombatUnitSpec[] {
  return statFighterSpecs(
    { primaries: side.primaries, weapon, count: side.count, level: side.level },
    pack.combat.statTable,
    c,
  );
}

/** 사양 하나의 스태미나 숫자: 최대·분당 회복·한 번 소모·간격, 버티는 분당 공격 수 */
function staminaLine(spec: CombatUnitSpec, c: CombatCoefficients): string {
  const cost = specStaminaCostMilli(spec, spec.staminaCost, c) / 1000;
  const perMinute = Math.min(60_000 / spec.attackIntervalMs, cost <= 0 ? Infinity : spec.staminaRegen / cost);
  const appropriate = staminaAppropriateOf(spec) / 1000;
  return `STA 점수 ${spec.staminaScore}·적정 ${appropriate}·최대 ${spec.staminaMax}·회복 분당 ${spec.staminaRegen}·소모 ${cost}·간격 ${spec.attackIntervalMs}ms → 처음 ${
    cost <= 0 ? "∞" : Math.floor(spec.staminaMax / cost)
  }번, 그 뒤 분당 ${perMinute.toFixed(1)}번(간격대로면 ${(60_000 / spec.attackIntervalMs).toFixed(1)}번)`;
}

const percentile = (sorted: readonly number[], p: number): number =>
  sorted.length === 0 ? 0 : (sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))] ?? 0);

const started = performance.now();
console.log(
  `판 ${runs} · 시드 ${seedBase} · 제한 ${limitMs / 1000}초 · 지도 ${mapSize} · 팩 ${pack.version}`,
);
for (const setting of SETTINGS) {
  if (only.length > 0 && !only.includes(setting.id)) continue;
  const { c, weapon } = prepared(setting);
  console.log(`\n## ${setting.id} — ${setting.label}`);
  for (const [name, primaries, level] of [
    ["새 사이보그(Lv 1)", NEW, 1],
    ["Lv30 균형형(Lv 30)", LV30, 30],
    ["Lv30 균형형 1차, Lv 60(적정 비율 0.57)", LV30, 60],
    ["Lv30 균형형, AGI·VIT 19(STA 점수 절반 → 비율 0.49)", { ...LV30, agi: 19, vit: 19 }, 30],
  ] as const)
    for (const kind of ["bare", "sword"] as const) {
      const spec = specs({ primaries, weapon: kind, count: 1, level }, weapon(kind), c)[0];
      if (spec) console.log(`- ${name} ${kind === "bare" ? "맨손" : "검"}: ${staminaLine(spec, c)}`);
    }
  for (const matchup of MATCHUPS) {
    const from = performance.now();
    const a = specs(matchup.a, weapon(matchup.a.weapon), c);
    const b = specs(matchup.b, weapon(matchup.b.weapon), c);
    let aWins = 0;
    let bWins = 0;
    let timeouts = 0;
    const seconds: number[] = [];
    for (let run = 0; run < runs; run++) {
      const { result } = runBattle(
        duelInit(a, b, mix32(seedBase ^ Math.imul(run + 1, 0x9e37_79b1)), mapSize, limitMs),
        [],
        undefined,
        c,
      );
      if (result.reason === "timeout") timeouts += 1;
      else if (result.winner === 1) aWins += 1;
      else bWins += 1;
      seconds.push((result.endTick * c.tickMs) / 1000);
    }
    seconds.sort((x, y) => x - y);
    const avg = seconds.reduce((total, value) => total + value, 0) / Math.max(1, seconds.length);
    console.log(
      `| ${matchup.label} | a ${aWins} · b ${bWins} · 시간 초과 ${timeouts} | 평균 ${avg.toFixed(1)}초 · 가운데 ${percentile(seconds, 50).toFixed(1)}초 · 90% ${percentile(seconds, 90).toFixed(1)}초 | ${Math.round(performance.now() - from)}ms |`,
    );
  }
}
console.error(`wall=${Math.round(performance.now() - started)}ms`);
