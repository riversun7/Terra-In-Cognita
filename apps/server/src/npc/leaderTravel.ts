// NPC 국가 지도자가 수도를 따라 걸어간다 — 기획 D-528("수도를 따라간다"), 사용자 결정 D-591("어떠한 경우에도 순간이동은 없다"), 질문 2654 가(줄기
// no-teleport-b). 예전의 바로 옮기기(leaders.ts moveLeaderToCapital, 질문 865 [임시])를 대신한다.
// - 수도가 바뀌면(하루 끝 capitals.ts review → world.ts onCapitalMoved) 지도자를 NPC 이동(travel/npcTravel.ts — 플레이어 이동과 같은 길·시간)으로 새 수도
//   행정 건물 곁(없으면 도시 시청 칸)으로 보낸다. 가는 동안 옛 자리·길 위에 있고, 닿으면 수도 순회(leaderRoam.ts)가 다시 붙는다.
// - 가는 중(2차맵 사이를 건너뛰는 중이라 2차맵에서 찾을 수 없음)에 수도가 또 바뀌면 바라는 수도만 바꿔 두고, 닿을 때 그 수도가 아니면 다시 보낸다.
// - 새 수도 2차맵을 띄우지 않았거나 길이 없으면 그 자리에 둔다("blocked" — 다음 수도 바뀜 때 다시 본다 [임시 — 질문 2697]).
import { type NpcTravel, npcTravelOf } from "../travel/npcTravel.ts";
import { type CapitalSpot, type LeaderMap, type LeaderSeedInput, findLeader, hallCell } from "./leaders.ts";

export type LeaderMoveResult = "sent" | "stay" | "none" | "blocked" | "pending";

/** 이동 서비스마다 세력 → 바라는 수도(가는 중에 바뀐 수도를 닿을 때 본다) */
const wantedOf = new WeakMap<NpcTravel, Map<number, CapitalSpot>>();

export interface LeaderTravelInput {
  readonly maps: ReadonlyMap<number, LeaderMap>;
  /** 시설 서비스(수도 행정 건물을 찾는다) */
  readonly facilities: { readonly service: { readonly facilities: LeaderSeedInput["facilities"] } };
  /** 이동 서비스(NPC 파견 — npcTravelOf). 없으면 옮기지 않는다 */
  readonly travel: Parameters<typeof npcTravelOf>[0] | undefined;
  readonly ownerId: number;
  readonly capital: CapitalSpot;
  readonly log?: { warn(obj: object, message: string): void } | undefined;
}

/**
 * 지도자를 수도로 보낸다: 이미 수도 2차맵이면 "stay", 지도자를 2차맵에서 찾지 못하면 가는 중일 수 있어 바라는 수도만 적고 "pending"(지도자가 아예 없으면
 * 닿을 일이 없어 그대로), 보냈으면 "sent", 못 보내면 "blocked"
 */
export async function leaderToCapital(input: LeaderTravelInput): Promise<LeaderMoveResult> {
  const { ownerId, capital } = input;
  if (!input.travel) return "blocked";
  const travel = npcTravelOf(input.travel);
  let wanted = wantedOf.get(travel);
  if (!wanted) {
    wanted = new Map();
    wantedOf.set(travel, wanted);
  }
  wanted.set(ownerId, capital);
  const found = findLeader(input.maps.values(), ownerId);
  if (!found) return "pending";
  if (found.map.mapKey === capital.mapKey) {
    wanted.delete(ownerId);
    return "stay";
  }
  const target = input.maps.get(capital.mapKey);
  if (!target) return "blocked";
  const at = hallCell(target, capital.id, input.facilities.service.facilities) ?? {
    x: capital.cellX,
    y: capital.cellY,
  };
  const table = wanted;
  const sent = await travel.send(found.id, { mapKey: capital.mapKey, ...at }, (done) => {
    // 닿은 2차맵이 지금 바라는 수도가 아니면(가는 중에 수도가 또 바뀜) 다시 보낸다. 멈췄으면 다음 수도 바뀜까지 둔다
    const want = table.get(ownerId);
    if (!want || done.state !== "arrived") return;
    if (done.mapKey === want.mapKey) table.delete(ownerId);
    else void leaderToCapital({ ...input, capital: want });
  });
  if (!sent.ok) {
    input.log?.warn({ ownerId, capital: capital.id, code: sent.code }, "npc leader could not set out");
    return "blocked";
  }
  return "sent";
}
