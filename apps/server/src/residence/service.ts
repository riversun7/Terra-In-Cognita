// 사는 곳 고르기·조회(서버 권위) — 사용자 답 D-585 1. 규칙은 book.ts, 메시지는 @terra/protocol residence.ts(WebSocket residence_set → residence_result —
// 채집 게이트웨이가 받아 넘긴다, gather/gateway.ts), 조회는 tRPC gather.residence(gather/reads.ts). 감사 기록은 남기지 않는다(돈이 움직이지 않는다 — 다음
// 주민세부터 고른 곳을 쓴다).
import type { ResidenceResultCode } from "@terra/protocol";
import type { ResidenceResponse } from "@terra/shared/residence";
import type { QueryPool } from "../world/persist/load.ts";
import type { ResidenceBook } from "./book.ts";
import { deleteResidence, saveResidence } from "./store.ts";

export type ResidenceCommandResult =
  | {
      readonly ok: true;
      readonly unitId: number;
      readonly buildingId: number | null;
      readonly cityId: number | null;
    }
  | { readonly ok: false; readonly code: ResidenceResultCode };

export interface ResidenceService {
  /** 내 유닛의 사는 곳을 고른다(buildingId null = 고른 것 풀기) */
  set(userId: string, unitId: number, buildingId: number | null): Promise<ResidenceCommandResult>;
  /** 내 유닛의 지금 사는 곳과(건물을 주면) 그 건물을 고를 수 있나 */
  view(userId: string, unitId: number, buildingId: number | undefined, nowMs: number): ResidenceResponse;
}

const fail = (code: ResidenceResultCode): ResidenceCommandResult => ({ ok: false, code });

export function createResidenceService(o: {
  readonly book: ResidenceBook;
  /** 없으면 메모리만(시험) */
  readonly pool?: QueryPool | undefined;
  /** 사용자 → 소유 주체(없으면 undefined) */
  ownerOf(userId: string): number | undefined;
  /** 유닛 주인(2차맵에 없으면 undefined) */
  unitOwner(unitId: number): number | undefined;
  readonly now: () => number;
}): ResidenceService {
  /** 같은 유닛 고르기는 차례대로(DB 쓰기와 메모리가 어긋나지 않게) */
  let chain: Promise<unknown> = Promise.resolve();
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
    const choice = { unitId, ownerId, buildingId, chosenAtMs: o.now() };
    if (o.pool) await saveResidence(o.pool, choice);
    o.book.put(choice);
    return { ok: true, unitId, buildingId, cityId: o.book.chosenPlace(unitId)?.cityId ?? null };
  };

  return {
    set(userId, unitId, buildingId) {
      const run = chain.then(() => setNow(userId, unitId, buildingId));
      chain = run.catch(() => undefined);
      return run;
    },
    view(userId, unitId, buildingId, nowMs) {
      const ownerId = mine(userId, unitId);
      if (ownerId === undefined)
        return { status: "unknown_unit", unitId, current: null, building: null, generatedAt: nowMs };
      return {
        status: "ok",
        unitId,
        current: o.book.residenceOf(unitId) ?? null,
        building:
          buildingId === undefined
            ? null
            : { buildingId, block: o.book.blockOf(unitId, ownerId, buildingId) },
        generatedAt: nowMs,
      };
    },
  };
}
