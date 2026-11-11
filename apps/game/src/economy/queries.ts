// 경제 화면 자료 받기 — tRPC economy.*(조회만). 화면 밖 저장소(useSyncExternalStore)라 효과 안에서 setState하지 않는다.
// - 조회마다 저장소 하나, 열쇠 = (시안 자료 여부, 매개변수). 같은 열쇠는 받는 중이면 함께 기다리고, 30초 안에 받은 값은 다시 받지 않는다.
//   받는 중에 다시 받으라고 하면(명령이 이어질 때) 끝난 뒤 한 번 더 받는다(앞 답이 명령 전 값일 수 있다).
// - 칸을 옮겨도 받은 값이 남는다(경제 조각이 살아 있는 동안). 시안 자료를 켜고 끄면 열쇠가 바뀌어 새로 받는다.
// - 실패는 값으로 둔다(문구 키는 net/apiErrors.ts). 로그인이 끝났으면 세션을 다시 확인한다.
// 이 모듈은 경제 지연 조각에만 들어간다(tRPC 클라이언트가 첫 화면에 들어가지 않게, ADR 37 11절).
import type {
  EconomyCatalogResponse,
  EconomyCityNamesResponse,
  EconomyExchangeResponse,
  EconomyHoldingsResponse,
  EconomyOrdersResponse,
  EconomyProductionResponse,
  MarketBookResponse,
  MarketCitiesResponse,
  MarketItemsResponse,
} from "@terra/shared/economy";
import type { FacilitiesOverviewResponse, FacilityWaterMaskResponse } from "@terra/shared/facilities";
import type { LaborJobsResponse, LaborOverviewResponse } from "@terra/shared/labor";
import type { RecruitBoardResponse } from "@terra/shared/recruit";
import type { RuinsOverviewResponse } from "@terra/shared/ruins";
import type { TempleOverviewResponse } from "@terra/shared/temple";
import { useEffect, useSyncExternalStore } from "react";
import { refreshSession } from "../auth/session.ts";
import { usePreviewOn } from "../inbox/preview.ts";
import { api } from "../net/api.ts";
import { apiErrorInfo } from "../net/apiErrors.ts";
import type { PlainMessageKey } from "../ui/messageRef.ts";

/** 받은 값을 다시 받지 않는 시간 */
const FRESH_MS = 30_000;
/** 응답을 기다리는 상한 */
const TIMEOUT_MS = 10_000;

export interface QueryView<T> {
  readonly status: "idle" | "loading" | "ready" | "failed";
  readonly data: T | null;
  readonly error: PlainMessageKey | null;
  /** 받은 기기 시각(서버 시각 generatedAt과 견줘 지난 시간을 셈한다). 아직 없으면 0 */
  readonly receivedAt: number;
}

interface Entry<T> {
  view: QueryView<T>;
  fetchedAt: number;
  inflight: boolean;
  /** 받는 동안 새로 받으라는 요청이 왔다(명령이 이어지면 끝난 뒤 한 번 더 받는다 — 앞 요청의 답이 바뀌기 전 값일 수 있다) */
  again: boolean;
}

const IDLE: QueryView<never> = { status: "idle", data: null, error: null, receivedAt: 0 };

/** 저장소 열쇠 = 시안 자료 여부 + 매개변수 */
function keyOf(args: readonly string[], preview: boolean): string {
  return `${preview ? "p" : "o"}|${args.join("|")}`;
}

