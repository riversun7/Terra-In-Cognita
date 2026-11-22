// 사는 곳(거주지) 장부 — 사용자 답 D-585 1: 플레이어·유닛은 집(주거 건물)을 여럿 가질 수 있지만 사는 곳은 하나만 고른다. 고른 집이 선 도시·나라의 주민이 되고,
// 주민세(집 몫·사업장 몫 — @terra/sim society/residentTax.ts)와 신용이 그 사는 곳을 따른다. docs/adr/2026-11-15-business-ledger.md "바뀜 (residence …)".
// - 고르는 쪽 = 유닛 하나(주민세 집 몫을 내는 쪽과 같다 — D-581 2372). 플레이어 자신 = 사이보그 본체 유닛이 고른 곳. 주인(소유 주체)은 사는 유닛이 있는 도시의
//   주민이다(사업장 몫 — 옛 규칙 그대로, 새 모양을 만들지 않았다).
// - 고를 수 있는 집: 다 지은(레벨 1 이상) 주거 건물(생활 단계 시설)이 도시에 서 있고, 그 유닛 주인이 가진 집이거나 그 유닛이 지금 배정받은 숙소(D-581 2372 —
//   지금 플레이어 일꾼이 사는 길)일 때. 고른 뒤 그 조건이 깨지면(집을 잃음·숙소 배정이 바뀜·건물이 사라짐) 고른 것은 쉰다 — 옛 길(숙소 배정)로 돌아간다.
//   표의 줄은 지우지 않는다(조건이 돌아오면 다시 쓴다).
// - 바뀜(governance-6, 질문 2481 가): 집마다 정원(ResidenceBuildingFacts.capacity)이 있다. 고른 차례(고른 시각, 유닛 ID)로 앞에서 정원까지만
//   그 집에 산다 — 다 찼으면 새로 고를 수 없고(full), 정원이 줄면 뒤에 고른 유닛부터 쉰다.
// - 바뀜(residence-3, D-591 1): 정원 = 층 수 × 설정 칸 residence_capacity_per_floor(층은 레벨과 따로 — 층 올리기 공사, facilities/floors.ts).
// - 바뀜(residence-3, D-591 2): 내는 길(payKindOf) — own = 내 집(값 없음), lodging = 배정받은 숙소(하룻밤 숙박비를 기간만큼 미리), rent = 남의 집(주인이 정한
//   집세를 기간마다 미리 — 주인이 세를 놓아야 고를 수 있다). own이 아니면 미리 낸 기간(paidUntilMs)이 지나지 않았을 때만 쓸 수 있다(값 셈·걷기는 rent.ts).
//   미리 낸 기간이 남아 있으면 세를 거두거나 숙소 배정이 바뀌어도 그 기간 끝까지 산다. 다른 집을 고르면 남은 몫은 돌려받지 않는다(2486 가 — 서비스가 새로 낸다).
//   정원은 쓸 수 있는(값을 낸) 유닛만 센다.
// - 고른 것이 없으면 옛 길: 숙소 배정이 있는 일꾼은 그 숙소가 사는 곳(lodgingOf). NPC 휴먼은 고른 것이 없으면 사는 도시 SimUnit.city(npc/residentProperty.ts).
// - 바뀜(npc-rent, 질문 2674 — D-555 1509 "똑같이"): NPC 휴먼도 세를 놓은 남의 집을 이 장부에 고른다(npcRent.ts — 같은 정원·미리 내기·쉼). 정원·사는 수 셈은
//   건물마다 고른 것만 훑는다(건물 색인 — 고른 것이 수천 개여도).
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
  /** 고른 집을 쓸 수 없게 된 시각(질문 2485 가 — 처리할 일). 쓸 수 있거나 모르면 없음·null */
  readonly pausedSinceMs?: number | null | undefined;
  /** 미리 낸 집세·숙박비가 덮는 끝 시각(D-591 2). 내 집이거나 내지 않았으면 없음·null */
  readonly paidUntilMs?: number | null | undefined;
}

/** 사는 곳 값을 내는 길(D-591 2): own = 내 집, lodging = 배정받은 숙소(숙박비 미리), rent = 남의 집(주인이 정한 집세 미리) */
export type ResidencePay = "own" | "lodging" | "rent";

