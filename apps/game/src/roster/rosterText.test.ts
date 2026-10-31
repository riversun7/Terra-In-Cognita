// 유닛·사이보그 화면 문구·다듬기 시험 — 이름(이름 없는 실제 유닛), 상태 분류·정렬(손이 필요한 순)·걸러 보기, 스탯 값 글, 남은 시간,
// 자산 이름(팩 → 시험 자산 → 코드)
import type { RosterNames, RosterUnit } from "@terra/shared/roster";
import { describe, expect, it } from "vitest";
import {
  NO_FILTER,
  assetLabel,
  basesOf,
  filterUnits,
  formatAmount,
  formatStat,
  injuryLabel,
  jobLabel,
  localName,
  remaining,
  sortUnits,
  statusCounts,
  unitLabel,
  unitStatus,
} from "./rosterText.ts";

const NOW = 1_800_000_000_000;
const MIN = 60_000;
const HOUR = 60 * MIN;

const NAMES: RosterNames = {
  stats: {},
  items: { grain: { ko: "곡물", en: "Grain" } },
  skills: {},
  facilities: { mine: { ko: "광산", en: "Mine" } },
  planets: {},
};

const unit = (extra: Partial<RosterUnit>): RosterUnit => ({
  id: "w1",
  name: null,
  type: "test_worker",
  level: null,
  rebirths: 0,
  place: null,
  job: { kind: "test_gather", phase: "work" },
  energy: { kind: "fatigue", value: 0, max: 120 },
  injury: { stage: 0, untilMs: null },
  captive: false,
  moving: false,
  cargo: [],
  satisfaction: null,
  party: null,
  stats: {
    source: "baseline",
    primaries: {
      str: { base: 10, bonus: 0 },
      dex: { base: 10, bonus: 0 },
      agi: { base: 10, bonus: 0 },
      vit: { base: 10, bonus: 0 },
      int: { base: 10, bonus: 0 },
      wis: { base: 10, bonus: 0 },
    },
    secondary: [],
  },
  slots: [],
  skills: { slots: 3, list: [] },
  preview: false,
  ...extra,
});

describe("이름", () => {
  it("지은 이름이 없으면 종류 + 세계 유닛 번호", () => {
    expect(unitLabel(unit({ id: "w42" }), "ko")).toBe("시험 일꾼 #42");
    expect(unitLabel(unit({ id: "w42" }), "en")).toBe("Test worker #42");
    expect(unitLabel(unit({ id: "p1", name: "Mina", type: "human" }), "ko")).toBe("Mina");
  });

  it("팩 이름은 지금 언어로, 없으면 ID", () => {
    expect(localName({ ko: "광산", en: "Mine" }, "mine", "en")).toBe("Mine");
    expect(localName(undefined, "mine", "ko")).toBe("mine");
    expect(jobLabel({ kind: "facility", facility: "mine", phase: "work" }, NAMES, "ko")).toBe("광산");
    expect(jobLabel({ kind: "test_gather", phase: "work" }, NAMES, "en")).toBe("Test gathering");
  });

  it("자산 이름: 팩 아이템 → 시험 자산 → 코드", () => {
    expect(assetLabel("grain", NAMES, "ko")).toBe("곡물");
    expect(assetLabel("s3_test_ore", NAMES, "en")).toBe("Test ore");
    expect(assetLabel("unknown_asset", NAMES, "ko")).toBe("unknown_asset");
  });
});

describe("상태·정렬·걸러 보기", () => {
  const working = unit({ id: "w1" });
  const resting = unit({ id: "w2", job: { kind: "test_gather", phase: "rest" } });
  const idle = unit({
    id: "w3",
    job: null,
    place: { planetId: "p", mapKey: "1", domain: "land", base: "Vega" },
  });
  const light = unit({ id: "w4", injury: { stage: 1, untilMs: NOW + HOUR } });
  const heavy = unit({ id: "w5", injury: { stage: 3, untilMs: NOW + HOUR } });
  const captive = unit({ id: "w6", captive: true, injury: { stage: 2, untilMs: NOW + HOUR } });
  const human = unit({
    id: "p1",
    name: "Mina",
    type: "human",
    preview: true,
    place: { planetId: "p", mapKey: "1", domain: "land", base: "Nova" },
  });
  const all = [working, resting, idle, light, heavy, captive, human];

  it("포로 → 부상(무거운 순) → 직무 없음 → 쉼 → 일함, 같으면 이름 순(한국어 차례: 한글 먼저)", () => {
    expect(unitStatus(captive)).toBe("captive");
    expect(unitStatus(heavy)).toBe("injured");
    expect(sortUnits(all, "ko").map((entry) => entry.id)).toEqual(["w6", "w5", "w4", "w3", "w2", "w1", "p1"]);
    expect(statusCounts(all)).toEqual({ captive: 1, injured: 2, idle: 1, resting: 1, working: 2 });
  });

  it("종류·상태·거점으로 거르고, 거점 목록은 이름 순", () => {
    expect(filterUnits(all, NO_FILTER)).toHaveLength(all.length);
    expect(filterUnits(all, { ...NO_FILTER, type: "test" })).toHaveLength(6);
    expect(filterUnits(all, { ...NO_FILTER, type: "human" }).map((entry) => entry.id)).toEqual(["p1"]);
    expect(filterUnits(all, { ...NO_FILTER, status: "injured" }).map((entry) => entry.id)).toEqual([
      "w4",
      "w5",
    ]);
    expect(filterUnits(all, { ...NO_FILTER, base: "Vega" }).map((entry) => entry.id)).toEqual(["w3"]);
    expect(basesOf(all, "ko")).toEqual(["Nova", "Vega"]);
  });

  it("부상 이름: 0은 없음", () => {
    expect(injuryLabel(0, "ko")).toBeNull();
    expect(injuryLabel(2, "ko")).toBe("중상");
    expect(injuryLabel(3, "en")).toBe("Critical");
  });
});

describe("수·시간", () => {
  it("확률 모양은 %, 크리 배율은 ×, 나머지는 자리 나눔", () => {
    expect(formatStat({ id: "evade", shape: "probability", value: 164 }, "en")).toBe("16.4%");
    expect(formatStat({ id: "crit_multiplier", shape: "quantity", value: 1300 }, "en")).toBe("×1.30");
    expect(formatStat({ id: "hp", shape: "quantity", value: 1284 }, "en")).toBe("1,284");
    expect(formatAmount("1200000", "ko")).toBe("1,200,000");
    expect(formatAmount("not-a-number", "ko")).toBe("not-a-number");
  });

  it("남은 시간은 내림, 지났으면 null", () => {
    expect(remaining(NOW + 3 * HOUR + 59 * MIN, NOW, "en")).toBe("in 3 hours");
    expect(remaining(NOW + 30 * 1000, NOW, "ko")).toBe("곧");
    expect(remaining(NOW - 1, NOW, "ko")).toBeNull();
  });
});
