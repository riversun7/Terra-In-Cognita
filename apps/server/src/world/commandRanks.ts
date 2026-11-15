// 지휘 계급 읽기 — 기획 D-558(사용자 1543·1544 "전투계열 랭킹이나 해당국가 작위로 지휘가능한 분대수가 정해짐(군대 계급처럼)", 1545 승계 순서),
// docs/adr/2026-10-31-combat-core.md "바뀜 (D-558)". 세계 전투 시작 사양의 몸(battleBodies.ts)이 사이보그 본체의 지휘 계급을 읽는다.
// - 전투 계열 랭킹 = 팩 랭킹 경로 가운데 영역 force(정복자·용병 등)의 마지막 집계 등급(ranking_path_scores.tier_pm) 가운데 가장 위 등급.
//   등급 번호는 지금 설정 칸의 등급 문턱(ranking_tier_*) 차례(0 = 가장 위). 등급 밖·집계 전이면 null.
// - 국가 작위(D-326)는 서버에 아직 없다 → 모두 0(민간인)이다(질문 1961).
// - 판 읽기는 비동기라 메모리 표를 둔다: 읽을 때 표가 COMMAND_RANK_TTL_MS보다 오래됐으면 뒤에서 다시 읽고(한 번에 하나), 그동안은 옛 표를 쓴다.
//   첫 읽기 전에는 계급 없음(아래 끝 정원). 랭킹 집계 주기(하루)보다 충분히 짧다.
// 사이보그가 아닌 세계 유닛(휴먼·봇)은 계급이 없다(칸 없음).
import { type CommandRank, combatTierIndex } from "@terra/sim";
import type { CyborgService } from "../cyborg/service.ts";
import type { QueryPool } from "./persist/load.ts";

/** 메모리 표를 다시 읽기까지(ms) */
export const COMMAND_RANK_TTL_MS = 10 * 60_000;

export interface CommandRankSource {
  /** 세계 유닛의 지휘 계급(사이보그 본체만, 없으면 undefined) */
  readonly rankOf: (unitId: number) => CommandRank | undefined;
  /** 판을 지금 다시 읽는다(시험·부팅) */
  readonly refresh: () => Promise<void>;
}

export function createCommandRanks(input: {
  readonly pool: QueryPool | undefined;
  readonly cyborgs: Pick<CyborgService, "userOfUnit">;
  /** 전투 계열(영역 force) 랭킹 경로 ID */
  readonly paths: readonly string[];
  /** 지금 설정 칸 등급 문턱(‰) */
  readonly tiersPm: () => readonly number[];
  readonly now: () => number;
  readonly onError?: ((error: unknown) => void) | undefined;
}): CommandRankSource {
  /** 사용자 → 가장 위 등급 문턱(‰) */
  let tiers = new Map<string, number>();
  let readAtMs = Number.NEGATIVE_INFINITY;
  let reading: Promise<void> | null = null;
  const refresh = async (): Promise<void> => {
    if (!input.pool || input.paths.length === 0) return;
    const result = await input.pool.query(
      `select o.user_id::text as user_id, min(s.tier_pm)::int as tier_pm
         from ranking_path_scores s
         join world_owners o on o.id = s.owner_id
        where s.path_id = any($1::text[]) and s.tier_pm is not null and o.user_id is not null
        group by o.user_id`,
      [input.paths],
    );
    const next = new Map<string, number>();
    for (const row of result.rows)
      if (typeof row.user_id === "string") next.set(row.user_id, Number(row.tier_pm));
    tiers = next;
  };
  const kick = (): void => {
    if (reading || !input.pool) return;
    readAtMs = input.now();
    reading = refresh()
      .catch((error: unknown) => input.onError?.(error))
      .finally(() => {
        reading = null;
      });
  };
  return {
    rankOf: (unitId) => {
      const userId = input.cyborgs.userOfUnit(unitId);
      if (userId === undefined) return undefined;
      const nowMs = input.now();
      if (nowMs - readAtMs >= COMMAND_RANK_TTL_MS || nowMs < readAtMs) kick();
      const tierPm = tiers.get(userId);
      return { title: 0, combatTier: combatTierIndex(tierPm ?? null, input.tiersPm()) };
    },
    refresh: async () => {
      readAtMs = input.now();
      await refresh();
    },
  };
}

/** 월드가 쓰는 꼴: 설정(전투 계열 경로)·세력·사회 계수표(등급 문턱)에서 만든다 */
export function commandRankSource(input: {
  readonly pool: QueryPool | undefined;
  readonly cyborgs: Pick<CyborgService, "userOfUnit">;
  readonly config: { readonly combatRankingPaths?: readonly string[] | undefined };
  readonly rules: () => { readonly ranking: { readonly tiersPm: readonly number[] } };
  readonly now: () => number;
}): CommandRankSource {
  return createCommandRanks({
    pool: input.pool,
    cyborgs: input.cyborgs,
    paths: input.config.combatRankingPaths ?? [],
    tiersPm: () => input.rules().ranking.tiersPm,
    now: input.now,
  });
}
