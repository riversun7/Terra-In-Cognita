// 2차맵 화면 가운데 안내 — 엔진 상태와 자료 상태 중 지금 가장 중요한 것 하나(순수 함수, SecondaryMapScreen.tsx에서 나눴다).
// 서버가 띄우지 않은 맵(unknown_map)은 다시 물어도 같아 [다시 시도] 없이 "아직 열려 있지 않습니다", 볼 수 없는 맵(not_visible)은 시야 규칙
// 그대로 까닭을 알린다. 둘 다 [1차맵에서 보기]로 1차맵 명령 흐름에 잇는다(docs/adr/2026-11-07-play-flow.md "WP7", 기획 정리 D-518 513).
import type { EngineStatus } from "@terra/engine";
import { m } from "../paraglide/messages.js";
import type { FeedStatus } from "./feedTypes.ts";
import { resultText, terrainFailureText } from "./mapMessages.ts";

export interface Notice {
  tone: "status" | "alert";
  lines: string[];
  /** [다시 시도]를 보인다 */
  retry: boolean;
  /** [1차맵에서 보기]를 보인다(열리지 않은 맵·볼 수 없는 맵) */
  planet?: boolean;
}

export function screenNotice(engine: EngineStatus, feed: FeedStatus): Notice | null {
  const { phase, terrain, hasSnapshot } = feed;
  if (engine.kind === "unsupported") return { tone: "alert", lines: [m.map_unsupported()], retry: false };
  if (engine.kind === "error") return { tone: "alert", lines: [m.map_error()], retry: false };
  if (phase.kind === "failed" && phase.code === "unknown_map") {
    return { tone: "alert", lines: [m.world_city_not_loaded()], retry: false, planet: true };
  }
  if (phase.kind === "failed" && phase.code === "not_visible") {
    return { tone: "alert", lines: [m.world_city_not_visible()], retry: true, planet: true };
  }
  if (phase.kind === "failed") {
    return { tone: "alert", lines: [m.map_feed_failed(), resultText(phase.code)], retry: true };
  }
  if (terrain.kind === "failed") {
    return {
      tone: "alert",
      lines: [m.map_terrain_failed(), terrainFailureText(terrain.reason)],
      retry: terrain.reason !== "render",
    };
  }
  if (engine.kind === "context-lost") return { tone: "status", lines: [m.map_context_lost()], retry: false };
  if (phase.kind === "offline") return { tone: "status", lines: [m.status_disconnected()], retry: false };
  if (phase.kind === "connecting") return { tone: "status", lines: [m.map_feed_connecting()], retry: false };
  if (phase.kind === "retrying" && !hasSnapshot) {
    return { tone: "status", lines: [resultText(phase.code), m.map_feed_retry_soon()], retry: false };
  }
  if (!hasSnapshot) return { tone: "status", lines: [m.map_feed_receiving()], retry: false };
  if (terrain.kind === "none" || terrain.kind === "loading") {
    return { tone: "status", lines: [m.map_terrain_loading()], retry: false };
  }
  if (engine.kind === "loading") return { tone: "status", lines: [m.map_preparing()], retry: false };
  return null;
}
