// 같은 나라 시야 공유 시험(기획 정리 질문 746 나, S3-Q1 "같은 국가 전체", docs/adr/2026-11-08-citizenship.md) — 가짜 2차맵 상태로 시야만 본다.
// - 같은 나라 주체(NPC 국가 휴먼·같은 나라 유저)의 유닛은 내 유닛 시야 밖에서도 보이고, 그들이 보는 남의 유닛도 보인다. 다른 나라는 안 보인다.
// - 탐사 기록은 내 유닛 시야로만 쌓인다(S3-Q2). 공유 시야 칸의 건물은 보인다. 나라를 바꾸면(국적 바꾸기) 다음 시야 틱부터 새 나라.
// - 비용: 나라 덮개는 2차맵·나라마다 시야 틱 하나에 한 번만 센다(같은 나라 무리가 여럿이어도).
import {
  type BuildingPlacement,
  CELL_UNITS,
  VISION_CELL,
  VISION_SIDE,
  WALK_SPEED,
  createMotion,
  hasBit,
} from "@terra/sim";
import { describe, expect, it } from "vitest";
import { type StreamSubscriber, emptyStreamStats } from "./mapStream.ts";
import {
  type NationLookup,
  VISION_TICK_MS,
  type VisionBuilding,
  type VisionUnit,
  buildingCell,
  createMapVision,
} from "./vision.ts";
import { buildingToWire, motionToWire, sized } from "./wire.ts";

/** 서 있는 유닛(배치 칸 가운데) */
function unitAt(id: number, ownerId: number, cellX: number, cellY: number): VisionUnit {
  const point = { x: cellX * CELL_UNITS + CELL_UNITS / 2, y: cellY * CELL_UNITS + CELL_UNITS / 2 };
  const motion = createMotion({ waypoints: [point], departAtMs: 0, speed: WALK_SPEED });
  return { id, ownerId, size: 1, motion, entry: sized(motionToWire(id, 1, motion)) };
}

function buildingAt(id: number, ownerId: number | null, x: number, y: number): VisionBuilding {
  const placement: BuildingPlacement = { x, y, width: 2, height: 2, rotation: 0 };
  return { id, ownerId, placement, entry: sized(buildingToWire(id, placement)) };
}

/** 소유 주체 → 나라: 1(나)·2(같은 나라 NPC 국가 주체)·3(같은 나라 다른 유저) = 나라 10, 4(다른 나라 국가 주체) = 나라 20 */
function lookupOf(nations: Map<number, number>): NationLookup {
  return (ownerId) => nations.get(ownerId);
}

