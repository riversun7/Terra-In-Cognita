// 의결 고리(줄기 governance-3): 점령 몰수 대상 가문·독립 투표 가문 찬반·나라 단위 판단 멈춤·독재 지분 팔기 계정
import { type SimFaction, type SimHooks, newFaction } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { registerNpcShareSale } from "../cityShares/npcTrade.ts";
import { withGovernanceHooks } from "./governanceHooks.ts";

const traits = { aggression: 500, commerce: 500, faith: 500, station: 500 };
const base: SimHooks = {
  treasuryAsset: () => "credit",
  beforeCityTransfer: () => undefined,
  factionBorn: () => undefined,
  factionDied: () => undefined,
  rulerShareHousesOf: (f: SimFaction) => (f.player ? ["12:"] : []),
};

function hooks(control: "npc" | "player" | "vacant", satisfactionMilli = 10_000) {
  return withGovernanceHooks(base, {
    cityHouses: {
      rulingHouseOf: (owner) =>
        owner === 1 && control === "npc" ? { id: 5, cityId: 7, name: "A", leader: true } : undefined,
      rulingPlayerHouseOf: (owner) => (owner === 1 && control === "player" ? 12 : undefined),
      controlOf: () => control,
    },
    world: { units: new Map([[100, { city: 7, satisfactionMilli }]]) },
    keepSatisfaction: () => 50,
  });
}

describe("의결 고리", () => {
  const nation = newFaction(1, "n", { fixed: true, tech: 1, regime: "dictatorship", settledAtMs: 0, traits });
  it("점령 몰수 대상 = 옛 통치자 지배 가문(NPC·선출된 플레이어), 플레이어 가문 나라는 경제 고리 몫", () => {
    expect(hooks("npc").rulerShareHousesOf?.(nation)).toEqual(["npc:5:"]);
    expect(hooks("player").rulerShareHousesOf?.(nation)).toEqual(["12:"]);
    expect(hooks("vacant").rulerShareHousesOf?.(nation)).toEqual([]);
  });

  it("독립 투표: 불만인 NPC 가문은 찬성, 지배 가문·플레이어 가문은 반대", () => {
    expect(hooks("npc").houseIndependenceYes?.("npc:6:", 7, nation)).toBe(true);
    expect(hooks("npc").houseIndependenceYes?.("npc:5:", 7, nation)).toBe(false);
    expect(hooks("npc").houseIndependenceYes?.("3:", 7, nation)).toBe(false);
    expect(hooks("npc", 90_000).houseIndependenceYes?.("npc:6:", 7, nation)).toBe(false);
  });

  it("선출된 플레이어 지도자·빈자리면 나라 단위 판단을 멈추고, NPC가 이끄는 독재만 지배 가문 계정에서 판다", () => {
    expect(hooks("npc").nationLocked?.(nation)).toBe(false);
    expect(hooks("player").nationLocked?.(nation)).toBe(true);
    expect(hooks("vacant").nationLocked?.(nation)).toBe(true);
    expect(hooks("npc").shareSellerOf?.(nation)).toBe("npc:5:");
    expect(hooks("player").shareSellerOf?.(nation)).toBeUndefined();
  });
});

describe("NPC 지분 팔기를 시장으로(D-587 2471 다)", () => {
  it("원장에 시장 고리가 등록돼 있으면 맡기고, 없으면 직접 양도(false)", () => {
    const ledger = {};
    const nation = newFaction(2, "m", { fixed: true, tech: 1, regime: "democracy", settledAtMs: 0, traits });
    const withLedger = withGovernanceHooks(base, {
      ledger,
      cityHouses: { rulingHouseOf: () => undefined },
      keepSatisfaction: () => 50,
    });
    expect(withLedger.marketShareSale?.(nation, undefined, 7, 0)).toBe(false);
    const seen: number[] = [];
    registerNpcShareSale(ledger, (seller, _house, cityId) => {
      seen.push(seller.id, cityId);
      return true;
    });
    expect(withLedger.marketShareSale?.(nation, undefined, 7, 0)).toBe(true);
    expect(seen).toEqual([2, 7]);
  });
});
