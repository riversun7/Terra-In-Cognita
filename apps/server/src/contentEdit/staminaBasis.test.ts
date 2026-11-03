// 행동별 소모 화면의 스태미나 기준(D-511) 시험 — 저장소 팩을 서버 시작과 같은 길로 읽어, 보통 유닛 Lv 1·30의 적정 STA·회복과
// 무기 줄마다 기본 공격 소모·간격이 판정과 같은 값이고, 출발값에서 모든 무기의 일반 공격이 이어지는지 본다.
import { loadContentPack } from "@terra/content/node";
import type { ActionCostRow } from "@terra/shared/skillEditor";
import { combatCoefficientsFrom } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { rosterCatalogOf } from "../roster/catalog.ts";
import { createTuningState } from "../tuning/state.ts";
import { statRowsOf, tuningEntriesOf } from "../world/combatCatalog.ts";
import { STAMINA_BASIS_LEVELS, staminaBasisOf } from "./staminaBasis.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
const source = loaded.source;
if (!source) throw new Error("content pack");
const packSource = source;

function basisOf(rows: readonly ActionCostRow[]) {
  const state = createTuningState(tuningEntriesOf(packSource), statRowsOf(packSource));
  const roster = rosterCatalogOf(
    packSource,
    () => state.society(),
    () => state.statTable(),
  );
  return {
    roster,
    basis: staminaBasisOf(
      {
        combat: roster.combat,
        coefficients: combatCoefficientsFrom(state.values(), undefined, state.combatFormulas()),
        growthPm: state.society().cyborg.growthPm,
      },
      rows,
    ),
  };
}

const row = (kind: "weapon" | "natural", id: string): ActionCostRow => ({
  kind,
  key: `${kind === "weapon" ? "items" : "unit_kinds"}/${id}`,
  id,
  name: { ko: id, en: id },
  staminaCost: 10,
  mpCost: 0,
  basic: "physical",
  origin: "pack",
  enabled: true,
});

describe("스태미나 기준(D-511)", () => {
  it("보통 유닛 Lv 1·30: 적정 STA = STA 점수(배율 1), 회복 분당 720, 최대 = 100 + 점수", () => {
    const { basis } = basisOf([]);
    expect(STAMINA_BASIS_LEVELS).toEqual([1, 30]);
    expect(basis.levels).toEqual([
      { level: 1, primary: 10, appropriateMilli: 10_000, score: 10, max: 110, regenPerMinute: 720 },
      { level: 30, primary: 39, appropriateMilli: 39_000, score: 39, max: 139, regenPerMinute: 720 },
    ]);
  });

  it("무기 줄마다 기본 공격 소모·간격(Lv 1 검은 적정 AGI 12 미만이라 1,200ms), 고정·스킬 줄은 없다", () => {
    const rows: ActionCostRow[] = [
      { kind: "fixed", key: "walk", status: "free" },
      row("weapon", "test_sword"),
      row("natural", "human"),
      row("natural", "creature"),
    ];
    const { basis } = basisOf(rows);
    expect(Object.keys(basis.attacks)).toEqual([
      "items/test_sword",
      "unit_kinds/human",
      "unit_kinds/creature",
    ]);
    expect(basis.attacks["items/test_sword"]).toEqual([
      { costMilli: 10_000, intervalMs: 1200 },
      { costMilli: 10_000, intervalMs: 1000 },
    ]);
    expect(basis.attacks["unit_kinds/creature"]?.[1]).toEqual({ costMilli: 10_000, intervalMs: 900 });
  });

  it("출발값에서 팩의 모든 무기·타고난 무기로 일반 공격이 이어진다(초당 회복 ≥ 초당 소모)", () => {
    const { roster } = basisOf([]);
    const rows = [
      ...roster.combat.equipment.flatMap((item) => (item.weapon ? [row("weapon", item.id)] : [])),
      ...roster.combat.unitKinds.map((kind) => row("natural", kind.id)),
    ];
    const { basis } = basisOf(rows);
    expect(Object.keys(basis.attacks)).toHaveLength(rows.length);
    for (const [key, attacks] of Object.entries(basis.attacks))
      attacks.forEach((attack, index) => {
        const regen = basis.levels[index]?.regenPerMinute ?? 0;
        expect(regen * attack.intervalMs, `${key} Lv ${basis.levels[index]?.level}`).toBeGreaterThanOrEqual(
          60 * attack.costMilli,
        );
      });
  });
});
