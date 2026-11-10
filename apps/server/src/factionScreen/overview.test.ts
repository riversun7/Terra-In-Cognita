// 세력 화면 응답 시험 — 실제 자료만(곧 열림 칸)·시안 자료(여섯 칸)·잠긴 메뉴(D-5055)·시안 장면이 기획 46 규칙과 맞는지
// (기획 세력 화면 검토 2026-11-01: 공성 기한 = 공성 선포 + 24시간, 공격 변, 민심 네 단계, 공물·문턱·주기 = 팩 tuning, 배당·복원 지분)
import { loadContentPack } from "@terra/content/node";
import {
  AGENDA_KINDS,
  CASUS_BELLI,
  DEVELOPMENT_FACTORS,
  DIVIDEND_BY_REGIME,
  OCCUPATION_STEPS,
  REGIMES,
  SHARES_PER_CITY,
  SIEGE_DEFENSE_WINDOW_MS,
  SIEGE_SIDES,
  TREATY_KINDS,
  UNREST_LEVELS,
  VOTING_RULES,
  relationBand,
  unrestLevel,
} from "@terra/shared/faction";
import { TEST_SOCIETY_COEFFICIENTS, societyCoefficientsFrom, unrestBand } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { tuningOf } from "../world/combatCatalog.ts";
import { LOCK_RULES, buildFactionOverview, createFactionScreenServices, evaluateLocks } from "./overview.ts";
import { type FactionReal, NO_FACTION_REAL, withNationNames } from "./source.ts";
import { TEST_FACTION_RULES, factionRulesFrom } from "./tuning.ts";

/** 실제 콘텐츠 팩(content/core)의 tuning으로 만든 세력 화면 설정값 */
function packRules() {
  const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
  if (!loaded.source) throw new Error("content pack");
  return factionRulesFrom(societyCoefficientsFrom(tuningOf(loaded.source)));
}

const NOW = Date.UTC(2026, 9, 31, 3, 0, 0);
const OFF = { preview: false, now: NOW };
const ON = { preview: true, now: NOW };
const SECTIONS = ["cities", "diplomacy", "wars", "regime", "shares", "occupations"] as const;

const MEMBER: FactionReal = {
  owner: { units: 3, buildings: 1, balances: [{ asset: "s3_test_credit", name: null, amount: "1200" }] },
  faction: {
    id: 7,
    kind: "npc",
    code: "s3_test_npc",
    parent: { id: 2, kind: "npc", code: "s3_test_crown" },
    joinedAt: NOW - 1000,
    memberCount: 4,
    regime: "democracy",
    fixed: false,
    cityCount: 0,
    treasury: [{ asset: "s3_test_credit", name: null, amount: "1000000000" }],
  },
};

/** 도시를 가진 고정 NPC 국가의 시민(C8: 도시 수·체제를 DB에서 읽는다) */
const CITIZEN: FactionReal = {
  ...MEMBER,
  faction:
    MEMBER.faction === null
      ? null
      : { ...MEMBER.faction, parent: null, regime: "dictatorship", fixed: true, cityCount: 2 },
};

