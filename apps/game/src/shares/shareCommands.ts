// 도시(정부) 지분 명령(WebSocket city_share_order·city_share_cancel → city_share_result)과 조회(tRPC shares.city·shares.hub) — 기획 D-583,
// docs/adr/2026-11-21-share-market.md. 게임 상태를 바꾸는 명령은 WebSocket으로만 보낸다. 보내고 같은 요청 번호의 답을 기다리는 틀은 가문 명령(request)과 같다.
import type { CityShareResultCode } from "@terra/protocol";
import type { CityShareMarketResponse, ShareHubResponse } from "@terra/shared/cityShares";
import { request } from "../faction/identity/houseCommands.ts";
import { api } from "../net/api.ts";
import { type ServerLink, serverLink } from "../net/serverLink.ts";

const REQUEST_TIMEOUT_MS = 10_000;

export type CityShareOutcome =
  | { readonly ok: true; readonly orderId?: number | undefined }
  | { readonly ok: false; readonly code: CityShareResultCode | "offline" | "timeout" };

export type CityShareRequest =
  | {
      readonly t: "city_share_order";
      readonly cityId: number;
      readonly side: "buy" | "sell";
      readonly price: string;
      readonly shares: string;
      readonly asHouse?: boolean;
    }
  | { readonly t: "city_share_cancel"; readonly orderId: number };

/** 도시 지분 명령 하나를 보내고 결과를 기다린다 */
export function sendCityShare(
  body: CityShareRequest,
  link: ServerLink = serverLink,
): Promise<CityShareOutcome> {
  return request<CityShareOutcome>(
    link,
    (id) => ({ ...body, id }),
    (message, id) => {
      if (message.t !== "city_share_result" || message.id !== id) return null;
      return message.ok ? { ok: true, orderId: message.orderId } : { ok: false, code: message.code };
    },
    (code) => ({ ok: false, code }),
  );
}

const withTimeout = (signal?: AbortSignal): AbortSignal => {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
};

/** 도시 하나의 지분 시장 */
export function loadCityShares(cityId: number, signal?: AbortSignal): Promise<CityShareMarketResponse> {
  return api.shares.city.query({ cityId }, { signal: withTimeout(signal) });
}

/** 증권 거래소 건물 판 */
export function loadShareHub(buildingId: number, signal?: AbortSignal): Promise<ShareHubResponse> {
  return api.shares.hub.query({ buildingId }, { signal: withTimeout(signal) });
}
