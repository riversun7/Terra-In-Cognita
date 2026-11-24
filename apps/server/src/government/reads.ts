// 정부(행정 건물) 판 조회(tRPC world.government) — docs/adr/2026-11-07-play-flow.md "WP-NPC"(사용자 지적 2026-11-08 "정부 건물의 기본 기능도
// 없음"). 응답 타입은 @terra/shared/government. 읽기만 한다(구인 고용은 WebSocket recruit_hire, 화면이 recruit.board를 따로 받는다).
// - 건물 → 시설 줄(행정 건물 government_hall·도시 ID) → NPC 사회 런타임 거울 도시(주인·행정 레벨·주거·휴먼 수) → 주인 나라(코드·고정·
//   지금 거래세) → 지도자(국가 지도자 사이보그 유닛, npc/leaders.ts)·이름(팩 국가 프리셋).
// - 안개(서버 권위): 내가 모르는 도시(1차맵 도시 안개 knownCities.ts와 같은 아는 도시)의 건물이면 unknown_building(없는 건물과 같은 답 —
//   모르는 도시의 세율·인구가 새지 않게). 2차맵에서 보이는 행정 건물은 보통 아는 도시다(시청 칸이 시야 칸 안).
// - 시장(46 §2, 기획 답 744 나): NPC 사회 런타임이 그 도시 휴먼 가운데 자동으로 고른 휴먼(npc/cityPeople.ts)의 레벨·1차 스탯·만족도.
//   저장된 스탯이 없는 휴먼은 [임시] 기본값(모두 10, 유닛 화면 기본 스탯과 같다). docs/adr/2026-11-07-play-flow.md "WP-NPC2".
// 바뀜(기획 정리 742 나·743 나, docs/adr/2026-11-07-play-flow.md "WP-NPC3"): 도시 하루 값(만족도·발전도·생필품 충족, cityDay.ts — 읽기만)과
// 지도자 창구(governmentOfLeader — 2차맵에서 누른 NPC 국가 지도자가 지금 내 시야 안이면 그 나라 수도 행정 건물의 정부 판).
// 바뀜("WP-NPC4"): 생필품 충족 = 지난 하루 끝에 저장한 값(781 나 — npc/cityDayStore.ts), 시장 이름(773 나 — npc/humanNames.ts).
// 바뀜(질문 2012·2018 답, docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-16, 2011·2012·2014·2017·2018 답)"): 지도자 = 지배 가문의 장 —
// NPC 나라는 지도자 사이보그에 지배 가문(수도 NPC 가문) 이름, 플레이어 가문 나라는 그 가문장. 가문 이동 정책 칸(houseEntry).
// 바뀜(D-574 10 — 2144·2147 가): 지배 가문 = 수도에서 처음 세운 가문(수도를 옮기면 새 수도의 첫 가문 — npc/cityHouses.ts가 읽을 때 정한다, 그대로).
// 나라를 누가 이끄는지는 체제대로(D-217): 나라 칸 regime, 지도자 칸 rule(독재 = 독재자·민주주의 = 투표·자본주의 = 지분).
// [임시] 투표·지분 의결이 아직 없어 어느 체제든 지도자 = 지배 가문의 장이 나라를 대표한다(질문 2254 — 선출·해임은 별도 줄기 governance, 질문 2315).
// 바뀜(tax-2, 질문 2322 나·2373 가): 나라 세금 칸(taxes — 소득세·주민세 세율·주기·국세 몫, 정한 곳, 지도자면 정하기 — nationTaxPolicy.ts).
import {
  type GovernmentHouseEntry,
  type GovernmentMayor,
  type GovernmentResponse,
  type GovernmentTaxes,
  leaderRuleOf,
} from "@terra/shared/government";
import type { NationEmblemView } from "@terra/shared/nationEditor";
import type { LocalizedName } from "@terra/shared/roster";
import type { SimCity, SimFaction, SimUnit } from "@terra/sim";
import type { Viewer } from "../trpc/context.ts";
import { BASELINE_HUMAN_STAT } from "../npc/cityPeople.ts";
import { currencyCode } from "../market/fxViews.ts";
import { FOREIGN_CITY_MONEY_MIN } from "../npc/cityMoney.ts";
import { DEFAULT_TAX_BP } from "../npc/currency.ts";
import { type LeaderUnits, leaderUnitOf } from "../npc/leaders.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { UNIT_KIND_NPC_LEADER } from "../world/unitKinds.ts";
import type { World } from "../world/world.ts";
import { cityDayOf } from "./cityDay.ts";