/** 건물 사실(장부가 읽는다) */
export interface ResidenceBuildingFacts {
  /** 선 도시(도시 밖이면 null) */
  readonly cityId: number | null;
  readonly level: number;
  /** 주거 건물(생활 단계 시설) */
  readonly living: boolean;
  /** 건물 주인(소유 주체, 없으면 null) */
  readonly ownerId: number | null;
  /** 사는 곳으로 고를 수 있는 유닛 수(정원 — 층 수 × 설정 칸 residence_capacity_per_floor, 질문 2481 가 + D-591 1) */
  readonly capacity: number;
  /** 주인이 내놓은 한 기간 집세(D-591 2 — 세를 놓지 않으면 null·없음, rent.ts) */
  readonly rent?: bigint | null | undefined;
}

/** 세계 몫(attach.ts가 2차맵·건물 서비스·일꾼 쉼터로 만든다) */
export interface ResidenceWorld {
  /** 유닛 주인(2차맵에 없으면 undefined) */
  unitOwner(unitId: number): number | undefined;
  /** 건물 사실(없으면 undefined) */
  building(buildingId: number): ResidenceBuildingFacts | undefined;
  /** 그 유닛이 지금 배정받은 숙소(일꾼 쉼터 — 숙소가 아니면 undefined) */
  lodgingOf(unitId: number): { readonly buildingId: number; readonly cityId: number } | undefined;
  /** 지금 시각(미리 낸 기간을 견준다). 없으면 미리 낸 기간을 늘 지난 것으로 본다(시험 — own만 쓴다) */
  now?(): number;
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
  /** 고른 것 모두(유닛 ID 차례 — 쉼 훑기, attach.ts) */
  all(): ResidenceChoice[];
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
  /** 그 유닛이 이 집에 산다면 내는 길(고를 수 없으면 null — D-591 2) */
  payKindOf(unitId: number, ownerId: number, buildingId: number): ResidencePay | null;
  /** 그 집에 고른 집으로 지금 사는(쓸 수 있는) 유닛 수 */
  occupants(buildingId: number): number;
  /** 그 유닛이 이 집 값을 atMs에 미리 내 두었나(일꾼 숙박비를 밤마다 다시 걷지 않는다 — labor/workerRest.ts) */
  prepaidAt(unitId: number, buildingId: number, atMs: number): boolean;
  /** 그 고른 것이 값 말고 다른 조건(건물·주거·도시·고를 수 있는 길·정원)을 지금 채우나 — 집세를 다시 걷기 전에 본다(rent.ts) */
  renewable(unitId: number): boolean;
}

