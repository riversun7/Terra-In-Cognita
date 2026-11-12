// 계산식 덮어쓰기 시험 — docs/adr/2026-11-01-formula-editor.md "저장·바로 듦"(D1 덮어쓰기 층을 글 값으로 넓힘).
// 저장소 팩을 서버 시작과 같은 길로 읽는다. 묶음 검사·켤 때 고르기(팩 이김·지움)·전투 식 묶음·행 식이 표·규칙 검사에 드는지 본다.
import { loadContentPack } from "@terra/content/node";
import { DEFAULT_COMBAT_FORMULAS } from "@terra/shared/formula";
import {
  DEFAULT_COMBAT_FORMULA_SET,
  TEST_STAT_TABLE,
  attackValue,
  computeSecondary,
  TEST_COMBAT_COEFFICIENTS,
} from "@terra/sim";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { formulaEntriesOf, statRowsOf, tuningEntriesOf } from "../world/combatCatalog.ts";
import { type FormulaOverrideRecord, createTuningState } from "./state.ts";

function packState() {
  const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
  if (!loaded.source) throw new Error("content pack");
  return createTuningState(
    tuningEntriesOf(loaded.source),
    statRowsOf(loaded.source),
    formulaEntriesOf(loaded.source),
  );
}

const formula = (id: string, source: string, packSource: string, updatedAtMs = 1): FormulaOverrideRecord => ({
  id,
  source,
  packSource,
  contentVersion: "core@21",
  note: null,
  updatedById: null,
  updatedByName: null,
  updatedAtMs,
});

const primaries = { str: 10, dex: 10, agi: 10, vit: 10, int: 10, wis: 10 };

describe("계산식 칸", () => {
  it("행 식 17개(켜진 행, D-502로 명중·크리·행동 속도 점수를 끔, D-512 323 제작 직무 행, D-514 HP 회복) + 전투 식 11개(D-511 적정 STA·실제 회복), 팩 식은 가중치에서 만든 식·팩 formulas 글", () => {
    const state = packState();
    expect(state.formulaSlots.filter((slot) => slot.group === "stat")).toHaveLength(17);
    expect(state.formulaSlots.filter((slot) => slot.group === "combat")).toHaveLength(13);
    expect(state.formulaSlot("stamina_appropriate")?.packSource).toBe(
      DEFAULT_COMBAT_FORMULAS.stamina_appropriate,
    );
    expect(state.formulaSlot("real_stamina_regen")?.packSource).toBe(
      DEFAULT_COMBAT_FORMULAS.real_stamina_regen,
    );
    expect(state.formulaSlot("stamina_regen.formula")?.packSource).toBe("720 + GEAR + BUFF");
    expect(state.formulaSlot("hp_regen.formula")?.packSource).toBe(
      "60 + VIT * 4.8 + WIS * 2.4 + GEAR + BUFF",
    );
    expect(state.formulaSlot("hp.formula")?.packSource).toBe(
      "STR * 1.5 + DEX + AGI * 1.5 + VIT * 3 + INT + WIS * 1.2 + GEAR + BUFF",
    );
    expect(state.formulaSlot("bare_appropriate")?.packSource).toBe(DEFAULT_COMBAT_FORMULAS.bare_appropriate);
    // 팩 식 그대로면 판정 코드의 기본 묶음과 같은 객체(같은 결과·같은 캐시)
    expect(state.combatFormulas().real_attack).toBe(DEFAULT_COMBAT_FORMULA_SET.real_attack);
    expect(state.statTable()).toEqual(TEST_STAT_TABLE);
  });

  it("행 식 실효 글은 덮어쓴 가중치에서 만든다", () => {
    const state = packState();
    state.install(
      [
        {
          id: "hp.vit",
          value: 4000,
          packValue: 3000,
          unit: "pm",
          contentVersion: "core@21",
          note: null,
          updatedById: null,
          updatedByName: null,
          updatedAtMs: 1,
        },
      ],
      1,
    );
    expect(state.formulaSource("hp.formula")).toContain("VIT * 4");
  });
});

