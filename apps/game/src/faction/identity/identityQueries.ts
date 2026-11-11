// 세력 정체성 조회·저장(tRPC factionIdentity) — 실패는 값으로 돌려준다(조회). 저장 오류는 부르는 쪽이 까닭을 읽는다(identityText rejectionOf).
import type { FactionIdentityInput, FactionIdentityMine } from "@terra/shared/factionIdentity";
import { api } from "../../net/api.ts";
import { type QueryResult, SCREEN_QUERY_TIMEOUT_MS, queryFailure } from "../../sections/queryStore.ts";

export async function loadIdentityMine(): Promise<QueryResult<FactionIdentityMine>> {
  try {
    const data = await api.factionIdentity.mine.query(undefined, {
      signal: AbortSignal.timeout(SCREEN_QUERY_TIMEOUT_MS),
    });
    return { ok: true, data };
  } catch (error) {
    return queryFailure(error);
  }
}

/** 그림(약 27만 글자)을 싣는 요청이라 조회보다 길게 기다린다 */
const SAVE_TIMEOUT_MS = 30_000;

export const saveIdentity = (input: FactionIdentityInput): Promise<FactionIdentityMine> =>
  api.factionIdentity.save.mutate(input, { signal: AbortSignal.timeout(SAVE_TIMEOUT_MS) });

export const checkIdentity = (name: string, shortName: string, signal: AbortSignal) =>
  api.factionIdentity.check.query({ name, shortName }, { signal });

export const dismissIdentityNotice = (): Promise<FactionIdentityMine> =>
  api.factionIdentity.dismissNotice.mutate(undefined, {
    signal: AbortSignal.timeout(SCREEN_QUERY_TIMEOUT_MS),
  });