/** 행정 건물 시설 ID(팩 content/core/facilities.json, npcSeed.ts seedPlan과 같다) */
export const GOVERNMENT_FACILITY = "government_hall";

/** 이 조회가 세계에서 읽는 것(시험은 가짜를 넣는다) */
export interface GovernmentSource {
  /** 띄운 2차맵(건물이 서 있나·지도자 유닛) */
  readonly maps: ReadonlyMap<
    number,
    LeaderUnits & Pick<SecondMap, "buildingOwner" | "forEachBuilding"> & Partial<Pick<SecondMap, "unitInfo">>
  >;
  /** 건물 ID → 시설 줄(없으면 undefined) */
  facility(buildingId: number): { readonly facilityId: string; readonly cityId: number | null } | undefined;
  /** NPC 사회 런타임 거울 세계·도시 자리·도시 경제 세율(런타임이 없으면 undefined) */
  runtime():
    | {
        readonly world: {
          readonly cities: ReadonlyMap<
            number,
            Pick<SimCity, "id" | "owner" | "start" | "adminLevel" | "housing" | "development">
          >;
          readonly factions: ReadonlyMap<
            number,
            Pick<SimFaction, "code" | "fixed"> & Partial<Pick<SimFaction, "player" | "regime" | "traits">>
          >;
          readonly units: ReadonlyMap<number, Pick<SimUnit, "city" | "recruit" | "satisfactionMilli">>;
        };
        readonly places: ReadonlyMap<number, { readonly mapKey: number; readonly name?: string | undefined }>;
        readonly taxOf?: ((factionId: number) => number | undefined) | undefined;
        /**
         * 도시 화폐(npc/cityMoney.ts — docs/adr/2026-11-24-city-money.md): 지금 화폐·주인 나라 화폐(원장 자산)와 찍는 나라가 있는 화폐마다 찍는 세력·
         * 주인 나라 국고 잔고. 도시 경제가 없으면 undefined
         */
        readonly cityMoney?:
          | ((cityId: number) =>
              | {
                  readonly currency: string;
                  readonly own: string;
                  readonly options: readonly {
                    readonly currency: string;
                    readonly issuer: number;
                    readonly reserve: bigint;
                  }[];
                }
              | undefined)
          | undefined;
        /** 그 도시 지난 하루 끝 생필품 충족 ‰(781 나, npc/cityDayStore.ts). 경제가 없거나 아직 하루 끝 전이면 undefined */
        readonly necessitiesPm?: ((cityId: number) => number | undefined) | undefined;
        /** 그 도시 시장 유닛(npc/cityPeople.ts). 없으면 undefined */
        readonly mayorOf?: ((cityId: number) => number | undefined) | undefined;
        /** NPC 휴먼 이름(773 나, npc/humanNames.ts). 없으면 undefined */
        readonly humanName?: ((unitId: number) => string | undefined) | undefined;
        /** 그 세력의 수도 도시(D-528, npc/capitals.ts — NPC가 발전도로 고름). 없으면 가장 작은 ID 시작 도시로 읽는다 */
        readonly capitalOf?: ((owner: number) => number | undefined) | undefined;
        /** NPC 나라의 지배 가문(수도에서 먼저 세운 NPC 가문 — 질문 2012 답, npc/cityHouses.ts). 없으면 undefined */
        readonly rulingHouseOf?: ((owner: number) => { readonly name: string } | undefined) | undefined;
        /** NPC 나라의 지배 가문이 선출로 플레이어 가문이 됐으면 그 가문 세력 행(governance-2, 질문 2406 가 — 지도자 = 그 가문장). 없으면 undefined */
        readonly rulingPlayerHouseOf?: ((owner: number) => number | undefined) | undefined;
      }
    | undefined;
  /** 소유 주체 ID → 세력 행 ID(유저 주체·없으면 undefined) */
  factionRowOf(ownerId: number): number | undefined;
  /** 사용자가 든 나라(세력 행 ID). 사이보그가 없으면 undefined */
  myFactionRow(userId: string): number | undefined;
  /** 그 사람이 아는 도시(1차맵 도시 안개) */
  knownCityIds(viewer: Viewer): Promise<ReadonlySet<number>>;
  /** 세력 코드 → 나라 이름·지도자 이름(팩 국가 프리셋) */
  nationName(code: string): LocalizedName | undefined;
  /** 세력 코드 → 국가 마크(만든 마크 + 올린 그림 해시). 없으면 마크 없이 보인다 */
  nationEmblem?: ((code: string) => Promise<NationEmblemView | null>) | undefined;
  leaderName(code: string): LocalizedName | undefined;
  /**
   * 그 사람이 지금 그 유닛을 보는가(지도의 한눈 정보와 같은 규칙: 내 유닛·전체 보기 권한·시야 전송 MapVision.sees). 없으면 늘 못 본다
   * (지도자 창구가 답하지 않는다)
   */
  seesUnit?: ((viewer: Viewer, mapKey: number, unitId: number) => boolean) | undefined;
  /**
   * 플레이어 가문 나라(도시를 가진 가문)의 지도자 = 그 가문장(질문 2012 답 — 국가 지도자 = 지배 가문의 장): 가문 세력 행 → 가문장 사이보그
   * 본체 유닛·이름·가문 이름. 없으면 undefined(정부 판 지도자 없음)
   */
  houseLeader?:
    | ((
        factionRow: number,
      ) => Promise<
        | { readonly unitId: number | null; readonly name: string | null; readonly house: string | null }
        | undefined
      >)
    | undefined;
  /** 가문 이동 정책 칸(질문 2018 답, factionIdentity/houseEntryPolicy.ts). 없으면 칸 없음 */
  houseEntry?: ((viewer: Viewer, cityId: number) => Promise<GovernmentHouseEntry | null>) | undefined;
  /** 나라 세금 칸(줄기 tax-2 — 질문 2322 나·2373 가, government/nationTaxPolicy.ts). 없으면 칸 없음 */
  nationTaxes?:
    | ((
        viewer: Viewer,
        nation: {
          readonly factionRow: number | undefined;
          readonly npc: boolean;
          readonly commerce: number | undefined;
          readonly tradeTaxBp: number;
        },
      ) => Promise<GovernmentTaxes | null>)
    | undefined;
}

