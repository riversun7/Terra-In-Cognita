// 세력 화면 응답 시험 — 실제 자료만(곧 열림 칸)·시안 자료(여섯 칸)·잠긴 메뉴(D-5055)·시안 장면이 기획 46 규칙과 맞는지
import {
  AGENDA_KINDS,
  CASUS_BELLI,
  OCCUPATION_STEPS,
  REGIMES,
  TREATY_KINDS,
  VOTING_RULES,
  relationBand,
  unrestLevel,
} from "@terra/shared/faction";
import { describe, expect, it } from "vitest";
import { LOCK_RULES, buildFactionOverview, createFactionScreenServices, evaluateLocks } from "./overview.ts";
import { type FactionReal, NO_FACTION_REAL } from "./source.ts";

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
    treasury: [{ asset: "s3_test_credit", name: null, amount: "1000000000" }],
  },
};

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
      regime: null,
      overlord: { faction: { id: "faction_2", name: "s3_test_crown" }, tributePm: null },
      treasury: [{ asset: "s3_test_credit", amount: "1000000000" }],
    });
    expect(view.faction?.preview).toBeUndefined();
    expect(view.locks.every((lock) => !lock.open)).toBe(true);
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
  });

  it("시안 장면이 46 규칙과 맞는다: 띠·민심은 점수에서, 공식 상태·조약·명분·안건은 정한 목록 안", () => {
    if (view.diplomacy.status !== "ready") throw new Error("외교 칸 없음");
    for (const row of view.diplomacy.data) {
      expect(row.band).toBe(relationBand(row.score));
      for (const treaty of row.treaties) expect(TREATY_KINDS).toContain(treaty.kind);
    }
    if (view.cities.status !== "ready") throw new Error("도시 칸 없음");
    const unrest = view.cities.data.map((city) => city.unrest);
    expect(new Set(unrest)).toEqual(new Set(["calm", "slowdown", "rebellion"]));
    for (const city of view.cities.data)
      expect(city.unrest).toBe(unrestLevel(city.satisfaction, city.rebellionThreshold));
    if (view.wars.status !== "ready") throw new Error("전쟁 칸 없음");
    for (const war of view.wars.data) expect(CASUS_BELLI).toContain(war.casusBelli);
    if (view.regime.status !== "ready") throw new Error("정권 칸 없음");
    expect(REGIMES).toContain(view.regime.data.regime);
    expect(view.regime.data.rule).toBe(VOTING_RULES[view.regime.data.regime]);
    for (const vote of view.regime.data.votes) expect(AGENDA_KINDS).toContain(vote.agenda);
    if (view.occupations.status !== "ready") throw new Error("점령 칸 없음");
    for (const row of view.occupations.data) expect(Object.keys(row.steps)).toEqual([...OCCUPATION_STEPS]);
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

describe("잠긴 메뉴(D-5055, S32 [임시])", () => {
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
