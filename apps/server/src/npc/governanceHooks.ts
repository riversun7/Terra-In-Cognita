// 의결이 NPC 사회 규칙·판단에 얹는 고리(줄기 governance-3) — npc/rulingVault.ts npcRulingHooks가 마지막에 얹는다(runtime.ts 1,000줄 상한).
// - 점령 몰수(질문 2431 나 답 — D-293 "통치자 지분만 몰수"·D-346·D-298): rulerShareHousesOf = 옛 통치자의 지배 가문 지분 계정(NPC 나라 = 그 나라 지배 가문 —
//   처음 규칙·선출된 NPC 가문 `npc:<ID>:` 또는 선출된 플레이어 가문 `<행>:`. 플레이어 가문 나라 = 그 가문 `<행>:`은 경제 고리 npc/economy.ts가 준다). 세운 가문(D-582)·알박기 설립자(D-575) 지분은 남는다.
// - 자본주의 독립 투표(질문 2435 답 — D-301 "그 도시 주식을 가진 가문·유저가 찬반"): houseIndependenceYes = 가문 계정 지분의 찬반. NPC 가문 = 그 도시 휴먼 평균
//   만족도가 의결 설정 칸 gov_npc_keep_satisfaction 아래면 찬성(D-323 성향 규칙식 결 — 만족도 = 충성도 D-219) [임시], 옛 통치자 지배 가문은 반대, 플레이어 가문은
//   반대(표를 던지는 명령이 아직 없다 — 질문 2452). 가문 계정은 투표를 열지 않는다(가문 독립 D-300·D-577은 다음 줄기 — 질문 2435 나).
// - 나라 단위 판단 멈춤(질문 2440 나·2434 나 답 — D-252·D-128·D-5057): nationLocked = 선출된 플레이어 지배 가문이 이끄는 NPC 나라·빈자리 나라 → NPC 판단이
//   새 선전포고·강화·봉신 독립·세율(거래세)을 하지 않는다(이미 하는 전쟁의 공격은 잇는다 [임시]). 도시 세금(시장)·짓기·구인은 그대로(D-252).
// - 독재 지분 팔기(질문 2439 나 답 — D-338·D-344): shareSellerOf = NPC가 이끄는 독재 NPC 나라의 지배 가문 계정. NPC 판단의 "지분 팔기"가 그 계정에서 팔고 돈은 그
//   가문 금고로, 과반 아래로는 팔지 않는다(@terra/sim society.sellShares). 플레이어 지배 가문은 NPC가 팔지 않는다.
import type { SimFaction, SimHooks, SimUnit } from "@terra/sim";
import { SATISFACTION_MAX_MILLI } from "@terra/sim";
import type { NpcCityHouses } from "./cityHouses.ts";

/** 만족도를 읽는 시뮬 세계(유닛만) */
type UnitsWorld = { readonly units: ReadonlyMap<number, Pick<SimUnit, "city" | "satisfactionMilli">> };

export interface GovernanceHookDeps {
  readonly cityHouses: Pick<NpcCityHouses, "rulingHouseOf"> &
    Partial<Pick<NpcCityHouses, "rulingPlayerHouseOf" | "controlOf">>;
  readonly world?: UnitsWorld | undefined;
  /** 의결 설정 칸 gov_npc_keep_satisfaction(0~100) */
  readonly keepSatisfaction: () => number;
}

/** 그 도시 휴먼 평균 만족도(0~100). 휴먼이 없으면 undefined */
function citySatisfaction(world: UnitsWorld | undefined, cityId: number): number | undefined {
  if (!world) return undefined;
  let sum = 0;
  let count = 0;
  for (const unit of world.units.values()) {
    if (unit.city !== cityId) continue;
    sum += unit.satisfactionMilli;
    count += 1;
  }
  return count === 0 ? undefined : Math.trunc((sum * 100) / (count * SATISFACTION_MAX_MILLI));
}

export function withGovernanceHooks(base: SimHooks, d: GovernanceHookDeps): SimHooks {
  /** NPC 나라의 지배 가문 계정 꼬리(플레이어 가문 나라는 경제 고리 npc/economy.ts가 준다) */
  const rulerHouses = (faction: SimFaction): string[] => {
    if (faction.player) return [];
    const npc = d.cityHouses.rulingHouseOf(faction.id);
    if (npc) return [`npc:${npc.id}:`];
    const player = d.cityHouses.rulingPlayerHouseOf?.(faction.id);
    return player === undefined ? [] : [`${player}:`];
  };
  const controlOf = (owner: number) => d.cityHouses.controlOf?.(owner) ?? "npc";
  return {
    ...base,
    rulerShareHousesOf: (faction) => [...(base.rulerShareHousesOf?.(faction) ?? []), ...rulerHouses(faction)],
    houseIndependenceYes(house, cityId, parent) {
      if (base.houseIndependenceYes?.(house, cityId, parent)) return true;
      const rulers = [...(base.rulerShareHousesOf?.(parent) ?? []), ...rulerHouses(parent)];
      if (!house.startsWith("npc:") || rulers.includes(house)) return false;
      const satisfaction = citySatisfaction(d.world, cityId);
      return satisfaction !== undefined && satisfaction < d.keepSatisfaction();
    },
    nationLocked: (faction) =>
      base.nationLocked?.(faction) === true || (!faction.player && controlOf(faction.id) !== "npc"),
    shareSellerOf(faction) {
      const inner = base.shareSellerOf?.(faction);
      if (inner !== undefined) return inner;
      if (faction.player || faction.regime !== "dictatorship" || controlOf(faction.id) !== "npc")
        return undefined;
      const npc = d.cityHouses.rulingHouseOf(faction.id);
      return npc ? `npc:${npc.id}:` : undefined;
    },
  };
}
