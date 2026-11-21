// 투표권 셈(electorate.ts) — 가짜 포트·가문 표로 민주주의(가문마다 한 표, 2355 가)·자본주의(지분, 국고 지분은 다른 주주에게 비례로 — D-581)·
// 독재(표 없음)·지분 과반(D-344)을 본다
import { describe, expect, it } from "vitest";
import { createElectorate } from "./electorate.ts";
import type { GovernanceNation, GovernanceOwner } from "./port.ts";

const TRAITS = { aggression: 500, commerce: 500, faith: 500 };
const nation = (regime: GovernanceNation["regime"]): GovernanceNation => ({
  rowId: 10,
  ownerId: 100,
  code: "nation_1",
  playerHouse: false,
  regime,
  traits: TRAITS,
  cities: [1, 2],
});
const owners: Record<number, GovernanceOwner> = {
  200: { userId: "u-a", factionRow: null, playerHouse: false, traits: null, satisfaction: undefined },
  300: { userId: null, factionRow: 30, playerHouse: false, traits: TRAITS, satisfaction: 40 },
  400: { userId: null, factionRow: 40, playerHouse: true, traits: null, satisfaction: undefined },
};

function tools(holdings: { owner: number; amount: bigint }[]) {
  const port: Parameters<typeof createElectorate>[0]["port"] = {
    holdingsOf: () => holdings,
    ownerInfo: (id) => owners[id],
    npcHousesOf: () => [
      { id: 5, cityId: 1 },
      { id: 6, cityId: 2 },
    ],
    citySatisfaction: (city) => (city === 1 ? 70 : 30),
    defaultRulingHouse: () => "n:5",
    ownerOfHouseRow: (row) => (row === 40 ? 400 : undefined),
  };
  const store: Parameters<typeof createElectorate>[0]["store"] = {
    playerHousesOf: async () => [{ id: 40, head: "u-head", name: "가문" }],
    headOf: async (row) => (row === 40 ? "u-head" : undefined),
  };
  return createElectorate({ port, store });
}

describe("electorate", () => {
  it("민주주의: 플레이어 가문(가문장)과 NPC 가문마다 한 표", async () => {
    const t = tools([]);
    const result = await t.electorate(nation("democracy"));
    expect(result.voters.map((voter) => [voter.key, voter.weight, voter.userId])).toEqual([
      ["p:40", 1n, "u-head"],
      ["n:5", 1n, null],
      ["n:6", 1n, null],
    ]);
    expect(result.voters.find((voter) => voter.key === "n:6")?.satisfaction).toBe(30);
  });
  it("자본주의: 국고 지분은 다른 주주에게 비례로 나눈다(D-581), 가문 국고는 가문장이 던진다", async () => {
    const t = tools([
      { owner: 100, amount: 1000n },
      { owner: 200, amount: 300n },
      { owner: 300, amount: 600n },
      { owner: 400, amount: 100n },
    ]);
    const result = await t.electorate(nation("capitalism"));
    expect(result.voters.map((voter) => [voter.key, voter.weight, voter.userId, voter.npc])).toEqual([
      ["o:200", 600n, "u-a", false],
      ["o:300", 1200n, null, true],
      ["o:400", 200n, "u-head", false],
    ]);
    expect(result.total).toBe(2000n);
  });
  it("국고만 지분을 가지면 투표권이 비고, 독재는 표가 없다", async () => {
    const t = tools([{ owner: 100, amount: 1000n }]);
    expect((await t.electorate(nation("capitalism"))).total).toBe(0n);
    expect((await t.electorate(nation("dictatorship"))).voters).toEqual([]);
  });
  it("지배 쪽 지분 몫(D-344): 국고 + 지배 플레이어 가문 국고", () => {
    const t = tools([
      { owner: 100, amount: 400n },
      { owner: 400, amount: 200n },
      { owner: 200, amount: 400n },
    ]);
    expect(t.rulingSharePm(nation("capitalism"), "n:5")).toBe(400);
    expect(t.rulingSharePm(nation("capitalism"), "p:40")).toBe(600);
    expect(tools([]).rulingSharePm(nation("capitalism"), null)).toBe(1000);
  });
});
