// 사는 곳 고르기·조회(서버 권위) — 사용자 답 D-585 1. 규칙은 book.ts, 메시지는 @terra/protocol residence.ts(WebSocket residence_set → residence_result —
// 채집 게이트웨이가 받아 넘긴다, gather/gateway.ts), 조회는 tRPC gather.residence(gather/reads.ts). 감사 기록은 남기지 않는다.
// 바뀜(residence-3, D-591 2): 남의 집(주인이 세를 놓은 것)·배정받은 숙소를 고르면 첫 기간 집세·숙박비를 유닛 지갑에서 바로 낸다(rent.ts — 모자라면
// insufficient_funds). 같은 집을 미리 낸 기간 안에 다시 고르면 unchanged, 다른 집을 고르면 새로 내고 옛 집의 남은 몫은 돌려받지 않는다(2486 가). 집세 정하기
// (residence_rent)는 그 건물 주인만 — 다음 기간부터 든다.
import type { ResidenceRentResultCode, ResidenceResultCode } from "@terra/protocol";
import type { ResidenceBuildingView, ResidenceFloorQuote, ResidenceResponse } from "@terra/shared/residence";
import type { QueryPool } from "../world/persist/load.ts";
import type { ResidenceBook } from "./book.ts";
import {
  type RentPayer,
  type RentTable,
  chargeResidence,
  deleteResidenceRent,
  saveResidenceRent,
} from "./rent.ts";
import { deleteResidence, saveResidence } from "./store.ts";

export type ResidenceCommandResult =
  | {
      readonly ok: true;
      readonly unitId: number;
      readonly buildingId: number | null;
      readonly cityId: number | null;
    }
  | { readonly ok: false; readonly code: ResidenceResultCode };

export type ResidenceRentCommandResult =
  | { readonly ok: true; readonly buildingId: number; readonly rent: bigint | null }
  | { readonly ok: false; readonly code: ResidenceRentResultCode };

export interface ResidenceService {
  /** 내 유닛의 사는 곳을 고른다(buildingId null = 고른 것 풀기) */
  set(userId: string, unitId: number, buildingId: number | null): Promise<ResidenceCommandResult>;
  /** 내 주거 건물의 한 기간 집세를 정한다(null = 세를 놓지 않음) */
  setRent(userId: string, buildingId: number, rent: bigint | null): Promise<ResidenceRentCommandResult>;
  /** 내 유닛의 지금 사는 곳과(건물을 주면) 그 건물을 고를 수 있나 */
  view(userId: string, unitId: number, buildingId: number | undefined, nowMs: number): ResidenceResponse;
}

/** 집세·층 자료(attach.ts가 건물 서비스·설정 칸으로 만든다). 없으면 집세 없음(시험 — 내 집·숙소만) */
export interface ResidenceExtras {
  readonly rents: RentTable;
  readonly payer: RentPayer;
  /** 건물 주인·주거·다 지음(집세 정하기 판정 — 없으면 undefined) */
  buildingFacts(
    buildingId: number,
  ): { readonly ownerId: number | null; readonly living: boolean; readonly level: number } | undefined;
  /** 층 수·최고 층·정원(주거 건물이 아니면 undefined) */
  floorsOf(
    buildingId: number,
  ): { readonly floors: number; readonly maxFloors: number; readonly capacity: number } | undefined;
  /** 층 올리기 견적(그 주인 것일 때 — 아니면 null) */
  floorQuote(buildingId: number, ownerId: number): ResidenceFloorQuote | null;
}

const fail = (code: ResidenceResultCode): ResidenceCommandResult => ({ ok: false, code });
const rentFail = (code: ResidenceRentResultCode): ResidenceRentCommandResult => ({ ok: false, code });

