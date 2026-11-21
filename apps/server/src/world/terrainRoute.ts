// 2차맵 지형 이진 파일 — GET /api/maps/<2차맵 키>/terrain?v=<판 표지> (형식: packages/protocol terrain.ts)
// - 로그인한 사용자만, 볼 수 있는 2차맵만(ADR 26). 없거나 볼 수 없으면 똑같이 404.
// - 띄운 2차맵은 그 지형(고정본·생성기·임시 지형). 띄우지 않은 2차맵은 볼 수 있는 띄운 2차맵의 이웃일 때만
//   지형 서비스가 만들어 준다(경계 너머 보기). 띄웠지만 볼 수 없는 2차맵(미리 띄운 옆 2차맵 — docs/adr/2026-11-08-seamless-second-map.md
//   "바뀜 (2026-11-12)")도 같은 이웃 규칙으로 그 지형을 준다(전에는 띄우지 않았을 때 받던 이웃 지형이 띄우자 404가 됐다).
// - 판 표지가 붙은 주소라 내용이 바뀌지 않는다 → 기기 캐시 1년(private: 공유 캐시에는 두지 않는다).
//   바뀜(사용자 지적 2026-11-21 "일부 2차맵 구간이 뜨지 않는 심각한 오류"): 표지가 그 2차맵 지금 표지와 다르면 404 대신 지금 표지 주소로
//   넘긴다(307, 저장 안 함). 고정본 2차맵(처음 손댄 때의 표지)과 생성기 2차맵은 표지가 다를 수 있는데, 기기는 이웃 지형 주소를 지금 2차맵
//   표지로 만든다 — 그래서 고정본 이웃·고정본에서 본 생성기 이웃이 늘 404였고 회색으로 남았다. 표지가 없으면 그대로 404.
// - 기기가 gzip을 받으면 미리 압축한 것을 준다(약 83KB → 더 작게).
import { TERRAIN_CACHE_CONTROL, TERRAIN_ROUTE, terrainPath } from "@terra/protocol";
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

/** 없음·볼 수 없음·판 표지 없음은 모두 404(저장하지 않는다) */
function notFound(reply: FastifyReply, error: string) {
  return reply.code(404).header("cache-control", "no-store").send({ error });
}

/** 판 표지가 다르면: 표지가 있으면 지금 표지 주소로 넘기고(307, 저장 안 함), 없으면 404 */
function wrongVersion(reply: FastifyReply, mapKey: number, asked: unknown, current: string | undefined) {
  if (typeof asked !== "string" || asked === "" || current === undefined)
    return notFound(reply, "TERRAIN_VERSION_NOT_FOUND");
  return reply
    .code(307)
    .header("cache-control", "no-store")
    .header("location", terrainPath(mapKey, current))
    .send();
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
        // 볼 수 없는 띄운 2차맵도 볼 수 있는 2차맵의 이웃이면 지형은 준다(띄우지 않은 이웃과 같은 규칙 — 미리 띄운 옆 2차맵, 2026-11-12)
        if (
          !(await canViewSecondMap(options.world, viewer, map)) &&
          !(await canViewNeighbour(options.world, viewer, mapKey))
        )
          return notFound(reply, "MAP_NOT_FOUND");
        if (request.query.v !== map.terrainVersion)
          return wrongVersion(reply, mapKey, request.query.v, map.terrainVersion);
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
        if (request.query.v !== terrain.version())
          return wrongVersion(reply, mapKey, request.query.v, terrain.version());
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
