// 랭킹 서비스 — 집계 일정(런타임)과 조회(tRPC ranking.board·ranking.mine, 사이보그 화면 랭킹 칸). docs/adr/2026-11-07-ranking.md.
// - 런타임: 1분마다 경계가 지났는지 보고(월드가 준비된 뒤), 쓰기 대기열이 빈 뒤 집계한다(복귀 요약과 같은 읽는 차례).
//   켜진 직후에도 한 번 본다(처음이면 바로 앞 기간을 센다). 집계는 한 번에 하나만 돈다.
// - 조회: 마지막 집계 표를 읽는다. 시안(dev·admin)이면 고정 시안 자료. DB가 없으면 빈 판(집계 전).
// - 설정 칸(ranking_*)은 부를 때마다 실효 값을 읽는다(덮어쓰기가 다음 집계·다음 조회부터 든다).
import type { CyborgRanking } from "@terra/shared/roster";
import type {
  RankingBoardKey,
  RankingBoardRequest,
  RankingBoardResponse,
  RankingMineResponse,
  RankingPathInfo,
} from "@terra/shared/ranking";
import { type RankingCoefficients, TEST_RANKING_COEFFICIENTS } from "@terra/sim";
import type { HomeQuery, Viewer } from "../trpc/context.ts";
import type { NationNames } from "./paths.ts";
import { previewBoard, previewMine } from "./preview.ts";
import { type RankingReadContext, readBoard, readMine, readMyStandings, viewerSubjects } from "./reads.ts";
import { type RankingPool, type SnapshotReport, runSnapshot } from "./snapshot.ts";

export interface RankingServices {
  /** 판 하나. 경로를 비우면 고른다(resolveBoard) */
  board(viewer: Viewer, request: RankingBoardRequest, query: HomeQuery): Promise<RankingBoardResponse>;
  mine(viewer: Viewer, query: HomeQuery): Promise<RankingMineResponse>;
  /** 사이보그 화면 랭킹 칸(질문 134 가: 점수 있는 경로만, 점수 높은 순). 시안은 roster 시안 본체가 맡는다 */
  cyborgRankings(userId: string): Promise<CyborgRanking[]>;
}

/**
 * 판 요청 → 판. 경로가 비었으면 내 점수가 가장 높은 경로(best), 없으면 연 경로의 첫째, 연 경로가 없으면 빈 ID(unknown)
 */
export async function resolveBoard(
  request: RankingBoardRequest,
  paths: readonly RankingPathInfo[],
  best: () => Promise<string | null>,
): Promise<RankingBoardKey> {
  if (request.kind === "faction") return { kind: "faction" };
  const path = request.path ?? (await best()) ?? paths.find((entry) => entry.open)?.id ?? "";
  return request.kind === "house" ? { kind: "house", path } : { kind: "path", path };
}

export interface RankingServiceOptions {
  /** 랭킹 표를 읽는 DB(없으면 빈 판) */
  readonly db?: RankingReadContext["db"] | undefined;
  readonly paths: readonly RankingPathInfo[];
  readonly nations?: NationNames | undefined;
  /** 설정 칸 실효 값(부를 때마다). 없으면 sim 시험 계수 */
  readonly coefficients?: (() => RankingCoefficients) | undefined;
}

