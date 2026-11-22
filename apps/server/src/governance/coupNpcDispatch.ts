// 쿠데타 NPC 병력 파견(줄기 no-teleport-b — 사용자 결정 D-591 "어떠한 경우에도 순간이동은 없다 파견으로 실제로 이동해서 참전한다", 질문 2651 나).
// 줄기 no-teleport는 NPC 휴먼을 2차맵 사이로 보내는 길이 없어 그 도시 2차맵에 이미 있는 NPC 병력만 쿠데타 전투에 넣었다 [임시 2651 가]. 이제 NPC 파견
// (travel/npcTravel.ts — 플레이어 이동과 같은 길·시간)으로 실제로 보낸다:
// - 누가: 일으킨 NPC 가문·NPC 지배 가문·편을 든 NPC 가문의 가문원(NPC 휴먼 = 봇). 쿠데타 틱(참가 받는 동안)마다 그 도시 2차맵에 없고 그쪽으로 가는 중도
//   아닌 가문원을 그 도시 시청 칸으로 보낸다(멱등 — 이미 가는 유닛은 다시 보내지 않는다). 국가 지도자(가문장일 수 있다)는 수도를 따라 있어 보내지 않는다,
//   경비대는 그 도시 것이라 이미 그곳이다 [임시 — 질문 2698].
// - 닿은 유닛만 싸운다: 전투(참가 받기 끝) 때 그 도시 2차맵에 서 있는 유닛만 든다(coupDispatch.ts arrivedIn — 늦으면 빠진다 [임시 2652]). 닿은 뒤 전투 중에
//   드는 길(join-on-arrival)은 줄기 no-teleport-a가 전투 쪽에 붙인다 — 이 모듈은 보내기와 도착 예정만 준다(npcTroopEta).
// - 힘 비(NPC 일으키기·참가 기록): 보낼 가문원 모두(그 도시에 있든 보내든 — 2549 "양쪽이 보낼 병력")로 본다 [임시 — 질문 2698].
// - 가는 동안 그 휴먼은 스스로 걷지 않고(2차맵 held) 그 도시 2차맵 밖에서는 일터·집 걷기·도시 웨이브 수비에 보이지 않는다. 도시 경제의 일꾼 수는 머릿수라
//   그대로다 [임시 — 질문 2697].
import type { HouseKey } from "@terra/shared/governance";
import { npcTravelOf } from "../travel/npcTravel.ts";
import { UNIT_KIND_BOT } from "../world/unitKinds.ts";
import type { World } from "../world/world.ts";
import type { CoupCityPlace, GovernancePortTroops } from "./coupDispatch.ts";
import type { GovernanceNation } from "./port.ts";

/** NPC 병력이 세계에서 읽고 바꾸는 것(port.ts가 의결 포트에 합친다) */
export interface GovernancePortNpcTroops {
  /** 그 NPC 휴먼을 그 자리로 보낸다(NPC 파견). 도착 예정 시각, 못 보내면(봇이 아님·길 없음 등) undefined */
  sendNpcTroop(unitId: number, place: CoupCityPlace): Promise<number | undefined>;
  /** 그 NPC 유닛이 그 2차맵으로 가는 중이면 도착 예정 시각 */
  npcTroopEta(unitId: number, mapKey: number): number | undefined;
}

type NpcTroopWorld = Pick<World, "status" | "persistence" | "maps">;

export function worldGovernancePortNpcTroops(
  world: () => NpcTroopWorld | undefined,
): GovernancePortNpcTroops {
  const live = () => {
    const w = world();
    return w?.status().state === "ready" && w.persistence
      ? { maps: w.maps, travel: w.persistence.travel }
      : undefined;
  };
  return {
    async sendNpcTroop(unitId, place) {
      const l = live();
      if (!l) return undefined;
      // NPC 휴먼만(지도자·플레이어 유닛은 보내지 않는다)
      let bot = false;
      for (const map of l.maps.values()) {
        const info = map.unitInfo(unitId);
        if (info) {
          bot = info.kind === UNIT_KIND_BOT;
          break;
        }
      }
      if (!bot) return undefined;
      const sent = await npcTravelOf(l.travel).send(unitId, place);
      return sent.ok ? sent.arriveAt : undefined;
    },
    npcTroopEta(unitId, mapKey) {
      const l = live();
      const trip = l ? npcTravelOf(l.travel).trip(unitId) : undefined;
      return trip?.mapKey === mapKey ? trip.arriveAt : undefined;
    },
  };
}

/** 파견이 쓰는 포트 몫 */
export type NpcDispatchPort = Pick<GovernancePortTroops, "unitMapOf"> &
  GovernancePortNpcTroops & {
    houseUnits(nation: GovernanceNation, key: HouseKey): readonly number[];
  };

/**
 * NPC 가문들의 가문원을 쿠데타 도시로 보낸다: keys 가운데 NPC 가문(n:)만, 가문마다 houseUnits. 그 도시 2차맵에 있거나 그쪽으로 가는 중이면 그대로.
 * 보낸 수
 */
export async function dispatchCoupNpcSides(
  port: NpcDispatchPort,
  nation: GovernanceNation,
  keys: readonly (string | null | undefined)[],
  place: CoupCityPlace | undefined,
): Promise<number> {
  if (!place) return 0;
  const houses = new Set<number>();
  for (const key of keys) if (key?.startsWith("n:") === true) houses.add(Number(key.slice(2)));
  let sent = 0;
  for (const id of [...houses].toSorted((a, b) => a - b))
    for (const unitId of port.houseUnits(nation, `n:${id}`)) {
      if (port.unitMapOf(unitId) === place.mapKey || port.npcTroopEta(unitId, place.mapKey) !== undefined)
        continue;
      if ((await port.sendNpcTroop(unitId, place)) !== undefined) sent += 1;
    }
  return sent;
}
