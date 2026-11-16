// 유닛 AI 작전 저장소(D-5039·D-5040, encounter-4) — 표 읽기, 소유·종류 검사, 쓰기 대기열 한 줄
import { AI_PRESET_VALUES } from "@terra/shared/aiTactics";
import { describe, expect, it } from "vitest";
import type { SecondMap } from "../world/secondMap.ts";
import { attachUnitTactics, tacticsOfRow, unitTacticsOf } from "./store.ts";

const KIND_HUMAN = 4;
const KIND_BOT = 0;

function world(rows: Record<string, unknown>[]) {
  const writes: unknown[] = [];
  const map = {
    unitInfo: (id: number) =>
      id === 1 || id === 2 || id === 3
        ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: 주인·종류만
          ({ ownerId: id === 2 ? 8 : 7, kind: id === 3 ? KIND_BOT : KIND_HUMAN } as unknown as ReturnType<
            SecondMap["unitInfo"]
          >)
        : undefined,
  };
  const persistence = {
    pool: { query: () => Promise.resolve({ rows }) },
    writer: {
      upsert: (table: string, row: unknown) => {
        writes.push([table, row]);
      },
    },
    settlement: { findOwnerOfUser: (userId: string) => (userId === "me" ? 7 : undefined) },
    travel: { coordinateUnits: () => [{ unitId: 9, ownerId: 7, kind: KIND_HUMAN }] },
  };
  return { world: { maps: new Map([[1, map]]), persistence, now: () => 1234 }, writes, persistence };
}

describe("유닛 AI 작전 저장소", () => {
  it("표를 읽어 들고, 내 판단 유닛(띄운 2차맵·좌표 유닛)만 저장한다", async () => {
    const aggressive = AI_PRESET_VALUES.aggressive;
    const rig = world([
      {
        unit_id: 1,
        preset: "aggressive",
        engage: 9,
        pursue: 8,
        cover: 3,
        escort: 2,
        save_skill: 2,
        spread: 3,
        retreat_pct: 0,
        target: "weakest",
      },
      { unit_id: 5, preset: "nope" },
    ]);
    const store = attachUnitTactics(rig.world);
    if (!store) throw new Error("no store");
    expect(attachUnitTactics(rig.world)).toBe(store);
    expect(unitTacticsOf(rig.persistence)).toBe(store);
    await store.loaded;
    expect(store.get(1)).toEqual(aggressive);
    expect(store.get(5)).toBeUndefined();
    const hold = AI_PRESET_VALUES.hold;
    expect(store.set("me", 9, hold)).toEqual({ ok: true });
    expect(store.get(9)).toEqual(hold);
    expect(rig.writes).toEqual([
      [
        "unitTactics",
        {
          unit_id: 9,
          preset: "hold",
          engage: 1,
          pursue: 0,
          cover: 10,
          escort: 8,
          save_skill: 8,
          spread: 7,
          retreat_pct: 0,
          target: "nearest",
          updated_at_ms: 1234,
        },
      ],
    ]);
    expect(store.set("me", 2, hold)).toEqual({ ok: false, code: "forbidden" });
    expect(store.set("me", 3, hold)).toEqual({ ok: false, code: "forbidden" });
    expect(store.set("me", 99, hold)).toEqual({ ok: false, code: "unknown_unit" });
    expect(store.set("stranger", 1, hold)).toEqual({ ok: false, code: "unknown_unit" });
    expect(store.set("me", 1, { ...hold, engage: 11 })).toEqual({ ok: false, code: "forbidden" });
  });

  it("틀린 줄은 읽지 않는다", () => {
    expect(tacticsOfRow({ preset: "balanced", target: "nearest" })).toBeUndefined();
  });
});
