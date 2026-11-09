// 효과 사전 화면 상태 계산 시험 — 담기·되돌리기·묶음·목록 거르기·다시 얹기(docs/adr/2026-11-01-item-editor.md "바뀜 (2026-11-09)")
import type { ContentIssueView } from "@terra/shared/contentEdit";
import type { EffectJson, TaxonomyRow } from "@terra/shared/itemEditor";
import { describe, expect, it } from "vitest";
import {
  EMPTY_EFFECT_QUERY,
  type EffectStage,
  changedKeysOf,
  effectChanges,
  filterEffects,
  isEffectJson,
  issuesOf,
  listEffects,
  looseIssues,
  newEffectTemplate,
  rebaseEffects,
  stageCreate,
  stagePut,
  stageRevert,
  unstage,
  withKind,
  withText,
} from "./effectDictionaryModel.ts";

const burn: EffectJson = {
  id: "burn",
  name: { ko: "화상", en: "Burn" },
  kind: "dot",
  valueMode: "flat",
  durationMs: 6000,
  tickMs: 1000,
  stacking: "refresh",
  maxStacks: 1,
  enabled: true,
};
const stun: EffectJson = {
  id: "stun",
  name: { ko: "기절", en: "Stun" },
  kind: "status",
  status: "stun",
  valueMode: "flat",
  durationMs: 1500,
  tickMs: 0,
  stacking: "ignore",
  maxStacks: 1,
  enabled: true,
};
const rowOf = (
  entry: EffectJson,
  origin: TaxonomyRow<EffectJson>["origin"] = "pack",
  hash = `h-${entry.id}`,
) => ({
  entry,
  origin,
  hash,
});
const rows = [rowOf(burn), rowOf(stun, "edited")];
const EMPTY: EffectStage = new Map();

const issue = (patch: Partial<ContentIssueView>): ContentIssueView => ({
  level: "error",
  file: "effects",
  id: null,
  path: null,
  code: null,
  params: {},
  message: "",
  ...patch,
});

describe("담기", () => {
  it("고치면 지금 행을 바탕(base·해시)으로 담고, 다시 고쳐도 처음 바탕을 지킨다. 지금 값과 같아지면 뺀다", () => {
    const first = stagePut(EMPTY, rowOf(burn), { ...burn, durationMs: 4500 });
    expect(first.get("burn")).toEqual({
      op: "put",
      entry: { ...burn, durationMs: 4500 },
      base: burn,
      baseHash: "h-burn",
    });
    // 그 사이 목록이 바뀌어도(다른 해시) 담은 바탕은 그대로
    const second = stagePut(first, rowOf(burn, "pack", "h-new"), { ...burn, durationMs: 3000 });
    expect(second.get("burn")?.baseHash).toBe("h-burn");
    expect(stagePut(second, rowOf(burn), burn).has("burn")).toBe(false);
  });

  it("새 효과는 꺼진 틀로 담기고 바탕이 없다(같아질 것이 없어 늘 남는다)", () => {
    const created = stageCreate(EMPTY, "e2e_glow", { ko: "빛남", en: "Glow" });
    expect(created.get("e2e_glow")).toEqual({
      op: "put",
      entry: newEffectTemplate("e2e_glow", { ko: "빛남", en: "Glow" }),
      base: null,
      baseHash: null,
    });
    expect(created.get("e2e_glow")?.entry?.enabled).toBe(false);
    const edited = stagePut(created, null, { ...newEffectTemplate("e2e_glow", { ko: "빛남", en: "Glow" }) });
    expect(edited.has("e2e_glow")).toBe(true);
    expect(unstage(edited, "e2e_glow").size).toBe(0);
  });

  it("묶음: 고침은 put(항목 통째·해시), 되돌리기는 revert(해시), 분류는 effects", () => {
    let stage = stagePut(EMPTY, rowOf(burn), { ...burn, tickMs: 500 });
    stage = stageRevert(stage, rowOf(stun, "edited"));
    expect(effectChanges(stage)).toEqual([
      { op: "put", category: "effects", entry: { ...burn, tickMs: 500 }, baseHash: "h-burn" },
      { op: "revert", category: "effects", id: "stun", baseHash: "h-stun" },
    ]);
  });
});

describe("칸 바꾸기", () => {
  it("종류를 바꾸면 수치·상태이상 칸을 그 종류에 맞춘다", () => {
    expect(withKind(burn, "buff")).toMatchObject({ kind: "buff", stat: "attack" });
    expect(withKind(burn, "status")).toMatchObject({ kind: "status", status: "stun" });
    const resisted = { ...stun, resist: { cap: 500, halfConstant: 100, weights: [0, 0, 0, 0, 0, 0] } };
    expect(withKind(resisted, "dot")).not.toHaveProperty("resist");
    expect(withKind(resisted, "dot")).not.toHaveProperty("status");
  });

  it("빈 글 칸(배타 묶음·상한 코드)은 뺀다", () => {
    expect(withText(burn, "exclusive", " food ")).toMatchObject({ exclusive: "food" });
    expect(withText({ ...burn, exclusive: "food" }, "exclusive", "")).not.toHaveProperty("exclusive");
  });
});

