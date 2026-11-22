// NPC 런타임 → NPC 세 들기 세계 몫(npcRent.ts NpcRentWorld) — 바뀜 npc-rent(질문 2674, D-555 1509). gather/world.ts가 사는 곳 장부를 붙일 때 늦게 읽는 고리로 넘긴다
// (NPC 런타임은 채집 세계보다 늦게 켜질 수 있다 — 없으면 NPC 세 들기를 건너뛴다).
// - 화폐: 그 도시 주인 나라 화폐(NPC 숙박비 npc/npcWages.ts와 같다 — 나라 화폐가 없으면 기준 통화).
// - 집세 화폐(서버 시험 화폐 = 기준 통화) → 나라 화폐: 지난 환전 체결가(로트당 기준 통화 값 — npc/cityFundFx.ts와 같은 읽기, 체결가가 없으면 로트 = 같은 값 [임시]), 올림.
// - 쉼터: 도시 경제 쉼터 계획(npc/cityRest.ts — restPlan)의 일꾼 자리를 휴먼에 맞춘다(@terra/sim cityWorkerUnits — npcWages.ts와 같은 맞춤).
//   한 기간 숙박비 = 그 기간에 드는 밤 수(기간 ÷ 쉼 바퀴 restPeriodMs) × 하룻밤 요금(설정 칸 lodging_fee_per_night) — 플레이어 일꾼 periodFee와 같은 셈.
import { type SocietyCoefficients, cityWorkerUnits, restPeriodMs } from "@terra/sim";
// 바뀜 (fixes-1117j, 기획 검토 2735): NPC 집주인(npcLandlord.ts)이 읽는 세력 상업 성향·숙소 한 기간 숙박비(lodgingPeriodFeeOf — 레벨의 숙소에서 쉬는 밤 수 × 하룻밤 요금)도 낸다.
import type { CityFundFxEconomy } from "../npc/cityFundFx.ts";
import type { CityRestPlan } from "../npc/cityRest.ts";
import type { NpcRuntime } from "../npc/runtime.ts";
import type { NpcRentWorld, NpcRest } from "./npcRent.ts";

/** 화폐 하나의 로트당 기준 통화 값(기준 통화 = 로트, 체결가가 없으면 로트) */
function lotValue(economy: CityFundFxEconomy, asset: string): bigint {
  const lot = economy.settings.fxLot;
  if (asset === economy.base) return lot;
  const price = economy.fx.get(asset)?.lastPrice;
  return price !== undefined && price > 0n ? price : lot;
}

/** from 화폐 양 → to 화폐 양(올림). 경제가 없거나 같은 화폐면 그대로 */
export function convertUp(
  economy: CityFundFxEconomy | undefined,
  amount: bigint,
  from: string,
  to: string,
): bigint {
  if (!economy || from === to || amount <= 0n) return amount;
  const toValue = lotValue(economy, to);
  if (toValue <= 0n) return amount;
  return (amount * lotValue(economy, from) + toValue - 1n) / toValue;
}

/** 쉼터 계획 → 휴먼마다 쉼터(일꾼만) */
export function npcRestsOf(
  plan: CityRestPlan | undefined,
  workers: readonly { readonly unitId: number; readonly facilityId: number; readonly index: number }[],
  periodMs: number,
  rules: SocietyCoefficients,
): Map<number, NpcRest> {
  const out = new Map<number, NpcRest>();
  if (!plan) return out;
  const bySlot = new Map<string, CityRestPlan["workers"][number]>();
  const next = new Map<number, number>();
  for (const rest of plan.workers) {
    const index = next.get(rest.facilityId) ?? 0;
    next.set(rest.facilityId, index + 1);
    bySlot.set(`${rest.facilityId}:${index}`, rest);
  }
  const fee = BigInt(Math.max(0, Math.trunc(rules.logistics.lodgingFeePerNight)));
  for (const worker of workers) {
    const rest = bySlot.get(`${worker.facilityId}:${worker.index}`);
    if (!rest) continue;
    const nights =
      rest.lodgingId === null
        ? 0
        : Math.floor(Math.max(1, periodMs) / Math.max(1, restPeriodMs(rest.place, rest.commuteCells, rules)));
    out.set(worker.unitId, {
      lodgingId: rest.lodgingId,
      homeless: rest.place.kind === "homeless",
      cost: BigInt(nights) * fee,
    });
  }
  return out;
}

/** 그 레벨 숙소에서 한 기간에 드는 밤 수 × 하룻밤 요금(일터와 숙소 사이 거리 0 — 숙소 자체 값) */
export function lodgingPeriodFeeOf(level: number, periodMs: number, rules: SocietyCoefficients): bigint {
  const fee = BigInt(Math.max(0, Math.trunc(rules.logistics.lodgingFeePerNight)));
  const nights = Math.max(
    1,
    Math.floor(Math.max(1, periodMs) / Math.max(1, restPeriodMs({ kind: "lodging", level }, 0, rules))),
  );
  return BigInt(nights) * fee;
}

/** NPC 런타임으로 세 들기 세계 몫을 만든다(없으면 undefined) */
export function npcRentWorldOf(
  npc: NpcRuntime | undefined,
  rules: () => SocietyCoefficients,
  /** 집세 화폐(주인이 정한 값의 화폐 — 서버 시험 화폐 [임시] 질문 2673) */
  rentAsset: string,
): NpcRentWorld | undefined {
  if (!npc) return undefined;
  const world = npc.world;
  const economy = npc.economy;
  return {
    units: world.units,
    isNpcOwner: (owner) => {
      const faction = world.factions.get(owner);
      return faction !== undefined && faction.player !== true;
    },
    currencyOf(cityId) {
      const city = world.cities.get(cityId);
      if (!city) return undefined;
      return economy?.economy.currencyOf.get(city.owner) ?? economy?.economy.base;
    },
    toLocal: (amount, asset) => convertUp(economy?.economy, amount, rentAsset, asset),
    commerceOf: (owner) => world.factions.get(owner)?.traits.commerce,
    lodgingPeriodFee: (level, periodMs) => lodgingPeriodFeeOf(level, periodMs, rules()),
    traits: (unitId) => npc.unitTraits(unitId),
    restsIn(cityId, periodMs) {
      if (!economy) return new Map();
      return npcRestsOf(
        economy.restPlan(cityId),
        cityWorkerUnits(world, economy.economy, cityId),
        periodMs,
        rules(),
      );
    },
  };
}
