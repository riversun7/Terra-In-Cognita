// 아이템 미리 보기 시험(설계안 3.7, WP-3) — 실제 팩으로: 장비 미리 보기 = 유닛 화면과 같은 함수(bodyView)로 셈한 값, 식을 덮어쓰면
// 무기 미리 보기 값이 바뀐다, 1차 적정 스탯 → 2차 적정치(D-496), 1차 합이 넘치면 칸 오류, 스키마에 걸린 초안은 코드가 붙은 문제.
import { loadContentPack } from "@terra/content/node";
import { DEFAULT_PREVIEW_UNIT } from "@terra/shared/itemEditor";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { bodyView } from "../roster/body.ts";
import { rosterCatalogOf } from "../roster/catalog.ts";
import { type FormulaOverrideRecord, type TuningOverrideRecord, createTuningState } from "../tuning/state.ts";
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

  it("D-502 몫마다 비율: 기준 유닛(1차 10)이 검(공격력 20·적정 STR 25·DEX 12·AGI 12)을 들면 STR 400‰·DEX 833‰·AGI 833‰", () => {
    const { ctx } = setup();
    const weapon = previewItem(ctx(), packItem("test_sword"), DEFAULT_PREVIEW_UNIT).weapon;
    expect(weapon?.parts).toEqual([
      { part: "physical", stat: "str", value: 10, appropriate: 25, ratioPm: 400 },
      { part: "hit", stat: "dex", value: 10, appropriate: 12, ratioPm: 833 },
      { part: "crit", stat: "dex", value: 10, appropriate: 12, ratioPm: 833 },
      { part: "speed", stat: "agi", value: 10, appropriate: 12, ratioPm: 833 },
    ]);
    expect(weapon?.capPm).toBe(1000);
    const values = weapon?.fields[0]?.values;
    // 공격력 = 스탯 공격력 10 + 20 × 0.4 = 18(사용자 예), 명중 900 × 0.833 = 749, 간격 1000 ÷ 0.833 = 1200
    expect(values?.find((value) => value.id === "real_attack")?.value).toBe(18);
    expect(values?.find((value) => value.id === "real_hit")?.value).toBe(749);
    expect(values?.find((value) => value.id === "attack_interval")?.value).toBe(1200);
    // 맨손 적정 식은 아이템 무기 미리 보기에 없다
    expect(values?.some((value) => value.id === "bare_appropriate")).toBe(false);
  });

  it("적정이 없는 몫은 비율 100%(appropriate null), 무기에 없는 공격력 칸은 줄이 없다", () => {
    const { ctx } = setup();
    const sword = packItem("test_sword");
    const equip = objectOf(sword.equip);
    const { appropriate: _drop, ...plain } = objectOf(equip.weapon);
    const weapon = previewItem(
      ctx(),
      { ...sword, equip: { ...equip, weapon: plain } },
      DEFAULT_PREVIEW_UNIT,
    ).weapon;
    expect(weapon?.parts?.every((part) => part.appropriate === null && part.ratioPm === 1000)).toBe(true);
    expect(weapon?.parts?.some((part) => part.part === "elemental")).toBe(false);
    expect(weapon?.fields[0]?.values.find((value) => value.id === "real_attack")?.value).toBe(30);
  });
});

