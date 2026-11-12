// 1차맵 자원 분포 지도 받기 — GET /api/planets/<행성 ID>/resources/<원자재>(공개 행성만, 로그인). ADR 2026-11-07-planet-view "바뀜 (2026-11-12)".
// 서버가 행성 값과 세계 설정 칸으로 셈한 칸 몫(@terra/shared/catchment cellSharesPm "supply"·highOrePm)을 받아 엔진 지도로 바꾼다.
// - 기기에서 셈하지 않는 까닭: 1차맵 타일에는 강수(mm)·칸 고도가 없어(습도·꼭짓점 높이만) 서버 경제와 같은 몫을 낼 수 없다.
// - 원자재를 고를 때 하나만 받는다(gzip 35~225KB, F9). 브라우저 캐시가 ETag로 다시 확인한다(같으면 304).
// - 굽는 중(409)이면 Retry-After 뒤 다시, 그 밖의 실패는 이유 코드(PlanetLoadError)로 거절한다.
import { type PlanetResourceMap, RESOURCE_MATERIALS } from "@terra/engine/planet";
import { decodePlanetResource, planetResourcePath } from "@terra/protocol/planetResource";
import type { CatchmentMaterial } from "@terra/shared/catchment";
import { PlanetLoadError, abortableSleep, retryAfterMs } from "./planetSource.ts";

/** 굽는 중일 때 Retry-After가 없으면 기다리는 시간(ms) */
const NOT_READY_WAIT_MS = 5000;
/** 굽는 중 다시 묻는 횟수 상한 */
const NOT_READY_TRIES = 24;

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** 자원 분포 지도를 받는다(signal이 멈추면 그 이유로 거절) */
export async function loadResourceMap(
  planetId: string,
  material: CatchmentMaterial,
  signal: AbortSignal,
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
): Promise<PlanetResourceMap> {
  for (let tries = 0; ; tries++) {
    let response: Response;
    try {
      response = await fetchImpl(planetResourcePath(planetId, material), {
        credentials: "same-origin",
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new PlanetLoadError("network", error instanceof Error ? error.message : String(error));
    }
    if (response.status === 409 && tries < NOT_READY_TRIES) {
      await abortableSleep(
        retryAfterMs(response.headers.get("retry-after"), Date.now()) ?? NOT_READY_WAIT_MS,
        signal,
      );
      continue;
    }
    if (!response.ok) {
      const reason =
        response.status === 401
          ? "sign_in"
          : response.status === 404
            ? "not_found"
            : response.status === 429
              ? "rate_limited"
              : response.status === 409
                ? "generating"
                : "server";
      throw new PlanetLoadError(reason, `resource map ${material}: HTTP ${response.status}`);
    }
    try {
      const data = decodePlanetResource(await response.arrayBuffer());
      const got = RESOURCE_MATERIALS[data.material];
      if (got !== material) throw new Error(`resource map material ${String(got)} is not ${material}`);
      return { material, level: data.level, share: data.share, high: data.high };
    } catch (error) {
      if (signal.aborted) throw error;
      throw new PlanetLoadError("invalid", error instanceof Error ? error.message : String(error));
    }
  }
}
