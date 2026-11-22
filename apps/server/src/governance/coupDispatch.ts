// 쿠데타 병력 파견(줄기 no-teleport — 사용자 결정 D-591 "어떠한 경우에도 순간이동은 없다 파견으로 실제로 이동해서 참전한다", D-555 1505 "어떤 유닛이든 실제로
// 옮겨야한다"). gov-fix-2(질문 2571 [임시])는 편을 든 쪽 병력을 어디에 있든 이동 시간 없이 전투에 넣었다 — 이 모듈이 그것을 대신한다.
// - 도착 = 쿠데타 도시의 2차맵에 서 있다(띄운 2차맵 위 유닛이거나 그 2차맵의 좌표 유닛 — 2차맵 사이를 건너뛰는 중이면 아니다) [임시 — 질문 2651].
//   전투(참가 받기 끝 — 빨리감기 한 번)에는 그때 도착한 유닛만 든다. 늦게 닿는 유닛은 싸우지 않는다(참가 받기를 늘리지 않는다) [임시 — 질문 2652].
// - 플레이어 병력: 고른 유닛을 이동 서비스(travel/service.ts start — 플레이어가 1차맵에서 보내는 길과 같은 걷기·좌표 이동·조우·도중 습격)로 쿠데타 도시
//   시청 칸으로 보낸다. 이미 그 2차맵에 있는 유닛은 보내지 않는다. 고르지 않으면 이미 그 도시 2차맵에 있는 내 유닛만 든다(보내지 않는다) [임시 — 질문 2571 뒤 2651].
//   보낼 수 있는 유닛 = 내 사이보그 본체·고용 휴먼·사이보그 유닛(수호신은 도시에 머물고, 배는 땅 전투에 들지 않는다 — D-541 1278 가).
// - NPC 병력(일으킨 NPC 가문·지배 가문·편을 든 NPC 가문·플레이어 가문 나라의 가문 유닛·경비대): NPC 휴먼을 2차맵 사이로 보내는 길이 서버에 없다(이동 서비스는
//   플레이어 유닛만 — 봇은 NPC 런타임이 집·일터로 걷게 한다). 그래서 그 도시 2차맵에 이미 있는 유닛만 든다 [임시 — 질문 2651].
// - 플레이어 유닛은 거울 세계(NPC 사회 런타임)에 없어 쿠데타 전투 틀(@terra/sim runCoupBattle — 거울 세계 유닛)에 그동안 들지 못했다. 전투 때 도착한
//   플레이어 유닛을 거울 유닛 모양으로 넣는다(portCoup.ts coupBattle — 스탯은 거울 휴먼과 같은 기술 단계 값, 부상은 남지 않는다) [임시 — 질문 2653].
import type { GovernanceCoupTroop } from "@terra/shared/governance";
import type { TravelService } from "../travel/serviceTypes.ts";
import { UNIT_KIND_CYBORG, UNIT_KIND_CYBORG_UNIT, UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import type { World } from "../world/world.ts";

/** 쿠데타 도시 자리(파견 목표 — 그 도시 2차맵의 시청 칸) */
export interface CoupCityPlace {
  readonly mapKey: number;
  readonly x: number;
  readonly y: number;
}

/** 화면 병력 한 줄의 종류(사이보그 본체·고용 휴먼·사이보그 유닛) */
export type CoupTroopType = "body" | "human" | "cyborg";

/** 쿠데타 병력이 세계에서 읽고 바꾸는 것(port.ts가 의결 포트에 합친다) */
export interface GovernancePortTroops {
  /** 도시 자리(모르면 undefined) */
  cityPlace(cityId: number): CoupCityPlace | undefined;
  /** 유닛이 지금 서 있는 2차맵(띄운 2차맵 위 또는 좌표 유닛). 2차맵 사이를 건너뛰는 중이거나 모르면 undefined */
  unitMapOf(unitId: number): number | undefined;
  /** 그 사용자가 쿠데타에 보낼 수 있는 실제 유닛(유닛 ID 차례) */
  userTroops(userId: string): readonly { readonly id: number; readonly type: CoupTroopType }[];
  /** 그 유닛을 그 자리로 보낸다(이동 서비스). 도착 예정 시각, 못 보내면 undefined */
  sendTroop(userId: string, unitId: number, place: CoupCityPlace): Promise<number | undefined>;
  /** 그 유닛이 그 2차맵으로 가는 중이면 도착 예정 시각 */
  troopEta(userId: string, unitId: number, mapKey: number): number | undefined;
  /** 보내면 걸리는 시간(ms — 이동 서비스 확인 단계, 못 가면 undefined) */
  troopTravelMs(userId: string, unitId: number, place: CoupCityPlace): number | undefined;
}

/** 화면 병력 표에서 걸리는 시간을 셈하는 유닛 수 상한(확인 단계 길 찾기 부하 [임시]) */
export const TROOP_PLAN_LIMIT = 40;

const TROOP_TYPES: ReadonlyMap<number, CoupTroopType> = new Map([
  [UNIT_KIND_CYBORG, "body"],
  [UNIT_KIND_HUMAN, "human"],
  [UNIT_KIND_CYBORG_UNIT, "cyborg"],
]);

type TroopWorld = Pick<World, "status" | "npc" | "persistence" | "maps">;

export function worldGovernancePortTroops(world: () => TroopWorld | undefined): GovernancePortTroops {
  const live = () => {
    const w = world();
    return w?.status().state === "ready" && w.persistence
      ? { maps: w.maps, persistence: w.persistence, npc: w.npc }
      : undefined;
  };
  const travelOf = (): TravelService | undefined => live()?.persistence.travel;
  return {
    cityPlace(cityId) {
      const place = live()?.npc?.places.get(cityId);
      return place ? { mapKey: place.mapKey, x: place.cellX, y: place.cellY } : undefined;
    },
    unitMapOf(unitId) {
      const l = live();
      if (!l) return undefined;
      for (const map of l.maps.values()) if (map.unitInfo(unitId)) return map.mapKey;
      return l.persistence.travel.parkedAt(unitId)?.mapKey;
    },
    userTroops(userId) {
      const l = live();
      const owner = l?.persistence.settlement.findOwnerOfUser(userId);
      if (!l || owner === undefined) return [];
      const out = new Map<number, CoupTroopType>();
      for (const map of l.maps.values())
        map.forEachUnit((unit) => {
          const type = TROOP_TYPES.get(unit.kind);
          if (unit.ownerId === owner && type) out.set(unit.id, type);
        });
      for (const unit of l.persistence.travel.coordinateUnits(new Set([owner]))) {
        const type = TROOP_TYPES.get(unit.kind);
        if (type && !unit.sea && unit.aboard === null) out.set(unit.unitId, type);
      }
      return [...out].map(([id, type]) => ({ id, type })).toSorted((a, b) => a.id - b.id);
    },
    async sendTroop(userId, unitId, place) {
      const travel = travelOf();
      if (!travel) return undefined;
      const sent = await travel.start(userId, {
        unitId,
        mapKey: place.mapKey,
        x: place.x,
        y: place.y,
        kind: "move",
      });
      return sent.ok ? (sent.arriveAt ?? 0) : undefined;
    },
    troopEta(userId, unitId, mapKey) {
      const row = travelOf()
        ?.list(userId)
        .find((trip) => trip.unitId === unitId);
      return row?.state === "going" && row.route.at(-1) === mapKey ? row.arriveAt : undefined;
    },
    troopTravelMs(userId, unitId, place) {
      const planned = travelOf()?.plan(userId, { unitId, mapKey: place.mapKey, x: place.x, y: place.y });
      return planned?.ok ? planned.plan.durationMs : undefined;
    },
  };
}

/** 그 도시 2차맵에 도착해 있는 유닛만(차례 그대로) */
export function arrivedIn(
  port: Pick<GovernancePortTroops, "unitMapOf">,
  unitIds: readonly number[],
  place: CoupCityPlace | undefined,
): number[] {
  if (!place) return [];
  return unitIds.filter((id) => port.unitMapOf(id) === place.mapKey);
}

/**
 * 플레이어가 고른 병력을 보낸다: 내 유닛 가운데 고른 것(고르지 않으면 이미 그 도시 2차맵에 있는 내 유닛). 그 2차맵에 없는 유닛은 이동 서비스로 보내고,
 * 못 보낸 유닛(길 없음·다침·포로 등)은 빠진다. 참가 줄에 적을 유닛 ID
 */
export async function dispatchTroops(
  port: Pick<GovernancePortTroops, "userTroops" | "unitMapOf" | "sendTroop">,
  userId: string,
  place: CoupCityPlace | undefined,
  picked?: readonly number[],
): Promise<number[]> {
  if (!place) return [];
  const mine = port.userTroops(userId).map((row) => row.id);
  if (!picked) return arrivedIn(port, mine, place);
  const want = new Set(picked);
  const out: number[] = [];
  for (const id of mine) {
    if (!want.has(id)) continue;
    if (port.unitMapOf(id) === place.mapKey || (await port.sendTroop(userId, id, place)) !== undefined)
      out.push(id);
  }
  return out;
}

/**
 * 의결 칸 쿠데타 카드의 내 병력(보낼 수 있는 내 유닛 — 유닛 ID 차례): 그 도시 2차맵에 있나·가는 중이면 도착 예정·다른 곳이면 지금 보내면 도착 예정
 * (확인 단계 길 찾기는 앞 TROOP_PLAN_LIMIT개만 — 나머지는 null)
 */
export function coupTroops(
  port: Pick<GovernancePortTroops, "cityPlace" | "unitMapOf" | "userTroops" | "troopEta" | "troopTravelMs">,
  userId: string,
  city: number | undefined,
  sent: readonly number[] | null | undefined,
  nowMs: number,
): GovernanceCoupTroop[] {
  const place = city === undefined ? undefined : port.cityPlace(city);
  if (!place) return [];
  const sentSet = new Set(sent ?? []);
  let planned = 0;
  return port.userTroops(userId).map(({ id, type }) => {
    const base = { id, type, sent: sentSet.has(id) };
    if (port.unitMapOf(id) === place.mapKey) return { ...base, state: "here", arriveAt: null };
    const eta = port.troopEta(userId, id, place.mapKey);
    if (eta !== undefined) return { ...base, state: "going", arriveAt: eta };
    planned += 1;
    const ms = planned <= TROOP_PLAN_LIMIT ? port.troopTravelMs(userId, id, place) : undefined;
    return { ...base, state: "away", arriveAt: ms === undefined ? null : nowMs + ms };
  });
}
