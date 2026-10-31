// 세력 화면 자료 다듬기 시험 — 천분율·지분 비율, 칸 상태, 탭 수, 투표 막대, 표 색 갈래(판정은 서버 값 그대로)
import type { FactionOverviewResponse, VoteRow } from "@terra/shared/faction";
import { describe, expect, it } from "vitest";
import {
  BAND_TONES,
  FACTION_TABS,
  STATE_TONES,
  UNREST_TONES,
  barWidth,
  decidesByVote,
  formatPermille,
  sectionData,
  sectionKind,
  sharePermille,
  tabCount,
  voteBar,
} from "./factionView.ts";

const VOTE: VoteRow = {
  id: "v",
  agenda: "tax_change",
  params: {},
  opensAt: 0,
  closesAt: 1,
  urgent: false,
  quorumPm: 500,
  yesPm: 380,
  noPm: 120,
  myVote: null,
  result: null,
};

const EMPTY: FactionOverviewResponse = {
  generatedAt: 0,
  rules: { tributeEveryMs: 604_800_000, dividendEveryMs: 604_800_000 },
  preview: false,
  stage: "individual",
  me: { hasOwner: false, units: 0, buildings: 0, balances: [] },
  faction: null,
  locks: [],
  cities: { status: "not_ready" },
  diplomacy: { status: "not_ready" },
  wars: { status: "not_ready" },
  regime: { status: "not_ready" },
  shares: { status: "not_ready" },
  occupations: { status: "not_ready" },
};

describe("수 글자", () => {
  it("천분율 → 백분율(소수 한 자리)", () => {
    expect(formatPermille(80, "ko")).toBe("8%");
    expect(formatPermille(1005, "en")).toBe("100.5%");
    expect(formatPermille(0, "en")).toBe("0%");
  });

  it("지분 비율: 1000주 중 180주 = 180‰, 총량 0이면 0", () => {
    expect(sharePermille(180, 1000)).toBe(180);
    expect(sharePermille(1, 3)).toBe(333);
    expect(sharePermille(5, 0)).toBe(0);
  });

  it("막대 너비는 0~100%로 자른다", () => {
    expect(barWidth(380)).toBe("38%");
    expect(barWidth(-5)).toBe("0%");
    expect(barWidth(2000)).toBe("100%");
  });
});

describe("칸·탭", () => {
  it("준비 중이면 soon·자료 없음, 시안이면 preview, 실제면 real", () => {
    expect(sectionKind({ status: "not_ready" })).toBe("soon");
    expect(sectionKind({ status: "ready", data: [] })).toBe("real");
    expect(sectionKind({ status: "ready", data: [], preview: true })).toBe("preview");
    expect(sectionData({ status: "not_ready" })).toBeNull();
    expect(sectionData({ status: "ready", data: [1] })).toEqual([1]);
  });

  it("탭 수: 준비 중이면 null(수를 그리지 않는다), 투표는 열린 것만", () => {
    for (const tab of FACTION_TABS) expect(tabCount(EMPTY, tab), tab).toBeNull();
    const view: FactionOverviewResponse = {
      ...EMPTY,
      regime: {
        status: "ready",
        data: {
          regime: "capitalism",
          rule: "by_shares",
          leader: "Aster",
          votes: [VOTE, { ...VOTE, id: "w", result: "passed" }],
        },
      },
      occupations: { status: "ready", data: [] },
    };
    expect(tabCount(view, "votes")).toBe(1);
    expect(tabCount(view, "shares")).toBe(0);
  });
});

describe("투표 막대", () => {
  it("찬성·반대·정족수와 정족수 채움", () => {
    expect(voteBar(VOTE)).toEqual({ yesPm: 380, noPm: 120, quorumPm: 500, quorumMet: true });
    expect(voteBar({ ...VOTE, noPm: 100 }).quorumMet).toBe(false);
  });

  it("찬성 + 반대가 1000을 넘지 않게 반대를 자른다", () => {
    expect(voteBar({ ...VOTE, yesPm: 900, noPm: 400 })).toMatchObject({ yesPm: 900, noPm: 100 });
  });
});

describe("투표로 정하는 체제(기획 검토 C4)", () => {
  it("독재만 바로 정하고, 민주주의·자본주의·모름은 안건으로 올린다", () => {
    expect(decidesByVote("dictatorship")).toBe(false);
    expect(decidesByVote("democracy")).toBe(true);
    expect(decidesByVote("capitalism")).toBe(true);
    expect(decidesByVote(null)).toBe(true);
  });
});

describe("표 색 갈래", () => {
  it("나쁜 상태는 bad, 좋은 상태는 good", () => {
    expect(UNREST_TONES.rebellion).toBe("bad");
    expect(UNREST_TONES.warning).toBe("bad");
    expect(UNREST_TONES.sabotage).toBe("warn");
    expect(UNREST_TONES.stable).toBe("good");
    expect(BAND_TONES.hostile).toBe("bad");
    expect(BAND_TONES.trusted).toBe("good");
    expect(STATE_TONES.war).toBe("bad");
    expect(STATE_TONES.alliance).toBe("good");
  });
});
