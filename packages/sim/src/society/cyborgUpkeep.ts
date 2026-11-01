// 사이보그 유지 — 인공장기 내구도와 생활비 효율. 기획 D-453(D-445 178 대체), D-150(유닛 유지비 = 생필품 요구량의 합),
// D-5031·49 F11·F12(장비 수리), 49 N38. docs/adr/2026-10-31-faction-society-core.md "바뀜 (2026-11-01, D-450~D-453)".
// - 생활비: 사이보그 본체도 유닛 유지비(D-150)를 같은 규칙으로 낸다(서버 정산 apps/server/src/world/settlement.ts가 본체를 센다).
//   못 내도 멈추지 않고 효율 불이익(N38 ‰)으로 돌아간다(노숙 불이익과 같은 결, D-296 해석). 보유 유닛 수 상한(D-153)에는 그대로
//   세지 않는다(D-445 178 해석 유지, D-453).
// - 인공장기 내구도: 유지비 경계(정시, settle.ts UPKEEP_PERIOD_MS)마다 N38만큼 닳는다(나눠 계산해도 같다). 0이면 그 인공장기는
//   일하지 않는다(스탯·스킬 보너스 없음, 해석). 수리는 장비 수리 규칙(D-5031)을 그대로 쓴다: 최대 내구도가 시설 레벨(F11)만큼 줄고
//   장인 실력이 그 폭을 반까지 줄인다(하한 F11). 최대 내구도가 F12 이하면 파괴(분해만 가능).
// - 인공장기·장비 내구도를 저장하는 곳(아이템 인스턴스)은 아직 없다. 이 함수들은 데이터 고리이고 서버 연결은 R5다.
// 정수만 쓴다.
import { UPKEEP_PERIOD_MS, upkeepBoundaries } from "../settle/settle.ts";
import type { SocietyCoefficients } from "./coefficients.ts";

/** 내구도가 있는 인공장기·장비 한 개 */
export interface Durable {
  readonly durability: number;
  readonly maxDurability: number;
}

export interface RepairResult<T extends Durable> {
  readonly organ: T;
  /** 최대 내구도가 F12 이하가 돼 파괴됐다(분해만 가능) */
  readonly destroyed: boolean;
  /** 줄어든 최대 내구도 */
  readonly maxLoss: number;
  /** 되찾은 내구도 × N38 비용(최소 단위). 파괴되면 0 */
  readonly cost: bigint;
}

/** 생활비를 못 냈으면 N38 효율(‰), 냈으면 1000 */
export function livingEfficiencyPm(unpaid: boolean, c: SocietyCoefficients): number {
  return unpaid ? c.cyborg.livingUnpaidPm : 1000;
}

/** 값 × 효율‰ (내림) */
export function withEfficiency(value: number, pm: number): number {
  return Math.floor((value * pm) / 1000);
}

/** (fromMs, toMs] 안 유지비 경계마다 N38만큼 닳는다. 0에서 멈춘다. 경계가 없으면 같은 객체 */
export function wearOrgan<T extends Durable>(
  organ: T,
  fromMs: number,
  toMs: number,
  c: SocietyCoefficients,
): T {
  if (toMs <= fromMs) return organ;
  const periods = upkeepBoundaries(fromMs, toMs, UPKEEP_PERIOD_MS).length;
  const wear = periods * Math.max(0, c.cyborg.organWearPerPeriod);
  if (wear === 0 || organ.durability <= 0) return organ;
  return { ...organ, durability: Math.max(0, organ.durability - wear) };
}

/** 내구도가 남았는가(0이면 보너스 없음) */
export function organWorks(organ: Durable): boolean {
  return organ.durability > 0;
}

/**
 * 수리(D-5031): 감소‰ = 시설 레벨 감소% × 10 × (2000 − 실력‰) ÷ 2000(내림), 하한 F11. 줄어드는 최대 내구도 = ⌈최대 × 감소‰ ÷ 1000⌉.
 * 새 최대가 F12 이하면 파괴(내구도 0, 비용 없음). 아니면 내구도 = 새 최대, 비용 = 되찾은 내구도 × N38. 닳지 않았으면 그대로
 */
export function repairOrgan<T extends Durable>(
  organ: T,
  facilityLevel: number,
  skillPm: number,
  c: SocietyCoefficients,
): RepairResult<T> {
  const table = c.durability.repairLossPct;
  if (!Number.isInteger(facilityLevel) || facilityLevel < 1 || facilityLevel > table.length)
    throw new RangeError("facility level out of range");
  if (!Number.isInteger(skillPm) || skillPm < 0 || skillPm > 1000) throw new RangeError("skill out of range");
  if (organ.durability >= organ.maxDurability) return { organ, destroyed: false, maxLoss: 0, cost: 0n };
  const basePm = (table[facilityLevel - 1] ?? 0) * 10;
  const lossPm = Math.max(
    c.durability.repairLossFloorPct * 10,
    Math.floor((basePm * (2000 - skillPm)) / 2000),
  );
  const maxLoss = Math.floor((organ.maxDurability * lossPm + 999) / 1000);
  const maxDurability = Math.max(0, organ.maxDurability - maxLoss);
  if (maxDurability <= c.durability.destroyAtMax)
    return { organ: { ...organ, durability: 0, maxDurability }, destroyed: true, maxLoss, cost: 0n };
  const restored = Math.max(0, maxDurability - organ.durability);
  return {
    organ: { ...organ, durability: maxDurability, maxDurability },
    destroyed: false,
    maxLoss,
    cost: BigInt(restored) * BigInt(c.cyborg.organRepairCost),
  };
}
