// 사는 곳(거주지) 장부 — 사용자 답 D-585 1: 플레이어·유닛은 집(주거 건물)을 여럿 가질 수 있지만 사는 곳은 하나만 고른다. 고른 집이 선 도시·나라의 주민이 되고,
// 주민세(집 몫·사업장 몫 — @terra/sim society/residentTax.ts)와 신용이 그 사는 곳을 따른다. docs/adr/2026-11-15-business-ledger.md "바뀜 (residence …)".
// - 고르는 쪽 = 유닛 하나(주민세 집 몫을 내는 쪽과 같다 — D-581 2372). 플레이어 자신 = 사이보그 본체 유닛이 고른 곳. 주인(소유 주체)은 사는 유닛이 있는 도시의
//   주민이다(사업장 몫 — 옛 규칙 그대로, 새 모양을 만들지 않았다).
// - 고를 수 있는 집: 다 지은(레벨 1 이상) 주거 건물(생활 단계 시설)이 도시에 서 있고, 그 유닛 주인이 가진 집이거나 그 유닛이 지금 배정받은 숙소(D-581 2372 —
//   지금 플레이어 일꾼이 사는 길)일 때. 고른 뒤 그 조건이 깨지면(집을 잃음·숙소 배정이 바뀜·건물이 사라짐) 고른 것은 쉰다 — 옛 길(숙소 배정)로 돌아간다.
//   표의 줄은 지우지 않는다(조건이 돌아오면 다시 쓴다).
// - 고른 것이 없으면 옛 길: 숙소 배정이 있는 일꾼은 그 숙소가 사는 곳(lodgingOf). NPC 휴먼은 고르지 않는다(사는 도시 SimUnit.city — npc/residentProperty.ts).
// - 조회 함수 residenceCityOf(유닛)·ownerResidenceCities(주인): 신용(apps/server/src/credit/ — governance-5 줄기가 다시 만든다)이 나중에 이것을 쓴다(지금은
//   잇지 않았다 — 신용 셈은 빚 계정의 도시를 그대로 쓴다).
// 장부는 원장마다 하나(WeakMap — npc/residentProperty.ts registerPlayerHomes와 같은 꼴). 저장은 residence/store.ts(표 unit_residences).
import type { ResidenceBlock, ResidencePlace } from "@terra/shared/residence";

/** 고른 사는 곳 한 줄(표 unit_residences) */
export interface ResidenceChoice {
  readonly unitId: number;
  readonly ownerId: number;
  readonly buildingId: number;
  readonly chosenAtMs: number;
}

/** 건물 사실(장부가 읽는다) */
export interface ResidenceBuildingFacts {
  /** 선 도시(도시 밖이면 null) */
  readonly cityId: number | null;
  readonly level: number;
  /** 주거 건물(생활 단계 시설) */
  readonly living: boolean;
  /** 건물 주인(소유 주체, 없으면 null) */
  readonly ownerId: number | null;
}

/** 세계 몫(attach.ts가 2차맵·건물 서비스·일꾼 쉼터로 만든다) */
export interface ResidenceWorld {
  /** 유닛 주인(2차맵에 없으면 undefined) */
  unitOwner(unitId: number): number | undefined;
  /** 건물 사실(없으면 undefined) */
  building(buildingId: number): ResidenceBuildingFacts | undefined;
  /** 그 유닛이 지금 배정받은 숙소(일꾼 쉼터 — 숙소가 아니면 undefined) */
  lodgingOf(unitId: number): { readonly buildingId: number; readonly cityId: number } | undefined;
}

/** 주민세 집 몫 고리가 받는 거주 한 줄(npc/residentProperty.ts ResidentUnit과 같은 꼴) */
export interface ChosenResident {
  readonly unit: number;
  readonly owner: number;
  readonly lodging: number;
}

