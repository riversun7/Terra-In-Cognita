// 2차맵 지형 이진 파일 — GET /api/maps/<2차맵 키>/terrain?v=<생성기 버전> (형식: packages/protocol terrain.ts)
// - 로그인한 사용자만, 볼 수 있는 2차맵만(ADR 26 자리, S1은 모두 통과). 없거나 볼 수 없으면 똑같이 404.
// - 버전이 붙은 주소라 내용이 바뀌지 않는다 → 기기 캐시 1년(private: 공유 캐시에는 두지 않는다).
//   버전이 지금 생성기와 다르면 404(옛 주소는 다시 만들 수 없다).
// - 기기가 gzip을 받으면 미리 압축한 것을 준다(약 83KB → 더 작게).
import { TERRAIN_CACHE_CONTROL, TERRAIN_ROUTE } from "@terra/protocol";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Viewer } from "../trpc/context.ts";
import type { WorldDirectory } from "./gateway.ts";
import { canViewSecondMap } from "./visibility.ts";

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

export function registerTerrainRoute(
  app: FastifyInstance,
  options: { world: WorldDirectory; viewer: (request: FastifyRequest) => Promise<Viewer | null> },
): void {
  app.get<{ Params: { mapKey: string }; Querystring: Record<string, unknown> }>(
    TERRAIN_ROUTE,
    async (request, reply) => {
      const viewer = await options.viewer(request);
      if (!viewer)
        return reply.code(401).header("cache-control", "no-store").send({ error: "SIGN_IN_REQUIRED" });
      const mapKey = parseMapKey(request.params.mapKey);
      const map = mapKey === undefined ? undefined : options.world.map(mapKey);
      if (!map || mapKey === undefined || !(await canViewSecondMap(options.world, viewer, map))) {
        return reply.code(404).header("cache-control", "no-store").send({ error: "MAP_NOT_FOUND" });
      }
      if (request.query.v !== String(map.generatorVersion)) {
        return reply
          .code(404)
          .header("cache-control", "no-store")
          .send({ error: "TERRAIN_VERSION_NOT_FOUND" });
      }
      const file = map.terrainFile();
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
