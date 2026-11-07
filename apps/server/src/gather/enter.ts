// 건물 들어가기 — docs/adr/2026-11-07-gather-objects.md 5절, 사용자 지적(2026-11-07) "숲이나 건물로 진입 등의 상호작용 불가".
// 유닛이 건물 둘레 설 칸에 닿으면 차례로 해 본다:
// 1. 화물 넣기: 내 창고 시설(다 지었고 일하는) → 그 건물 창고(용량까지), 내 벌목장·광산(다 지었고 일하는) → 그 시설이 맡는 오브젝트 물건만 그 시설 산출
//    자리(도시 창고, 도시가 없으면 그 건물 창고), 행정 건물(시청, 주인 상관없음) → 그 도시의 내 도시 창고.
// 2. 직무 받기: 내 채집 시설(다 지었고)이고 유닛이 쉬고 있으면 기존 직무 배치(labor assign — 자리·같은 2차맵 검사는 그쪽이 한다).
// 3. 안에 머물기: 위 둘이 아니면(남의 건물 포함) 건물 판에 "안에 있는 유닛"으로 보인다(움직이면 나간다).
import type { GatherEnterResult } from "@terra/shared/gather";
import { buildingLocation, cargoLocation, cityLocation } from "@terra/shared/goodsPlaces";
import { buildingPlace } from "../facilities/places.ts";
import type { StorageContext } from "../facilities/storage.ts";
import { campDeposit, type Deposit, depositCargo } from "./deposit.ts";
import type { GatherKind } from "./kinds.ts";

/** 그 건물에 들어가면 할 수 있는 것 */
export interface EntryOptions {
  /** 화물을 넣는 곳(없으면 넣지 않는다)과 받는 자산(null = 물자 모두) */
  readonly deposit: Deposit | null;
  readonly accepts: ReadonlySet<string> | null;
  /** 내 채집 시설이라 직무를 받을 수 있나(자리는 직무 배치가 본다) */
  readonly workplace: boolean;
  readonly mine: boolean;
}

export function entryOptions(
  ctx: StorageContext,
  kinds: readonly GatherKind[],
  ownerId: number,
  buildingId: number,
  works: (id: number) => boolean,
): EntryOptions | undefined {
  const { world } = ctx;
  const place = buildingPlace(world, buildingId);
  if (!place) return undefined;
  const record = world.facilities.get(buildingId);
  const def = record ? world.catalog().facility(record.facilityId) : undefined;
  const mine = place.ownerId === ownerId;
  const ready = record !== undefined && record.level >= 1 && works(buildingId);
  let cell: { x: number; y: number } | undefined;
  world.maps.get(place.mapKey)?.forEachBuilding((building) => {
    if (building.id === buildingId) cell = { x: building.x, y: building.y };
  });
  const x = cell?.x ?? 0;
  const y = cell?.y ?? 0;
  if (mine && ready && def?.stage === "storage")
    return {
      deposit: { kind: "storage", id: buildingId, location: buildingLocation(buildingId), x, y },
      accepts: null,
      workplace: false,
      mine,
    };
  if (mine && ready && record && def?.gather) {
    const served = new Set(
      kinds.filter((kind) => kind.facility === def.id).map((kind) => `item:${kind.item}`),
    );
    return {
      deposit: campDeposit(world, { buildingId, level: record.level, x, y }),
      accepts: served,
      workplace: true,
      mine,
    };
  }
  if (def?.stage === "government" && place.cityId !== null)
    return {
      deposit: { kind: "city", id: place.cityId, location: cityLocation(place.cityId), x, y },
      accepts: null,
      workplace: false,
      mine,
    };
  return { deposit: null, accepts: null, workplace: false, mine };
}

/** 유닛 화물의 물자 자산(그 주인 몫, 잔고 > 0) */
export function cargoGoods(ctx: StorageContext, ownerId: number, unitId: number): string[] {
  const here = cargoLocation(unitId);
  const out: string[] = [];
  for (const account of ctx.ledger.accounts())
    if (
      account.location === here &&
      account.ownerId === ownerId &&
      account.balance > 0n &&
      account.asset.startsWith("item:") &&
      ctx.catalog.isGoods(account.asset.slice(5))
    )
      out.push(account.asset);
  return out.toSorted();
}

export async function enterBuilding(input: {
  readonly ctx: StorageContext;
  readonly kinds: readonly GatherKind[];
  readonly ownerId: number;
  readonly userId: string;
  readonly unitId: number;
  readonly buildingId: number;
  /** 유닛이 직무 없이 쉬고 있나(묶이지 않음) */
  readonly idle: boolean;
  readonly works: (id: number) => boolean;
  readonly assign?:
    | ((userId: string, buildingId: number, unitId: number) => Promise<{ readonly ok: boolean }>)
    | undefined;
  readonly atMs: number;
}): Promise<{ result: GatherEnterResult; moved: number }> {
  const options = entryOptions(input.ctx, input.kinds, input.ownerId, input.buildingId, input.works);
  if (!options) return { result: "inside", moved: 0 };
  if (options.deposit) {
    const accepts = options.accepts;
    const assets = cargoGoods(input.ctx, input.ownerId, input.unitId).filter(
      (asset) => accepts === null || accepts.has(asset),
    );
    const moved = depositCargo(input.ctx, input.ownerId, input.unitId, assets, options.deposit, input.atMs);
    if (moved > 0n) return { result: "deposited", moved: Number(moved) };
  }
  if (options.workplace && input.idle && input.assign) {
    const assigned = await input.assign(input.userId, input.buildingId, input.unitId);
    if (assigned.ok) return { result: "assigned", moved: 0 };
  }
  return { result: "inside", moved: 0 };
}
