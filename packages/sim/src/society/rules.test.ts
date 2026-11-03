import { describe, expect, it } from "vitest";
import { createLedgerAudit } from "../ledger/audit.ts";
import { createLedgerBook } from "../ledger/ledgerBook.ts";
import { TEST_SOCIETY_COEFFICIENTS as c } from "./coefficients.ts";
import { makeOffers, occupationShifts, resolveOffer, settleShares } from "./occupation.ts";
import { deathFate, inherit, lifespanMs } from "./population.ts";
import {
  allocateShares,
  holdingsOf,
  issueShares,
  rulerHasMajority,
  shareAsset,
  totalShares,
  transferShares,
} from "./shares.ts";
import { advanceTech, researchCost, techCeiling } from "./tech.ts";
import {
  capitalistIndependence,
  democraticIndependence,
  independenceAllowed,
  rebelsOf,
  unrestBand,
} from "./uprising.ts";

function setup() {
  let account = 0;
  let tx = 0;
  const audit = createLedgerAudit();
  const book = createLedgerBook({ nextAccountId: () => ++account, nextTxId: () => ++tx, hooks: audit.hooks });
  const give = (owner: number, asset: string, amount: bigint, location: number | null = null) =>
    book.post({
      kind: "issue",
      atMs: 0,
      entries: [
        { account: book.systemAccount(`issue:${asset}`, asset), amount: -amount },
        { account: book.ownerAccount(owner, asset, location), amount },
      ],
    });
  return { book, audit, give };
}

describe("도시 지분(원장 자산)", () => {
  it("발행·양도, 독재 도시는 지배 주체 과반을 깨는 양도를 거절한다(D-349)", () => {
    const { book, audit } = setup();
    issueShares(
      book,
      5,
      [
        { owner: 1, amount: 600n },
        { owner: 2, amount: 400n },
      ],
      0,
    );
    expect(totalShares(book, 5)).toBe(1000n);
    const city = { id: 5, regime: "dictatorship" as const, ruler: 1 };
    expect(transferShares(book, city, 1, 3, 100n, 1)).toBe("dictatorship_majority");
    expect(transferShares(book, city, 1, 3, 99n, 1)).toBe("ok");
    expect(rulerHasMajority(holdingsOf(book, 5), 1)).toBe(true);
    expect(transferShares(book, { ...city, regime: "capitalism" }, 1, 3, 500n, 1)).toBe("ok");
    expect(transferShares(book, city, 9, 3, 1n, 1)).toBe("insufficient");
    expect(audit.check(book.accounts())).toEqual([]);
  });

  it("비례 배정은 가장 큰 나머지로 합을 맞춘다", () => {
    expect(
      allocateShares(
        [
          { owner: 1, amount: 1n },
          { owner: 2, amount: 1n },
          { owner: 3, amount: 1n },
        ],
        1000n,
      ),
    ).toEqual([
      { owner: 1, amount: 334n },
      { owner: 2, amount: 333n },
      { owner: 3, amount: 333n },
    ]);
  });
});

/** 점령 세력: 국고 주체·체제·지배 가문 주체(독재)·충성 보상을 받을 가문 */
const occupier = (
  treasury: number,
  regime: "dictatorship" | "democracy" | "capitalism",
  rulingFamily = treasury,
  loyalists: readonly number[] = [],
) => ({ treasury, regime, rulingFamily, loyalists });

