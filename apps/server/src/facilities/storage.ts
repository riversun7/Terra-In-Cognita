// 창고 시설에 물건 두기·꺼내기, 사라진 건물의 물건 돌려놓기 — docs/adr/2026-11-07-buildings-runtime.md "바뀜 (창고·직무)",
// 기획 49 N50(창고 용량)·D-117(물건마다 자리)·D-121(다중 창고)·D-516(382). 명령은 건물 서비스(service.ts)가 받아 여기를 부른다.
// - 넣기(in): 내 창고 시설(창고 단계, 다 지었고 30% 이상)에. 그 건물이 선 도시의 내 도시 창고 → 그 2차맵 내 유닛 화물 차례로 꺼낸다(다른
//   창고 시설에서는 꺼내지 않는다 — 꺼낸 뒤 넣는다). 물자(item:<ID>)만, 무게 합 ≤ 용량(N50 storageCapacityAt).
// - 꺼내기(out): 그 건물 창고의 내 몫(창고 시설, 임대형 임차인 산출 — 남의 건물이어도 된다)을 그 도시의 내 도시 창고로. 도시가 없으면
//   no_place. 상태·짓는 중과 상관없이 꺼낸다 [임시].
// - [임시] 같은 도시 안은 바로 옮긴다(운송·직접 운반 D-117은 운송 줄기, 질문 412).
// - 거래 하나(원장 kind storage_move, 주체 계정끼리라 시스템 계정을 건드리지 않는다).
import type { FacilityResultCode } from "@terra/protocol";
import { buildingLocation, cityLocation } from "@terra/shared/goodsPlaces";
import { type FacilityRuntimeRules, conditionWorks, storageCapacityAt } from "@terra/shared/facilityRuntime";
import type { Ledger } from "../economy/ledger.ts";
import { TEST_ASSET_CREDIT as ASSET_CREDIT } from "@terra/sim";
import type { FacilityCatalog } from "./catalog.ts";
import {
  type PlaceWorld,
  assetWeightG,
  buildingOfLocation,
  buildingPlace,
  materialScope,
  storedGrams,
} from "./places.ts";

export interface StorageMoveInput {
  readonly buildingId: number;
  readonly asset: string;
  readonly qty: number;
  readonly direction: "in" | "out";
}

export interface StorageContext {
  readonly world: PlaceWorld;
  readonly ledger: Ledger;
  readonly catalog: FacilityCatalog;
  readonly rules: FacilityRuntimeRules;
}

/** 창고 시설의 지금 용량(g). 창고 시설이 아니면 undefined */
export function capacityGrams(ctx: StorageContext, buildingId: number): bigint | undefined {
  const record = ctx.world.facilities.get(buildingId);
  const def = record ? ctx.catalog.facility(record.facilityId) : undefined;
  if (!record || def?.stage !== "storage" || def.storageKg === undefined) return undefined;
  return BigInt(storageCapacityAt(def.storageKg, Math.max(1, record.level), ctx.rules)) * 1000n;
}

/**
 * 그 건물 창고의 남은 자리(g) = 상한(팩 시설 storageKg × 레벨, N50) − 든 무게(모든 주인). storageKg가 없는 시설·시설 줄이 없는 건물은
 * undefined(상한 없음). 채집 시설의 임대형 임차인 몫 상한(docs/adr/2026-11-07-play-flow.md "WP8", 기획 정리 D-518 523 ② — 414 옛 상한
 * 벌목장·광산 200kg·농장 300kg)이 쓴다. 넣기 명령은 여전히 창고 시설만 받는다
 */
export function roomGrams(ctx: StorageContext, buildingId: number): bigint | undefined {
  const record = ctx.world.facilities.get(buildingId);
  const def = record ? ctx.catalog.facility(record.facilityId) : undefined;
  if (!record || def?.storageKg === undefined) return undefined;
  const capacity = BigInt(storageCapacityAt(def.storageKg, Math.max(1, record.level), ctx.rules)) * 1000n;
  const used = storedGrams(ctx.ledger, ctx.catalog, buildingId);
  return capacity > used ? capacity - used : 0n;
}

