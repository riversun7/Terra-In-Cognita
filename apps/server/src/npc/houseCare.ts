// NPC 가문 금고(가문세)와 돌봄 배당 — docs/adr/2026-11-21-npc-needs-drives.md "바뀜 (임금·가문 금고)". 순수 규칙은 @terra/sim/npcAi houseOrders.ts.
// 하루 끝, 임금·생활비(livingDay) 다음·만족도(society.endOfDay) 앞에 돈다. 도시마다 거래 하나.
// - 가문세: 그 도시에 사는 가문원이 그날 받은 임금(SimUnit.paidToday)의 몫(‰, 설정 칸 npc_ai_house_tax_pm — 출발 10%)을 그 휴먼 지갑 → 가문 금고(원장 시스템 계정
//   vault:house:npc:<NPC 가문 ID>:<화폐> — 지배 가문 금고 rulingVault.ts와 같은 계정). 지갑에 남은 만큼만 낸다.
// - 돌봄 배당: 가문 상태 점검(laborOrders.ts)에서 식량 부족·사기 낮음 깃발이 선 가문만. 그날 임금을 못 받았거나 못 먹은 가문원에게 금고 ×
//   가문장 돌봄 몫(가문장 성향 — 공동체 높을수록 많이, 이윤 높을수록 적게)을 똑같이 나눠 지갑에 준다(한 사람 몫 ≤ 하루 임금). 받은 돈은 그날
//   받은 임금에 더해 만족도의 임금 요소가 본다 — 챙겨 주는 가문장의 가문원은 만족도·복종도가 덜 떨어진다.
// 화폐 = 도시 주인 화폐(임금과 같다). 경비대는 임금 틀 밖이라 세금도 배당도 없다. 가문 AI 스위치(npc_ai_house_enabled)가 꺼지면 하지 않는다.
import { unitPurseLocation } from "@terra/shared/businessBooks";
import type { UnitTraits } from "@terra/shared/unitTraits";
import type { SimUnit, SocietyCoefficients } from "@terra/sim";
import {
  type HouseFlag,
  houseCarePm,
  houseCareShare,
  houseOrderRulesFromAi,
  houseTaxOf,
} from "@terra/sim/npcAi";
import type { Ledger } from "../economy/ledger.ts";
import { npcHouseVaultCode } from "./rulingVault.ts";

type CareUnit = Pick<SimUnit, "id" | "city" | "owner" | "guard" | "fedPm" | "paidToday">;

export interface HouseCareDay {
  /** 가문세를 낸 가문원 수·배당을 받은 가문원 수 */
  taxed: number;
  cared: number;
}

export interface HouseCare {
  day(nowMs: number): HouseCareDay;
}

export function createHouseCare(o: {
  readonly ledger: Pick<Ledger, "systemAccount" | "ownerAccount" | "balance" | "post">;
  readonly rules: () => SocietyCoefficients;
  readonly units: ReadonlyMap<number, CareUnit>;
  readonly cities: ReadonlyMap<number, { readonly owner: number }>;
  /** 그 도시 주인의 화폐(임금 화폐). 없으면 그 도시는 건너뛴다 */
  readonly currencyOf: (owner: number) => string | undefined;
  /** 하루 임금(배당 한 사람 몫의 상한) */
  readonly dailyWage: () => bigint;
  readonly housesOfCity: (cityId: number) => readonly number[];
  readonly membersOf: (houseId: number) => readonly number[];
  readonly headOf: (houseId: number) => number | undefined;
  readonly traitsOf: (unitId: number) => UnitTraits | undefined;
  /** 그 도시 그 가문의 깃발(가문 상태 점검 — 없으면 깃발 없음) */
  readonly flagsOf: (cityId: number, houseId: number) => readonly HouseFlag[];
}): HouseCare {
  return {
    day(nowMs) {
      const out: HouseCareDay = { taxed: 0, cared: 0 };
      if (o.rules().npcAi.houseAiEnabled !== 1) return out;
      const rules = houseOrderRulesFromAi(o.rules().npcAi);
      const cap = o.dailyWage();
      for (const [cityId, city] of [...o.cities].toSorted((a, b) => a[0] - b[0])) {
        const currency = o.currencyOf(city.owner);
        if (!currency) continue;
        const delta = new Map<number, bigint>();
        const shift = (account: number, amount: bigint): void => {
          delta.set(account, (delta.get(account) ?? 0n) + amount);
        };
        const balanceOf = (account: number): bigint => o.ledger.balance(account) + (delta.get(account) ?? 0n);
        const purseOf = (unit: CareUnit): number =>
          o.ledger.ownerAccount(unit.owner, currency, unitPurseLocation(unit.id));
        for (const houseId of o.housesOfCity(cityId).toSorted((a, b) => a - b)) {
          const members: CareUnit[] = [];
          for (const unitId of o.membersOf(houseId).toSorted((a, b) => a - b)) {
            const unit = o.units.get(unitId);
            if (unit && unit.city === cityId && unit.guard !== true) members.push(unit);
          }
          if (members.length === 0) continue;
          const vault = o.ledger.systemAccount(npcHouseVaultCode(houseId, currency), currency);
          // ① 가문세
          for (const unit of members) {
            const paid = unit.paidToday ?? 0;
            if (paid <= 0) continue;
            const purse = purseOf(unit);
            const have = balanceOf(purse);
            const due = houseTaxOf(BigInt(paid), rules);
            const tax = due < have ? due : have;
            if (tax <= 0n) continue;
            shift(purse, -tax);
            shift(vault, tax);
            out.taxed += 1;
          }
          // ② 돌봄 배당(깃발이 섰을 때만)
          const flags = o.flagsOf(cityId, houseId);
          if (!flags.includes("food_short") && !flags.includes("morale_low")) continue;
          const needy = members.filter(
            (unit) => (unit.paidToday ?? 0) === 0 || (unit.fedPm ?? 1000) < rules.unfedBelowPm,
          );
          const head = o.headOf(houseId);
          const carePm = houseCarePm(head === undefined ? undefined : o.traitsOf(head), rules);
          const each = houseCareShare(balanceOf(vault), carePm, needy.length, cap);
          if (each <= 0n) continue;
          for (const unit of needy) {
            shift(vault, -each);
            shift(purseOf(unit), each);
            unit.paidToday = (unit.paidToday ?? 0) + Number(each);
            out.cared += 1;
          }
        }
        const entries = [...delta]
          .filter(([, amount]) => amount !== 0n)
          .map(([account, amount]) => ({ account, amount }));
        if (entries.length > 0) o.ledger.post({ kind: "npc_house_care", atMs: nowMs, entries });
      }
      return out;
    },
  };
}