describe("점령(46 §5.1)", () => {
  it("지분 유지 = 옛 통치자 몫 → 점령 국고, 독재 점령국이 과반이 안 되면 상장폐지 + 새 1000주", () => {
    const { book } = setup();
    issueShares(
      book,
      5,
      [
        { owner: 1, amount: 400n },
        { owner: 7, amount: 600n },
      ],
      0,
    );
    expect(settleShares(book, 5, 1, occupier(2, "capitalism"), "keep", 1, c)).toBe("keep");
    expect(holdingsOf(book, 5)).toEqual([
      { owner: 2, amount: 400n },
      { owner: 7, amount: 600n },
    ]);
    // 독재 점령국 3이 몰수로 과반이 안 된다 → 상장폐지, 새 지분은 지배 가문에게(충성 보상 받을 가문이 없으면 전부)
    expect(settleShares(book, 5, 2, occupier(3, "dictatorship"), "keep", 2, c)).toBe("delist");
    expect(holdingsOf(book, 5)).toEqual([{ owner: 3, amount: 1000n }]);
    expect(book.balanceOf(7, shareAsset(5))).toBe(0n);
  });

  it("상장폐지 뒤 재발행 주식 수는 설정값이고, 자본주의·민주주의 점령국은 국고로 받는다(D-298·D-443·D-444)", () => {
    const { book } = setup();
    issueShares(book, 6, [{ owner: 1, amount: 1000n }], 0);
    const tuned = { ...c, delistReissueShares: 400 };
    // 지배 가문·충성 가문을 줘도 독재가 아니면 국고만 받는다
    expect(settleShares(book, 6, 1, occupier(2, "capitalism", 20, [21]), "delist", 1, tuned)).toBe("delist");
    expect(holdingsOf(book, 6)).toEqual([{ owner: 2, amount: 400n }]);
    expect(settleShares(book, 6, 2, occupier(4, "democracy", 40, [41]), "delist", 2, c)).toBe("delist");
    expect(holdingsOf(book, 6)).toEqual([{ owner: 4, amount: 1000n }]);
    expect(c.delistReissueShares).toBe(1000);
  });

  it("독재 점령국의 재발행 = 지배 가문 과반 + 나머지는 충성 보상으로 가문들에 고르게(D-338·D-344·D-444, 비율 설정값)", () => {
    const { book } = setup();
    issueShares(book, 8, [{ owner: 1, amount: 1000n }], 0);
    expect(c.delistLoyaltyPm).toBe(200);
    // 충성 보상 200주를 세 가문에: 66주씩 + 남는 2주는 주체 ID 작은 쪽부터
    expect(settleShares(book, 8, 1, occupier(3, "dictatorship", 30, [43, 41, 42]), "delist", 1, c)).toBe(
      "delist",
    );
    expect(holdingsOf(book, 8)).toEqual([
      { owner: 30, amount: 800n },
      { owner: 41, amount: 67n },
      { owner: 42, amount: 67n },
      { owner: 43, amount: 66n },
    ]);
    // 국고는 받지 않는다(독재 지분 = 지배 가문 사유 자산, D-338)
    expect(book.balanceOf(3, shareAsset(8))).toBe(0n);
    expect(rulerHasMajority(holdingsOf(book, 8), 30)).toBe(true);
  });

  it("충성 보상 비율이 커도 지배 가문은 과반을 지킨다, 받을 가문이 없으면 지배 가문이 다 가진다", () => {
    const { book } = setup();
    issueShares(book, 9, [{ owner: 1, amount: 1000n }], 0);
    const greedy = { ...c, delistLoyaltyPm: 700 };
    settleShares(book, 9, 1, occupier(3, "dictatorship", 30, [41]), "delist", 1, greedy);
    expect(holdingsOf(book, 9)).toEqual([
      { owner: 30, amount: 501n },
      { owner: 41, amount: 499n },
    ]);
    settleShares(book, 9, 30, occupier(5, "dictatorship", 50), "delist", 2, c);
    expect(holdingsOf(book, 9)).toEqual([{ owner: 50, amount: 1000n }]);
  });

  it("독재 점령국의 지분 유지: 몰수 몫은 지배 가문으로 가고, 과반은 지배 가문 기준으로 본다(D-346)", () => {
    const { book } = setup();
    issueShares(
      book,
      10,
      [
        { owner: 1, amount: 700n },
        { owner: 7, amount: 300n },
      ],
      0,
    );
    expect(settleShares(book, 10, 1, occupier(3, "dictatorship", 30, [41]), "keep", 1, c)).toBe("keep");
    expect(holdingsOf(book, 10)).toEqual([
      { owner: 7, amount: 300n },
      { owner: 30, amount: 700n },
    ]);
  });

  it("만족도·관계 사건: 약탈·통합, 상장폐지, 독재로 바뀜", () => {
    expect(occupationShifts("integrate", "keep", "capitalism", "capitalism", c).satisfactionShift).toBe(-5);
    expect(occupationShifts("loot", "delist", "democracy", "dictatorship", c)).toEqual({
      shares: "delist",
      satisfactionShift: -25 - 15 - 20,
      relationShift: -20,
    });
  });

  it("편입 제안: 그 도시 위치 물건 주인 모두, 수락은 그대로, 거부·만료는 물건을 점령자에게", () => {
    const { book, audit, give } = setup();
    give(4, "item:grain", 30n, 5);
    give(6, "item:grain", 10n, 5);
    give(6, "item:ore", 5n, 5);
    give(8, "item:grain", 7n, 9);
    const offers = makeOffers(book, 5, 2, new Set([1]), 100, c);
    expect(offers.map((o) => [o.owner, o.deadlineMs])).toEqual([
      [4, 100 + c.offerDeadlineMs],
      [6, 100 + c.offerDeadlineMs],
    ]);
    const [a, b] = offers;
    if (!a || !b) throw new Error("offers");
    expect(resolveOffer(book, a, "accepted", 200)).toBe(0);
    expect(resolveOffer(book, b, "expired", 200)).toBe(1);
    expect(book.balanceOf(4, "item:grain", 5)).toBe(30n);
    expect(book.balanceOf(2, "item:grain", 5)).toBe(10n);
    expect(book.balanceOf(2, "item:ore", 5)).toBe(5n);
    expect(resolveOffer(book, b, "refused", 300)).toBe(0);
    expect(audit.check(book.accounts())).toEqual([]);
  });
});