describe("나라 이름·지도자 이름(WP-NPC)", () => {
  const names = {
    nationNames: (code: string) =>
      code === "s3_test_npc"
        ? {
            name: { ko: "임시 국가 16", en: "Placeholder nation 16" },
            leader: { ko: "임시 지도자 16", en: "L16" },
          }
        : { name: undefined, leader: undefined },
  };

  it("지도자 유닛이 있으면 팩 이름(label)과 지도자 이름(leaderName)을 붙여 요약에 싣는다", () => {
    const real = withNationNames(
      { ...CITIZEN, faction: CITIZEN.faction ? { ...CITIZEN.faction, leaderUnit: 900 } : null },
      names,
    );
    const view = buildFactionOverview(real, OFF);
    expect(view.faction?.label).toEqual({ ko: "임시 국가 16", en: "Placeholder nation 16" });
    expect(view.faction?.leaderName).toEqual({ ko: "임시 지도자 16", en: "L16" });
    // 옛 글 칸(name = 코드, leader = null)은 그대로(옛 기기)
    expect(view.faction?.name).toBe("s3_test_npc");
    expect(view.faction?.leader).toBeNull();
  });

  it("국가 마크: 프리셋의 만든 마크 사양·색을 싣고, 올린 그림이 있으면 그 해시도 싣는다", () => {
    const spec = { shape: "circle", division: "fess", charge: "bird", scheme: 1 } as const;
    const withEmblem = {
      nationNames: (code: string) => ({
        ...names.nationNames(code),
        emblem:
          code === "s3_test_npc" ? { preset: "placeholder_nation_16", spec, color: "#fdcb6e" } : undefined,
      }),
    };
    const made = buildFactionOverview(withNationNames(CITIZEN, withEmblem), OFF);
    expect(made.faction?.emblem).toEqual({ spec, color: "#fdcb6e", uploaded: null });
    const hash = "ab".repeat(32);
    const uploaded = buildFactionOverview(
      withNationNames(CITIZEN, withEmblem, new Map([["placeholder_nation_16", hash]])),
      OFF,
    );
    expect(uploaded.faction?.emblem?.uploaded).toBe(hash);
    // 프리셋이 없는 세력은 마크가 없다(화면은 기본 표식)
    expect(buildFactionOverview(withNationNames(CITIZEN, names), OFF).faction?.emblem).toBeNull();
  });

  it("지도자 유닛이 없으면 지도자 이름을 싣지 않는다, 이름 출처가 없으면 그대로", () => {
    const view = buildFactionOverview(withNationNames(CITIZEN, names), OFF);
    expect(view.faction?.label?.ko).toBe("임시 국가 16");
    expect(view.faction?.leaderName).toBeNull();
    expect(withNationNames(CITIZEN, undefined)).toBe(CITIZEN);
    expect(withNationNames(NO_FACTION_REAL, names)).toBe(NO_FACTION_REAL);
  });
});

describe("실제 자료만(시안 자료 꺼짐)", () => {
  it("세력이 없으면 개인 단계, 잠긴 메뉴 없음, 여섯 칸은 모두 준비 중", () => {
    const view = buildFactionOverview(NO_FACTION_REAL, OFF);
    expect(view.preview).toBe(false);
    expect(view.stage).toBe("individual");
    expect(view.faction).toBeNull();
    expect(view.locks).toEqual([]);
    expect(view.me).toEqual({ hasOwner: false, units: 0, buildings: 0, balances: [] });
    for (const name of SECTIONS) expect(view[name], name).toEqual({ status: "not_ready" });
  });

  it("소속 세력이 있으면 그 요약(도시 0 = 가문·세력 단계, 국고·위 세력)과 도시 수로 정한 잠긴 메뉴", () => {
    const view = buildFactionOverview(MEMBER, OFF);
    expect(view.stage).toBe("faction");
    expect(view.me).toEqual({ hasOwner: true, ...MEMBER.owner });
    expect(view.faction).toMatchObject({
      id: "faction_7",
      name: "s3_test_npc",
      kind: "npc",
      stage: "faction",
      memberCount: 4,
      cityCount: 0,
      regime: "democracy",
      fixed: false,
      overlord: { faction: { id: "faction_2", name: "s3_test_crown" }, tributePm: null },
      treasury: [{ asset: "s3_test_credit", amount: "1000000000" }],
    });
    expect(view.faction?.preview).toBeUndefined();
    expect(view.locks.every((lock) => !lock.open)).toBe(true);
    for (const name of SECTIONS) expect(view[name].status, name).toBe("not_ready");
  });

  it("도시를 가진 NPC 국가 시민: 국가 단계, DB의 체제·고정 표시·도시 수, 화폐 발행·세율은 열리고 채권은 잠김(C8)", () => {
    const view = buildFactionOverview(CITIZEN, OFF);
    expect(view.stage).toBe("nation");
    expect(view.faction).toMatchObject({
      stage: "nation",
      regime: "dictatorship",
      fixed: true,
      cityCount: 2,
    });
    expect(view.locks.map((lock) => [lock.feature, lock.open])).toEqual([
      ["currency_issue", true],
      ["tax_rate", true],
      ["national_bond", false],
    ]);
    for (const name of SECTIONS) expect(view[name].status, name).toBe("not_ready");
  });

  it("세력 코드가 없으면(유저 세력) 번호로 부른다", () => {
    const faction = MEMBER.faction === null ? null : { ...MEMBER.faction, code: null, parent: null };
    expect(buildFactionOverview({ ...MEMBER, faction }, OFF).faction).toMatchObject({
      name: "#7",
      overlord: null,
    });
  });
});