/** 조회 하나의 저장소. args = 매개변수(ID 글자, "|"가 없다) */
function createQuery<T>(
  load: (args: readonly string[], preview: boolean, signal: AbortSignal) => Promise<T>,
) {
  const entries = new Map<string, Entry<T>>();
  const listeners = new Set<() => void>();
  const emit = (): void => {
    for (const listener of listeners) listener();
  };
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const fetchKey = (key: string, force: boolean): void => {
    const [mode = "o", ...args] = key.split("|");
    const existing = entries.get(key);
    if (existing?.inflight) {
      if (force) existing.again = true;
      return;
    }
    if (existing && !force && Date.now() - existing.fetchedAt < FRESH_MS) return;
    const entry: Entry<T> = existing ?? {
      view: { status: "loading", data: null, error: null, receivedAt: 0 },
      fetchedAt: 0,
      inflight: true,
      again: false,
    };
    /** 받는 동안 다시 받으라는 요청이 있었으면 한 번 더 */
    const follow = (): void => {
      if (!entry.again) return;
      entry.again = false;
      fetchKey(key, true);
    };
    entry.inflight = true;
    // 다시 받는 동안 앞 값을 그대로 보인다
    if (existing)
      entry.view = { ...existing.view, status: existing.view.data === null ? "loading" : "ready" };
    entries.set(key, entry);
    emit();
    load(args, mode === "p", AbortSignal.timeout(TIMEOUT_MS)).then(
      (data) => {
        entry.inflight = false;
        entry.fetchedAt = Date.now();
        entry.view = { status: "ready", data, error: null, receivedAt: entry.fetchedAt };
        emit();
        follow();
      },
      (error: unknown) => {
        const info = apiErrorInfo(error);
        if (info.sessionEnded) void refreshSession();
        entry.inflight = false;
        entry.fetchedAt = 0;
        entry.view = {
          status: "failed",
          data: entry.view.data,
          error: info.key,
          receivedAt: entry.view.receivedAt,
        };
        emit();
        follow();
      },
    );
  };

  /** 화면에서 쓰기. args가 null이면 받지 않는다 */
  function useQuery(args: readonly string[] | null): QueryView<T> & { refresh: () => void } {
    const preview = usePreviewOn();
    const key = args === null ? null : keyOf(args, preview);
    const view = useSyncExternalStore(subscribe, () =>
      key === null ? IDLE : (entries.get(key)?.view ?? IDLE),
    );
    useEffect(() => {
      if (key !== null) fetchKey(key, false);
    }, [key]);
    return {
      ...view,
      refresh: () => {
        if (key !== null) fetchKey(key, true);
      },
    };
  }
  /** 이 조회의 받아 둔 값을 모두 다시 받는다(다른 칸의 명령이 이 자료를 바꿨을 때 — 예: 건물을 지으면 신전 칸) */
  const refreshAll = (): void => {
    for (const key of entries.keys()) fetchKey(key, true);
  };
  return Object.assign(useQuery, { refreshAll });
}

/** 시안 자료면 { preview: true }, 아니면 입력 없음 */
const previewInput = (preview: boolean) => (preview ? { preview: true } : undefined);

export const useCatalog = createQuery<EconomyCatalogResponse>((_args, _preview, signal) =>
  api.economy.catalog.query(undefined, { signal }),
);
/** 도시 이름(실제 자료만 — 구인·노동·건물·신전 칸의 도시 표시, cityText.ts) */
export const useCityNames = createQuery<EconomyCityNamesResponse>((_args, _preview, signal) =>
  api.economy.cityNames.query(undefined, { signal }),
);
export const useHoldings = createQuery<EconomyHoldingsResponse>((_args, preview, signal) =>
  api.economy.holdings.query(previewInput(preview), { signal }),
);
export const useProduction = createQuery<EconomyProductionResponse>((_args, preview, signal) =>
  api.economy.production.query(previewInput(preview), { signal }),
);
export const useMarketItems = createQuery<MarketItemsResponse>((_args, preview, signal) =>
  api.economy.marketItems.query(previewInput(preview), { signal }),
);
export const useMarketCities = createQuery<MarketCitiesResponse>(([item = ""], preview, signal) =>
  api.economy.marketCities.query({ item, ...(preview ? { preview: true } : {}) }, { signal }),
);
export const useMarketBook = createQuery<MarketBookResponse>(([item = "", city = ""], preview, signal) =>
  api.economy.marketBook.query({ item, city, ...(preview ? { preview: true } : {}) }, { signal }),
);
export const useOrders = createQuery<EconomyOrdersResponse>((_args, preview, signal) =>
  api.economy.orders.query(previewInput(preview), { signal }),
);
export const useExchange = createQuery<EconomyExchangeResponse>((_args, preview, signal) =>
  api.economy.exchange.query(previewInput(preview), { signal }),
);

