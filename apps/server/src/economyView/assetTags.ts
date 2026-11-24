// 자산 표시 정보(서버가 붙인다) — docs/adr/2026-11-23-nation-money.md, 사용자 요청 2026-11-23 "기준통화란 소속한 국가의 화폐", "다른나라 화폐는
// 외환보유고에 따로 표시… 화폐표시 뒤에 해당 세력 국기", "주식같은경우 해당 사업장이름(중복금지), 도시… 금화표시도 안되고 화폐와 구분".
// - 화폐(cur:<코드>·나라 없는 세계의 돈): 그 주체의 돈(world/money.ts moneyOf)이면 home(기준 통화), 아니면 foreign(외환). 나라 = 그 화폐를 찍는
//   나라(경제 issuer) — 국기는 팩 국가 프리셋 마크 + 올린 그림.
// - 도시 지분(share_<도시 ID>): 도시 이름 + 그 도시 주인 나라.
// - 사업장 지분(share:biz_<건물 ID>): 시설 이름 + 건물 번호(화면이 "이름 #번호"로 보여 세계에서 하나다) + 도시 이름 + 그 도시 주인 나라.
// 읽기만 한다(원장·세계를 바꾸지 않는다).
import { parseBusinessShareAsset } from "@terra/shared/businessBooks";
import type { AssetNation, AssetTag } from "@terra/shared/economy";
import { isMoneyAsset, moneyOf } from "../world/money.ts";
import type { World } from "../world/world.ts";
import type { NationNameReads } from "../worldMap/reads.ts";

export interface AssetTagger {
  /** ownerId = 그 잔고의 주인(기준 통화를 가르는 기준). 화폐·지분이 아니면 undefined */
  tag(asset: string, ownerId: number | undefined): AssetTag | undefined;
  /** 그 주체의 기준 통화(소속 국가 화폐) 자산 코드. 세계가 준비되지 않았으면 undefined */
  homeAsset(ownerId: number | undefined): string | undefined;
}

const CITY_SHARE = /^share_(\d+)$/;

export function createAssetTagger(
  world: Pick<World, "npc" | "persistence">,
  nationNames?: NationNameReads["nationNames"],
  uploaded?: ReadonlyMap<string, string>,
): AssetTagger {
  const runtime = world.npc;
  const ledger = world.persistence?.ledger;
  const nationOfFaction = (factionId: number | undefined): AssetNation | null => {
    const code = factionId === undefined ? undefined : runtime?.world.factions.get(factionId)?.code;
    if (!code || !nationNames) return null;
    const found = nationNames(code);
    const emblem = found.emblem
      ? {
          spec: found.emblem.spec,
          color: found.emblem.color,
          uploaded: uploaded?.get(found.emblem.preset) ?? null,
        }
      : null;
    return found.name === undefined && emblem === null ? null : { name: found.name ?? null, emblem };
  };
  const cityPart = (cityId: number | null | undefined) => {
    if (cityId === null || cityId === undefined) return { city: null, nation: null };
    return {
      cityId,
      city: runtime?.places.get(cityId)?.name ?? null,
      nation: nationOfFaction(runtime?.world.cities.get(cityId)?.owner),
    };
  };
  const homeAsset = (ownerId: number | undefined): string | undefined =>
    ledger ? moneyOf(ledger, ownerId) : undefined;
  return {
    homeAsset,
    tag(asset, ownerId) {
      if (isMoneyAsset(asset)) {
        const nation = nationOfFaction(runtime?.economy?.economy.issuer.get(asset));
        return { kind: asset === homeAsset(ownerId) ? "home" : "foreign", nation };
      }
      const cityShare = CITY_SHARE.exec(asset);
      if (cityShare) return { kind: "city_share", ...cityPart(Number(cityShare[1])) };
      const buildingId = parseBusinessShareAsset(asset);
      if (buildingId === undefined) return undefined;
      const facilities = world.persistence?.facilities;
      const record = facilities?.service.facilities.get(buildingId);
      const def = record ? facilities?.catalog().facility(record.facilityId) : undefined;
      return {
        kind: "business_share",
        ...cityPart(record?.cityId),
        business: def?.name ?? null,
        buildingId,
      };
    },
  };
}
