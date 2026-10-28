// 스냅샷 조각 모으기 시험 — 차례대로 모으기, part 0에서 새로, 빠짐·머리 어긋남은 버림
import type { ServerMessageOf } from "@terra/protocol";
import { describe, expect, it } from "vitest";
import { building, partAt, snapshot, unit } from "./feedTestSupport.ts";
import { createSnapshotAssembler } from "./snapshotParts.ts";

const size = (part: ServerMessageOf<"map_snapshot">): number => JSON.stringify(part).length;

describe("스냅샷 조각 모으기", () => {
  it("조각을 차례대로 모아 마지막 조각에서 한 번에 돌려준다(유닛 먼저, 건물 나중)", () => {
    const assembler = createSnapshotAssembler();
    const parts = snapshot({
      rev: 9,
      units: [unit(1), unit(2), unit(3)],
      parts: 3,
      buildings: [building(4)],
    });
    expect(assembler.add(partAt(parts, 0), 10)).toEqual({ kind: "pending" });
    expect(assembler.active).toBe(true);
    expect(assembler.add(partAt(parts, 1), 20)).toEqual({ kind: "pending" });
    const result = assembler.add(partAt(parts, 2), 30);
    expect(result.kind).toBe("complete");
    if (result.kind !== "complete") return;
    expect(result.snapshot.units.map((u) => u.id)).toEqual([1, 2, 3]);
    expect(result.snapshot.buildings.map((b) => b.id)).toEqual([4]);
    expect(result.snapshot).toMatchObject({
      rev: 9,
      parts: 3,
      bytes: 60,
      terrainUrl: partAt(parts, 0).terrain.url,
    });
    expect(assembler.active).toBe(false);
  });

  it("조각 하나짜리(빈 2차맵 포함)", () => {
    const assembler = createSnapshotAssembler();
    const only = partAt(snapshot({ rev: 0 }), 0);
    const result = assembler.add(only, size(only));
    expect(result.kind === "complete" && result.snapshot.units.length === 0).toBe(true);
  });

  it("part 0이 오면 모으던 것을 버리고 새로 모은다", () => {
    const assembler = createSnapshotAssembler();
    const first = snapshot({ rev: 4, units: [unit(1), unit(2)], parts: 2, snapshotId: 1 });
    const second = snapshot({ rev: 6, units: [unit(7)], parts: 1, snapshotId: 2 });
    assembler.add(partAt(first, 0), 1);
    const result = assembler.add(partAt(second, 0), 1);
    expect(result.kind === "complete" && result.snapshot.units.map((u) => u.id)).toEqual([7]);
  });

  it("차례가 어긋나거나 머리 정보가 다르면 버린다", () => {
    const cases: [string, (part: ServerMessageOf<"map_snapshot">) => ServerMessageOf<"map_snapshot">][] = [
      ["건너뛴 조각", (part) => ({ ...part, part: 2 })],
      ["다른 snapshotId", (part) => ({ ...part, snapshotId: 99 })],
      ["다른 조각 수", (part) => ({ ...part, parts: 5 })],
      ["다른 rev", (part) => ({ ...part, rev: 77 })],
    ];
    for (const [label, change] of cases) {
      const assembler = createSnapshotAssembler();
      const parts = snapshot({ rev: 4, units: [unit(1), unit(2), unit(3)], parts: 3 });
      assembler.add(partAt(parts, 0), 1);
      expect(assembler.add(change(partAt(parts, 1)), 1), label).toEqual({ kind: "broken" });
      expect(assembler.active, label).toBe(false);
    }
  });

  it("part 0 없이 온 조각은 버린다", () => {
    const assembler = createSnapshotAssembler();
    const parts = snapshot({ rev: 4, units: [unit(1), unit(2)], parts: 2 });
    expect(assembler.add(partAt(parts, 1), 1)).toEqual({ kind: "broken" });
  });
});