/** 회복 물약 초안(배급 식량 + 회복 줄 하나, VIT 비례) */
const mendPotion = (value: number, appropriate: number, variancePm?: number) => ({
  ...packItem("ration"),
  use: {
    effects: [
      {
        effect: "mend",
        value,
        chancePm: 1000,
        scale: { stat: "vit", appropriate },
        ...(variancePm === undefined ? {} : { variancePm }),
      },
    ],
  },
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

  it("D-501: 효과량 = 기준 × min(상한, 스탯 ÷ 적정 스탯) × (1 ± 오차), 기준 30·50·100을 적정 스탯에서 ±50% → 15~45·25~75·50~150", () => {
    const { ctx } = setup();
    // 기준 유닛 VIT 10, 적정 10, 설정 칸 기본 ±500‰
    const amountOf = (item: unknown, unit = DEFAULT_PREVIEW_UNIT, variance = 500) =>
      previewItem(ctx(), item, unit, variance).use?.lines[0]?.amount;
    expect(amountOf(mendPotion(30, 10))).toEqual({
      stat: "vit",
      statValue: 10,
      appropriate: 10,
      ratioPm: 1000,
      capPm: 1000,
      scaled: 30,
      variancePm: 500,
      min: 15,
      max: 45,
    });
    expect(amountOf(mendPotion(50, 10))).toMatchObject({ scaled: 50, min: 25, max: 75 });
    expect(amountOf(mendPotion(100, 10))).toMatchObject({ scaled: 100, min: 50, max: 150 });
    // 적정 스탯이 높은 기준 50 물약은 VIT 10 유닛에게 250‰ → 12(6~18): 적정 10짜리 기준 30(15~45)이 더 낫다
    expect(amountOf(mendPotion(50, 40))).toMatchObject({ ratioPm: 250, scaled: 12, min: 6, max: 18 });
    // VIT 39 → 상한 1000‰(무기 몫과 같은 N10, D-502: 넘는 보너스 없음) → 30(15~45), 사용자 답 299 "40이면 20~60". 줄 오차 250‰ → 22~37
    const strong = { ...DEFAULT_PREVIEW_UNIT, primaries: { ...DEFAULT_PREVIEW_UNIT.primaries, vit: 39 } };
    expect(amountOf(mendPotion(30, 10), strong)).toMatchObject({
      ratioPm: 1000,
      scaled: 30,
      min: 15,
      max: 45,
    });
    expect(amountOf(mendPotion(40, 10), strong)).toMatchObject({ scaled: 40, min: 20, max: 60 });
    expect(amountOf(mendPotion(30, 10, 250), strong)).toMatchObject({ variancePm: 250, min: 22, max: 37 });
    // 비례 스탯이 없으면 기준 값 그대로(오차만)
    const fixed = {
      ...mendPotion(40, 10),
      use: { effects: [{ effect: "mend", value: 40, chancePm: 1000 }] },
    };
    expect(amountOf(fixed, strong)).toMatchObject({
      stat: null,
      appropriate: null,
      ratioPm: 1000,
      scaled: 40,
      min: 20,
      max: 60,
    });
  });

  it("D-501: 상한은 설정 칸 N10 실효 값을 읽는다(무기 효율과 같은 값)", () => {
    const { ctx, tuning } = setup();
    const potion = {
      ...packItem("ration"),
      use: {
        effects: [{ effect: "mend", value: 30, chancePm: 1000, scale: { stat: "vit", appropriate: 5 } }],
      },
    };
    const before = previewItem(ctx(), potion, DEFAULT_PREVIEW_UNIT, 500).use?.lines[0]?.amount;
    expect(before).toMatchObject({ ratioPm: 1000, capPm: 1000, scaled: 30 });
    const cap: TuningOverrideRecord = {
      id: "n10_appropriate_cap",
      value: 3000,
      packValue: 1000,
      unit: null,
      contentVersion: "core@26",
      note: null,
      updatedById: null,
      updatedByName: null,
      updatedAtMs: 1,
    };
    tuning.install([cap], 1);
    const after = previewItem(ctx(), potion, DEFAULT_PREVIEW_UNIT, 500).use?.lines[0]?.amount;
    expect(after).toMatchObject({ ratioPm: 2000, capPm: 3000, scaled: 60 });
    const lower = { ...DEFAULT_PREVIEW_UNIT, primaries: { ...DEFAULT_PREVIEW_UNIT.primaries, vit: 40 } };
    expect(previewItem(ctx(), potion, lower, 500).use?.lines[0]?.amount).toMatchObject({
      ratioPm: 3000,
      scaled: 90,
    });
  });

  it("D-501: 옛 모양(스탯 1점당 ‰)과 25~50% 밖 오차는 스키마가 막는다", () => {
    const line = { effect: "mend", value: 40, chancePm: 1000 };
    const codes = (extra: Record<string, unknown>) => {
      const parsed = parseDraft({ ...packItem("ration"), use: { effects: [{ ...line, ...extra }] } });
      return parsed.ok ? [] : parsed.issues.map((issue) => [issue.path, issue.code]);
    };
    expect(codes({ scale: { stat: "vit", pmPerPoint: 10 } }).length).toBeGreaterThan(0);
    expect(codes({ scale: { stat: "vit", appropriate: 0 } })).toEqual([
      ["use.effects[0].scale.appropriate", "too_small"],
    ]);
    expect(codes({ variancePm: 200 })).toEqual([["use.effects[0].variancePm", "too_small"]]);
    expect(codes({ variancePm: 600 })).toEqual([["use.effects[0].variancePm", "too_big"]]);
    expect(codes({ scale: { stat: "wis", appropriate: 25 }, variancePm: 250 })).toEqual([]);
  });
});