describe("시안 자료(dev·admin)", () => {
  const view = buildFactionOverview(MEMBER, ON);

  it("세력·여섯 칸은 시안 자료(preview)이고 내 몫은 실제 자료 그대로", () => {
    expect(view.preview).toBe(true);
    expect(view.faction?.preview).toBe(true);
    expect(view.me.balances).toEqual(MEMBER.owner?.balances);
    for (const name of SECTIONS) {
      const section = view[name];
      expect(section.status, name).toBe("ready");
      if (section.status === "ready") expect(section.preview, name).toBe(true);
    }
  });

  it("국가 단계(도시 1개 이상)이고 잠긴 메뉴는 도시 수로 정한다", () => {
    expect(view.stage).toBe("nation");
    expect(view.faction?.cityCount).toBeGreaterThan(0);
    expect(view.locks).toEqual(evaluateLocks(view.faction?.cityCount ?? 0));
    expect(view.locks.find((lock) => lock.feature === "national_bond")?.open).toBe(false);
    expect(view.locks.find((lock) => lock.feature === "currency_issue")?.open).toBe(true);
    expect(view.faction?.fixed).toBe(false);
  });

  it("시안 장면이 46 규칙과 맞는다: 띠·민심은 점수에서, 공식 상태·조약·명분·안건은 정한 목록 안", () => {
    if (view.diplomacy.status !== "ready") throw new Error("외교 칸 없음");
    for (const row of view.diplomacy.data) {
      expect(row.band).toBe(relationBand(row.score));
      for (const treaty of row.treaties) expect(TREATY_KINDS).toContain(treaty.kind);
    }
    if (view.cities.status !== "ready") throw new Error("도시 칸 없음");
    const unrest = view.cities.data.map((city) => city.unrest);
    expect(new Set(unrest)).toEqual(new Set(UNREST_LEVELS));
    for (const city of view.cities.data) {
      expect(city.unrest).toBe(unrestLevel(city.satisfaction, TEST_FACTION_RULES.unrest));
      expect(city.rebellionWarning).toBe(TEST_FACTION_RULES.unrest.warningAt);
      // 발전도 7요소 내역의 합 = 발전도(D-254)
      const parts = city.developmentParts;
      expect(parts === null ? null : Object.keys(parts)).toEqual([...DEVELOPMENT_FACTORS]);
      if (parts !== null)
        expect(Object.values(parts).reduce((sum, value) => sum + value, 0)).toBe(city.development);
    }
    if (view.wars.status !== "ready") throw new Error("전쟁 칸 없음");
    for (const war of view.wars.data) {
      expect(CASUS_BELLI).toContain(war.casusBelli);
      // 공성: 공격 변이 있고(D-233), 방어 시각 기한·고른 시각은 공성 선포 + 24시간 안(D-200), 공성 선포는 선전포고 뒤
      if (war.siegeDeclaredAt === null) throw new Error("공성 선포 시각 없음");
      expect(SIEGE_SIDES).toContain(war.attackSide);
      expect(war.siegeDeclaredAt).toBeGreaterThanOrEqual(war.declaredAt);
      if (war.deadlineAt !== null) expect(war.deadlineAt).toBe(war.siegeDeclaredAt + SIEGE_DEFENSE_WINDOW_MS);
      if (war.siegeAt !== null)
        expect(war.siegeAt).toBeLessThanOrEqual(war.siegeDeclaredAt + SIEGE_DEFENSE_WINDOW_MS);
    }
    if (view.regime.status !== "ready") throw new Error("정권 칸 없음");
    expect(REGIMES).toContain(view.regime.data.regime);
    expect(view.regime.data.rule).toBe(VOTING_RULES[view.regime.data.regime]);
    for (const vote of view.regime.data.votes) expect(AGENDA_KINDS).toContain(vote.agenda);
    if (view.occupations.status !== "ready") throw new Error("점령 칸 없음");
    for (const row of view.occupations.data) expect(Object.keys(row.steps)).toEqual([...OCCUPATION_STEPS]);
  });

  it("봉신 공물·민심 문턱·주기는 팩 tuning 값이다(S33 5%·7일, S26 40·N35 50·60, 배당 7일, D-443)", () => {
    const rules = packRules();
    expect(rules).toEqual({
      unrest: { rebellionThreshold: 40, warningAt: 50, sabotageAt: 60 },
      tributePm: 50,
      tributeEveryMs: 7 * 86_400_000,
      dividendEveryMs: 7 * 86_400_000,
    });
    // 팩 없는 서버·시험의 값(sim 시험 계수표)도 팩 출발값과 같다
    expect(TEST_FACTION_RULES).toEqual(rules);
    const packed = buildFactionOverview(MEMBER, ON, { ...rules, tributePm: 70, tributeEveryMs: 3 });
    expect(packed.faction?.vassals.map((vassal) => vassal.tributePm)).toEqual([70]);
    expect(packed.rules).toEqual({ tributeEveryMs: 3, dividendEveryMs: rules.dividendEveryMs });
    expect(view.faction?.vassals.map((vassal) => vassal.tributePm)).toEqual([rules.tributePm]);
  });

  it("민심 단계는 규칙 sim unrestBand와 같다(만족도 0~100 모두)", () => {
    for (let satisfaction = 0; satisfaction <= 100; satisfaction += 1)
      expect(unrestLevel(satisfaction, TEST_FACTION_RULES.unrest), String(satisfaction)).toBe(
        unrestBand(satisfaction * 1000, TEST_SOCIETY_COEFFICIENTS),
      );
  });

  it("지분: 남은 이익은 체제대로(자본주의 = 지분대로, 민주주의 = 국고라 배당 없음), 최근 배당 내 몫 = 지분 비례 내림(D-304)", () => {
    if (view.shares.status !== "ready") throw new Error("지분 칸 없음");
    const recipients = new Set(view.shares.data.map((row) => row.dividend.to));
    expect(recipients).toEqual(new Set([DIVIDEND_BY_REGIME.capitalism, DIVIDEND_BY_REGIME.democracy]));
    for (const row of view.shares.data) {
      const last = row.dividend.last;
      if (row.dividend.to === "treasury") expect(last).toBeNull();
      if (last !== null)
        expect(last.mine).toBe(
          ((BigInt(last.total) * BigInt(row.myShares)) / BigInt(SHARES_PER_CITY)).toString(),
        );
    }
  });

  it("복원 모금: 목표를 채우면 받을 지분 = 내 돈 / 목표 × 1000주(가장 큰 나머지)", () => {
    if (view.occupations.status !== "ready") throw new Error("점령 칸 없음");
    const funds = view.occupations.data.flatMap((row) => (row.restoration === null ? [] : [row.restoration]));
    expect(funds.length).toBeGreaterThan(0);
    for (const fund of funds) {
      const exact = (Number(fund.mine) * SHARES_PER_CITY) / Number(fund.goal);
      expect(Math.abs(fund.expectedShares - exact)).toBeLessThan(1);
    }
  });

  it("시각은 지금 기준: 마감·공성·투표 끝은 미래(끝난 투표만 과거), 선포·점령은 과거", () => {
    if (view.wars.status !== "ready" || view.regime.status !== "ready") throw new Error("칸 없음");
    for (const war of view.wars.data) {
      expect(war.declaredAt).toBeLessThan(NOW);
      for (const at of [war.siegeAt, war.deadlineAt]) if (at !== null) expect(at).toBeGreaterThan(NOW);
    }
    for (const vote of view.regime.data.votes) expect(vote.closesAt > NOW).toBe(vote.result === null);
  });

  it("시안 ID는 preview_로 시작한다(실제 ID와 겹치지 않게)", () => {
    const ids = JSON.stringify(view).match(/"id":"[^"]+"/g) ?? [];
    expect(ids.length).toBeGreaterThan(10);
    for (const id of ids) expect(id).toMatch(/^"id":"preview_/);
  });
});

describe("잠긴 메뉴(D-5055, S32)", () => {
  it("조건마다 지금 값과 충족 여부", () => {
    expect(evaluateLocks(0).map((lock) => lock.open)).toEqual(LOCK_RULES.map(() => false));
    expect(evaluateLocks(5).every((lock) => lock.open)).toBe(true);
    expect(evaluateLocks(2).find((lock) => lock.feature === "national_bond")).toEqual({
      feature: "national_bond",
      open: false,
      requirements: [{ kind: "cities_min", need: 5, current: 2, met: false }],
    });
  });
});

describe("서비스", () => {
  it("실제 자료 출처가 없으면 빈 실제 자료, 있으면 그 사용자로 읽는다", async () => {
    const viewer = { id: "user-1", loginId: "tester", roles: [] };
    expect((await createFactionScreenServices().overview(viewer, OFF)).faction).toBeNull();
    const calls: [string, number][] = [];
    const services = createFactionScreenServices({
      source: {
        load: (userId, nowMs) => {
          calls.push([userId, nowMs]);
          return Promise.resolve(MEMBER);
        },
      },
    });
    expect((await services.overview(viewer, OFF)).faction?.name).toBe("s3_test_npc");
    expect(calls).toEqual([["user-1", NOW]]);
  });
});