export interface GovernmentReads {
  government(viewer: Viewer, buildingId: number, nowMs: number): Promise<GovernmentResponse>;
  /**
   * 지도자 창구(742 나): 2차맵 mapKey의 유닛 unitId가 지금 내 시야 안의 NPC 국가 지도자면 그 나라 수도(가장 작은 ID 시작 도시) 행정 건물의
   * 정부 판(government와 같은 답). 시야 밖·없는 유닛·지도자가 아니면 unknown_unit, 수도 행정 건물이 서 있지 않으면 not_government
   */
  governmentOfLeader(
    viewer: Viewer,
    mapKey: number,
    unitId: number,
    nowMs: number,
  ): Promise<GovernmentResponse>;
}

const empty = (
  status: GovernmentResponse["status"],
  buildingId: number,
  nowMs: number,
): GovernmentResponse => ({
  status,
  buildingId,
  city: null,
  nation: null,
  leader: null,
  building: null,
  mayor: null,
  generatedAt: nowMs,
});

/** 시장 휴먼 → 화면 자료(스탯 차례 STR·DEX·AGI·VIT·INT·WIS, 저장된 스탯이 없으면 기본값 모두 BASELINE_HUMAN_STAT). 이름이 없으면 null */
export function mayorView(
  unitId: number,
  unit: Pick<SimUnit, "recruit" | "satisfactionMilli">,
  name?: string,
): GovernmentMayor {
  const stats = unit.recruit?.stats;
  const known = stats !== undefined && stats.length >= 6;
  const at = (index: number): number => (known ? (stats[index] ?? 0) : BASELINE_HUMAN_STAT);
  return {
    unitId,
    name: name ?? null,
    level: unit.recruit?.level ?? 1,
    stats: { str: at(0), dex: at(1), agi: at(2), vit: at(3), int: at(4), wis: at(5) },
    baseline: !known,
    satisfaction: Math.max(0, Math.min(100, Math.round(unit.satisfactionMilli / 1000))),
  };
}

