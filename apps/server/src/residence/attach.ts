// 사는 곳 장부·서비스를 세계에 잇는다(gather/world.ts가 세계가 준비된 뒤 일꾼 쉼터와 함께 부른다 — world.ts·app.ts 줄 수 때문에 여기 둔다). D-585 1.
// - 표는 gather/world.ts가 먼저 읽어 준다(residence/store.ts loadResidences·rent.ts loadResidenceRents).
// - 장부는 원장에 붙인다(residenceBookOf — 주민세 거주 출처 npc/residentProperty.ts·신용·일꾼 쉼터 숙박비가 읽는다).
// - 서비스는 채집 서비스 객체에 붙인다(residenceServiceOf — 채집 게이트웨이가 residence_set·residence_rent를 받아 넘긴다, gather/gateway.ts).
// - 바뀜(residence-3, D-591): 정원 = 층 × 설정 칸(facilities/floors.ts), 집세·미리 내는 숙박비(rent.ts) — 1분 훑기가 다음 기간을 걷은 뒤 쉼을 훑는다.
// - 바뀜(npc-rent, 질문 2674 — D-555 1509): NPC 휴먼도 같은 장부로 세 든다(npcRent.ts). 1분 훑기 = 다음 기간 걷기 → NPC 세 들기 → 쉼. NPC 휴먼 값은 그 도시 나라
//   화폐로 그 휴먼 지갑에서(npcAwarePayer), 장부의 유닛 주인은 2차맵에 없으면 거울 세계 휴먼 주인.
import type { ResidenceFloorQuote } from "@terra/shared/residence";
import { unitPurseLocation } from "@terra/shared/businessBooks";
import type { BusinessCore } from "../business/core.ts";
import type { Ledger } from "../economy/ledger.ts";
import {
  type FloorRules,
  LIVING_STAGE,
  floorMax,
  floorsOf,
  residenceCapacity,
} from "../facilities/floors.ts";
import type { WorkerRest } from "../labor/workerRest.ts";
import type { QueryPool } from "../world/persist/load.ts";
import {
  type ResidenceBook,
  type ResidenceChoice,
  type ResidenceWorld,
  createResidenceBook,
  registerResidenceBook,
} from "./book.ts";
import {
  DEFAULT_RESIDENCE_RENT_PERIOD_MS,
  RENT_TX_KIND,
  type RentPayer,
  type RentTable,
  type ResidenceRent,
  createRentTable,
  renewResidenceRents,
} from "./rent.ts";
import { type NpcRentRules, type NpcRentWorld, createNpcRentSweeper, npcAwarePayer } from "./npcRent.ts";
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

/** 사는 곳 규칙(설정 칸 — @terra/sim BusinessCoefficients의 같은 이름 칸) */
export interface ResidenceRules extends FloorRules, NpcRentRules {
  readonly residenceRentPeriodMs?: number | undefined;
}

/** 시설 줄에서 장부가 읽는 칸 */
interface FacilityRow {
  readonly cityId: number | null;
  readonly level: number;
  readonly facilityId: string;
  readonly floors?: number | undefined;
}

export interface ResidenceParts {
  readonly pool: QueryPool;
  readonly ledger: Ledger;
  readonly facilities: {
    readonly service: { readonly facilities: ReadonlyMap<number, FacilityRow> };
    catalog(): { facility(id: string): { readonly stage: string } | undefined };
    /** 사업장 장부(집세를 그 건물 금고로 — 없으면 건물 주인 지갑) */
    readonly business?: Pick<BusinessCore, "receive"> | undefined;
  };
  readonly maps: ReadonlyMap<
    number,
    {
      unitInfo(unitId: number): { readonly ownerId: number } | undefined;
      buildingOwner(buildingId: number): number | null | undefined;
    }
  >;
  readonly workerRest: Pick<WorkerRest, "restOf" | "periodFee">;
  /** 사는 곳 규칙(정원·층·집세 기간 — 설정 칸) */
  rules(): ResidenceRules;
  /** 집세·숙박비 화폐(숙박비와 같은 서버 시험 화폐 [임시]) */
  readonly feeAsset: string;
  /** 층 올리기 견적(residence/floorQuote.ts — 없으면 견적 없음) */
  floorQuote?(buildingId: number, ownerId: number): ResidenceFloorQuote | null;
  ownerOf(userId: string): number | undefined;
  readonly now: () => number;
  /** NPC 세 들기 세계 몫(NPC 런타임이 켜진 뒤 — 없으면 NPC는 세 들지 않는다, npcRent.ts) */
  npc?(): NpcRentWorld | undefined;
}

type WorldParts = Pick<ResidenceParts, "facilities" | "maps" | "workerRest" | "rules" | "now" | "npc">;

