// 시작 국가 설정 편집기 모델 시험 — 담음·보낼 묶음, 빈 칸 빼기, 시작 수 셈, 색 읽기 쉬움, 다시 얹기, 마크 자르기 셈. 값은 시험용이다.
import type { NationEditorRow, NationPresetJson, NationSeedDefaults } from "@terra/shared/nationEditor";
import { contrastOf } from "@terra/shared/nationEmblem";
import { describe, expect, it } from "vitest";
import {
  CROP_ZOOM,
  EMPTY_NATION_STAGE,
  MAP_DARK,
  MAP_LIGHT,
  READABLE_COLORS,
  appendUnique,
  cleanNation,
  clampCrop,
  colorReadability,
  cropRect,
  currencySample,
  dragCrop,
  emblemOf,
  initialCrop,
  isNationJson,
  moveItem,
  nationBatchOf,
  nationChangesOf,
  nationStageKeys,
  posterize,
  rebaseNation,
  setPersonality,
  stageNation,
  stageNationDiscard,
  startCountsOf,
  zoomCrop,
} from "./nationModel.ts";

const base: NationPresetJson = {
  id: "nation_a",
  name: { ko: "가나", en: "Gana" },
  shortName: "GNA",
  color: "#2980b9",
  currency: { code: "cur_a", name: { ko: "닢", en: "Nip" }, symbol: "Ƀ", ticker: "NIP" },
  tradeTaxBp: 200,
  personality: { startCities: 3 },
  cityNames: ["Alpha", "Beta"],
  enabled: true,
};
const defaults: NationSeedDefaults = {
  startCitiesMin: 2,
  startCitiesMax: 4,
  housing: 40,
  populationPm: 750,
  farms: 1,
  lumberCamps: 1,
  mines: 1,
  storehouses: 1,
  necessityHours: 48,
};
const HASH = "a".repeat(64);
const rowOf = (entry: NationPresetJson, hash = HASH): NationEditorRow => ({
  entry,
  origin: "pack",
  pack: entry,
  override: null,
  hash,
  uploaded: null,
  slot: null,
});

describe("담은 변경", () => {
  it("담고 빼고, 서버 묶음으로 바꾼다", () => {
    const edited = { ...base, name: { ko: "새 이름", en: "New" } };
    let stage = stageNation(EMPTY_NATION_STAGE, "nation_a", {
      op: "put",
      entry: edited,
      base,
      baseHash: HASH,
    });
    stage = stageNation(stage, "nation_b", { op: "revert", base, baseHash: HASH });
    stage = stageNationDiscard(stage, "old_one", true);
    expect(nationStageKeys(stage)).toEqual(["nation_a", "nation_b", "sleeping/old_one"]);
    expect(nationChangesOf(stage)).toEqual([
      { op: "put", entry: edited, baseHash: HASH },
      { op: "revert", id: "nation_b", baseHash: HASH },
      { op: "discard_sleeping", id: "old_one" },
    ]);
    stage = stageNationDiscard(stageNation(stage, "nation_b", null), "old_one", false);
    expect(nationStageKeys(stage)).toEqual(["nation_a"]);
  });

  it("보낼 묶음은 빈 선택 칸을 뺀다(초안에는 그대로 둔다)", () => {
    const typing = { ...base, shortName: "", leaderName: { ko: "", en: "" }, cityNames: [] };
    const stage = stageNation(EMPTY_NATION_STAGE, "nation_a", {
      op: "put",
      entry: typing,
      base,
      baseHash: HASH,
    });
    const [change] = nationBatchOf(stage);
    expect(change?.op).toBe("put");
    if (change?.op !== "put") return;
    expect(Object.hasOwn(change.entry, "shortName")).toBe(false);
    expect(Object.hasOwn(change.entry, "leaderName")).toBe(false);
    expect(Object.hasOwn(change.entry, "cityNames")).toBe(false);
  });
});

describe("cleanNation · setPersonality", () => {
  it("팩 줄과 같은 칸 차례로 맞추고 빈 성격 칸은 칸째 뺀다", () => {
    const messy: NationPresetJson = {
      enabled: true,
      tradeTaxBp: 200,
      currency: { ticker: "NIP", symbol: "Ƀ", name: { en: "Nip", ko: "닢" }, code: "cur_a" },
      personality: {},
      name: { en: "Gana", ko: "가나" },
      id: "nation_a",
      humanNames: { given: [], family: ["Kim"] },
    };
    const clean = cleanNation(messy);
    expect(Object.keys(clean)).toEqual(["id", "name", "currency", "tradeTaxBp", "enabled"]);
    expect(Object.keys(clean.currency)).toEqual(["code", "name", "symbol", "ticker"]);
    expect(JSON.stringify(cleanNation(base))).toBe(JSON.stringify(base));
  });

  it("성격 칸을 넣고 뺀다", () => {
    const withHousing = setPersonality(base, "startHousing", 60);
    expect(cleanNation(withHousing).personality).toEqual({ startCities: 3, startHousing: 60 });
    const cleared = setPersonality(
      setPersonality(withHousing, "startHousing", undefined),
      "startCities",
      undefined,
    );
    expect(Object.hasOwn(cleanNation(cleared), "personality")).toBe(false);
  });
});

describe("startCountsOf", () => {
  it("국가 칸이 먼저, 없으면 설정 칸 기본값", () => {
    expect(startCountsOf(base, defaults)).toEqual({
      cities: 3,
      housing: 40,
      population: 30,
      totalPopulation: 90,
      facilities: 5,
    });
    const custom = {
      ...base,
      personality: { startCities: 9, startHousing: 60, startPopulationPm: 500, startFarms: 2, startMines: 0 },
    };
    // 시작 도시 수는 설정 칸 위 끝(4)으로 잘린다
    expect(startCountsOf(custom, defaults)).toEqual({
      cities: 4,
      housing: 60,
      population: 30,
      totalPopulation: 120,
      facilities: 5,
    });
    const { personality: _none, ...bare } = base;
    expect(startCountsOf(bare, defaults).cities).toBe(2);
  });
});