describe("목록", () => {
  it("담은 값으로 보이고 새 효과는 끝에 붙는다. 되돌리기를 담으면 지금 값으로 보인다", () => {
    let stage = stagePut(EMPTY, rowOf(burn), { ...burn, name: { ko: "센 화상", en: "Hot burn" } });
    stage = stageCreate(stage, "glow", { ko: "빛남", en: "Glow" });
    stage = stageRevert(stage, rowOf(stun, "edited"));
    const listed = listEffects(rows, stage);
    expect(listed.map((item) => [item.id, item.entry.name.ko, item.row === null])).toEqual([
      ["burn", "센 화상", false],
      ["stun", "기절", false],
      ["glow", "빛남", true],
    ]);
  });

  it("찾기(ID·이름)·종류·고침·꺼짐·쓰는 곳 없음·담은 것만", () => {
    const off = { ...burn, id: "chill", name: { ko: "냉기", en: "Chill" }, enabled: false };
    const listed = listEffects([...rows, rowOf(off)], EMPTY);
    const usage = { burn: { items: [], skills: ["fire_bolt"] }, stun: { items: ["flash"], skills: [] } };
    const ids = (query: Partial<typeof EMPTY_EFFECT_QUERY>, staged: ReadonlySet<string> = new Set()) =>
      filterEffects(listed, { ...EMPTY_EFFECT_QUERY, ...query }, usage, staged).map((item) => item.id);
    expect(ids({ text: "BURN" })).toEqual(["burn"]);
    expect(ids({ text: "냉" })).toEqual(["chill"]);
    expect(ids({ kind: "status" })).toEqual(["stun"]);
    expect(ids({ filter: "changed" })).toEqual(["stun"]);
    expect(ids({ filter: "disabled" })).toEqual(["chill"]);
    expect(ids({ filter: "unused" })).toEqual(["chill"]);
    expect(ids({ stagedOnly: true }, new Set(["burn"]))).toEqual(["burn"]);
  });
});

describe("다시 얹기(entry_changed)", () => {
  it("내가 바꾼 칸만 새 항목 위에 얹고 새 해시를 바탕으로 한다. 같은 칸이면 내 값을 두고 알린다", () => {
    const stage = stagePut(EMPTY, rowOf(burn), { ...burn, durationMs: 4500, tickMs: 500 });
    const theirs = rowOf({ ...burn, tickMs: 2000, maxStacks: 3 }, "edited", "h-theirs");
    const done = rebaseEffects(stage, ["effects/burn", "items/sword"], [theirs, rowOf(stun)]);
    expect(done.stage.get("burn")).toEqual({
      op: "put",
      entry: { ...burn, durationMs: 4500, tickMs: 500, maxStacks: 3 },
      base: theirs.entry,
      baseHash: "h-theirs",
    });
    expect(done.rebased).toEqual([{ id: "burn", conflicts: ["tickMs"] }]);
  });

  it("다시 얹은 끝이 새 항목과 같으면 담김에서 빠진다. 되돌리기는 새 해시만 받는다", () => {
    const theirs = rowOf({ ...burn, durationMs: 4500 }, "edited", "h-theirs");
    let stage = stagePut(EMPTY, rowOf(burn), { ...burn, durationMs: 4500 });
    stage = stageRevert(stage, rowOf(stun, "edited"));
    const done = rebaseEffects(
      stage,
      ["effects/burn", "effects/stun"],
      [theirs, rowOf(stun, "edited", "h-s2")],
    );
    expect(done.stage.has("burn")).toBe(false);
    expect(done.stage.get("stun")).toMatchObject({ op: "revert", baseHash: "h-s2" });
  });

  it("검사 문제에서 바뀐 항목 키를 꺼내고, 효과마다·어디에도 안 붙은 문제를 가른다", () => {
    const issues = [
      issue({ code: "entry_changed", params: { details: "effects/burn, effects/stun" } }),
      issue({ id: "burn", path: "durationMs", message: "too long" }),
      issue({ file: "items", id: "flash", message: "uses disabled effect" }),
    ];
    expect(changedKeysOf(issues)).toEqual(["effects/burn", "effects/stun"]);
    expect(issuesOf(issues, "burn").map((item) => item.message)).toEqual(["too long"]);
    expect(looseIssues(issues, new Set(["burn", "stun"])).map((item) => item.message)).toEqual([
      "uses disabled effect",
    ]);
  });
});

describe("효과 모양", () => {
  it("다시 담기로 받은 값이 효과 항목 모양인지 본다", () => {
    expect(isEffectJson(burn)).toBe(true);
    expect(isEffectJson({ ...burn, kind: "nope" })).toBe(false);
    expect(isEffectJson({ id: "x" })).toBe(false);
    expect(isEffectJson(null)).toBe(false);
  });
});
