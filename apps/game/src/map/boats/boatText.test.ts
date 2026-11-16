// 배 화면 도우미 시험 — 고른 유닛에 보일 배 단추, 결과 문구(docs/adr/2026-11-13-boats.md)
import type { MapUnit } from "@terra/shared/mapUnits";
import { describe, expect, it } from "vitest";
import { boatChoiceOf, boatGatherOf, boatOutcomeText, boatStatusText, dockJobText } from "./boatText.ts";

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

  it("만드는 시간(D-541 1271 나): 만들기 시작·부두가 바쁨·남은 시간", () => {
    const now = 1_800_000_000_000;
    const started = boatOutcomeText("build", { ok: true, readyAtMs: now + 5 * 60_000 }, now);
    expect(started).not.toBe(boatOutcomeText("build", { ok: true, boatId: 9 }, now));
    expect(started).toContain("5");
    expect(
      boatOutcomeText("build", { ok: false, code: "dock_busy", readyAtMs: now + 120_000 }, now),
    ).toContain("2");
    expect(boatOutcomeText("build", { ok: false, code: "dock_busy" }, now)).not.toBe(
      boatOutcomeText("build", { ok: false, code: "busy" }, now),
    );
    expect(dockJobText(undefined, now)).toBeNull();
    expect(dockJobText({ readyAt: now + 3 * 60_000 }, now)).toContain("3");
  });
});

describe("배에서 캐기 판(D-541 1280 가)", () => {
  it("탄 유닛은 바다 오브젝트만, 걷는 유닛은 배로만 닿는 것을 못 캔다", () => {
    expect(boatGatherOf({ boat: true }, true, true)).toBe("from_boat");
    expect(boatGatherOf({ boat: false }, true, true)).toBe("from_boat");
    expect(boatGatherOf({ boat: true }, false, true)).toBe("from_boat");
    expect(boatGatherOf({}, false, true)).toBe("not_from_boat");
    expect(boatGatherOf({ boat: true }, true, false)).toBe("boat_only");
    expect(boatGatherOf({}, true, false)).toBe("none");
    expect(boatGatherOf(undefined, false, false)).toBe("none");
  });
});

describe("배 체계 개편(D-547) 문구", () => {
  it("배 줄 상태: 내구도·집 정박장, 정보가 없으면 null", () => {
    expect(boatStatusText(undefined)).toBeNull();
    expect(boatStatusText({ passengers: [], capacity: 4 })).toBeNull();
    const homed = boatStatusText({ passengers: [], capacity: 4, hullPm: 875, homeId: 12, typeId: "rowboat" });
    expect(homed).toContain("87");
    expect(homed).toContain("12");
    const homeless = boatStatusText({ passengers: [], capacity: 4, hullPm: 1000, homeId: null });
    expect(homeless).toContain("100");
  });

  it("새 결과 코드마다 문구가 있다(코드 그대로 보이지 않는다)", () => {
    for (const code of [
      "not_shipyard",
      "not_berth",
      "not_trade_dock",
      "unknown_boat_type",
      "no_berth",
      "trade_full",
      "berth_denied",
      "harbor_closed",
      "insufficient_funds",
      "hull_full",
      "module_locked",
      "invalid_policy",
    ] as const)
      expect(boatOutcomeText("berth", { ok: false, code })).not.toContain(code);
    expect(boatOutcomeText("repair", { ok: true, walking: true })).not.toBe("");
    expect(boatOutcomeText("policy", { ok: true })).not.toBe("");
  });

  it("D-559: 새 결과 코드·출고·연료·표류·오버히트 문구", () => {
    for (const code of [
      "not_docked",
      "not_moored",
      "fuel_full",
      "fuel_empty",
      "cooling",
      "not_aboard",
      "post_full",
      "own_boat",
      "not_drifting",
    ] as const)
      expect(boatOutcomeText("release", { ok: false, code })).not.toContain(code);
    expect(boatOutcomeText("release", { ok: true, boatId: 41 })).toContain("41");
    expect(boatOutcomeText("seize", { ok: true, boatId: 42 })).toContain("42");
    const status = boatStatusText({
      passengers: [],
      capacity: 4,
      hullPm: 0,
      homeId: null,
      fuelPm: 455,
      drifting: true,
      overheat: false,
    });
    expect(status).toContain("45%");
    expect(status).toContain("표류");
  });

  it("실제 운반(기획 대조 boats-5): 운반꾼이 걷는 중이면 남은 시간, 운반꾼이 없으면 그 까닭", () => {
    const now = 1_000_000;
    const carrying = { ok: true as const, walking: true, readyAtMs: now + 90_000 };
    expect(boatOutcomeText("unload", carrying, now)).not.toBe(boatOutcomeText("unload", { ok: true }, now));
    expect(boatOutcomeText("load", carrying, now)).not.toBe(boatOutcomeText("load", { ok: true }, now));
    expect(boatOutcomeText("load", { ok: false, code: "no_carrier" })).not.toContain("no_carrier");
  });
});