describe("색 읽기 쉬움", () => {
  it("고르기 판의 색은 두 지도 바탕 모두와 대비 2 이상이고 서로 다르다", () => {
    expect(new Set(READABLE_COLORS).size).toBe(READABLE_COLORS.length);
    for (const color of READABLE_COLORS) {
      expect(contrastOf(color, MAP_LIGHT), color).toBeGreaterThanOrEqual(2);
      expect(contrastOf(color, MAP_DARK), color).toBeGreaterThanOrEqual(2);
      expect(colorReadability(color).ok).toBe(true);
      expect(colorReadability(color).textContrast).toBeGreaterThanOrEqual(3);
    }
  });

  it("아주 밝거나 아주 어두운 색은 알린다", () => {
    expect(colorReadability("#fff8e1").ok).toBe(false);
    expect(colorReadability("#0b0d10").ok).toBe(false);
    expect(colorReadability("#fff8e1").text).toBe("#111418");
    expect(colorReadability("#0b0d10").text).toBe("#ffffff");
  });
});

describe("목록 도우미 · 화폐 보기 · 마크", () => {
  it("줄을 위·아래로 옮기고, 겹치지 않는 이름만 붙인다", () => {
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(appendUnique(["a"], ["a", "b", "c", "d"], 3)).toEqual(["a", "b", "c"]);
  });

  it("금액 보기 = 기호 + 자리 나눈 수 + 약어", () => {
    expect(currencySample(base, 1234, "en")).toBe("Ƀ 1,234 NIP");
    const { symbol: _s, ticker: _t, ...plain } = base.currency;
    expect(currencySample({ ...base, currency: plain }, 1234, "en")).toBe("1,234");
  });

  it("마크 칸이 없으면 ID로 정해지는 기본 마크", () => {
    expect(emblemOf(base)).toEqual(emblemOf({ ...base, name: { ko: "다른", en: "Other" } }));
    const spec = { shape: "circle", division: "plain", charge: "sun", scheme: 1 } as const;
    expect(emblemOf({ ...base, emblem: spec })).toEqual(spec);
  });

  it("국가 JSON 모양을 가린다", () => {
    expect(isNationJson(base)).toBe(true);
    expect(isNationJson({ ...base, currency: null })).toBe(false);
    expect(isNationJson("x")).toBe(false);
  });
});

describe("rebaseNation", () => {
  it("내가 바꾼 칸만 새 항목 위에 얹고, 같아지면 담음에서 뺀다", () => {
    const mine = { ...base, shortName: "GAN" };
    const theirs = { ...base, tradeTaxBp: 300 };
    const result = rebaseNation(
      { op: "put", entry: mine, base, baseHash: HASH },
      rowOf(theirs, "b".repeat(64)),
    );
    expect(result.conflicts).toEqual([]);
    expect(result.next).toMatchObject({
      op: "put",
      entry: { shortName: "GAN", tradeTaxBp: 300 },
      baseHash: "b".repeat(64),
    });
    const same = rebaseNation({ op: "put", entry: theirs, base, baseHash: HASH }, rowOf(theirs));
    expect(same.next).toBeNull();
  });

  it("양쪽이 같은 칸을 다르게 바꿨으면 내 값을 넣고 알린다", () => {
    const result = rebaseNation(
      { op: "put", entry: { ...base, shortName: "AAA" }, base, baseHash: HASH },
      rowOf({ ...base, shortName: "BBB" }),
    );
    expect(result.conflicts).toEqual(["shortName"]);
    expect(result.next).toMatchObject({ entry: { shortName: "AAA" } });
  });
});

describe("마크 자르기 셈", () => {
  it("처음은 짧은 변 전체를 가운데에서 자른다", () => {
    expect(cropRect(400, 200, initialCrop(400, 200))).toEqual({ sx: 100, sy: 0, size: 200 });
  });

  it("확대하면 정사각이 줄고, 그림 밖으로 나가지 않는다", () => {
    const zoomed = zoomCrop(400, 200, initialCrop(400, 200), 2);
    expect(cropRect(400, 200, zoomed)).toEqual({ sx: 150, sy: 50, size: 100 });
    const far = clampCrop(400, 200, { zoom: 2, cx: 9999, cy: -50 });
    expect(cropRect(400, 200, far)).toEqual({ sx: 300, sy: 0, size: 100 });
    expect(zoomCrop(400, 200, zoomed, 99).zoom).toBe(CROP_ZOOM.max);
    expect(zoomCrop(400, 200, zoomed, 0).zoom).toBe(CROP_ZOOM.min);
  });

  it("끌면 그림이 손가락을 따라온다(가운데는 반대로)", () => {
    const start = zoomCrop(400, 400, initialCrop(400, 400), 2);
    // 보기 칸 200px에서 오른쪽으로 20px = 원본 20px(자른 변 200 ÷ 보기 200)
    const moved = dragCrop(400, 400, start, 20, -10, 200);
    expect(moved.cx).toBe(180);
    expect(moved.cy).toBe(210);
  });

  it("색 단계를 줄여도 알파는 그대로다", () => {
    const data = new Uint8ClampedArray([13, 130, 250, 77, 0, 255, 127, 255]);
    posterize(data, 2);
    expect([...data]).toEqual([0, 255, 255, 77, 0, 255, 0, 255]);
  });
});