describe("반란·독립", () => {
  it("도시 평균이 문턱(40) 이하이면 문턱 이하 휴먼이 반란군", () => {
    const units = [
      { id: 3, satisfactionMilli: 20_000 },
      { id: 1, satisfactionMilli: 35_000 },
      { id: 2, satisfactionMilli: 60_000 },
    ];
    expect(rebelsOf(units, c)).toEqual([1, 3]);
    expect(
      rebelsOf(
        units.map((u) => ({ ...u, satisfactionMilli: u.satisfactionMilli + 20_000 })),
        c,
      ),
    ).toEqual([]);
  });

  it("민심 표(D-443 155, N35): 문턱 이하 = 반란 중, 그 바로 위 = 반란 예고, 태업 문턱 이하 = 태업 조짐, 그 위 = 안정", () => {
    expect([0, 40, 41, 50, 51, 60, 61, 100].map((points) => unrestBand(points * 1000, c))).toEqual([
      "rebellion",
      "rebellion",
      "warning",
      "warning",
      "sabotage",
      "sabotage",
      "stable",
      "stable",
    ]);
    expect(unrestBand(40_001, c)).toBe("warning");
    expect(unrestBand(55_000, { ...c, rebellionWarningAt: 55 })).toBe("warning");
  });

  it("자본주의: 지분 1위가 열고 혼자 50% 이상이면 선언, 찬성 합 50% 이상이면 통과(D-300·D-301)", () => {
    const holdings = [
      { owner: 1, amount: 300n },
      { owner: 4, amount: 400n },
      { owner: 5, amount: 300n },
    ];
    expect(capitalistIndependence(holdings, 1, new Set(), c)).toEqual({
      kind: "failed",
      leader: 4,
      yesPm: 400,
    });
    expect(capitalistIndependence(holdings, 1, new Set([5]), c)).toEqual({
      kind: "passed",
      leader: 4,
      yesPm: 700,
    });
    expect(
      capitalistIndependence(
        [
          { owner: 1, amount: 400n },
          { owner: 4, amount: 600n },
        ],
        1,
        new Set(),
        c,
      ).kind,
    ).toBe("declare");
    expect(
      capitalistIndependence(
        [
          { owner: 1, amount: 900n },
          { owner: 4, amount: 100n },
        ],
        1,
        new Set([4]),
        c,
      ).kind,
    ).toBe("none");
    expect(democraticIndependence(5, 3)).toBe(true);
    expect(democraticIndependence(4, 2)).toBe(false);
    expect(independenceAllowed("dictatorship", false)).toBe(false);
    expect(independenceAllowed("capitalism", true)).toBe(false);
  });
});