/** 그 2차맵에서 건물 기준 칸(없으면 null) */
function buildingCell(
  map: Pick<SecondMap, "forEachBuilding"> | undefined,
  buildingId: number,
): { x: number; y: number } | null {
  let cell: { x: number; y: number } | null = null;
  map?.forEachBuilding((building) => {
    if (building.id === buildingId) cell = { x: building.x, y: building.y };
  });
  return cell;
}

/** 그 2차맵 유닛의 주인·종류(없으면 undefined) */
function unitOf(map: LeaderUnits | undefined, unitId: number): { ownerId: number; kind: number } | undefined {
  let found: { ownerId: number; kind: number } | undefined;
  map?.forEachUnit((unit) => {
    if (unit.id === unitId) found = { ownerId: unit.ownerId, kind: unit.kind };
  });
  return found;
}

/** 그 세력 수도(D-528): 런타임 수도 → 없으면 가장 작은 ID 시작 도시(옛 규칙, npc/leaders.ts capitalsOf와 같은 뒷길) */
function capitalOf(
  runtime: NonNullable<ReturnType<GovernmentSource["runtime"]>>,
  owner: number,
): number | undefined {
  const chosen = runtime.capitalOf?.(owner);
  if (chosen !== undefined) return chosen;
  let capital: number | undefined;
  for (const city of runtime.world.cities.values())
    if (city.start && city.owner === owner && (capital === undefined || city.id < capital)) capital = city.id;
  return capital;
}

