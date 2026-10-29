// 2차맵 지형 받기 — 스냅샷이 알려 준 주소(버전이 붙은 불변 주소, 로그인 필요)를 같은 출처 쿠키로 받아 엔진 입력으로 바꾼다.
// 서버가 1년 캐시(private, immutable)를 붙이므로 다시 열 때는 브라우저 캐시에서 온다(ADR 2026-10-28-s1-second-map "전송").
// 실패는 이유 코드로 알린다(화면이 문구를 고른다). 문장은 화면에 쓰지 않는다.
import { decodeTerrain } from "@terra/protocol";
import type { TerrainInput } from "@terra/engine";
import { isSameOriginPath } from "../net/sameOrigin.ts";
import { toTerrainInput } from "./mapWire.ts";

export type TerrainFailure =
  /** 서버에 닿지 못함(오프라인 등) */
  | "network"
  /** 로그인이 풀림(401) */
  | "sign_in"
  /** 주소의 버전이 지금 서버와 다름·없는 2차맵(404) — 새 스냅샷의 주소로 다시 받는다 */
  | "not_found"
  /** 그 밖의 서버 오류 */
  | "server"
  /** 받은 자료를 읽지 못함(형식·크기) */
  | "invalid";

export class TerrainLoadError extends Error {
  override readonly name = "TerrainLoadError";
  readonly reason: TerrainFailure;

  constructor(reason: TerrainFailure, message: string) {
    super(message);
    this.reason = reason;
  }
}

/** 같은 출처의 경로만 받는다(net/sameOrigin.ts, 1차맵 타일 주소 틀과 같은 규칙) */
export { isSameOriginPath };

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export async function fetchTerrain(url: string, fetchImpl: FetchLike = fetch): Promise<TerrainInput> {
  if (!isSameOriginPath(url)) throw new TerrainLoadError("invalid", `terrain url is not a same-origin path`);
  let response: Response;
  try {
    response = await fetchImpl(url, { credentials: "same-origin" });
  } catch (error) {
    throw new TerrainLoadError("network", error instanceof Error ? error.message : String(error));
  }
  if (response.status === 401) throw new TerrainLoadError("sign_in", "terrain needs a signed-in session");
  if (response.status === 404) throw new TerrainLoadError("not_found", "terrain version not found");
  if (!response.ok) throw new TerrainLoadError("server", `terrain request failed: HTTP ${response.status}`);
  let bytes: ArrayBuffer;
  try {
    bytes = await response.arrayBuffer();
  } catch (error) {
    throw new TerrainLoadError("network", error instanceof Error ? error.message : String(error));
  }
  try {
    return toTerrainInput(decodeTerrain(bytes));
  } catch (error) {
    throw new TerrainLoadError("invalid", error instanceof Error ? error.message : String(error));
  }
}
