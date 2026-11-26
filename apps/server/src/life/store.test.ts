// 유닛 생활 규칙 저장소(docs/adr/2026-11-26-unit-life-rules.md) — 표 읽기, 성향 기본값, 소유·종류·모양 검사, 저장 전 정산, 쓰기 대기열 한 줄
import { TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { SecondMap } from "../world/secondMap.ts";
import { attachUnitLife, penaltyFromOf, unitLifeOf } from "./store.ts";

const KIND_HUMAN = 4;
const KIND_BOT = 0;
/** 성향 7축(규율이 맨 끝) */
const traits = (discipline: number) => [500, 500, 500, 500, 500, 500, discipline];

function world(rows: Record<string, unknown>[]) {
  const writes: unknown[] = [];
  const settled: [number, number][] = [];
  const units: Record<number, { ownerId: number; kind: number; traits?: number[] }> = {
    1: { ownerId: 7, kind: KIND_HUMAN },
    2: { ownerId: 8, kind: KIND_HUMAN },
    3: { ownerId: 7, kind: KIND_BOT },
    4: { ownerId: 7, kind: KIND_HUMAN, traits: traits(1000) },
    5: { ownerId: 7, kind: KIND_HUMAN, traits: traits(0) },
  };
  const map = {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: 주인·종류·성향만
    unitInfo: (id: number) => units[id] as unknown as ReturnType<SecondMap["unitInfo"]>,
  };
  const persistence = {
    pool: { query: () => Promise.resolve({ rows }) },
    writer: {
      upsert: (table: string, row: unknown) => {
        writes.push([table, row]);
      },
    },
    settlement: {
      findOwnerOfUser: (userId: string) => (userId === "me" ? 7 : undefined),
      settleOwner: (ownerId: number, toMs: number) => {
        settled.push([ownerId, toMs]);
      },
    },
  };
  return {
    world: {
      maps: new Map([[1, map]]),
      persistence,
      now: () => 1234,
      rules: () => TEST_SOCIETY_COEFFICIENTS,
    },
    writes,
    settled,
    persistence,
  };
}

describe("유닛 생활 규칙 저장소", () => {
  it("첫 불이익 구간 시작 = 90(기본 계수표)", () => {
    expect(penaltyFromOf(TEST_SOCIETY_COEFFICIENTS)).toBe(90);
  });

  it("표를 읽어 들고, 저장한 값이 없으면 성향 기본값(규율이 높으면 더 버틴다)", async () => {
    const rig = world([
      { unit_id: 1, rest_at: 60, resume_at: 20 },
      { unit_id: 9, rest_at: 10, resume_at: 50 },
    ]);
    const store = attachUnitLife(rig.world);
    if (!store) throw new Error("no store");
    expect(attachUnitLife(rig.world)).toBe(store);
    expect(unitLifeOf(rig.persistence)).toBe(store);
    await store.loaded;
    expect(store.get(1)).toEqual({ restAt: 60, resumeAt: 20 });
    expect(store.of(1)).toEqual({ restAt: 60, resumeAt: 20, saved: true });
    // 틀린 줄은 버린다
    expect(store.get(9)).toBeUndefined();
    // 성향 없는 유닛 = 구간 시작, 규율 1000 = +20, 규율 0 = −20
    expect(store.of(2)).toEqual({ restAt: 90, resumeAt: 0, saved: false });
    expect(store.of(4)).toEqual({ restAt: 110, resumeAt: 0, saved: false });
    expect(store.of(5)).toEqual({ restAt: 70, resumeAt: 0, saved: false });
  });

  it("내 판단 유닛만 저장하고, 저장 전에 그 주체를 지금까지 정산한다", async () => {
    const rig = world([]);
    const store = attachUnitLife(rig.world);
    if (!store) throw new Error("no store");
    await store.loaded;
    expect(store.set("me", 1, { restAt: 100, resumeAt: 30 })).toEqual({ ok: true });
    expect(rig.settled).toEqual([[7, 1234]]);
    expect(rig.writes).toEqual([
      ["unitLifeRules", { unit_id: 1, rest_at: 100, resume_at: 30, updated_at_ms: 1234 }],
    ]);
    expect(store.of(1)).toEqual({ restAt: 100, resumeAt: 30, saved: true });
    // 남의 유닛·판단하지 않는 종류·없는 유닛·모르는 사용자·틀린 모양
    expect(store.set("me", 2, { restAt: 100, resumeAt: 30 })).toEqual({ ok: false, code: "forbidden" });
    expect(store.set("me", 3, { restAt: 100, resumeAt: 30 })).toEqual({ ok: false, code: "forbidden" });
    expect(store.set("me", 99, { restAt: 100, resumeAt: 30 })).toEqual({ ok: false, code: "unknown_unit" });
    expect(store.set("you", 1, { restAt: 100, resumeAt: 30 })).toEqual({ ok: false, code: "unknown_unit" });
    expect(store.set("me", 1, { restAt: 30, resumeAt: 30 })).toEqual({ ok: false, code: "forbidden" });
    expect(store.set("me", 1, { restAt: 130, resumeAt: 0 })).toEqual({ ok: false, code: "forbidden" });
    expect(rig.writes.length).toBe(1);
  });
});
