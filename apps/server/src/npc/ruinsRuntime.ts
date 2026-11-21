// 폐허 2를 NPC 사회 런타임에 잇는 몫 — docs/adr/2026-11-07-ruins-restoration.md "바뀜 (기획 답 480~489, 472, 535)".
// 규칙은 시뮬과 같은 함수(@terra/sim SocietyRuins·gardener·economy)이고, 여기는 서버 자료(건물·신전·유저 나라·도시 자리)를 고리로 바꾼다:
// - 정부 건물 상태(480 다·487 다): 폐허 서비스가 건물 시설 줄로 알려 준다. 런타임을 켤 때 거울 세계 규칙에 붙인다.
// - 행정 레벨(489 다): 모든 도시의 행정 레벨 = 그 도시 안 행정 건물 레벨. 행정 건물이 있는 도시만 맞추고(없는 도시는 그대로 [임시]),
//   바뀐 도시는 도시 저장이 줄 비교로 쓴다.
// - 수호신(472 가): 신전 서비스가 그 도시에 싸울 수 있는 수호신이 있는지 알려 주면 수비 휴먼이 없어도 웨이브 전투를 연다.
// - 폐허가 된 도시 창고 물건(535·540 나·541 가, D-518): 규칙은 시뮬과 같은 함수(@terra/sim ruinedGoodsHome — NPC 세력·유저 같은 규칙,
//   D-397). 주인(NPC 세력은 그 세력, 유저는 그 사이보그 나라)의 다른 도시 가운데 같은 2차맵에서 가장 가까운 도시(칸 거리 제곱, 같으면 작은
//   ID), 같은 2차맵에 없으면 가장 오래된(작은 ID) 도시의 그 주인 도시 창고로. 다른 도시가 없으면 NPC 세력 물건은 소각, 유저 물건은 자리 없음
//   (원장 보유 — 주인이 물건 목록에서 그대로 본다). 여기는 거리(2차맵 칸)만 준다.
import {
  type CityDistance,
  type GovernmentLookup,
  type RuinedGoodsHome,
  type SimWorld,
  ruinedGoodsHome,
} from "@terra/sim";
import type { ClaimSpawner } from "./npcClaims.ts";
import type { CityPlace } from "./persist.ts";

/** 행정 레벨 범위(49 N45, world_cities 검사 조건 1~5) */
const ADMIN_MIN = 1;
const ADMIN_MAX = 5;

export interface NpcRuinsInput {
  /** 정부 건물 상태(폐허 서비스 governmentStatus) */
  readonly government?: GovernmentLookup | undefined;
  /** 도시마다 행정 건물 레벨(폐허 서비스 governmentLevels) */
  readonly governmentLevels?: (() => ReadonlyMap<number, number>) | undefined;
  /** 다 지은 빈 2차맵 행정 건물마다 새 도시를 세운다(폐허 서비스 foundClaims, 기획 D-572 알박기 — ruins/landClaim.ts). 세운 수 */
  readonly foundClaims?: ((nowMs: number) => number) | undefined;
  /** 그 도시에 싸울 수 있는 수호신이 있나(신전 서비스) */
  readonly hasGuardians?: ((cityId: number) => boolean) | undefined;
  /** 유저 소유 주체가 드는 나라(세력 소유 주체 ID, 사이보그 나라). 세력 주체·모르면 undefined */
  readonly nationOf?: ((ownerId: number) => number | undefined) | undefined;
  /** 빈 2차맵을 그때 띄우기(서버 NPC 알박기 — npcClaims.ts, 월드 저장 묶음 spawn). 없으면 띄운 2차맵만 알박기 후보 */
  readonly spawner?: (() => ClaimSpawner | undefined) | undefined;
}

/** 행정 건물이 있는 도시의 행정 레벨을 그 건물 레벨로 맞춘다(489 다). 바꾼 도시 수 */
export function syncAdminLevels(world: SimWorld, levels: ReadonlyMap<number, number> | undefined): number {
  if (!levels || levels.size === 0) return 0;
  let changed = 0;
  for (const [cityId, level] of levels) {
    const city = world.cities.get(cityId);
    if (!city) continue;
    const next = Math.min(ADMIN_MAX, Math.max(ADMIN_MIN, Math.floor(level)));
    if (city.adminLevel === next) continue;
    city.adminLevel = next;
    changed += 1;
  }
  return changed;
}

/**
 * 틱마다 정부 건물 맞추기: 먼저 다 지은 빈 2차맵 알박기 행정 건물로 새 도시를 세우고(그 건물이 새 도시 시설이 된다), 행정 레벨을 맞춘다.
 * 세운 도시 수 + 바꾼 도시 수(0이 아니면 런타임이 저장한다)
 */
export function liftGovernments(world: SimWorld, input: NpcRuinsInput | undefined, nowMs: number): number {
  const founded = input?.foundClaims?.(nowMs) ?? 0;
  return founded + syncAdminLevels(world, input?.governmentLevels?.());
}

/** 같은 2차맵 두 도시의 칸 거리 제곱(다른 2차맵이거나 자리를 모르면 undefined) */
export function placeDistance(places: ReadonlyMap<number, CityPlace>): CityDistance {
  return (from, to) => {
    const a = places.get(from);
    const b = places.get(to);
    if (!a || !b || a.planetId !== b.planetId || a.mapKey !== b.mapKey) return undefined;
    const dx = a.cellX - b.cellX;
    const dy = a.cellY - b.cellY;
    return dx * dx + dy * dy;
  };
}

/** 폐허가 된 도시 창고 물건의 갈 곳(535·540 나): 시뮬 규칙(ruinedGoodsHome)에 2차맵 칸 거리와 유저 나라를 준다 */
export function ruinedGoodsHomeOf(
  world: SimWorld,
  places: ReadonlyMap<number, CityPlace>,
  nationOf: ((ownerId: number) => number | undefined) | undefined,
): RuinedGoodsHome {
  return ruinedGoodsHome(world, placeDistance(places), nationOf);
}