/** 세계 몫 → 장부가 읽는 세계 */
export function residenceWorldOf(parts: WorldParts, rents: RentTable = createRentTable()): ResidenceWorld {
  const unitOwner = (unitId: number): number | undefined => {
    for (const map of parts.maps.values()) {
      const info = map.unitInfo(unitId);
      if (info) return info.ownerId;
    }
    // 2차맵에 서 있지 않은 NPC 휴먼(npc-rent): 거울 세계 휴먼 주인
    return parts.npc?.()?.units.get(unitId)?.owner;
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
      const ownerId = buildingOwner(buildingId);
      return {
        cityId: record.cityId,
        level: record.level,
        living: parts.facilities.catalog().facility(record.facilityId)?.stage === LIVING_STAGE,
        ownerId,
        // 정원 = 층 × 설정 칸(D-591 1 — 레벨은 들지 않는다)
        capacity: residenceCapacity(floorsOf(record), parts.rules()),
        rent: rents.rentOf(buildingId, ownerId),
      };
    },
    lodgingOf(unitId) {
      const rest = parts.workerRest.restOf(unitId);
      return rest?.lodgingId === null || rest?.lodgingId === undefined
        ? undefined
        : { buildingId: rest.lodgingId, cityId: rest.cityId };
    },
    now: parts.now,
  };
}

/** 집세를 걷는 세계 몫(rent.ts RentPayer) — 유닛 지갑 → 그 건물 사업장 금고 */
function rentPayerOf(parts: ResidenceParts, world: ResidenceWorld): RentPayer {
  const periodMs = (): number => {
    const value = parts.rules().residenceRentPeriodMs;
    return value === undefined || !Number.isFinite(value) || value < 1
      ? DEFAULT_RESIDENCE_RENT_PERIOD_MS
      : Math.trunc(value);
  };
  const purse = (ownerId: number, unitId: number): number =>
    parts.ledger.ownerAccount(ownerId, parts.feeAsset, unitPurseLocation(unitId));
  return {
    periodMs,
    priceOf(unitId, buildingId, kind) {
      if (kind === "own") return 0n;
      if (kind === "lodging") return parts.workerRest.periodFee(unitId, buildingId, periodMs());
      return world.building(buildingId)?.rent ?? undefined;
    },
    purseBalance: (ownerId, unitId) => parts.ledger.balance(purse(ownerId, unitId)),
    pay(input) {
      if (input.kind === "own" || input.amount <= 0n) return true;
      const from = purse(input.ownerId, input.unitId);
      const kind = RENT_TX_KIND[input.kind];
      if (
        parts.facilities.business?.receive({
          from,
          buildingId: input.buildingId,
          asset: parts.feeAsset,
          amount: input.amount,
          kind,
          atMs: input.atMs,
        })
      )
        return true;
      // 사업장 장부가 없거나(시험) 받지 않으면 건물 주인 지갑으로(일꾼 숙박비 옛 길과 같다)
      const owner = world.building(input.buildingId)?.ownerId ?? null;
      if (owner === null) return false;
      parts.ledger.post({
        kind,
        atMs: input.atMs,
        entries: [
          { account: from, amount: -input.amount },
          { account: parts.ledger.ownerAccount(owner, parts.feeAsset), amount: input.amount },
        ],
      });
      return true;
    },
  };
}

/** 읽은 표(residence/store.ts loadResidences·rent.ts loadResidenceRents)로 장부·서비스를 만들어 원장에 붙인다 */
export function attachResidence(
  parts: ResidenceParts & {
    readonly rows: readonly ResidenceChoice[];
    readonly rentRows?: readonly ResidenceRent[] | undefined;
  },
): {
  readonly book: ResidenceBook;
  readonly service: ResidenceService;
  /** 쉼 훑기를 멈춘다 */
  stop(): void;
} {
  const rents = createRentTable();
  rents.load(parts.rentRows ?? []);
  const world = residenceWorldOf(parts, rents);
  const book = createResidenceBook(world);
  book.load(parts.rows);
  registerResidenceBook(parts.ledger, book);
  const payer = npcAwarePayer(rentPayerOf(parts, world), {
    npc: () => parts.npc?.(),
    ledger: parts.ledger,
    business: parts.facilities.business,
    world,
  });
  const npcRent = createNpcRentSweeper({
    book,
    rents,
    world,
    payer,
    npc: () => parts.npc?.(),
    pool: parts.pool,
    rules: () => parts.rules(),
  });
  const service = createResidenceService({
    book,
    pool: parts.pool,
    ownerOf: (userId) => parts.ownerOf(userId),
    unitOwner: (unitId) => world.unitOwner(unitId),
    now: parts.now,
    extras: {
      rents,
      payer,
      buildingFacts(buildingId) {
        const facts = world.building(buildingId);
        return facts ? { ownerId: facts.ownerId, living: facts.living, level: facts.level } : undefined;
      },
      floorsOf(buildingId) {
        const record = parts.facilities.service.facilities.get(buildingId);
        if (!record || world.building(buildingId)?.living !== true) return undefined;
        const floors = floorsOf(record);
        return {
          floors,
          maxFloors: floorMax(parts.rules()),
          capacity: residenceCapacity(floors, parts.rules()),
        };
      },
      floorQuote: (buildingId, ownerId) => parts.floorQuote?.(buildingId, ownerId) ?? null,
    },
  });
  // 1분 훑기(D-591 2·질문 2485 가): 낸 기간이 끝난 고른 것의 다음 기간을 걷고, NPC 세 들기(npc-rent)를 본 뒤 쉼을 훑는다. 하나씩 차례로(겹치지 않게)
  let sweeping = false;
  const timer = setInterval(() => {
    if (sweeping) return;
    sweeping = true;
    const at = parts.now();
    void renewResidenceRents(book, payer, parts.pool, at)
      .then(() => npcRent.sweep(at))
      .then(() => sweepResidencePauses(book, parts.pool, at))
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
