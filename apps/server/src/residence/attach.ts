// 사는 곳 장부·서비스를 세계에 잇는다(gather/world.ts가 세계가 준비된 뒤 일꾼 쉼터와 함께 부른다 — world.ts·app.ts 줄 수 때문에 여기 둔다). D-585 1.
// - 표는 gather/world.ts가 먼저 읽어 준다(residence/store.ts loadResidences).
// - 장부는 원장에 붙인다(residenceBookOf — 주민세 거주 출처 npc/residentProperty.ts·신용이 읽는다).
// - 서비스는 채집 서비스 객체에 붙인다(residenceServiceOf — 채집 게이트웨이가 residence_set을 받아 넘긴다, gather/gateway.ts).
import type { WorkerRest } from "../labor/workerRest.ts";
import type { QueryPool } from "../world/persist/load.ts";
import {
  type ResidenceBook,
  type ResidenceChoice,
  type ResidenceWorld,
  createResidenceBook,
  registerResidenceBook,
} from "./book.ts";
import { type ResidenceService, createResidenceService } from "./service.ts";

/** 생활 단계 시설(숙소·집 — 팩 facilities stage "living") */
const LIVING_STAGE = "living";

export interface ResidenceParts {
  readonly pool: QueryPool;
  readonly ledger: object;
  readonly facilities: {
    readonly service: {
      readonly facilities: ReadonlyMap<
        number,
        { readonly cityId: number | null; readonly level: number; readonly facilityId: string }
      >;
    };
    catalog(): { facility(id: string): { readonly stage: string } | undefined };
  };
  readonly maps: ReadonlyMap<
    number,
    {
      unitInfo(unitId: number): { readonly ownerId: number } | undefined;
      buildingOwner(buildingId: number): number | null | undefined;
    }
  >;
  readonly workerRest: Pick<WorkerRest, "restOf">;
  ownerOf(userId: string): number | undefined;
  readonly now: () => number;
}

/** 세계 몫 → 장부가 읽는 세계 */
export function residenceWorldOf(
  parts: Omit<ResidenceParts, "pool" | "ledger" | "ownerOf" | "now">,
): ResidenceWorld {
  const unitOwner = (unitId: number): number | undefined => {
    for (const map of parts.maps.values()) {
      const info = map.unitInfo(unitId);
      if (info) return info.ownerId;
    }
    return undefined;
  };
  const buildingOwner = (buildingId: number): number | null => {
    for (const map of parts.maps.values()) {
      const owner = map.buildingOwner(buildingId);
      if (owner !== undefined) return owner;
    }
    return null;
  };
  return {
    unitOwner,
    building(buildingId) {
      const record = parts.facilities.service.facilities.get(buildingId);
      if (!record) return undefined;
      return {
        cityId: record.cityId,
        level: record.level,
        living: parts.facilities.catalog().facility(record.facilityId)?.stage === LIVING_STAGE,
        ownerId: buildingOwner(buildingId),
      };
    },
    lodgingOf(unitId) {
      const rest = parts.workerRest.restOf(unitId);
      return rest?.lodgingId === null || rest?.lodgingId === undefined
        ? undefined
        : { buildingId: rest.lodgingId, cityId: rest.cityId };
    },
  };
}

/** 읽은 표(residence/store.ts loadResidences)로 장부·서비스를 만들어 원장에 붙인다 */
export function attachResidence(parts: ResidenceParts & { readonly rows: readonly ResidenceChoice[] }): {
  readonly book: ResidenceBook;
  readonly service: ResidenceService;
} {
  const world = residenceWorldOf(parts);
  const book = createResidenceBook(world);
  book.load(parts.rows);
  registerResidenceBook(parts.ledger, book);
  const service = createResidenceService({
    book,
    pool: parts.pool,
    ownerOf: (userId) => parts.ownerOf(userId),
    unitOwner: (unitId) => world.unitOwner(unitId),
    now: parts.now,
  });
  return { book, service };
}

const services = new WeakMap<object, ResidenceService>();

/** 사는 곳 서비스를 채집 서비스 객체에 붙인다(채집 게이트웨이가 찾는다) */
export function registerResidenceService(key: object, service: ResidenceService): void {
  services.set(key, service);
}

/** 그 채집 서비스에 붙은 사는 곳 서비스(아직 없으면 undefined) */
export function residenceServiceOf(key: object | undefined): ResidenceService | undefined {
  return key ? services.get(key) : undefined;
}