export function createRankingServices(options: RankingServiceOptions): RankingServices {
  const coefficients = options.coefficients ?? (() => TEST_RANKING_COEFFICIENTS);
  const nations = options.nations ?? new Map();
  const contextOf = (): RankingReadContext | null =>
    options.db ? { db: options.db, paths: options.paths, nations, coefficients: coefficients() } : null;
  return {
    async board(viewer, request, query) {
      const ctx = contextOf();
      const board = await resolveBoard(request, options.paths, async () => {
        if (!ctx || query.preview) return null;
        const me = await viewerSubjects(ctx.db, viewer.id);
        return (await readMyStandings(ctx, me.ownerId))[0]?.path ?? null;
      });
      if (query.preview) return previewBoard(board, options.paths, coefficients(), query.now);
      if (ctx) return readBoard(ctx, viewer.id, board, query.now);
      const path =
        board.kind === "faction" ? undefined : options.paths.find((entry) => entry.id === board.path);
      const status = board.kind === "faction" || path?.open === true ? "ready" : path ? "closed" : "unknown";
      return {
        generatedAt: query.now,
        preview: false,
        snapshot: null,
        paths: options.paths,
        board,
        status,
        total: 0,
        rows: [],
        me: null,
        renown: null,
        tiers: coefficients()
          .tiersPm.toSorted((a, b) => a - b)
          .map((tierPm) => ({ tierPm, minScore: null })),
      };
    },
    async mine(viewer, query) {
      if (query.preview) return previewMine(options.paths, coefficients(), query.now);
      const ctx = contextOf();
      if (ctx) return readMine(ctx, viewer.id, query.now);
      return {
        generatedAt: query.now,
        preview: false,
        snapshot: null,
        paths: options.paths,
        standings: [],
        faction: null,
        renown: null,
      };
    },
    async cyborgRankings(userId) {
      const ctx = contextOf();
      if (!ctx) return [];
      const me = await viewerSubjects(ctx.db, userId);
      const standings = await readMyStandings(ctx, me.ownerId);
      const names = new Map(ctx.paths.map((path) => [path.id, path.name]));
      return standings.flatMap(({ path, standing }) =>
        standing === null
          ? []
          : [
              {
                path,
                name: names.get(path) ?? { ko: path, en: path },
                rank: standing.rank,
                tierPercent: standing.tierPm === null ? 100 : standing.tierPm / 10,
                score: standing.score,
              },
            ],
      );
    },
  };
}

/** 집계를 보는 간격 */
export const RANKING_TICK_MS = 60_000;

export interface RankingRuntime {
  /** 일정 시작(켜진 직후 한 번 + 1분마다) */
  start(): void;
  stop(): Promise<void>;
  /** 지금 경계가 지났으면 센다(시험·운영 확인용). 센 것이 없으면 null */
  tick(): Promise<SnapshotReport | null>;
}

export function createRankingRuntime(options: {
  readonly pool: RankingPool;
  readonly paths: readonly RankingPathInfo[];
  readonly coefficients: () => RankingCoefficients;
  readonly creditAsset: string;
  readonly now: () => number;
  /** 월드가 준비됐는가(부팅 복구 전에는 세지 않는다) */
  readonly ready: () => boolean;
  /** 쓰기 대기열이 DB에 닿을 때까지(세계 바뀜을 다 본 뒤 센다) */
  readonly durable: () => Promise<void>;
  readonly log: {
    info(obj: object, message: string): void;
    warn(obj: object, message: string): void;
  };
  readonly intervalMs?: number | undefined;
}): RankingRuntime {
  let timer: ReturnType<typeof setInterval> | undefined;
  let running: Promise<SnapshotReport | null> | null = null;
  let stopped = false;

  const run = async (): Promise<SnapshotReport | null> => {
    if (stopped || !options.ready()) return null;
    await options.durable();
    const started = Date.now();
    const report = await runSnapshot(options.pool, {
      paths: options.paths,
      coefficients: options.coefficients(),
      creditAsset: options.creditAsset,
      nowMs: options.now(),
    });
    if (report) options.log.info({ ...report, ms: Date.now() - started }, "ranking snapshot");
    return report;
  };

  const tick = (): Promise<SnapshotReport | null> => {
    if (running) return running;
    running = run().finally(() => {
      running = null;
    });
    return running;
  };

  const safeTick = (): void => {
    void tick().catch((error: unknown) => options.log.warn({ err: error }, "ranking snapshot failed"));
  };

  return {
    start() {
      if (timer || stopped) return;
      safeTick();
      timer = setInterval(safeTick, options.intervalMs ?? RANKING_TICK_MS);
      timer.unref();
    },
    async stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = undefined;
      await running?.catch(() => null);
    },
    tick,
  };
}
