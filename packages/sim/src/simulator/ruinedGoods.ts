// 폐허가 된 도시 창고 물건의 갈 곳 — 기획 D-518 535·540 나·541 가(docs/adr/2026-11-07-ruins-restoration.md "바뀜 (기획 답 540)").
// 규칙 한 벌(D-397: NPC와 유저가 같은 규칙, D-013): 주인마다 그 주인의 다른 도시 가운데 가장 가까운 도시 창고로 옮긴다. 소유는 점령으로만
// 바뀐다(D-161) — 건물이 사라질 때 창고 물건을 옮기는 416과 같은 결.
// - 주인의 도시: NPC 세력 주인 = 그 세력의 도시, 유저 주인 = 그 유저 사이보그 나라의 도시(541 가, 서버가 nationOf로 알려 준다).
// - 가장 가까운: 거리를 잴 수 있는 도시(같은 지도) 가운데 거리가 가장 작은 도시(같으면 작은 ID). 잴 수 있는 도시가 없으면 가장 오래된
//   (작은 ID) 도시. 거리는 부르는 쪽이 준다(시뮬 = 정원사 합성 격자, 서버 = 같은 2차맵의 칸 거리).
// - 갈 도시가 없으면: NPC 세력 물건은 소각(그 세력에 다른 도시가 없을 때만 — 540 나), 유저 물건은 자리 없음(원장 보유 — 주인이 물건 목록에서
//   그대로 본다, 541).
import type { SimWorld } from "./world.ts";

/**
 * 폐허가 된 도시 창고 물건의 갈 곳: 주인 → 그 주인의 도시 창고(도시 ID), null(자리 없음 — 원장 보유, 주인이 그대로 본다),
 * "burn"(소각 — 다른 도시가 없는 NPC 세력 물건). 폐허가 될 도시는 아직 세계에 있으니 고르지 않는다(골라도 자리 없음으로 친다)
 */
export type RuinedGoodsHome = (ownerId: number, ruinedCityId: number) => number | null | "burn";

/** 두 도시 사이 거리(같은 지도에서 잴 수 있으면 0 이상, 모르면 undefined). 크기만 견주므로 제곱 거리여도 된다 */
export type CityDistance = (from: number, to: number) => number | undefined;

/** 그 세력의 다른 도시 가운데 가장 가까운 도시(거리를 잴 수 없으면 가장 오래된 도시). 없으면 undefined */
export function nearestOtherCity(
  world: SimWorld,
  factionId: number,
  fromCity: number,
  distanceOf?: CityDistance,
): number | undefined {
  const faction = world.factions.get(factionId);
  if (!faction?.alive) return undefined;
  let best: { id: number; distance: number } | undefined;
  let oldest: number | undefined;
  for (const cityId of faction.cities) {
    if (cityId === fromCity || !world.cities.has(cityId)) continue;
    if (oldest === undefined || cityId < oldest) oldest = cityId;
    const distance = distanceOf?.(fromCity, cityId);
    if (distance === undefined) continue;
    if (!best || distance < best.distance || (distance === best.distance && cityId < best.id))
      best = { id: cityId, distance };
  }
  return best?.id ?? oldest;
}

/**
 * 갈 곳 규칙(540 나): 세력(NPC) 주인은 그 세력의 가장 가까운 다른 도시(없으면 소각), 세력이 아닌 주인(서버의 유저)은 nationOf가 알려 준
 * 나라의 가장 가까운 다른 도시(나라를 모르거나 다른 도시가 없으면 자리 없음). 시뮬은 nationOf 없이 부른다(시뮬 주인은 모두 세력)
 */
export function ruinedGoodsHome(
  world: SimWorld,
  distanceOf?: CityDistance,
  nationOf?: (ownerId: number) => number | undefined,
): RuinedGoodsHome {
  return (ownerId, ruinedCityId) => {
    if (world.factions.has(ownerId))
      return nearestOtherCity(world, ownerId, ruinedCityId, distanceOf) ?? "burn";
    const nation = nationOf?.(ownerId);
    if (nation === undefined) return null;
    return nearestOtherCity(world, nation, ruinedCityId, distanceOf) ?? null;
  };
}

/**
 * 그 도시 창고의 물건을 주인마다 갈 곳으로. 소각 몫은 거래 하나(burn → sink), 옮기는 몫은 거래 하나(storage_rehome — 서버 건물 창고
 * 옮기기와 같은 종류). 옮기거나 태운 계정 수
 */
export function rehomeRuinedGoods(
  world: SimWorld,
  cityId: number,
  nowMs: number,
  homeOf: RuinedGoodsHome,
): number {
  const found = [...world.book.accounts()]
    .filter((account) => account.ownerId !== null && account.location === cityId && account.balance > 0n)
    .toSorted((a, b) => a.id - b.id);
  const homes = new Map<number, number | null | "burn">();
  const burned = [];
  const moved = [];
  for (const account of found) {
    const owner = account.ownerId ?? 0;
    if (!homes.has(owner)) {
      const home = homeOf(owner, cityId);
      homes.set(owner, home === cityId ? null : home);
    }
    const home = homes.get(owner) ?? null;
    if (home === "burn") {
      burned.push({ account: account.id, amount: -account.balance });
      burned.push({
        account: world.book.systemAccount(`sink:${account.asset}`, account.asset),
        amount: account.balance,
      });
      continue;
    }
    moved.push({ account: account.id, amount: -account.balance });
    moved.push({ account: world.book.ownerAccount(owner, account.asset, home), amount: account.balance });
  }
  if (burned.length > 0) world.book.post({ kind: "burn", atMs: nowMs, entries: burned });
  if (moved.length > 0) world.book.post({ kind: "storage_rehome", atMs: nowMs, entries: moved });
  return found.length;
}