/** 옮긴다(같은 동기 처리 안에서 확인 → 거래). 결과 코드 또는 null(성공) */
export function moveStorage(
  ctx: StorageContext,
  ownerId: number,
  input: StorageMoveInput,
  atMs: number,
): FacilityResultCode | null {
  const place = buildingPlace(ctx.world, input.buildingId);
  if (!place) return "unknown_building";
  const here = buildingLocation(input.buildingId);
  const qty = BigInt(input.qty);
  if (input.direction === "out") {
    if (place.cityId === null) return "no_place";
    const from = ctx.ledger.balanceOf(ownerId, input.asset, here);
    if (from < qty) return "insufficient_materials";
    ctx.ledger.post({
      kind: "storage_move",
      atMs,
      entries: [
        { account: ctx.ledger.ownerAccount(ownerId, input.asset, here), amount: -qty },
        { account: ctx.ledger.ownerAccount(ownerId, input.asset, cityLocation(place.cityId)), amount: qty },
      ],
    });
    return null;
  }
  // 넣기: 내 창고 시설만, 물자만
  const record = ctx.world.facilities.get(input.buildingId);
  const capacity = capacityGrams(ctx, input.buildingId);
  if (place.ownerId !== ownerId) return "forbidden";
  if (!record || capacity === undefined) return "not_storage";
  if (!input.asset.startsWith("item:") || !ctx.catalog.isGoods(input.asset.slice(5))) return "not_storage";
  if (record.level < 1) return "under_construction";
  if (!conditionWorks(record.conditionPpm, ctx.rules)) return "facility_disabled";
  const added = qty * assetWeightG(ctx.catalog, input.asset);
  if (storedGrams(ctx.ledger, ctx.catalog, input.buildingId) + added > capacity) return "storage_full";
  // 꺼내는 자리: 도시 창고 → 화물(창고 시설은 빼고)
  const sources = materialScope(ctx.world, ownerId, place.mapKey, place.cityId).filter(
    (location) => buildingOfLocation(location) === undefined,
  );
  const entries: { account: number; amount: bigint }[] = [];
  let left = qty;
  for (const location of sources) {
    if (left === 0n) break;
    const balance = ctx.ledger.balanceOf(ownerId, input.asset, location);
    if (balance <= 0n) continue;
    const take = balance < left ? balance : left;
    entries.push({ account: ctx.ledger.ownerAccount(ownerId, input.asset, location), amount: -take });
    left -= take;
  }
  if (left > 0n) return "insufficient_materials";
  entries.push({ account: ctx.ledger.ownerAccount(ownerId, input.asset, here), amount: qty });
  ctx.ledger.post({ kind: "storage_move", atMs, entries });
  return null;
}

/** 화폐 자산인가(서버 시험 화폐·나라 화폐 cur:<코드>) */
const isMoneyAsset = (asset: string): boolean => asset === ASSET_CREDIT || asset.startsWith("cur:");

/**
 * 사라진 건물(관리자가 지움 등)의 건물 창고 물건을 주인마다 그 도시 창고로(도시를 모르면 위치 없음) 돌려놓는다. 거래 하나. 옮긴 계정 수.
 * 건물 위치의 화폐(사업장 금고 — 정박료 등, 기획 D-548·docs/adr/2026-11-15-business-ledger.md 결정 5)는 도시 창고가 아니라 주인 지갑(위치 없음)으로 간다
 */
export function rehomeBuildingGoods(
  ledger: Ledger,
  buildingId: number,
  cityId: number | null,
  atMs: number,
): number {
  const here = buildingLocation(buildingId);
  const entries: { account: number; amount: bigint }[] = [];
  const found = [...ledger.accounts()].filter(
    (account) => account.location === here && account.ownerId !== null && account.balance > 0n,
  );
  for (const account of found) {
    const ownerId = account.ownerId ?? 0;
    entries.push({ account: account.id, amount: -account.balance });
    entries.push({
      account: ledger.ownerAccount(
        ownerId,
        account.asset,
        cityId === null || isMoneyAsset(account.asset) ? null : cityLocation(cityId),
      ),
      amount: account.balance,
    });
  }
  if (entries.length > 0) ledger.post({ kind: "storage_rehome", atMs, entries });
  return found.length;
}