export function createGovernmentReads(source: GovernmentSource): GovernmentReads {
  /** 건물이 띄운 2차맵에 서 있나 */
  const standing = (buildingId: number): boolean => {
    for (const map of source.maps.values()) if (map.buildingOwner(buildingId) !== undefined) return true;
    return false;
  };

  /** 그 도시 행정 건물(띄운 2차맵에 서 있는 것 가운데 가장 작은 ID). 없으면 undefined */
  const hallOf = (cityId: number, mapKey: number): number | undefined => {
    let hall: number | undefined;
    source.maps.get(mapKey)?.forEachBuilding((building) => {
      const record = source.facility(building.id);
      if (record?.facilityId !== GOVERNMENT_FACILITY || record.cityId !== cityId) return;
      if (hall === undefined || building.id < hall) hall = building.id;
    });
    return hall;
  };

  const reads: GovernmentReads = {
    async governmentOfLeader(viewer, mapKey, unitId, nowMs) {
      const runtime = source.runtime();
      if (!runtime) return empty("not_ready", 0, nowMs);
      const unit = unitOf(source.maps.get(mapKey), unitId);
      // 시야 밖·없는 유닛·지도자가 아님은 같은 답(시야 밖 유닛이 있는지 새지 않게)
      if (
        !unit ||
        unit.kind !== UNIT_KIND_NPC_LEADER ||
        !(source.seesUnit?.(viewer, mapKey, unitId) ?? false)
      )
        return empty("unknown_unit", 0, nowMs);
      // 수도 = NPC가 고른 수도(D-528). 런타임이 모르면 가장 작은 ID 시작 도시
      const capital = capitalOf(runtime, unit.ownerId);
      const place = capital === undefined ? undefined : runtime.places.get(capital);
      const hall = capital === undefined || !place ? undefined : hallOf(capital, place.mapKey);
      if (hall === undefined) return empty("not_government", 0, nowMs);
      return reads.government(viewer, hall, nowMs);
    },

    async government(viewer, buildingId, nowMs) {
      const runtime = source.runtime();
      if (!runtime) return empty("not_ready", buildingId, nowMs);
      const record = source.facility(buildingId);
      if (!record || !standing(buildingId)) return empty("unknown_building", buildingId, nowMs);
      if (record.facilityId !== GOVERNMENT_FACILITY || record.cityId === null)
        return empty("not_government", buildingId, nowMs);
      const city = runtime.world.cities.get(record.cityId);
      const place = runtime.places.get(record.cityId);
      if (!city || !place) return empty("not_government", buildingId, nowMs);
      // 모르는 도시의 건물은 없는 건물과 같은 답(안개)
      const known = await source.knownCityIds(viewer);
      if (!known.has(city.id)) return empty("unknown_building", buildingId, nowMs);
      const faction = runtime.world.factions.get(city.owner);
      const factionRow = source.factionRowOf(city.owner);
      let humans = 0;
      for (const unit of runtime.world.units.values()) if (unit.city === city.id) humans += 1;
      const capital = capitalOf(runtime, city.owner);
      // 선출로 NPC 나라를 이끄는 플레이어 가문(질문 2406 가): 지도자 = 그 가문장, NPC 국가 지도자 유닛은 남지만 지도자 칸에 보이지 않는다(퇴임)
      const electedRow = faction?.player === true ? undefined : runtime.rulingPlayerHouseOf?.(city.owner);
      const leaderUnit =
        faction?.fixed && electedRow === undefined
          ? leaderUnitOf(source.maps.values(), city.owner)
          : undefined;
      // 지도자가 이 도시 2차맵에 있나(아니면 화면이 "수도에 있음")
      const cityMap = source.maps.get(place.mapKey);
      const here = cityMap !== undefined && leaderUnitOf([cityMap], city.owner) === leaderUnit;
      // 플레이어 가문 나라의 지도자 = 그 가문장(질문 2012 답)
      const headRow = faction?.player === true ? factionRow : electedRow;
      const head =
        headRow !== undefined ? await source.houseLeader?.(headRow).catch(() => undefined) : undefined;
      const ruling = leaderUnit === undefined ? undefined : runtime.rulingHouseOf?.(city.owner);
      const houseEntry = (await source.houseEntry?.(viewer, city.id).catch(() => null)) ?? null;
      // 나라 세금(tax-2): 소득세 기본값 = 그 나라 거래세율(도시 경제가 없으면 기본 거래세 — 사업장 소득세와 같은 뒷길)
      const taxes =
        (await source
          .nationTaxes?.(viewer, {
            factionRow,
            npc: faction?.player !== true,
            commerce: faction?.traits?.commerce,
            tradeTaxBp: runtime.taxOf?.(city.owner) ?? DEFAULT_TAX_BP,
          })
          .catch(() => null)) ?? null;
      // 도시 화폐(지도자 = 나라 세금을 정하는 사람과 같다)
      const moneyNow = runtime.cityMoney?.(city.id);
      const nationOfCurrency = async (issuer: number | undefined) => {
        const issuerCode = issuer === undefined ? undefined : runtime.world.factions.get(issuer)?.code;
        if (issuerCode === undefined) return null;
        return {
          name: source.nationName(issuerCode) ?? null,
          emblem: (await source.nationEmblem?.(issuerCode).catch(() => null)) ?? null,
        };
      };
      const canSetMoney = taxes?.canSet === true;
      const money = moneyNow
        ? {
            code: currencyCode(moneyNow.currency),
            nation: await nationOfCurrency(
              moneyNow.options.find((entry) => entry.currency === moneyNow.currency)?.issuer,
            ),
            own: moneyNow.currency === moneyNow.own,
            reserveMin: String(FOREIGN_CITY_MONEY_MIN),
            canSet: canSetMoney,
            options: canSetMoney
              ? await Promise.all(
                  moneyNow.options
                    .toSorted(
                      (a, b) => Number(b.currency === moneyNow.own) - Number(a.currency === moneyNow.own),
                    )
                    .map(async (entry) => ({
                      code: currencyCode(entry.currency),
                      nation: await nationOfCurrency(entry.issuer),
                      own: entry.currency === moneyNow.own,
                      reserve: String(entry.reserve),
                      allowed: entry.currency === moneyNow.own || entry.reserve >= FOREIGN_CITY_MONEY_MIN,
                    })),
                )
              : [],
          }
        : null;
      const code = faction?.code ?? null;
      const mayorId = runtime.mayorOf?.(city.id);
      const mayorUnit = mayorId === undefined ? undefined : runtime.world.units.get(mayorId);
      // 나라를 이끄는 방식(D-574 10 — 체제대로: 독재 = 독재자, 민주주의 = 투표, 자본주의 = 지분)
      const rule = faction?.regime ? { rule: leaderRuleOf(faction.regime) } : {};
      return {
        status: "ready",
        buildingId,
        city: {
          id: city.id,
          name: place.name ?? null,
          mapKey: String(place.mapKey),
          start: city.start,
          capital: capital === city.id,
          adminLevel: city.adminLevel,
          humans,
          housing: city.housing,
          day: cityDayOf(city, runtime.world.units.values(), runtime.necessitiesPm?.(city.id)),
        },
        nation: {
          id: factionRow ?? city.owner,
          code,
          name: code === null ? null : (source.nationName(code) ?? null),
          // 국가 마크(마크 조회가 있는 서버만 — 읽지 못해도 정부 판은 그대로 준다)
          ...(source.nationEmblem && code !== null
            ? { emblem: await source.nationEmblem(code).catch(() => null) }
            : {}),
          fixed: faction?.fixed ?? false,
          mine: factionRow !== undefined && source.myFactionRow(viewer.id) === factionRow,
          taxBp: runtime.taxOf?.(city.owner) ?? null,
          regime: faction?.regime ?? null,
        },
        leader:
          leaderUnit !== undefined
            ? {
                unitId: leaderUnit,
                name: code === null ? null : (source.leaderName(code) ?? null),
                here,
                house: ruling ? { name: ruling.name, npc: true } : null,
                ...rule,
              }
            : head?.unitId !== null && head?.unitId !== undefined
              ? {
                  unitId: head.unitId,
                  name: head.name === null ? null : { ko: head.name, en: head.name },
                  here: cityMap?.unitInfo?.(head.unitId) !== undefined,
                  house: head.house === null ? null : { name: head.house, npc: false },
                  ...rule,
                }
              : null,
        building: buildingCell(cityMap, buildingId),
        mayor:
          mayorId === undefined || !mayorUnit
            ? null
            : mayorView(mayorId, mayorUnit, runtime.humanName?.(mayorId)),
        houseEntry,
        taxes,
        money,
        generatedAt: nowMs,
      };
    },
  };
  return reads;
}

