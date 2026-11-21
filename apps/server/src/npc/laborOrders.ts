// 가문 일 지시 런타임 — docs/adr/2026-11-21-npc-needs-drives.md "바뀜 (가문 일 지시)". 순수 규칙은 @terra/sim/npcAi houseOrders.ts.
// 도시마다 가볍게 점검한다(점검 주기 = 설정 칸 npc_ai_house_check_ms, 출발 5분, 도시마다 시작을 흩음): 그 도시 휴먼(경비대 제외)의 2차 지수를 뽑아 가문별 집계·깃발을 보고,
// 지난 점검과 달라진 것(날·가문원 수·깃발·가문 없는 휴먼 수)이 있을 때만 일꾼 차례를 다시 짠다.
// 결과는 거울 세계 휴먼에 적는다: laborRank(일꾼 자리를 채우는 차례)·onStrike(그날 지시 불복 — 일꾼으로 세지 않는다). 일꾼 ↔ 휴먼을 정하는
// 모든 곳(@terra/sim cityWorkerUnits — 임금·숙박비·물류, humanPlaces.ts — 보이는 일터)이 이 값을 읽는다. 저장하지 않는다(켜면 다시 짠다).
// 가문 AI 스위치(npc_ai_house_enabled)가 꺼지면 적은 값을 지운다(옛 유닛 ID 차례).
import type { UnitTraits } from "@terra/shared/unitTraits";
import { HOMELESS, type SimUnit, type SocietyCoefficients, mix32 } from "@terra/sim";
import {
  type CityLaborPlan,
  type LaborHouse,
  type LaborMember,
  deriveUnitDrives,
  driveRulesFromAi,
  houseCheckKey,
  houseOrderRulesFromAi,
  loyaltyRulesFromAi,
  planCityLabor,
} from "@terra/sim/npcAi";

type LaborUnit = Pick<
  SimUnit,
  "id" | "city" | "guard" | "satisfactionMilli" | "fedPm" | "laborRank" | "onStrike"
>;

export interface LaborOrders {
  /** 점검할 때가 된 도시를 보고 일꾼 차례가 바뀐 도시 ID를 돌려준다 */
  tick(nowMs: number): number[];
  /** 그 도시의 마지막 계획(개발 화면·시험) */
  planOf(cityId: number): CityLaborPlan | undefined;
}

export function createLaborOrders(o: {
  readonly worldSeed: number;
  readonly rules: () => SocietyCoefficients;
  readonly units: ReadonlyMap<number, LaborUnit>;
  readonly cities: ReadonlyMap<number, unknown>;
  readonly traitsOf: (unitId: number) => UnitTraits | undefined;
  /** 유닛 → NPC 가문 ID(없으면 가문 없는 휴먼) */
  readonly houseOf: (unitId: number) => number | undefined;
  /** 지금 날(불복 굴림은 하루에 한 번) */
  readonly day: () => number;
}): LaborOrders {
  const nextAt = new Map<number, number>();
  const keys = new Map<number, string>();
  const plans = new Map<number, CityLaborPlan>();
  let wasOn = false;

  const clear = (): number[] => {
    const changed = new Set<number>();
    for (const unit of o.units.values()) {
      if (unit.laborRank === undefined && unit.onStrike !== true) continue;
      unit.laborRank = undefined;
      unit.onStrike = undefined;
      changed.add(unit.city);
    }
    keys.clear();
    plans.clear();
    nextAt.clear();
    return [...changed];
  };

  return {
    tick(nowMs) {
      const rules = o.rules();
      if (rules.npcAi.houseAiEnabled !== 1) {
        if (!wasOn) return [];
        wasOn = false;
        return clear();
      }
      wasOn = true;
      const checkMs = Math.max(10_000, Math.trunc(rules.npcAi.houseCheckMs));
      const orderRules = houseOrderRulesFromAi(rules.npcAi);
      const driveRules = driveRulesFromAi(rules.npcAi);
      const due: number[] = [];
      for (const cityId of o.cities.keys()) {
        const at = nextAt.get(cityId);
        if (at === undefined) {
          // 처음: 바로 짜고, 다음 점검은 도시마다 흩는다
          const spread = (mix32(o.worldSeed ^ Math.imul(cityId, 0x9e37_79b1)) >>> 0) % checkMs;
          nextAt.set(cityId, nowMs + spread + 1);
          due.push(cityId);
        } else if (nowMs >= at) {
          nextAt.set(cityId, nowMs + checkMs);
          due.push(cityId);
        }
      }
      for (const cityId of nextAt.keys()) if (!o.cities.has(cityId)) nextAt.delete(cityId);
      if (due.length === 0) return [];
      const wanted = new Set(due);
      const byCity = new Map<number, LaborUnit[]>();
      for (const unit of o.units.values()) {
        if (unit.city === HOMELESS || unit.guard === true || !wanted.has(unit.city)) continue;
        const list = byCity.get(unit.city);
        if (list) list.push(unit);
        else byCity.set(unit.city, [unit]);
      }
      const loyaltyRules = loyaltyRulesFromAi(rules.npcAi);
      const day = o.day();
      const changed: number[] = [];
      for (const cityId of due) {
        const units = byCity.get(cityId) ?? [];
        const houses = new Map<number, LaborMember[]>();
        const unhoused: LaborMember[] = [];
        for (const unit of units) {
          const traits = o.traitsOf(unit.id);
          const satisfactionMilli = unit.satisfactionMilli;
          const fedPm = unit.fedPm ?? null;
          // 성향을 모르는 유닛은 늘 따르는 보통 일꾼으로 본다
          const drives = traits
            ? deriveUnitDrives({ traits, satisfactionMilli, fedPm, loyaltyRules, rules: driveRules })
            : { work: 500, obedience: 1000 };
          const member: LaborMember = {
            unitId: unit.id,
            workPm: drives.work,
            obediencePm: drives.obedience,
            fedPm,
            satisfactionMilli,
          };
          const houseId = o.houseOf(unit.id);
          if (houseId === undefined) unhoused.push(member);
          else {
            const list = houses.get(houseId);
            if (list) list.push(member);
            else houses.set(houseId, [member]);
          }
        }
        const list: LaborHouse[] = [...houses].map(([houseId, members]) => ({ houseId, members }));
        // 가벼운 점검: 날·가문마다(가문원 수 + 깃발)·가문 없는 휴먼 수가 지난번과 같으면 다시 짜지 않는다
        const key = `${day}|${unhoused.length}|${list
          .toSorted((a, b) => a.houseId - b.houseId)
          .map((house) => `${house.houseId}=${houseCheckKey(house, orderRules)}`)
          .join(";")}`;
        if (keys.get(cityId) === key) continue;
        keys.set(cityId, key);
        const plan = planCityLabor({ houses: list, unhoused, day, seed: o.worldSeed, rules: orderRules });
        plans.set(cityId, plan);
        const rank = new Map(plan.order.map((unitId, index) => [unitId, index]));
        const strike = new Set(plan.refused);
        let touched = false;
        for (const unit of units) {
          const nextRank = rank.get(unit.id);
          const nextStrike = strike.has(unit.id) ? true : undefined;
          if (unit.laborRank === nextRank && unit.onStrike === nextStrike) continue;
          unit.laborRank = nextRank;
          unit.onStrike = nextStrike;
          touched = true;
        }
        if (touched) changed.push(cityId);
      }
      return changed;
    },
    planOf: (cityId) => plans.get(cityId),
  };
}
