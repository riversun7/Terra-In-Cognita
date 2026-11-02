// 옛 모양 전투 실험실 프리셋 읽기 시험(legacy.ts, D-502): D-502 전 직접 값 무기(2차 점수 적정치 칸)가 든 프리셋이 지금 스키마로 읽힌다.
import { newLabUnit } from "@terra/shared/battleLab";
import { describe, expect, it } from "vitest";
import { upgradeLegacyPreset } from "./legacy.ts";
import { presetViewOf } from "./presets.ts";

/** D-502 전 직접 값 무기 */
const oldSpec = {
  physical: { attack: 30, appropriate: 20 },
  elemental: null,
  basic: "physical",
  hitPm: 900,
  hitAppropriate: 20,
  critPm: 100,
  critAppropriate: 20,
  intervalMs: 1100,
  speedAppropriate: 100,
  range: 1,
  arc: false,
  staminaCost: 10,
  mpCost: 0,
  elementsPm: Array.from({ length: 12 }, () => 0),
};
const oldUnit = { ...newLabUnit("human"), weapon: { kind: "custom", spec: oldSpec } };

const row = (kind: string, data: unknown) => ({
  id: "lab_0123456789ab",
  kind,
  nameKo: "옛 프리셋",
  nameEn: "Old preset",
  data,
  version: 1,
  updatedByName: null,
  updatedAtMs: 1,
});

describe("옛 모양 전투 실험실 프리셋(D-502)", () => {
  it("직접 값 무기: 공격력 칸 {attack}, 적정은 모두 0(옛 2차 점수 적정치는 1차로 옮길 수 없다)", () => {
    const unit = upgradeLegacyPreset("unit", oldUnit);
    expect(unit).toMatchObject({
      weapon: {
        kind: "custom",
        spec: {
          physical: { attack: 30 },
          elemental: null,
          appropriate: { str: 0, int: 0, dex: 0, agi: 0 },
          intervalMs: 1100,
        },
      },
    });
    const view = presetViewOf(row("unit", oldUnit));
    expect(view?.kind).toBe("unit");
    const party = presetViewOf(row("party", { units: [oldUnit, newLabUnit("cyborg")], retreatHpPct: 0 }));
    expect(party?.kind).toBe("party");
  });

  it("고칠 것이 없으면 같은 값", () => {
    const fresh = newLabUnit("human");
    expect(upgradeLegacyPreset("unit", fresh)).toBe(fresh);
    const party = { units: [fresh], retreatHpPct: 0 };
    expect(upgradeLegacyPreset("party", party)).toBe(party);
  });
});