export function createResidenceService(o: {
  readonly book: ResidenceBook;
  /** 없으면 메모리만(시험) */
  readonly pool?: QueryPool | undefined;
  /** 사용자 → 소유 주체(없으면 undefined) */
  ownerOf(userId: string): number | undefined;
  /** 유닛 주인(2차맵에 없으면 undefined) */
  unitOwner(unitId: number): number | undefined;
  readonly now: () => number;
  readonly extras?: ResidenceExtras | undefined;
}): ResidenceService {
  /** 같은 유닛 고르기는 차례대로(DB 쓰기와 메모리가 어긋나지 않게) */
  let chain: Promise<unknown> = Promise.resolve();
  const queue = <T>(task: () => Promise<T>): Promise<T> => {
    const run = chain.then(task);
    chain = run.catch(() => undefined);
    return run;
  };
  const mine = (userId: string, unitId: number): number | undefined => {
    const ownerId = o.ownerOf(userId);
    return ownerId !== undefined && o.unitOwner(unitId) === ownerId ? ownerId : undefined;
  };

  const setNow = async (
    userId: string,
    unitId: number,
    buildingId: number | null,
  ): Promise<ResidenceCommandResult> => {
    const ownerId = mine(userId, unitId);
    if (ownerId === undefined) return fail("unknown_unit");
    const before = o.book.choiceOf(unitId);
    if (buildingId === null) {
      if (!before) return fail("unchanged");
      if (o.pool) await deleteResidence(o.pool, unitId);
      o.book.remove(unitId);
      return { ok: true, unitId, buildingId: null, cityId: null };
    }
    const block = o.book.blockOf(unitId, ownerId, buildingId);
    if (block !== null) return fail(block);
    if (before?.buildingId === buildingId && before.ownerId === ownerId && o.book.chosenPlace(unitId))
      return fail("unchanged");
    const at = o.now();
    // 내는 길(D-591 2): 같은 집을 미리 낸 기간 안에 다시 고르면(쉬다가 돌아옴) 그 기간을 그대로 쓴다
    const kind = o.book.payKindOf(unitId, ownerId, buildingId);
    const extras = o.extras;
    const keep = o.book.prepaidAt(unitId, buildingId, at);
    const charge = !keep && kind !== null && kind !== "own" ? kind : null;
    let paidUntilMs: number | null = keep ? (before?.paidUntilMs ?? null) : null;
    if (charge !== null) {
      // 돈을 먼저 확인하고(쓰기 전) 표를 쓴 뒤 걷는다 — 표 쓰기가 실패하면 돈은 그대로
      const price = extras?.payer.priceOf(unitId, buildingId, charge);
      if (!extras || price === undefined) return fail("not_eligible");
      if (extras.payer.purseBalance(ownerId, unitId) < price) return fail("insufficient_funds");
      paidUntilMs = at + Math.max(1, Math.trunc(extras.payer.periodMs()));
    }
    const choice = { unitId, ownerId, buildingId, chosenAtMs: at, paidUntilMs };
    if (o.pool) await saveResidence(o.pool, choice);
    if (charge !== null && extras) {
      const charged = chargeResidence(extras.payer, { ownerId, unitId, buildingId, kind: charge, atMs: at });
      if (!charged.ok) {
        // 표를 쓴 사이 지갑이 줄었다 — 낸 기간 없이 적고(쉰다) 다음 훑기가 다시 걷는다
        const unpaid = { ...choice, paidUntilMs: null };
        if (o.pool) await saveResidence(o.pool, unpaid);
        o.book.put(unpaid);
        return fail(charged.code);
      }
    }
    o.book.put(choice);
    return { ok: true, unitId, buildingId, cityId: o.book.chosenPlace(unitId)?.cityId ?? null };
  };

  const setRentNow = async (
    userId: string,
    buildingId: number,
    rent: bigint | null,
  ): Promise<ResidenceRentCommandResult> => {
    const extras = o.extras;
    const ownerId = o.ownerOf(userId);
    if (!extras || ownerId === undefined) return rentFail("busy");
    const facts = extras.buildingFacts(buildingId);
    if (!facts || facts.level < 1) return rentFail("unknown_building");
    if (!facts.living) return rentFail("not_housing");
    if (facts.ownerId !== ownerId) return rentFail("forbidden");
    const current = extras.rents.rentOf(buildingId, ownerId);
    if (current === rent) return rentFail("unchanged");
    if (rent === null) {
      if (o.pool) await deleteResidenceRent(o.pool, buildingId);
      extras.rents.remove(buildingId);
    } else {
      const row = { buildingId, ownerId, rent, setAtMs: o.now() };
      if (o.pool) await saveResidenceRent(o.pool, row);
      extras.rents.put(row);
    }
    return { ok: true, buildingId, rent };
  };

  const buildingView = (ownerId: number, unitId: number, buildingId: number): ResidenceBuildingView => {
    const block = o.book.blockOf(unitId, ownerId, buildingId);
    const extras = o.extras;
    if (!extras) return { buildingId, block };
    const facts = extras.buildingFacts(buildingId);
    const floors = extras.floorsOf(buildingId);
    const rent = extras.rents.rentOf(buildingId, facts?.ownerId ?? null);
    const kind = block === null ? o.book.payKindOf(unitId, ownerId, buildingId) : null;
    const price =
      kind === null ? undefined : kind === "own" ? 0n : extras.payer.priceOf(unitId, buildingId, kind);
    const isMine = facts?.ownerId === ownerId;
    return {
      buildingId,
      block,
      ...floors,
      occupants: o.book.occupants(buildingId),
      rent: rent === null ? null : rent.toString(),
      mine: isMine,
      payKind: price === undefined ? null : kind,
      price: price === undefined ? null : price.toString(),
      floor: isMine ? extras.floorQuote(buildingId, ownerId) : null,
    };
  };

  return {
    set: (userId, unitId, buildingId) => queue(() => setNow(userId, unitId, buildingId)),
    setRent: (userId, buildingId, rent) => queue(() => setRentNow(userId, buildingId, rent)),
    view(userId, unitId, buildingId, nowMs) {
      const ownerId = mine(userId, unitId);
      if (ownerId === undefined)
        return { status: "unknown_unit", unitId, current: null, building: null, generatedAt: nowMs };
      const choice = o.book.choiceOf(unitId);
      return {
        status: "ok",
        unitId,
        current: o.book.residenceOf(unitId) ?? null,
        building: buildingId === undefined ? null : buildingView(ownerId, unitId, buildingId),
        ...(o.extras ? { periodMs: Math.max(1, Math.trunc(o.extras.payer.periodMs())) } : {}),
        choice: choice
          ? {
              buildingId: choice.buildingId,
              paidUntilMs: choice.paidUntilMs ?? null,
              paused: o.book.chosenPlace(unitId) === undefined,
            }
          : null,
        generatedAt: nowMs,
      };
    },
  };
}
