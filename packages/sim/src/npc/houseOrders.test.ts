import { describe, expect, it } from "vitest";
import {
  type LaborMember,
  START_HOUSE_ORDER_RULES,
  houseCarePm,
  houseCareShare,
  houseCheckKey,
  houseFlagsOf,
  houseStatusOf,
  houseTaxOf,
  planCityLabor,
  refusesOrder,
} from "./houseOrders.ts";

const member = (unitId: number, patch: Partial<LaborMember> = {}): LaborMember => ({
  unitId,
  workPm: 500,
  obediencePm: 1000,
  fedPm: 1000,
  satisfactionMilli: 70_000,
  ...patch,
});

describe("가문 상태 점검(집계 → 깃발)", () => {
  it("못 먹은 가문원 몫·평균 만족도·불복 수로 깃발을 세운다", () => {
    const fine = houseStatusOf([member(1), member(2), member(3)]);
    expect(houseFlagsOf(fine)).toEqual([]);

    const hungry = houseStatusOf([member(1, { fedPm: 0 }), member(2), member(3)]);
    expect(hungry.unfed).toBe(1);
    expect(houseFlagsOf(hungry)).toEqual(["food_short"]);

    const sad = houseStatusOf([
      member(1, { satisfactionMilli: 20_000 }),
      member(2, { satisfactionMilli: 40_000 }),
    ]);
    expect(sad.avgSatisfaction).toBe(30);
    expect(houseFlagsOf(sad)).toEqual(["morale_low"]);

    const unruly = houseStatusOf([member(1, { obediencePm: 300 }), member(2, { obediencePm: 500 })]);
    expect(houseFlagsOf(unruly)).toEqual(["unruly"]);
  });

  it("빈 가문·아무도 세지 않은 만족도는 깃발이 없다", () => {
    expect(houseFlagsOf(houseStatusOf([]))).toEqual([]);
    expect(houseStatusOf([member(1, { satisfactionMilli: null })]).avgSatisfaction).toBeNull();
  });

  it("점검 열쇠는 가문원 수와 깃발이 같으면 같다(다시 짜지 않는다)", () => {
    const a = { houseId: 1, members: [member(1), member(2)] };
    const b = { houseId: 1, members: [member(1, { workPm: 900 }), member(2, { fedPm: 800 })] };
    expect(houseCheckKey(a)).toBe(houseCheckKey(b));
    expect(houseCheckKey({ houseId: 1, members: [member(1, { fedPm: 0 }), member(2)] })).not.toBe(
      houseCheckKey(a),
    );
  });
});

/** 유닛 400명 가운데 그날 지시를 따르지 않는 수 */
const count = (obediencePm: number): number => {
  let n = 0;
  for (let unitId = 1; unitId <= 400; unitId++) if (refusesOrder({ unitId, obediencePm }, 3, 7)) n += 1;
  return n;
};

describe("불복(하루 한 번 굴림)", () => {
  it("복종도가 문턱 이상이면 늘 따르고, 낮을수록 자주 따르지 않는다. 같은 날은 같은 답", () => {
    const loyal = member(1, { obediencePm: START_HOUSE_ORDER_RULES.refuseBelowPm });
    for (let day = 0; day < 50; day++) expect(refusesOrder(loyal, day, 7)).toBe(false);

    // 복종도 400 → 20%, 200 → 40% 안팎
    expect(count(400)).toBeGreaterThan(50);
    expect(count(400)).toBeLessThan(110);
    expect(count(200)).toBeGreaterThan(count(400));
    expect(refusesOrder({ unitId: 9, obediencePm: 200 }, 3, 7)).toBe(
      refusesOrder({ unitId: 9, obediencePm: 200 }, 3, 7),
    );
  });
});

describe("도시 일 계획", () => {
  it("가문끼리 한 사람씩 돌아가며, 가문 안은 근로 의욕 차례, 가문 없는 휴먼은 도시가 그 뒤에 부른다", () => {
    const plan = planCityLabor({
      houses: [
        { houseId: 20, members: [member(5, { workPm: 300 }), member(6, { workPm: 900 })] },
        {
          houseId: 10,
          members: [member(1, { workPm: 400 }), member(2, { workPm: 800 }), member(3, { workPm: 600 })],
        },
      ],
      unhoused: [member(40), member(30)],
      day: 1,
      seed: 1,
    });
    expect(plan.order).toEqual([2, 6, 3, 5, 1, 30, 40]);
    expect(plan.drafted).toEqual([30, 40]);
    expect(plan.refused).toEqual([]);
    expect(plan.houses.get(10)?.status.members).toBe(3);
  });

  it("불복한 가문원은 일꾼 차례에도 징발에도 들지 않는다", () => {
    const sullen = Array.from({ length: 200 }, (_, i) => member(i + 1, { obediencePm: 200 }));
    const plan = planCityLabor({ houses: [{ houseId: 1, members: sullen }], unhoused: [], day: 4, seed: 11 });
    expect(plan.refused.length).toBeGreaterThan(40);
    expect(plan.order.length + plan.refused.length).toBe(200);
    for (const unitId of plan.refused) expect(plan.order).not.toContain(unitId);
    expect(plan.houses.get(1)?.flags).toContain("unruly");
  });

  it("사기 낮음 깃발이 선 가문은 못 먹은 가문원을 뒤로 돌린다", () => {
    const plan = planCityLabor({
      houses: [
        {
          houseId: 1,
          members: [
            member(1, { workPm: 900, fedPm: 0, satisfactionMilli: 20_000 }),
            member(2, { workPm: 300, satisfactionMilli: 30_000 }),
          ],
        },
      ],
      unhoused: [],
      day: 1,
      seed: 1,
    });
    expect(plan.houses.get(1)?.flags).toContain("morale_low");
    expect(plan.order).toEqual([2, 1]);
  });
});

describe("가문 금고(가문세·돌봄 배당)", () => {
  it("가문세는 받은 임금의 10%(내림), 못 받았으면 0", () => {
    expect(houseTaxOf(1234n)).toBe(123n);
    expect(houseTaxOf(0n)).toBe(0n);
  });

  it("돌봄 몫은 공동체 성향이 높을수록 크고 이윤 성향이 높을수록 작다", () => {
    const giver = houseCarePm({ communalism: 1000, greed: 0 });
    const miser = houseCarePm({ communalism: 0, greed: 1000 });
    expect(giver).toBe(START_HOUSE_ORDER_RULES.careMaxPm);
    expect(miser).toBe(START_HOUSE_ORDER_RULES.careMinPm);
    expect(houseCarePm(undefined)).toBe(500);
  });

  it("배당 한 사람 몫 = 금고 × 돌봄 몫 ÷ 돌볼 사람 수, 하루 임금을 넘지 않는다", () => {
    expect(houseCareShare(1000n, 500, 5, 1000n)).toBe(100n);
    expect(houseCareShare(1000n, 500, 5, 60n)).toBe(60n);
    expect(houseCareShare(0n, 500, 5, 60n)).toBe(0n);
    expect(houseCareShare(1000n, 500, 0, 60n)).toBe(0n);
  });
});