export function createResidenceBook(world: ResidenceWorld): ResidenceBook {
  const choices = new Map<number, ResidenceChoice>();
  /** 건물 → 그 건물을 고른 유닛(정원·사는 수 셈이 건물 하나만 훑게 — NPC 세 들기로 고른 것이 수천 개여도, 바뀜 npc-rent) */
  const byBuilding = new Map<number, Set<number>>();
  const index = (choice: ResidenceChoice): void => {
    const set = byBuilding.get(choice.buildingId) ?? new Set<number>();
    set.add(choice.unitId);
    byBuilding.set(choice.buildingId, set);
  };
  const unindex = (choice: ResidenceChoice | undefined): void => {
    if (!choice) return;
    const set = byBuilding.get(choice.buildingId);
    set?.delete(choice.unitId);
    if (set?.size === 0) byBuilding.delete(choice.buildingId);
  };
  /** 그 건물을 고른 것들 */
  const choicesAt = (buildingId: number): ResidenceChoice[] => {
    const out: ResidenceChoice[] = [];
    for (const unitId of byBuilding.get(buildingId) ?? []) {
      const choice = choices.get(unitId);
      if (choice) out.push(choice);
    }
    return out;
  };
  const nowMs = (): number => world.now?.() ?? Number.NEGATIVE_INFINITY;
  const paid = (choice: ResidenceChoice | undefined, buildingId: number): boolean =>
    choice?.buildingId === buildingId &&
    choice.paidUntilMs !== null &&
    choice.paidUntilMs !== undefined &&
    choice.paidUntilMs > nowMs();

  /** 내는 길(머리 주석) — 배정받은 숙소가 먼저, 그다음 내 집, 그다음 세를 놓은 남의 집 */
  const payKindOf = (unitId: number, ownerId: number, buildingId: number): ResidencePay | null => {
    const facts = world.building(buildingId);
    if (!facts) return null;
    if (world.lodgingOf(unitId)?.buildingId === buildingId) return "lodging";
    if (facts.ownerId === ownerId) return "own";
    return (facts.rent ?? null) === null ? null : "rent";
  };

  /** 정원 말고 다른 조건(건물·주거·도시·고를 수 있는 길 — 미리 낸 기간이 남은 집은 길이 없어져도 그 기간 끝까지) */
  const eligibility = (unitId: number, ownerId: number, buildingId: number): ResidenceBlock | null => {
    const facts = world.building(buildingId);
    if (!facts || facts.level < 1) return "unknown_building";
    if (!facts.living) return "not_housing";
    if (facts.cityId === null) return "no_city";
    if (payKindOf(unitId, ownerId, buildingId) !== null) return null;
    return paid(choices.get(unitId), buildingId) ? null : "not_eligible";
  };

  /** 값을 냈나(내 집은 늘 — D-591 2) */
  const settled = (choice: ResidenceChoice): boolean =>
    payKindOf(choice.unitId, choice.ownerId, choice.buildingId) === "own" || paid(choice, choice.buildingId);

  /** 정원(질문 2481 가): 그 집을 고른(다른 조건이 맞고 값을 낸) 유닛을 고른 차례로 세워 이 유닛이 정원 안에 드나 본다. 아직 고르지 않았으면 맨 뒤 */
  const capacityBlock = (unitId: number, buildingId: number): ResidenceBlock | null => {
    const capacity = world.building(buildingId)?.capacity ?? 0;
    const mine = choices.get(unitId);
    const ahead = choicesAt(buildingId).filter(
      (choice) =>
        choice.unitId !== unitId &&
        world.unitOwner(choice.unitId) === choice.ownerId &&
        eligibility(choice.unitId, choice.ownerId, buildingId) === null &&
        settled(choice) &&
        (mine?.buildingId !== buildingId ||
          choice.chosenAtMs < mine.chosenAtMs ||
          (choice.chosenAtMs === mine.chosenAtMs && choice.unitId < unitId)),
    ).length;
    return ahead < capacity ? null : "full";
  };

  const blockOf = (unitId: number, ownerId: number, buildingId: number): ResidenceBlock | null =>
    eligibility(unitId, ownerId, buildingId) ?? capacityBlock(unitId, buildingId);

  const chosenPlace = (unitId: number): { buildingId: number; cityId: number } | undefined => {
    const choice = choices.get(unitId);
    if (!choice) return undefined;
    // 유닛이 그 주인 것이 아니게 되었거나(죽음·넘김) 2차맵에서 못 찾으면 쉰다
    if (world.unitOwner(unitId) !== choice.ownerId) return undefined;
    if (blockOf(unitId, choice.ownerId, choice.buildingId) !== null) return undefined;
    // 집세·숙박비를 미리 내야 하는 집은 낸 기간 안에서만(D-591 2)
    if (!settled(choice)) return undefined;
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
      byBuilding.clear();
      for (const row of rows) {
        choices.set(row.unitId, row);
        index(row);
      }
    },
    choiceOf: (unitId) => choices.get(unitId),
    all: () => [...choices.values()].toSorted((a, b) => a.unitId - b.unitId),
    put(choice) {
      unindex(choices.get(choice.unitId));
      choices.set(choice.unitId, choice);
      index(choice);
    },
    remove(unitId) {
      unindex(choices.get(unitId));
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
    payKindOf,
    occupants(buildingId) {
      let count = 0;
      for (const choice of choicesAt(buildingId)) if (chosenPlace(choice.unitId)) count += 1;
      return count;
    },
    prepaidAt(unitId, buildingId, atMs) {
      const choice = choices.get(unitId);
      return (
        choice?.buildingId === buildingId &&
        choice.paidUntilMs !== null &&
        choice.paidUntilMs !== undefined &&
        choice.paidUntilMs > atMs
      );
    },
    renewable(unitId) {
      const choice = choices.get(unitId);
      if (!choice || world.unitOwner(unitId) !== choice.ownerId) return false;
      if (payKindOf(unitId, choice.ownerId, choice.buildingId) === null) return false;
      return blockOf(unitId, choice.ownerId, choice.buildingId) === null;
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