export interface ResidenceBook {
  /** 부팅 때 표를 읽어 넣는다 */
  load(rows: readonly ResidenceChoice[]): void;
  /** 고른 것(쉬는 것 포함 — 표 그대로) */
  choiceOf(unitId: number): ResidenceChoice | undefined;
  /** 적는다(서비스가 DB에 쓴 뒤) */
  put(choice: ResidenceChoice): void;
  /** 지운다(서비스가 DB에서 지운 뒤) */
  remove(unitId: number): void;
  /** 그 주인의 그 유닛이 이 건물을 고를 수 있나(null = 고를 수 있다) */
  blockOf(unitId: number, ownerId: number, buildingId: number): ResidenceBlock | null;
  /** 고른 것이 지금 쓸 수 있으면 그 집·도시(쉬면 undefined) */
  chosenPlace(unitId: number): { readonly buildingId: number; readonly cityId: number } | undefined;
  /** 지금 사는 곳: 고른 집(쓸 수 있으면) → 숙소 배정 → 없음 */
  residenceOf(unitId: number): ResidencePlace | undefined;
  /** 지금 사는 도시(신용 등이 쓸 조회 함수 — 위 머리 주석) */
  residenceCityOf(unitId: number): number | undefined;
  /** 그 주인의 유닛이 고른 집으로 사는 도시들(차례대로, 겹침 없음 — 숙소 배정만으로 사는 도시는 넣지 않는다) */
  ownerResidenceCities(ownerId: number): number[];
  /** 그 도시에 고른 집으로 사는 유닛(쓸 수 있는 것만, 유닛 ID 차례) */
  chosenIn(cityId: number): ChosenResident[];
}

export function createResidenceBook(world: ResidenceWorld): ResidenceBook {
  const choices = new Map<number, ResidenceChoice>();

  const blockOf = (unitId: number, ownerId: number, buildingId: number): ResidenceBlock | null => {
    const facts = world.building(buildingId);
    if (!facts || facts.level < 1) return "unknown_building";
    if (!facts.living) return "not_housing";
    if (facts.cityId === null) return "no_city";
    if (facts.ownerId === ownerId) return null;
    return world.lodgingOf(unitId)?.buildingId === buildingId ? null : "not_eligible";
  };

  const chosenPlace = (unitId: number): { buildingId: number; cityId: number } | undefined => {
    const choice = choices.get(unitId);
    if (!choice) return undefined;
    // 유닛이 그 주인 것이 아니게 되었거나(죽음·넘김) 2차맵에서 못 찾으면 쉰다
    if (world.unitOwner(unitId) !== choice.ownerId) return undefined;
    if (blockOf(unitId, choice.ownerId, choice.buildingId) !== null) return undefined;
    const cityId = world.building(choice.buildingId)?.cityId;
    return cityId === null || cityId === undefined ? undefined : { buildingId: choice.buildingId, cityId };
  };

  const residenceOf = (unitId: number): ResidencePlace | undefined => {
    const chosen = chosenPlace(unitId);
    if (chosen) return { ...chosen, source: "chosen" };
    const lodging = world.lodgingOf(unitId);
    return lodging ? { ...lodging, source: "lodging" } : undefined;
  };

  return {
    load(rows) {
      choices.clear();
      for (const row of rows) choices.set(row.unitId, row);
    },
    choiceOf: (unitId) => choices.get(unitId),
    put(choice) {
      choices.set(choice.unitId, choice);
    },
    remove(unitId) {
      choices.delete(unitId);
    },
    blockOf,
    chosenPlace,
    residenceOf,
    residenceCityOf: (unitId) => residenceOf(unitId)?.cityId,
    ownerResidenceCities(ownerId) {
      const cities = new Set<number>();
      for (const choice of choices.values()) {
        if (choice.ownerId !== ownerId) continue;
        const place = chosenPlace(choice.unitId);
        if (place) cities.add(place.cityId);
      }
      return [...cities].toSorted((a, b) => a - b);
    },
    chosenIn(cityId) {
      const out: ChosenResident[] = [];
      for (const choice of choices.values()) {
        const place = chosenPlace(choice.unitId);
        if (place?.cityId === cityId)
          out.push({ unit: choice.unitId, owner: choice.ownerId, lodging: place.buildingId });
      }
      return out.toSorted((a, b) => a.unit - b.unit);
    },
  };
}

const books = new WeakMap<object, ResidenceBook>();

/** 사는 곳 장부를 원장에 붙인다(마지막에 붙인 것이 이긴다 — 세계 하나에 하나) */
export function registerResidenceBook(ledger: object, book: ResidenceBook): void {
  books.set(ledger, book);
}

/** 그 원장의 사는 곳 장부(아직 없거나 DB 없는 세계면 undefined) */
export function residenceBookOf(ledger: object | undefined): ResidenceBook | undefined {
  return ledger ? books.get(ledger) : undefined;
}
