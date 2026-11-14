// 배 화면 도우미 시험 — 고른 유닛에 보일 배 단추, 결과 문구(docs/adr/2026-11-13-boats.md)
import type { MapUnit } from "@terra/shared/mapUnits";
import { describe, expect, it } from "vitest";
import { boatChoiceOf, boatOutcomeText } from "./boatText.ts";

const unit = (over: Partial<MapUnit>): MapUnit => ({
  unitId: 1,
  kind: "human",
  name: null,
  cellX: 10,
  cellY: 10,
  moving: false,
  job: null,
  injury: 0,
  hold: null,
  ...over,
});

describe("배 단추 고르기", () => {
  it("배·탄 유닛·가까운 자리 있는 배·없음", () => {
    const boatNear = unit({
      unitId: 5,
      kind: "boat",
      cellX: 14,
      cellY: 10,
      boat: { passengers: [], capacity: 4 },
    });
    const boatFar = unit({
      unitId: 6,
      kind: "boat",
      cellX: 90,
      cellY: 10,
      boat: { passengers: [], capacity: 4 },
    });
    const boatFull = unit({
      unitId: 7,
      kind: "boat",
      cellX: 11,
      cellY: 10,
      boat: { passengers: [8], capacity: 1 },
    });
    const walker = unit({});
    const units = [walker, boatFar, boatNear, boatFull];
    expect(boatChoiceOf(boatNear, units)).toEqual({ kind: "boat", boatId: 5, passengers: 0, capacity: 4 });
    expect(boatChoiceOf(unit({ aboard: 6 }), units)).toEqual({ kind: "rider", boatId: 6 });
    expect(boatChoiceOf(walker, units)).toEqual({ kind: "board", boatId: 5 });
    expect(boatChoiceOf(walker, [walker])).toEqual({ kind: "none" });
    expect(boatChoiceOf(unit({ hold: "captive" }), units)).toEqual({ kind: "none" });
    expect(boatChoiceOf(undefined, units)).toEqual({ kind: "none" });
  });

  it("결과 문구", () => {
    expect(boatOutcomeText("build", { ok: true, boatId: 9 })).toContain("9");
    expect(boatOutcomeText("board", { ok: true, walking: true })).not.toBe(
      boatOutcomeText("board", { ok: true }),
    );
    expect(boatOutcomeText("leave", { ok: false, code: "no_shore" })).not.toBe(
      boatOutcomeText("leave", { ok: false, code: "wrong_map" }),
    );
    expect(boatOutcomeText("leave", { ok: false, code: "offline" })).toBe(
      boatOutcomeText("leave", { ok: false, code: "busy" }),
    );
  });
});
