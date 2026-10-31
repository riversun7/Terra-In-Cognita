// 2차맵 지형 이진 파일 — GET /api/maps/<2차맵 키>/terrain?v=<판 표지> (형식: packages/protocol terrain.ts)
// - 로그인한 사용자만, 볼 수 있는 2차맵만(ADR 26). 없거나 볼 수 없으면 똑같이 404.
// - 띄운 2차맵은 그 지형(고정본·생성기·임시 지형). 띄우지 않은 2차맵은 볼 수 있는 띄운 2차맵의 이웃일 때만
//   지형 서비스가 만들어 준다(경계 너머 보기).
// - 판 표지가 붙은 주소라 내용이 바뀌지 않는다 → 기기 캐시 1년(private: 공유 캐시에는 두지 않는다).
//   표지가 지금과 다르면 404(옛 주소는 다시 만들 수 없다).
// - 기기가 gzip을 받으면 미리 압축한 것을 준다(약 83KB → 더 작게).
import { TERRAIN_CACHE_CONTROL, TERRAIN_ROUTE } from "@terra/protocol";
import { isCellKey, stepCell } from "@terra/planet";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Viewer } from "../trpc/context.ts";
import type { WorldDirectory } from "./gateway.ts";
import type { TerrainFile } from "./mapTerrain.ts";
import type { TerrainService } from "./terrainService.ts";
import { canObserve, canViewSecondMap } from "./visibility.ts";

/** Accept-Encoding에 gzip이 있고 q=0이 아닌가 */
export function acceptsGzip(header: string | string[] | undefined): boolean {
  const value = Array.isArray(header) ? header.join(",") : (header ?? "");
  return value.split(",").some((part) => {
    const [name = "", ...params] = part.split(";").map((piece) => piece.trim().toLowerCase());
    if (name !== "gzip" && name !== "*") return false;
    const q = params.find((param) => param.startsWith("q="));
    return q === undefined || Number(q.slice(2)) > 0;
  });
}

/** 경로 매개변수 → 2차맵 키(10진수 숫자만, 안전 정수). 아니면 undefined */
function parseMapKey(value: string): number | undefined {
  if (!/^\d{1,16}$/.test(value)) return undefined;
  const key = Number(value);
  return Number.isSafeInteger(key) ? key : undefined;
}

/**
 * 띄우지 않은 2차맵의 지형을 볼 수 있는가: 전체 보기 권한이거나, 볼 수 있는 띄운 2차맵의 8이웃이면(경계 너머 보기, ADR 46 WP-4).
 * 지형은 숨김 정보가 아니다(자원·크리쳐는 따로, ADR 26). 이웃 두 장 너머는 주지 않는다
 */
async function canViewNeighbour(world: WorldDirectory, viewer: Viewer, mapKey: number): Promise<boolean> {
  if (canObserve(viewer)) return true;
  if (!isCellKey(mapKey)) return false;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      if (di === 0 && dj === 0) continue;
      const next = stepCell(mapKey, di, dj);
      const map = next === null ? undefined : world.map(next);
      if (map && (await canViewSecondMap(world, viewer, map))) return true;
    }
  }
  return false;
}

/** 없음·볼 수 없음·판 표지 다름은 모두 404(저장하지 않는다) */
function notFound(reply: FastifyReply, error: string) {
  return reply.code(404).header("cache-control", "no-store").send({ error });
}

export function registerTerrainRoute(
  app: FastifyInstance,
  options: {
    world: WorldDirectory;
    viewer: (request: FastifyRequest) => Promise<Viewer | null>;
    /** 2차맵 지형 서비스(있으면 띄우지 않은 이웃 2차맵의 지형도 준다) */
    terrain?: TerrainService | undefined;
  },
): void {
  app.get<{ Params: { mapKey: string }; Querystring: Record<string, unknown> }>(
    TERRAIN_ROUTE,
    async (request, reply) => {
      const viewer = await options.viewer(request);
      if (!viewer)
        return reply.code(401).header("cache-control", "no-store").send({ error: "SIGN_IN_REQUIRED" });
      const mapKey = parseMapKey(request.params.mapKey);
      if (mapKey === undefined) return notFound(reply, "MAP_NOT_FOUND");
      const map = options.world.map(mapKey);
      let file: TerrainFile;
      if (map) {
        if (!(await canViewSecondMap(options.world, viewer, map))) return notFound(reply, "MAP_NOT_FOUND");
        if (request.query.v !== map.terrainVersion) return notFound(reply, "TERRAIN_VERSION_NOT_FOUND");
        file = map.terrainFile();
      } else {
        const terrain = options.terrain;
        if (
          !terrain ||
          !options.world.isReady?.() ||
          !(await canViewNeighbour(options.world, viewer, mapKey))
        ) {
          return notFound(reply, "MAP_NOT_FOUND");
        }
        // 띄우지 않은 2차맵은 지금 생성기 판(고정본은 띄운 2차맵에만 있다)
        if (request.query.v !== terrain.version()) return notFound(reply, "TERRAIN_VERSION_NOT_FOUND");
        try {
          file = (await terrain.get(mapKey)).file();
        } catch {
          return notFound(reply, "MAP_NOT_FOUND");
        }
      }
      const gzip = acceptsGzip(request.headers["accept-encoding"]);
      reply
        .header("content-type", "application/octet-stream")
        .header("cache-control", TERRAIN_CACHE_CONTROL)
        .header("vary", "accept-encoding");
      if (gzip) reply.header("content-encoding", "gzip");
      return reply.send(gzip ? file.gzip : file.raw);
    },
  );
}
