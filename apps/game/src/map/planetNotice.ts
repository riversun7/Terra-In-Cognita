// 1차맵 화면 가운데 안내 — 받기 단계·타일 실패·엔진 상태 중 지금 가장 중요한 것 하나(순수 함수, PlanetMapScreen.tsx에서 나눴다)
import type { PlanetStatus } from "@terra/engine/planet";
import { m } from "../paraglide/messages.js";
import type { PlanetFailure } from "./planetSource.ts";
import { planetFailureText } from "./planetText.ts";

/** 목록 정보 받기 단계 */
export type LoadPhase =
  /** 목록 정보를 받는 중 */
  | { kind: "manifest" }
  /** 서버가 굽는 중(다시 묻기까지 ms) */
  | { kind: "generating"; retryInMs: number }
  /** 목록 정보 요청이 너무 많다(429, 다시 묻기까지 ms) */
  | { kind: "rate_limited"; retryInMs: number }
  /** 엔진을 만들었다(그 뒤 상태는 엔진 status) */
  | { kind: "ready" }
  | { kind: "failed"; reason: PlanetFailure };

/** 화면이 알아야 할 타일 실패(그 밖의 실패는 엔진이 저절로 다시 받는다) */
export type TileProblem = Extract<PlanetFailure, "sign_in" | "not_found">;

export interface Notice {
  tone: "status" | "alert";
  lines: string[];
  retry: boolean;
}

/** 가운데 안내 — 받기 단계·타일 실패·엔진 상태 중 지금 가장 중요한 것 하나 */
export function screenNotice(
  load: LoadPhase,
  tiles: TileProblem | null,
  status: PlanetStatus,
): Notice | null {
  if (load.kind === "failed") {
    return { tone: "alert", lines: [m.planet_failed(), planetFailureText(load.reason)], retry: true };
  }
  if (status.kind === "unsupported") return { tone: "alert", lines: [m.map_unsupported()], retry: false };
  if (status.kind === "error") return { tone: "alert", lines: [m.map_error()], retry: false };
  if (tiles === "sign_in") return { tone: "alert", lines: [m.map_code_sign_in_required()], retry: false };
  if (tiles === "not_found") return { tone: "alert", lines: [m.planet_tiles_outdated()], retry: true };
  if (load.kind === "manifest") return { tone: "status", lines: [m.planet_manifest_loading()], retry: false };
  if (load.kind === "generating" || load.kind === "rate_limited") {
    const seconds = Math.max(1, Math.round(load.retryInMs / 1000));
    const line =
      load.kind === "generating" ? m.planet_generating({ seconds }) : m.planet_rate_limited({ seconds });
    return { tone: "status", lines: [line], retry: false };
  }
  switch (status.kind) {
    case "loading":
      return { tone: "status", lines: [m.planet_preparing()], retry: false };
    case "context-lost":
      return { tone: "status", lines: [m.map_context_lost()], retry: false };
    case "ready":
      return null;
    default: {
      const unhandled: never = status;
      return unhandled;
    }
  }
}