describe("인구", () => {
  it("수명은 범위 안, 수명 끝은 환생 → 신격화 → 사망(출생은 없다, D-469)", () => {
    expect(lifespanMs(0, c)).toBe(c.lifespanMinMs);
    expect(lifespanMs(9999, c)).toBeLessThan(c.lifespanMaxMs);
    expect([deathFate(999, c), deathFate(1000, c), deathFate(1099, c), deathFate(1100, c)]).toEqual([
      "reborn",
      "deified",
      "deified",
      "dead",
    ]);
  });

  it("상속: 상속세(50%)는 도시 국고, 나머지는 소유자에게만(D-469, D-332 대체), 소유자가 없으면 전부 국고", () => {
    const { book, audit, give } = setup();
    give(100, "cur:a", 101n);
    give(100, "cur:b", 7n);
    expect(inherit(book, 100, 201, 9, 1, c)).toBe(2);
    // 세금 ⌊101 × 50%⌋ = 50은 국고, 나머지 51은 소유자. 자산마다 따로
    expect([book.balanceOf(9, "cur:a"), book.balanceOf(201, "cur:a")]).toEqual([50n, 51n]);
    expect([book.balanceOf(9, "cur:b"), book.balanceOf(201, "cur:b")]).toEqual([3n, 4n]);
    expect(book.balanceOf(100, "cur:a")).toBe(0n);
    // 소유자 = 국고 주체(NPC 휴먼이 자기 세력 도시에 삶): 전부 한 계정으로
    give(101, "cur:a", 40n);
    inherit(book, 101, 9, 9, 2, c);
    expect(book.balanceOf(9, "cur:a")).toBe(90n);
    // 소유자가 없으면 전부 국고
    give(102, "cur:a", 10n);
    inherit(book, 102, null, 9, 3, c);
    expect(book.balanceOf(9, "cur:a")).toBe(100n);
    expect(audit.check(book.accounts())).toEqual([]);
  });
});

describe("기술 단계(질문 121·D-396)", () => {
  it("상한 = 연구 시설 Lv와 발전도, 작업량이 차면 오르고, 시설·도시를 잃으면 바로 내려가며, 다시 오를 때는 설계도 할인", () => {
    const sites = [
      { researchLevel: 3, development: 40 },
      { researchLevel: 5, development: 30 },
    ];
    expect(techCeiling(sites, c)).toBe(3);
    expect(techCeiling([{ researchLevel: 5, development: 80 }], c)).toBe(5);
    const state = { level: 1, progress: 0, blueprint: 1 };
    expect(advanceTech(state, researchCost(2, 1, c) + researchCost(3, 1, c), 3, c)).toEqual([
      { from: 1, to: 2, cause: "research" },
      { from: 2, to: 3, cause: "research" },
    ]);
    expect(advanceTech(state, 0, 1, c)).toEqual([{ from: 3, to: 1, cause: "regression" }]);
    expect(state.blueprint).toBe(3);
    expect(researchCost(2, 3, c)).toBe(Math.floor((c.researchWorkBase * 2) / 2));
    expect(advanceTech(state, researchCost(2, 3, c), 3, c)).toEqual([{ from: 1, to: 2, cause: "research" }]);
  });
});
