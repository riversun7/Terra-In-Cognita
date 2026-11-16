// 거래소 거래 직무 자리 값(시간당 임대료) — 질문 2083(주인이 자리를 내고 값을 정한다), 기획 대조 2204(NPC 거래소도 자리를 낸다 — D-555 1509·D-212, 줄기 misc-574).
// - 주인이 낸 값(labor_rents 줄, 0 = 내지 않음)이 있으면 그 값(store.ts postedRent).
// - 줄이 없고 주인이 NPC 세력이면 NPC가 정한 값 = 적정 자리 값 × 설정 칸 exchange_npc_desk_rent_pm ÷ 1000. 적정 자리 값 = 일꾼 한 명 시간당 인건비(기본
//   임금 — hourlyLabor의 기본 일꾼과 같은 셈) + 수수료(serviceFeePm, 외주 수리 적정가와 같은 셈 — 세금 0). 0이면 NPC 거래소는 자리를 내지 않는다.
//   [임시] NPC가 성향으로 값을 바꾸지는 않는다(질문 2264). 플레이어 가문 주체 건물도 소유 주체 줄에 사용자가 없어 NPC 셈을 받는다(Assumed — 드묾).
// 정수 연산만 쓴다.
import { wage, wagePerCycle } from "@terra/sim";
import { hourlyFair } from "../business/fairPrice.ts";
import type { WageRules } from "./rules.ts";
import { type RentRow, postedRent } from "./store.ts";

const HOUR_MS = 3_600_000;

/** 거래 직무 자리 값 셈에 드는 NPC 몫(없으면 NPC 셈 없음) */
export interface NpcDeskRent {
  /** 설정 칸 exchange_npc_desk_rent_pm(적정가 ‰) */
  readonly rentPm: number;
}

/** 일꾼 한 명 시간당 인건비(올림) — 기본 일꾼 한 주기 임금 × 시간 ÷ 주기 */
export function workerHourly(perCycle: bigint, cycleMs: number, hourMs: number): bigint {
  const cycle = BigInt(Math.max(1, Math.trunc(cycleMs)));
  return (perCycle * BigInt(hourMs) + cycle - 1n) / cycle;
}

/** NPC 거래소 자리 값(시간당). 0 이하 ‰면 null(자리를 내지 않음) */
export function npcDeskRent(hourly: bigint, feePm: number, rentPm: number): bigint | null {
  const pm = Math.max(0, Math.trunc(rentPm));
  if (pm <= 0) return null;
  const fair = hourlyFair(hourly, { feePm, taxBp: 0 }).price;
  const rent = (fair * BigInt(pm)) / 1000n;
  return rent > 0n ? rent : 1n;
}

/** NPC 거래소 자리 값(시간당) — 기본 일꾼 한 명 인건비로 센 적정가 × rentPm ÷ 1000. rentPm이 없으면(NPC 건물 아님) null */
export function npcDeskRentOf(rules: WageRules, rentPm: number | undefined): bigint | null {
  if (rentPm === undefined) return null;
  const perCycle = wagePerCycle(
    BigInt(wage(rules.efficiency, rules.rateMilli, 1000, rules.society)),
    rules.labor,
  );
  const hourly = workerHourly(perCycle, rules.labor.wageCycleMs, HOUR_MS);
  return npcDeskRent(hourly, rules.society.business.serviceFeePm, rentPm);
}

/** 그 거래소 자리의 시간당 값: 주인이 낸 값 → (줄이 없을 때만) NPC 셈. 없으면 null */
export function deskRentOf(
  row: RentRow | undefined,
  buildingOwner: number | null | undefined,
  npc: (() => bigint | null) | undefined,
): bigint | null {
  if (row && row.ownerId === buildingOwner) return postedRent(row, buildingOwner);
  return buildingOwner === null || buildingOwner === undefined ? null : (npc?.() ?? null);
}