function setup() {
  let clock = 10_000;
  const units = new Map<number, VisionUnit>();
  const buildings = new Map<number, VisionBuilding>();
  const stats = emptyStreamStats();
  const vision = createMapVision({
    mapKey: 7,
    terrain: { url: "/t", generatorVersion: 1 },
    now: () => clock,
    stats,
    source: {
      units: () => units.values(),
      unit: (id) => units.get(id),
      buildings: () => buildings.values(),
    },
  });
  // 내 사이보그는 (10, 10), 같은 나라 휴먼은 멀리 (200, 200), 그 곁에 다른 나라 휴먼 (205, 205)
  for (const unit of [
    unitAt(1, 1, 10, 10),
    unitAt(2, 2, 200, 200),
    unitAt(3, 4, 205, 205),
    unitAt(4, 4, 120, 30),
    unitAt(5, 3, 30, 200),
  ])
    units.set(unit.id, unit);
  return {
    vision,
    units,
    buildings,
    stats,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

const nations = new Map([
  [1, 10],
  [2, 10],
  [3, 10],
  [4, 20],
]);

/** 배치 칸 → 시야 칸 번호 */
const cellOf = (x: number, y: number): number =>
  Math.floor(y / VISION_CELL) * VISION_SIDE + Math.floor(x / VISION_CELL);

/** 받은 메시지에 실린 남의 유닛 ID(스냅샷·변화) */
function seenUnits(texts: readonly string[]): Set<number> {
  const seen = new Set<number>();
  for (const text of texts) {
    const message: unknown = JSON.parse(text);
    const list = typeof message === "object" && message !== null ? Reflect.get(message, "units") : undefined;
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      const id: unknown = typeof entry === "object" && entry !== null ? Reflect.get(entry, "id") : undefined;
      if (typeof id === "number") seen.add(id);
    }
  }
  return seen;
}

describe("같은 나라 시야 공유(질문 746 나)", () => {
  it("나라가 없으면 내 시야만, 나라가 있으면 같은 나라 유닛과 그들이 보는 남의 유닛이 보인다", async () => {
    const { vision } = setup();
    const alone = { userId: "u1", ownerId: 1 };
    expect(vision.sees(alone, 2)).toBe(false);
    expect(vision.sees(alone, 3)).toBe(false);
    const shared = { userId: "u1", ownerId: 1, nations: lookupOf(nations) };
    // 같은 나라 NPC 휴먼(2)·같은 나라 유저 유닛(5), 그 곁의 다른 나라 휴먼(3)은 보이고, 아무도 보지 않는 다른 나라 유닛(4)은 안 보인다
    expect(vision.sees(shared, 2)).toBe(true);
    expect(vision.sees(shared, 5)).toBe(true);
    expect(vision.sees(shared, 3)).toBe(true);
    expect(vision.sees(shared, 4)).toBe(false);
    // seer(시야를 한 번만 세는 묶음 판정)는 sees와 같은 답을 낸다 — 없는 유닛은 false
    const lone = vision.seer(alone);
    const joint = vision.seer(shared);
    for (const unitId of [1, 2, 3, 4, 5, 999]) {
      expect(lone(unitId), `alone ${unitId}`).toBe(vision.sees(alone, unitId));
      expect(joint(unitId), `shared ${unitId}`).toBe(vision.sees(shared, unitId));
    }
    // 1차맵 도시 안개·건물 겉모습이 쓰는 아는 칸에도 공유 시야가 든다
    const sighted = await vision.sighted(shared);
    expect(hasBit(sighted, cellOf(200, 200))).toBe(true);
    expect(hasBit(await vision.sighted(alone), cellOf(200, 200))).toBe(false);
    // 내 유닛이 없는 2차맵도 같은 나라 유닛·건물이 있으면 볼 수 있다(내 나라 다른 도시)
    const lookup = lookupOf(new Map([...nations, [30, 10], [40, 99]]));
    expect(await vision.canView({ userId: "u30", ownerId: 30, nations: lookup })).toBe(true);
    expect(await vision.canView({ userId: "u40", ownerId: 40, nations: lookup })).toBe(false);
    expect(await vision.canView({ userId: "u30b", ownerId: 30 })).toBe(false);
  });

  it("구독: 같은 나라 유닛을 보내고, 탐사 기록은 내 시야로만 쌓고, 공유 시야 칸의 건물을 보낸다", async () => {
    const { vision, buildings } = setup();
    buildings.set(90, buildingAt(90, 4, 198, 196));
    const texts: string[] = [];
    const subscriber: StreamSubscriber = { send: (text) => texts.push(text), bufferedAmount: () => 0 };
    const viewer = { userId: "u1", ownerId: 1, nations: lookupOf(nations) };
    expect(await vision.canView(viewer)).toBe(true);
    vision.subscribe(subscriber, viewer);
    const seen = seenUnits(texts);
    expect(seen.has(2)).toBe(true);
    expect(seen.has(3)).toBe(true);
    expect(seen.has(4)).toBe(false);
    expect(texts.some((text) => text.includes('"id":90'))).toBe(true);
    // 탐사 기록(vision 메시지) = 내 사이보그 둘레만
    const visionText = texts.find((text) => text.includes('"t":"vision"'));
    const explored = Buffer.from(String(JSON.parse(visionText ?? "{}").explored), "base64");
    expect(hasBit(new Uint8Array(explored), buildingCell(buildingAt(0, null, 200, 200).placement))).toBe(
      false,
    );
    expect(hasBit(new Uint8Array(explored), buildingCell(buildingAt(0, null, 10, 10).placement))).toBe(true);
    vision.unsubscribe(subscriber);
  });

  it("나라를 바꾸면 다음 시야 틱부터 새 나라의 시야(옛 나라 유닛은 사라진다)", () => {
    const { vision, advance } = setup();
    const mine = new Map(nations);
    const texts: string[] = [];
    vision.subscribe(
      { send: (text) => texts.push(text), bufferedAmount: () => 0 },
      {
        userId: "u1",
        ownerId: 1,
        nations: lookupOf(mine),
      },
    );
    expect(vision.sees({ userId: "u1", ownerId: 1 }, 5)).toBe(true);
    expect(vision.sees({ userId: "u1", ownerId: 1 }, 4)).toBe(false);
    // 귀화: 나(1)가 나라 20으로
    mine.set(1, 20);
    advance(VISION_TICK_MS);
    vision.tick();
    // 구독 중인 무리는 보내 둔 것(visible)으로 답한다 — 옛 나라 유저 유닛(5)은 숨김, 새 나라 유닛(4)은 보냄
    expect(vision.sees({ userId: "u1", ownerId: 1 }, 5)).toBe(false);
    expect(vision.sees({ userId: "u1", ownerId: 1 }, 4)).toBe(true);
  });

  it("비용: 같은 나라 무리가 여럿이어도 나라 덮개는 시야 틱마다 나라 하나에 한 번", () => {
    const { vision, stats, advance } = setup();
    const many = new Map(nations);
    // 같은 나라 유저 다섯(주체 11~15)·다른 나라 유저 셋(주체 21~23)
    for (let owner = 11; owner <= 15; owner++) many.set(owner, 10);
    for (let owner = 21; owner <= 23; owner++) many.set(owner, 20);
    const lookup = lookupOf(many);
    for (const owner of [1, 11, 12, 13, 14, 15, 21, 22, 23])
      vision.subscribe(
        { send: () => undefined, bufferedAmount: () => 0 },
        { userId: `u${owner}`, ownerId: owner, nations: lookup },
      );
    expect(vision.groupCount).toBe(9);
    const before = stats.visionNationCovers;
    advance(VISION_TICK_MS);
    vision.tick();
    expect(stats.visionGroupTicks).toBeGreaterThanOrEqual(9);
    // 나라 둘(10·20) → 덮개 둘
    expect(stats.visionNationCovers - before).toBe(2);
    advance(VISION_TICK_MS);
    vision.tick();
    expect(stats.visionNationCovers - before).toBe(4);
    vision.close();
  });
});
