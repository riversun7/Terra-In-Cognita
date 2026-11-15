// 좌표 유닛 장부 시험(DB 없음, docs/adr/2026-11-15-unloaded-second-maps.md 1절·6절) — 넣으면 서 있는 줄로 고쳐 쓰고(쓰기 대기열), 배는 승객과 함께
// 넣고 꺼내며(승객 혼자는 꺼내지 않음), 2차맵을 띄울 때 그 2차맵 줄을 꺼내 칸을 고치고(승객은 배 칸), 주인·2차맵으로 찾는다. 보는 사람이 띄우기
// (world/viewOpen.ts): 내 좌표 유닛이 선 2차맵·운영자 전체 보기만, 상한이면 busy.
import { WALK_SPEED, anchorCenter } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { UnitRow } from "../world/secondMap.ts";
import { openForView } from "../world/viewOpen.ts";
import { createParkedBook } from "./parked.ts";

const row = (id: number, mapKey: number, ownerId = 7, aboardId: number | null = null): UnitRow => ({
  id,
  ownerId,
  kind: 4,
  size: 1,
  speed: WALK_SPEED,
  mapKey,
  planetId: "s2_test_planet",
  domain: "land",
  path: [1, 2, 3, 4],
  pace: [1000],
  departAtMs: 5,
  wakeAtMs: 9,
  aiStep: 0,
  job: { job: 0, phase: 0, progressMs: 0, fatigue: 0 },
  condition: { injury: 0, injuryUntilMs: null, heldBy: null },
  aboardId,
});

function writer() {
  const writes: Record<string, unknown>[] = [];
  const fake: Pick<WorldWriter, "upsert"> = { upsert: (_table, columns) => writes.push(columns) };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: 장부는 upsert만 쓴다
  return { writes, writer: fake as WorldWriter };
}

describe("좌표 유닛 장부", () => {
  it("넣으면 그 칸에 서 있는 줄로 고쳐 쓰고, 꺼내면 장부에서 빠진다", () => {
    const { writes, writer: w } = writer();
    const book = createParkedBook(w);
    book.put(row(1, 100), 200, { x: 10, y: 20 }, 1_000);
    const center = anchorCenter(10, 20, 1);
    expect(book.get(1)?.row).toMatchObject({
      mapKey: 200,
      path: [center.x, center.y],
      pace: null,
      departAtMs: 1_000,
      wakeAtMs: null,
    });
    expect(writes).toMatchObject([{ id: 1, map_key: 200, path: [center.x, center.y] }]);
    expect(book.hasOwnerOn(200, 7)).toBe(true);
    expect(book.hasOwnerOn(200, 8)).toBe(false);
    expect(book.ofOwner(7).map((entry) => entry.row.id)).toEqual([1]);
    expect(book.take(1)?.id).toBe(1);
    expect(book.size).toBe(0);
    expect(book.hasOwnerOn(200, 7)).toBe(false);
  });

  it("배는 승객과 함께 넣고 꺼낸다(승객 혼자는 꺼내지 않는다), 부팅 adopt는 쓰지 않는다", () => {
    const { writes, writer: w } = writer();
    const book = createParkedBook(w);
    book.put({ ...row(3, 100), riders: [row(2, 100, 7, 3)] }, 300, { x: 50, y: 60 }, 1, false);
    expect(writes).toEqual([]);
    expect(book.get(2)?.row).toMatchObject({ mapKey: 300, aboardId: 3 });
    expect(book.take(2)).toBeUndefined();
    const boat = book.take(3);
    expect(boat?.riders?.map((rider) => rider.id)).toEqual([2]);
    expect(book.size).toBe(0);
  });

  it("2차맵을 띄우면 그 2차맵 줄을 모두 꺼내고, 막힌 칸은 고친다(승객은 배 칸을 따른다)", () => {
    const book = createParkedBook();
    book.put({ ...row(3, 1), riders: [row(2, 1, 7, 3)] }, 400, { x: 5, y: 5 }, 1);
    book.put(row(4, 1), 400, { x: 9, y: 9 }, 1);
    book.put(row(5, 1), 401, { x: 9, y: 9 }, 1);
    const rows = book.claim(400, (unit, cell) => (unit.id === 3 ? { x: 6, y: 5 } : cell));
    expect(rows.map((unit) => [unit.id, unit.path])).toEqual([
      [2, [anchorCenter(6, 5, 1).x, anchorCenter(6, 5, 1).y]],
      [3, [anchorCenter(6, 5, 1).x, anchorCenter(6, 5, 1).y]],
      [4, [anchorCenter(9, 9, 1).x, anchorCenter(9, 9, 1).y]],
    ]);
    expect(book.size).toBe(1);
    expect(book.claim(400)).toEqual([]);
  });
});

const spawnWith = (outcome: "ok" | "full" | "invalid" | "failed") => {
  const opened: string[] = [];
  return {
    opened,
    spawn: {
      canOpen: (mapKey: number) => mapKey !== 9,
      open: (mapKey: number, reason?: "view") => {
        opened.push(`${mapKey}:${reason}`);
        return Promise.resolve(outcome);
      },
    },
  };
};
const viewTravel = { hasParked: (mapKey: number, ownerId: number) => mapKey === 1 && ownerId === 7 };
const ownerOfUser = (userId: string) => (userId === "me" ? 7 : undefined);

describe("보는 사람이 띄우기(viewOpen)", () => {
  it("내 좌표 유닛이 선 2차맵·운영자 전체 보기만 띄운다. 이미 떴으면 ok, 상한이면 busy", async () => {
    const ok = spawnWith("ok");
    const parts = {
      maps: new Map<number, unknown>([[5, {}]]),
      spawn: ok.spawn,
      travel: viewTravel,
      ownerOfUser,
    };
    expect(await openForView(parts, "me", 5, false)).toBe("ok");
    expect(await openForView(parts, "me", 1, false)).toBe("ok");
    expect(await openForView(parts, "me", 2, false)).toBe("refused");
    expect(await openForView(parts, "other", 1, false)).toBe("refused");
    expect(await openForView(parts, "other", 2, true)).toBe("ok");
    expect(await openForView(parts, "me", 9, true)).toBe("refused");
    expect(ok.opened).toEqual(["1:view", "2:view"]);
    const full = spawnWith("full");
    expect(await openForView({ ...parts, spawn: full.spawn }, "me", 1, false)).toBe("busy");
    expect(await openForView({ ...parts, spawn: undefined }, "me", 1, false)).toBe("refused");
  });
});
