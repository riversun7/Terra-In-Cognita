// 진 사이보그 본체의 사는 곳 귀환(D-594 "부상입고 주거지 귀환" — battleReturn.ts returnHome, cyborgHome.ts): 같은 2차맵이면 걸어가고, 다른 2차맵이면 이동 서비스로
// 보내 닿는 예상 시각까지 쓰지 못하며, 못 보내면 안전한 곳으로 걷는다. 사는 곳이 없으면 false(부르는 쪽이 가장 가까운 안전 도시로).
import { WALK_SPEED, anchorAt, arrivalAt, positionAt } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RETURN_PLAN_HOLD_MS, returnHome } from "./battleReturn.ts";
import type { CyborgHome, HomeTarget } from "./cyborgHome.ts";
import { standNear } from "./cyborgHome.ts";
import { createTestMap } from "./testSupport.ts";
import { UNIT_KIND_CYBORG } from "./unitKinds.ts";

const START = 1_798_000_000_000;
const OWNER = 7;

beforeEach(() => {
  vi.useFakeTimers({ now: START });
});
afterEach(() => {
  vi.useRealTimers();
});

const settle = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

/** 시험 2차맵 + 사이보그 본체 하나 */
function rig() {
  const { map } = createTestMap({ mapKey: 9 });
  map.addUnit({
    id: 21,
    size: 1,
    speed: WALK_SPEED,
    cellX: 40,
    cellY: 100,
    ownerId: OWNER,
    kind: UNIT_KIND_CYBORG,
  });
  const info = map.unitInfo(21);
  if (!info) throw new Error("no unit");
  return { map, info };
}

/** 가짜 사는 곳(home = 사는 곳 칸, sent = 보낸 줄, answer = 이동 서비스 답) */
function fakeHome(home: HomeTarget | undefined, answer: () => Promise<number | undefined>) {
  const sent: HomeTarget[] = [];
  const cyborgHome: CyborgHome = {
    homeOf: () => home,
    send: (_unitId, _owner, _size, to) => {
      sent.push(to);
      return answer();
    },
  };
  return { cyborgHome, sent };
}

describe("진 사이보그 본체 사는 곳 귀환 (D-594)", () => {
  it("사는 곳이 같은 2차맵이면 그 둘레로 걸어간다(순간이동 없음, 닿을 때까지 쓰지 못함)", async () => {
    const { map, info } = rig();
    const { cyborgHome } = fakeHome({ mapKey: 9, x: 150, y: 100 }, async () => undefined);
    const world = { mapOf: () => map, cyborgHome: () => cyborgHome };
    expect(returnHome(world, map, 21, info, () => undefined, START)).toBe(true);
    await vi.waitFor(() => {
      const motion = map.unitInfo(21)?.motion;
      expect(motion && arrivalAt(motion) > START).toBe(true);
    });
    const after = map.unitInfo(21);
    if (!after) throw new Error("no unit");
    expect(anchorAt(positionAt(after.motion, START), 1)).toEqual({ x: 40, y: 100 });
    const goal = anchorAt(positionAt(after.motion, arrivalAt(after.motion)), 1);
    expect(Math.abs(goal.x - 150) + Math.abs(goal.y - 100)).toBeLessThan(12);
    expect(after.condition.returningUntilMs).toBe(arrivalAt(after.motion));
    map.stop();
  });

  it("다른 2차맵이면 이동 서비스로 보내고 닿는 예상까지 쓰지 못한다. 못 보내면 안전한 곳으로 걷는다", async () => {
    const { map, info } = rig();
    const arrive = START + 3_600_000;
    const ok = fakeHome({ mapKey: 77, x: 10, y: 10 }, async () => arrive);
    const world = { mapOf: () => map, cyborgHome: () => ok.cyborgHome };
    expect(returnHome(world, map, 21, info, () => undefined, START)).toBe(true);
    // 길 결과를 기다리는 동안 잡아 둔다
    expect(map.unitInfo(21)?.condition.returningUntilMs).toBe(START + RETURN_PLAN_HOLD_MS);
    await settle();
    expect(ok.sent).toEqual([{ mapKey: 77, x: 10, y: 10 }]);
    expect(map.unitInfo(21)?.condition.returningUntilMs).toBe(arrive);
    // 못 보냄(길 없음 등): 표시를 걷어 내고 대비 자리로 걷는다
    const no = fakeHome({ mapKey: 77, x: 10, y: 10 }, async () => undefined);
    const world2 = { mapOf: () => map, cyborgHome: () => no.cyborgHome };
    expect(returnHome(world2, map, 21, info, () => ({ x: 150, y: 100 }), START)).toBe(true);
    await vi.waitFor(() => {
      const motion = map.unitInfo(21)?.motion;
      expect(motion && map.unitInfo(21)?.condition.returningUntilMs === arrivalAt(motion)).toBe(true);
    });
    map.stop();
  });

  it("사는 곳이 없으면(떠돌이) false — 부르는 쪽이 가장 가까운 안전 도시로", () => {
    const { map, info } = rig();
    const none = fakeHome(undefined, async () => undefined);
    expect(
      returnHome(
        { mapOf: () => map, cyborgHome: () => none.cyborgHome },
        map,
        21,
        info,
        () => undefined,
        START,
      ),
    ).toBe(false);
    expect(returnHome({ mapOf: () => map }, map, 21, info, () => undefined, START)).toBe(false);
    expect(map.unitInfo(21)?.condition.returningUntilMs).toBeUndefined();
    map.stop();
  });

  it("설 칸 찾기: 설 수 없는 칸이면 둘레의 가장 가까운 설 칸", () => {
    const { map } = createTestMap({ mapKey: 9 });
    map.placeBuilding({ x: 150, y: 100, width: 6, height: 6, rotation: 0 }, OWNER);
    const cell = standNear(map, { x: 153, y: 103 }, 1);
    expect(cell).toBeDefined();
    expect(map.isStandable(cell?.x ?? -1, cell?.y ?? -1, 1)).toBe(true);
    map.stop();
  });
});