/** 노동 계약(실제 자료만, 시안 자료 없음 — docs/adr/2026-11-03-labor-contracts.md) */
export const useLabor = createQuery<LaborOverviewResponse>((_args, _preview, signal) =>
  api.labor.overview.query(undefined, { signal }),
);
/** 구인 게시판. args = [도시 ID 글자 또는 ""(모든 도시)] */
export const useLaborJobs = createQuery<LaborJobsResponse>(([city = ""], _preview, signal) =>
  api.labor.jobs.query(city === "" ? undefined : { cityId: Number(city) }, { signal }),
);

/** 건물(짓기·레벨업·노화·수리, docs/adr/2026-11-07-buildings-runtime.md) */
export const useFacilities = createQuery<FacilitiesOverviewResponse>((_args, _preview, signal) =>
  api.facilities.overview.query(undefined, { signal }),
);
/** 2차맵 물 표(짓기 폼의 물가 조건 미리 보기, 질문 947 나). args = [2차맵 키 글자] */
export const useWaterMask = createQuery<FacilityWaterMaskResponse>(([mapKey = "0"], _preview, signal) =>
  api.facilities.waterMask.query({ mapKey: Number(mapKey) }, { signal }),
);

/** 신전·생명과학 연구소(비활성 휴먼 환생·신격화·유전자 변환, D-517 — docs/adr/2026-11-07-temple-religion.md) */
export const useTemple = createQuery<TempleOverviewResponse>((_args, _preview, signal) =>
  api.temple.overview.query(undefined, { signal }),
);

/** 폐허 복원(정부를 먼저 지은 쪽이 주인 → 복원 사업 모금, D-510 — docs/adr/2026-11-07-ruins-restoration.md) */
export const useRuins = createQuery<RuinsOverviewResponse>((_args, _preview, signal) =>
  api.ruins.overview.query(undefined, { signal }),
);

/**
 * 정부기관 구인 카드(D-469, 고용은 WebSocket recruit_hire — docs/adr/2026-11-07-play-flow.md "WP3 플레이어 생산"). args = [도시 ID 글자 또는
 * ""(내 시작 도시)]
 */
export const useRecruitBoard = createQuery<RecruitBoardResponse>(([city = ""], _preview, signal) =>
  api.recruit.board.query(city === "" ? undefined : { cityId: Number(city) }, { signal }),
);

/** 매개변수 없는 조회의 args(같은 배열을 넘겨 열쇠가 그대로이게) */
export const NO_ARGS: readonly string[] = [];

const tickListeners = new Set<() => void>();
let tickTimer: ReturnType<typeof setInterval> | undefined;
let tickNow = Date.now();

function subscribeTick(listener: () => void): () => void {
  tickListeners.add(listener);
  if (tickTimer === undefined) {
    // 처음 쓰는 화면: 모듈을 읽은 때가 아니라 지금 시각에서 시작한다(바뀐 값을 React가 다시 읽는다)
    tickNow = Date.now();
    tickTimer = setInterval(() => {
      tickNow = Date.now();
      for (const each of tickListeners) each();
    }, 1000);
  }
  return () => {
    tickListeners.delete(listener);
    if (tickListeners.size === 0 && tickTimer !== undefined) {
      clearInterval(tickTimer);
      tickTimer = undefined;
    }
  };
}

/** 1초마다 바뀌는 기기 시각(남은 시간 글용). 쓰는 화면이 없으면 타이머를 멈춘다 */
export function useNowTick(): number {
  return useSyncExternalStore(subscribeTick, () => tickNow);
}
