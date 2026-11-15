// 사이보그 판 채집 예상의 시간당 기대 금액 — 기획 D-556 1255·1256("최적 = 돈 되는 일" — 기대 티어 × 시세), D-562 1569("그 도시 거래소 체결가
// (기술 추천)"). 표시만 하고 판정에 쓰지 않는다. 판정과 같은 순서로 센다:
// - 티어 확률(‰) = 확률표 구간(레벨 보너스 든 유효 스탯, select는 해금 티어 한 칸)을 시설 오브젝트 묶음 위 끝으로 접는다(@terra/shared/npcGatherTiers
//   — 자리를 모르면 그 시설이 맡는 오브젝트 묶음 모두: 광석은 산지 묶음, 낚시터는 모든 물 묶음).
// - 그 티어 아이템 = 묶음의 같은 티어 비중(대표 아이템·비중 적은 아이템)이 있으면 그대로, 없으면 고르게. 그 티어에 아이템이 없으면 더 낮은 티어
//   (@terra/sim pickGatherItem과 같다).
// - 한 번 시도 기대 금액 = 성공 ‰ × Σ 티어 ‰ × 그 티어 아이템 시세 평균 × 한 번 개수. 한 번 시도 기대 시간 = 성공한 번은 나온 티어의 필요 진행,
//   실패한 번은 T0 필요 진행(49 N44) × 틱 ÷ 진행 속도. 시간당 = 기대 금액 × 1시간 ÷ 기대 시간(내림).
// - 시세 = 그 유닛이 있는 도시 거래소의 마지막 체결가(없으면 시작 시세 — NPC 매물 값과 같은 규칙). 한 개 = 거래 묶음 하나로 센다.
// 금액은 BigInt 정수로만 센다(실수 없음).

/** 한 시간(ms) */
const HOUR_MS = 3_600_000n;
/** 같은 티어 아이템 몫을 나눌 때 쓰는 배율(시세 × 1000을 내림) */
const SCALE = 1000n;

export interface GatherValueInput {
  /** T0~T9 확률(‰) — 묶음 위 끝으로 접기 전 */
  readonly tierPm: readonly number[];
  /** 시설 오브젝트 묶음 위 끝(없으면 접지 않는다) */
  readonly maxTier?: number | undefined;
  /** 시설 사다리: 티어마다 켜진 아이템 ID(팩 차례) */
  readonly ladder: readonly (readonly string[])[];
  /** 같은 티어 아이템 비중(아이템 ID → 비중). 그 티어에 적은 것이 없으면 고르게 */
  readonly weights?: ReadonlyMap<string, number> | undefined;
  /** 아이템 시세(최소 단위)와 거래소 체결가인가 */
  readonly priceOf: (item: string) => { readonly price: bigint; readonly market: boolean };
  readonly yieldPerLot: number;
  /** 진행 속도(틱마다) */
  readonly progress: number;
  /** 한 번 시도의 성공 ‰(없으면 늘 성공) */
  readonly catchPm?: number | undefined;
  readonly tierProgressBase: number;
  readonly tierProgressStep: number;
  readonly tickMs: number;
}

export interface GatherValue {
  /** 시간당 기대 금액(최소 단위, 내림) */
  readonly perHour: bigint;
  /** 값에 든 시세 가운데 거래소 체결가가 하나라도 있나(없으면 모두 시작 시세) */
  readonly market: boolean;
}

/** 필요 진행(49 N44, @terra/shared/gatherMath tierRequiredProgress와 같은 식) */
const need = (tier: number, base: number, step: number): number =>
  Math.max(base, base + Math.max(0, tier) * step);

/** 그 티어(없으면 더 낮은 티어)의 아이템 시세 평균 × 1000(비중 → 고르게). 아이템이 없으면 undefined */
function tierPriceMilli(
  input: GatherValueInput,
  tier: number,
): { tier: number; milli: bigint; market: boolean } | undefined {
  for (let t = tier; t >= 0; t--) {
    const choices = input.ladder[t] ?? [];
    if (choices.length === 0) continue;
    const weighted = choices.filter((item) => (input.weights?.get(item) ?? 0) > 0);
    const picks = weighted.length > 0 ? weighted : choices;
    let total = 0n;
    let sum = 0n;
    let market = false;
    for (const item of picks) {
      const weight = BigInt(weighted.length > 0 ? Math.trunc(input.weights?.get(item) ?? 0) : 1);
      const price = input.priceOf(item);
      total += weight;
      sum += weight * price.price;
      market ||= price.market;
    }
    return { tier: t, milli: total > 0n ? (sum * SCALE) / total : 0n, market };
  }
  return undefined;
}

/** 시간당 기대 금액(머리 주석). 진행이 0이거나 확률이 비면 0 */
export function gatherValuePerHour(input: GatherValueInput): GatherValue {
  const top = input.maxTier === undefined ? input.tierPm.length - 1 : Math.max(0, Math.trunc(input.maxTier));
  const folded = Array.from({ length: input.tierPm.length }, () => 0);
  input.tierPm.forEach((pm, tier) => {
    const at = Math.min(tier, top);
    folded[at] = (folded[at] ?? 0) + Math.max(0, Math.trunc(pm));
  });
  const catchPm = BigInt(Math.max(0, Math.min(1000, Math.trunc(input.catchPm ?? 1000))));
  const base = input.tierProgressBase;
  const step = input.tierProgressStep;
  let valueMilli = 0n;
  let workPm = 0n;
  let totalPm = 0n;
  let market = false;
  folded.forEach((pm, tier) => {
    if (pm <= 0) return;
    const found = tierPriceMilli(input, tier);
    const p = BigInt(pm);
    totalPm += p;
    if (!found) {
      workPm += p * BigInt(need(0, base, step));
      return;
    }
    market ||= found.market;
    valueMilli += p * found.milli;
    workPm += p * BigInt(need(found.tier, base, step));
  });
  const speed = BigInt(Math.max(0, Math.trunc(input.progress)));
  if (totalPm === 0n || speed === 0n) return { perHour: 0n, market };
  // 한 번 시도: 금액(× 10⁹) = 성공 ‰ × Σ (티어 ‰ × 시세 × 1000) × 개수, 진행(× 10⁶) = 성공 ‰ × Σ 티어 ‰ × 필요 + 실패 ‰ × 1000 × T0 필요
  const amount = catchPm * valueMilli * BigInt(Math.max(0, Math.trunc(input.yieldPerLot)));
  const work = catchPm * workPm + (1000n - catchPm) * totalPm * BigInt(need(0, base, step));
  // 시간(ms) = 진행 × 틱 ÷ 속도 → 시간당 = (금액 ÷ 10⁹) × 1시간 × 속도 ÷ ((진행 ÷ 10⁶) × 틱)
  const tick = BigInt(Math.max(1, Math.trunc(input.tickMs)));
  const perHour = (amount * HOUR_MS * speed) / (work * tick * SCALE);
  return { perHour, market };
}