/** 월드(app.ts → worldMap/reads.ts worldMapReadsOf)로 정부 판 조회를 만든다. 아는 도시·이름은 지도 흐름 조회와 같은 함수 */
export function governmentReadsOfWorld(
  world: Pick<World, "maps" | "persistence" | "npc">,
  names: Pick<
    GovernmentSource,
    | "knownCityIds"
    | "nationName"
    | "nationEmblem"
    | "leaderName"
    | "seesUnit"
    | "houseLeader"
    | "houseEntry"
    | "nationTaxes"
  >,
): GovernmentReads {
  return createGovernmentReads({
    ...names,
    maps: world.maps,
    facility: (buildingId) => world.persistence?.facilities.service.facilities.get(buildingId),
    runtime: () => {
      const npc = world.npc;
      if (!npc) return undefined;
      return {
        world: npc.world,
        places: npc.places,
        taxOf: (factionId) => npc.economy?.economy.taxOf.get(factionId),
        cityMoney: (cityId) => {
          const economy = npc.economy;
          const owner = npc.world.cities.get(cityId)?.owner;
          const currency = economy?.cityMoney.of(cityId);
          if (!economy || owner === undefined || currency === undefined) return undefined;
          return {
            currency,
            own: economy.economy.currencyOf.get(owner) ?? economy.economy.base,
            options: [...economy.economy.issuer].map(([asset, issuer]) => ({
              currency: asset,
              issuer,
              reserve: npc.world.book.balanceOf(owner, asset),
            })),
          };
        },
        // 지난 하루 끝 값(781 나 — 만족도·발전도와 같은 날, 저장해 다시 켜도 같다). 도시 경제가 없으면 값이 없다
        necessitiesPm: (cityId) => (npc.economy ? npc.necessitiesOf(cityId) : undefined),
        mayorOf: (cityId) => npc.mayorOf(cityId),
        humanName: (unitId) => npc.humanName(unitId),
        capitalOf: (owner) => npc.capitalOf(owner),
        rulingHouseOf: (owner) => npc.cityHouses.rulingHouseOf(owner),
        rulingPlayerHouseOf: (owner) => npc.cityHouses.rulingPlayerHouseOf(owner),
      };
    },
    factionRowOf: (ownerId) => world.persistence?.owners.get(ownerId)?.factionId ?? undefined,
    myFactionRow: (userId) => world.persistence?.cyborgs.record(userId)?.factionId ?? undefined,
  });
}
