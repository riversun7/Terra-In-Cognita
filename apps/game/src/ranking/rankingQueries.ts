// 랭킹 조회(tRPC ranking.board·ranking.mine) — 랭킹 화면·세력 화면 랭킹 칸 조각에만 들어간다. 실패는 값으로 돌려준다.
import type { RankingBoardRequest, RankingBoardResponse, RankingMineResponse } from "@terra/shared/ranking";
import { api } from "../net/api.ts";
import { type QueryResult, SCREEN_QUERY_TIMEOUT_MS, queryFailure } from "../sections/queryStore.ts";

export async function loadRankingBoard(
  board: RankingBoardRequest,
  preview: boolean,
): Promise<QueryResult<RankingBoardResponse>> {
  try {
    const data = await api.ranking.board.query(preview ? { board, preview: true } : { board }, {
      signal: AbortSignal.timeout(SCREEN_QUERY_TIMEOUT_MS),
    });
    return { ok: true, data };
  } catch (error) {
    return queryFailure(error);
  }
}

export async function loadRankingMine(preview: boolean): Promise<QueryResult<RankingMineResponse>> {
  try {
    const data = await api.ranking.mine.query(preview ? { preview: true } : undefined, {
      signal: AbortSignal.timeout(SCREEN_QUERY_TIMEOUT_MS),
    });
    return { ok: true, data };
  } catch (error) {
    return queryFailure(error);
  }
}