describe("묶음 검사(plan)", () => {
  it("읽히는 식만 받는다: 오타는 invalid_formula와 오류 위치", () => {
    const state = packState();
    const plan = state.plan([], [{ id: "hp.formula", source: "VIT * 3 + STRR" }]);
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason).toBe("invalid_formula");
    expect(plan.formulaErrors?.[0]).toMatchObject({ code: "unknown_name", s: 10, suggestion: "STR" });
  });

  it("없는 칸은 unknown_entry, 같은 칸 두 번은 duplicate_entry", () => {
    const state = packState();
    const unknown = state.plan([], [{ id: "nope.formula", source: "1" }]);
    expect(!unknown.ok && unknown.reason).toBe("unknown_entry");
    const twice = state.plan(
      [],
      [
        { id: "hp.formula", source: "VIT * 4" },
        { id: "hp.formula", source: "VIT * 5" },
      ],
    );
    expect(!twice.ok && twice.reason).toBe("duplicate_entry");
  });

  it("팩 식과 같은 글(앞뒤 빈칸)은 되돌리기: 덮어쓰기가 없으면 바꿀 것 없음", () => {
    const state = packState();
    const source = state.formulaSlot("real_hit")?.packSource ?? "";
    const plan = state.plan([], [{ id: "real_hit", source: `  ${source}\n` }]);
    expect(plan).toEqual({ ok: true, changes: [], formulas: [] });
  });

  it("행 식이 1차 하나를 모든 행에서 빼면 가치 없는 1차(rules_conflict)", () => {
    const state = packState();
    // WIS를 쓰는 행을 모두 WIS 없이 바꾼다
    const changes = state.formulaSlots
      .filter((slot) => slot.group === "stat" && slot.packSource.includes("WIS"))
      .map((slot) => ({ id: slot.key, source: "GEAR + BUFF" }));
    const plan = state.plan([], changes);
    expect(!plan.ok && plan.reason).toBe("rules_conflict");
    expect(!plan.ok && plan.problems).toEqual(["stat_primary_unused"]);
  });

  it("칸 값과 식을 한 묶음으로", () => {
    const state = packState();
    const plan = state.plan(
      [{ id: "hp.vit", value: 4000 }],
      [{ id: "real_attack", source: "2 * if(A <= 0, W, floor(W * min(CAP, max(0, S) / A)))" }],
    );
    expect(plan.ok && plan.changes.length).toBe(1);
    expect(plan.ok && plan.formulas).toEqual([
      {
        id: "real_attack",
        before: null,
        after: "2 * if(A <= 0, W, floor(W * min(CAP, max(0, S) / A)))",
      },
    ]);
  });
});

describe("바로 듦(install)", () => {
  it("행 식 덮어쓰기는 실효 표에, 전투 식 덮어쓰기는 전투 식 묶음에 든다", () => {
    const state = packState();
    const hp = state.formulaSlot("hp.formula")?.packSource ?? "";
    const attack = state.formulaSlot("real_attack")?.packSource ?? "";
    state.install([], 3, [
      formula("hp.formula", "VIT * 10 + STR + DEX + AGI + INT + WIS", hp),
      formula("real_attack", `2 * (${attack})`, attack),
    ]);
    expect(computeSecondary(primaries, state.statTable()).hp).toBe(150);
    const c = { ...TEST_COMBAT_COEFFICIENTS, formulas: state.combatFormulas() };
    // 2 × (스탯 공격력 0 + 무기 20 × min(1, STR 40 ÷ 적정 40)) = 40
    expect(attackValue(0, 20, 40, 40_000, 1000, c)).toBe(40);
    expect(state.formulaOverrideCount()).toBe(2);
    expect(state.appliedCount()).toBe(2);
    // 칸만 바꾼 install은 식 덮어쓰기를 그대로 둔다
    state.install([], 4);
    expect(state.formulaOverrideCount()).toBe(2);
    // 읽히지 않는 식은 넣지 않는다(켤 때 고른 뒤라 생기지 않지만 지킨다)
    state.install([], 5, [formula("real_hit", "W +", "x")]);
    expect(state.formulaOverrideCount()).toBe(0);
  });
});

describe("켤 때 고르기(가장 나중에 바꾼 것이 이긴다, 시작을 막지 않는다)", () => {
  it("팩 식이 저장 뒤에 바뀌면 팩이 이긴다, 칸이 없거나 새 변수로 읽히지 않으면 지운다", () => {
    const state = packState();
    const attack = state.formulaSlot("real_attack")?.packSource ?? "";
    const selection = state.selectAtBoot(
      [],
      [
        formula("real_attack", `3 * ${attack}`, attack, 1),
        formula("real_hit", "W * 2", "옛 팩 식", 2),
        formula("gone.formula", "1", "1", 3),
        formula("real_crit", "W + NOPE", state.formulaSlot("real_crit")?.packSource ?? "", 4),
      ],
    );
    expect(selection.formulaKeep.map((row) => row.id)).toEqual(["real_attack"]);
    expect(selection.formulaPackWon.map(({ row }) => row.id)).toEqual(["real_hit"]);
    expect(selection.formulaDropped.map(({ row, reason }) => [row.id, reason])).toEqual([
      ["gone.formula", "unknown_entry"],
      ["real_crit", "invalid_formula"],
    ]);
  });

  it("저장 차례대로 얹다 가치 없는 1차가 되면 그 줄을 지운다", () => {
    const state = packState();
    const wisRows = state.formulaSlots.filter(
      (slot) => slot.group === "stat" && slot.packSource.includes("WIS"),
    );
    const rows = wisRows.map((slot, index) => formula(slot.key, "GEAR + BUFF", slot.packSource, index + 1));
    const selection = state.selectAtBoot([], rows);
    expect(selection.formulaKeep).toHaveLength(rows.length - 1);
    expect(selection.formulaDropped.map(({ reason }) => reason)).toEqual(["rules_conflict"]);
  });
});
