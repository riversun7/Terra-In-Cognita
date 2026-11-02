// 아이템 미리 보기 시험(설계안 3.7, WP-3) — 실제 팩으로: 장비 미리 보기 = 유닛 화면과 같은 함수(bodyView)로 셈한 값, 식을 덮어쓰면
// 무기 미리 보기 값이 바뀐다, 1차 적정 스탯 → 2차 적정치(D-496), 1차 합이 넘치면 칸 오류, 스키마에 걸린 초안은 코드가 붙은 문제.
import { loadContentPack } from "@terra/content/node";
import { DEFAULT_PREVIEW_UNIT } from "@terra/shared/itemEditor";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { bodyView } from "../roster/body.ts";
import { rosterCatalogOf } from "../roster/catalog.ts";
import { type FormulaOverrideRecord, createTuningState } from "../tuning/state.ts";
import { formulaEntriesOf, statRowsOf, tuningEntriesOf } from "../world/combatCatalog.ts";
import { parseDraft, previewItem } from "./preview.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source) throw new Error("content pack");
const source = loaded.source;

function setup() {
  const tuning = createTuningState(tuningEntriesOf(source), statRowsOf(source), formulaEntriesOf(source));
  const content = createContentEditState(source);
  const roster = rosterCatalogOf(
    source,
    () => tuning.society(),
    () => tuning.statTable(),
    () => content.effective(),
  );
  const ctx = () => ({
    combat: roster.combat,
    tuning,
    effects: content.effects,
    recipes: [],
    values: new Map(content.effective().items.map((item) => [item.id, item.baseValue])),
  });
  return { tuning, content, roster, ctx };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const objectOf = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

const packItem = (id: string): Record<string, unknown> => {
  const entry = createContentEditState(source).packEntry("items", id);
  if (!entry) throw new Error(`fixture ${id}`);
  return structuredClone({ ...entry });
};

describe("장비 미리 보기", () => {
  it("기준 유닛(새 사이보그: 칼·조끼)에 머리 장비를 0·500·1000‰로 입힌 값 = 유닛 화면 bodyView 값", () => {
    const { roster, ctx } = setup();
    const helmet = packItem("test_helmet");
    const preview = previewItem(ctx(), helmet, DEFAULT_PREVIEW_UNIT);
    expect(preview.ok).toBe(true);
    const equip = preview.equip;
    if (!equip) throw new Error("equip");
    expect(equip.slotIndex).toBe(2);
    expect(equip.replaced).toBeNull();
    const flat = { str: 10, dex: 10, agi: 10, vit: 10, int: 10, wis: 10 };
    const body = (pm: number | null) =>
      bodyView(roster, {
        kind: "cyborg",
        initial: flat,
        kPm: null,
        level: 1,
        rebirths: 0,
        equipped: new Map([
          [0, { item: "test_sword", pm: 0 }],
          [3, { item: "test_vest", pm: 0 }],
          ...(pm === null ? [] : [[2, { item: "test_helmet", pm }] as const]),
        ]),
        innateSkills: [],
        source: "baseline",
      });
    const rowOf = (view: ReturnType<typeof body>, id: string) =>
      view.stats.secondary.find((row) => row.id === id)?.value;
    for (const row of equip.rows) {
      expect(row.before).toBe(rowOf(body(null), row.id));
      expect(row.after).toEqual([0, 500, 1000].map((pm) => rowOf(body(pm), row.id)));
    }
    // 머리 장비는 아머 HP를 올린다(팩 시험 장비)
    const armor = equip.rows.find((row) => row.id === "armor_hp");
    expect((armor?.after[2] ?? 0) > (armor?.before ?? 0)).toBe(true);
  });

  it("kinds에 이 종류가 없으면 입을 수 없음으로 알린다, 그 종류에 칸이 없으면 칸 번호 null", () => {
    const { ctx } = setup();
    const ring = {
      ...packItem("test_ring"),
      equip: { ...objectOf(packItem("test_ring").equip), kinds: ["creature"] },
    };
    expect(previewItem(ctx(), ring, DEFAULT_PREVIEW_UNIT).equip?.wearable).toBe(false);
    const heart = packItem("test_heart");
    expect(previewItem(ctx(), heart, { ...DEFAULT_PREVIEW_UNIT, kind: "human" }).equip?.slotIndex).toBeNull();
  });

  it("1차 스탯 합이 넘쳐도 던지지 않고 입력 범위(10,000,000)에서 자른다(WP-5)", () => {
    const { ctx } = setup();
    const ring = packItem("test_ring");
    const huge = {
      ...ring,
      equip: { slot: "accessory", stats: [{ stat: "str", min: 10_000_000, max: 10_000_000 }] },
    };
    const equip = previewItem(ctx(), huge, DEFAULT_PREVIEW_UNIT).equip;
    expect(equip?.error).toBeNull();
    expect(equip?.primaries.find((row) => row.stat === "str")?.after).toEqual([
      10_000_000, 10_000_000, 10_000_000,
    ]);
  });

  it("입을 수 없는 종류면 입히지 않고 셈한다(입기 전 = 뒤), 쓰지 않은 장비로 알린다(D-494)", () => {
    const { ctx } = setup();
    const ring = {
      ...packItem("test_ring"),
      equip: { ...objectOf(packItem("test_ring").equip), kinds: ["creature"] },
    };
    const equip = previewItem(ctx(), ring, DEFAULT_PREVIEW_UNIT).equip;
    expect(equip?.ignored).toEqual([{ index: 4, item: "test_ring", reason: "kind" }]);
    const str = equip?.primaries.find((row) => row.stat === "str");
    expect(str?.after).toEqual([str?.before, str?.before, str?.before]);
  });

  it("인공장기의 속성값이 사이보그 속성값에 든다(test_heart 불 2·빙결 3, 팩으로 옮긴 값)", () => {
    const { ctx } = setup();
    const gear = previewItem(ctx(), packItem("test_heart"), DEFAULT_PREVIEW_UNIT).equip?.gear;
    expect(gear?.elements.before).toEqual(Array.from({ length: 12 }, () => 0));
    // 칸 차례: 물·빙결·불·…
    expect(gear?.elements.after[1]).toBe(3);
    expect(gear?.elements.after[2]).toBe(2);
  });

  it("전투 직접 값(저항‰·고정 방어·관통‰)은 입기 전·뒤로 보인다", () => {
    const { ctx } = setup();
    const helmet = packItem("test_helmet");
    const tough = {
      ...helmet,
      equip: {
        ...objectOf(helmet.equip),
        combat: {
          resistPm: [0, 0, 150, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          defenseFlat: 4,
          penetrationPm: 30,
        },
      },
    };
    const gear = previewItem(ctx(), tough, DEFAULT_PREVIEW_UNIT).equip?.gear;
    expect(gear?.resistPm.after[2]).toBe(150);
    expect(gear?.defenseFlat).toEqual({ before: 0, after: 4 });
    expect(gear?.penetrationPm).toEqual({ before: 0, after: 30 });
  });
});

describe("무기 미리 보기", () => {
  it("그 세계의 실효 계산식으로 셈하고, 식을 덮어쓰면 값이 바뀐다(덮어쓴 식 표시)", () => {
    const { tuning, ctx } = setup();
    const sword = packItem("test_sword");
    const before = previewItem(ctx(), sword, DEFAULT_PREVIEW_UNIT).weapon?.fields[0];
    const hitOf = (field: typeof before) => field?.values.find((value) => value.id === "real_hit");
    expect(before?.kind).toBe("physical");
    expect(hitOf(before)?.overridden).toBe(false);
    const record: FormulaOverrideRecord = {
      id: "real_hit",
      source: "floor(W / 2)",
      packSource: tuning.formulaSlot("real_hit")?.packSource ?? "",
      contentVersion: "core@24",
      note: null,
      updatedById: null,
      updatedByName: null,
      updatedAtMs: 1,
    };
    tuning.install([], 1, [record]);
    const after = previewItem(ctx(), sword, DEFAULT_PREVIEW_UNIT).weapon?.fields[0];
    // 시험용 검 명중‰ 900 → 식 W ÷ 2 = 450
    expect(hitOf(after)).toMatchObject({ value: 450, overridden: true });
  });

  it("1차 적정 스탯이 있으면 셈한 2차 적정치를 보인다(질문 290 칼 STR 25·DEX 15 → 물리 59·명중 18·크리 22·속도 54)", () => {
    const { ctx } = setup();
    const sword = packItem("test_sword");
    const equip = objectOf(sword.equip);
    const withAppropriate = {
      ...sword,
      equip: { ...equip, weapon: { ...objectOf(equip.weapon), appropriate: { str: 25, dex: 15 } } },
    };
    const weapon = previewItem(ctx(), withAppropriate, DEFAULT_PREVIEW_UNIT).weapon;
    expect(weapon?.derived).toEqual({
      physicalAttack: 59,
      elementalAttack: 0,
      hit: 18,
      crit: 22,
      speed: 54,
    });
    // 풀이: 물리 공격력 = STR 25 × 2.0 + DEX 15 × 0.6 = 59(지금 가중치 표)
    expect(weapon?.derivedTerms?.find((row) => row.row === "physical_attack")).toEqual({
      row: "physical_attack",
      value: 59,
      base: 0,
      terms: [
        { stat: "str", value: 25, weightPm: 2000 },
        { stat: "dex", value: 15, weightPm: 600 },
      ],
      formula: null,
    });
  });

  it("WP-5: 전투가 셈한 적정치를 쓴다 — 1차 10인 기준 유닛의 효율 = 물리 26 ÷ 59 = 440‰, 실제 공격력 = 20 × 0.44 → 8", () => {
    const { ctx } = setup();
    const sword = packItem("test_sword");
    const equip = objectOf(sword.equip);
    const withAppropriate = {
      ...sword,
      equip: { ...equip, weapon: { ...objectOf(equip.weapon), appropriate: { str: 25, dex: 15 } } },
    };
    const weapon = previewItem(ctx(), withAppropriate, DEFAULT_PREVIEW_UNIT).weapon;
    expect(weapon?.efficiency?.find((row) => row.row === "physical_attack")).toEqual({
      row: "physical_attack",
      stat: 26,
      appropriate: 59,
      ratioPm: 440,
    });
    // 속성 칸이 없는 칼은 속성 공격력 효율 줄이 없다
    expect(weapon?.efficiency?.some((row) => row.row === "elemental_attack")).toBe(false);
    expect(weapon?.capPm).toBe(2000);
    const real = weapon?.fields[0]?.values.find((value) => value.id === "real_attack");
    expect(real?.value).toBe(8);
    // 직접 적은 적정치(40)였다면 20 × 26 ÷ 40 = 13
    const plain = previewItem(ctx(), sword, DEFAULT_PREVIEW_UNIT).weapon;
    expect(plain?.fields[0]?.values.find((value) => value.id === "real_attack")?.value).toBe(13);
  });
});

describe("초안 읽기", () => {
  it("팩 스키마에 걸리면 미리 보기 없이 코드가 붙은 문제", () => {
    const parsed = parseDraft({ ...packItem("ration"), weight: -5 });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues.map((issue) => [issue.path, issue.code])).toEqual([["weight", "too_small"]]);
  });

  it("소모품은 효과 줄마다 효과 사전 값(실효 지속 포함)", () => {
    const { ctx } = setup();
    const potion = {
      ...packItem("ration"),
      use: { effects: [{ effect: "mend", value: 40, chancePm: 1000 }] },
    };
    const lines = previewItem(ctx(), potion, undefined).use?.lines;
    expect(lines?.[0]).toMatchObject({ effect: "mend", kind: "heal", value: 40 });
  });

  it("WP-6: 효과량 = 기준 값 × (1000 + 스탯 × ‰/점) ÷ 1000, ±오차(VIT 39 → HP 40 × 1.39 = 55 → ±25% 41~68)", () => {
    const { ctx } = setup();
    const potion = {
      ...packItem("ration"),
      use: {
        effects: [{ effect: "mend", value: 40, chancePm: 1000, scale: { stat: "vit", pmPerPoint: 10 } }],
      },
    };
    const unit = { ...DEFAULT_PREVIEW_UNIT, primaries: { ...DEFAULT_PREVIEW_UNIT.primaries, vit: 39 } };
    const amount = previewItem(ctx(), potion, unit, 250).use?.lines[0]?.amount;
    expect(amount).toEqual({
      stat: "vit",
      statValue: 39,
      pmPerPoint: 10,
      scaled: 55,
      variancePm: 250,
      min: 41,
      max: 68,
    });
    // 줄에 오차를 적으면 그 값(±10%), 비례 스탯이 없으면 기준 값 그대로
    const fixed = {
      ...potion,
      use: { effects: [{ effect: "mend", value: 40, chancePm: 1000, variancePm: 100 }] },
    };
    expect(previewItem(ctx(), fixed, unit, 250).use?.lines[0]?.amount).toMatchObject({
      stat: null,
      scaled: 40,
      min: 36,
      max: 44,
    });
  });
});
