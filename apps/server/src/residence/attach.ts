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
import { markResidencePaused } from "./store.ts";

/** 고른 집이 쉬는지 훑는 간격(ms — 질문 2485 가) */
const PAUSE_SWEEP_MS = 60_000;

/**
 * 고른 집이 쉬기 시작했거나 다시 쓸 수 있게 된 유닛의 표시를 고친다(질문 2485 가 — 쉬면 옛 길 숙소 배정으로 돌아가고 주인에게 처리할 일 residence_paused, residence/inbox.ts).
 * 바뀐 유닛 수
 */
export async function sweepResidencePauses(
  book: ResidenceBook,
  pool: QueryPool | undefined,
  nowMs: number,
): Promise<number> {
  let changed = 0;
  for (const choice of book.all()) {
    const usable = book.chosenPlace(choice.unitId) !== undefined;
    const paused = choice.pausedSinceMs !== null && choice.pausedSinceMs !== undefined;
    if (usable === !paused) continue;
    const next = usable ? null : nowMs;
    if (pool) await markResidencePaused(pool, choice.unitId, next);
    book.put({ ...choice, pausedSinceMs: next });
    changed += 1;
  }
  return changed;
}

/** 설정 칸 residence_capacity_per_level이 없을 때(옛 팩) 레벨마다 정원 — 기술 기본값 [임시] */
export const DEFAULT_RESIDENCE_CAPACITY_PER_LEVEL = 4;

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
  /** 사는 곳 정원: 레벨(층)마다 유닛 수(설정 칸 residence_capacity_per_level — 질문 2481 가) */
  capacityPerLevel(): number;
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
        capacity: Math.max(0, record.level) * Math.max(0, Math.trunc(parts.capacityPerLevel())),
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
  /** 쉼 훑기를 멈춘다 */
  stop(): void;
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
  // 고른 집 쉼 훑기(질문 2485 가): 1분마다, 하나씩 차례로(겹치지 않게)
  let sweeping = false;
  const timer = setInterval(() => {
    if (sweeping) return;
    sweeping = true;
    void sweepResidencePauses(book, parts.pool, parts.now())
      .catch(() => undefined)
      .finally(() => {
        sweeping = false;
      });
  }, PAUSE_SWEEP_MS);
  timer.unref();
  return { book, service, stop: () => clearInterval(timer) };
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
