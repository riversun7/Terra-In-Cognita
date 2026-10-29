// 행성 목록 정보·타일 경로 — ADR 2026-10-29-s2-planet-lod "전송" (형식: packages/protocol planetTile.ts·planetManifest.ts)
//   GET /api/planets/<행성 ID>                         목록 정보 JSON (private, no-cache + ETag)
//   GET /api/planets/<행성 ID>/tiles/<타일 ID>?v=<버전>  압축한 타일 그대로 (gzip, private 1년 immutable)
// - 로그인한 사용자만(S1 지형 파일과 같다). 1차맵 지형은 모두에게 같은 파일이다(ADR 26).
// - 오류는 코드만 보낸다(no-store): 401 SIGN_IN_REQUIRED, 404 PLANET_NOT_FOUND·TILE_NOT_FOUND·TILE_VERSION_NOT_FOUND,
//   409 PLANET_NOT_READY(굽는 중, Retry-After), 429 RATE_LIMITED(Retry-After).
// - 속도 제한: 로그인 확인 전 접속 주소별(DB 조회를 지키려고), 확인 뒤 사용자별, 타일은 서버 전체도.
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import { PLANET_MANIFEST_ROUTE, PLANET_TILE_CACHE_CONTROL, PLANET_TILE_ROUTE } from "@terra/protocol";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createRateLimiter } from "../rateLimit.ts";
import type { Viewer } from "../trpc/context.ts";
import { acceptsGzip } from "../world/terrainRoute.ts";
import type { PlanetService } from "./service.ts";

const gunzipAsync = promisify(gunzip);

/** 목록 정보는 상태(굽는 중 → 완료)가 바뀌므로 매번 확인한다. ETag가 같으면 304 */
export const PLANET_MANIFEST_CACHE_CONTROL = "private, no-cache";

/** 속도 제한 (순간 capacity개, 분당 refillPerMinute개) */
export interface PlanetRouteLimits {
  /** 로그인 확인 전, 접속 주소별(목록 정보 + 타일). 같은 주소 뒤 여러 사람(NAT)을 생각해 넉넉하게 */
  perIp: { capacity: number; refillPerMinute: number };
  /** 사용자별 타일. 행성 하나(지구 크기 2,046개)를 한 번에 받을 수 있게 */
  tilesPerUser: { capacity: number; refillPerMinute: number };
  /** 사용자별 목록 정보(굽는 중에는 기기가 몇 초마다 다시 묻는다) */
  manifestPerUser: { capacity: number; refillPerMinute: number };
  /** 서버 전체 타일(NAS 대역폭·CPU) */
  tilesOverall: { capacity: number; refillPerMinute: number };
}

export const DEFAULT_PLANET_ROUTE_LIMITS: PlanetRouteLimits = {
  perIp: { capacity: 6_000, refillPerMinute: 6_000 },
  tilesPerUser: { capacity: 2_048, refillPerMinute: 2_048 },
  manifestPerUser: { capacity: 30, refillPerMinute: 60 },
  tilesOverall: { capacity: 20_000, refillPerMinute: 30_000 },
};

/** 굽는 중일 때 기기가 다시 묻기까지(초) */
const NOT_READY_RETRY_SECONDS = 5;

export interface PlanetRouteOptions {
  planets: PlanetService;
  viewer: (request: FastifyRequest) => Promise<Viewer | null>;
  now: () => number;
  limits?: Partial<PlanetRouteLimits> | undefined;
}

/** 경로 매개변수 → 타일 ID(10진수 숫자만, 안전 정수). 아니면 undefined */
function parseTileKey(value: string): number | undefined {
  if (!/^\d{1,16}$/.test(value)) return undefined;
  const key = Number(value);
  return Number.isSafeInteger(key) ? key : undefined;
}

function sendError(reply: FastifyReply, status: number, error: string): FastifyReply {
  return reply.code(status).header("cache-control", "no-store").send({ error });
}

/** 429 + 다시 시도할 때까지(초, 1 이상) */
function rateLimited(reply: FastifyReply, retryAfterMs: number): FastifyReply {
  reply.header("retry-after", String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
  return sendError(reply, 429, "RATE_LIMITED");
}

export function registerPlanetRoutes(app: FastifyInstance, options: PlanetRouteOptions): void {
  const { planets, now } = options;
  const limits = { ...DEFAULT_PLANET_ROUTE_LIMITS, ...options.limits };
  const perIp = createRateLimiter({ ...limits.perIp, now });
  const tilesPerUser = createRateLimiter({ ...limits.tilesPerUser, now });
  const manifestPerUser = createRateLimiter({ ...limits.manifestPerUser, now });
  const tilesOverall = createRateLimiter({ ...limits.tilesOverall, now });

  /** 주소별 제한 → 로그인 확인. 통과하면 사용자, 아니면 답을 보내고 undefined */
  const admit = async (request: FastifyRequest, reply: FastifyReply): Promise<Viewer | undefined> => {
    if (!perIp.take(request.ip)) {
      rateLimited(reply, perIp.retryAfterMs(request.ip));
      return undefined;
    }
    const viewer = await options.viewer(request);
    if (!viewer) {
      sendError(reply, 401, "SIGN_IN_REQUIRED");
      return undefined;
    }
    return viewer;
  };

  app.get<{ Params: { planetId: string } }>(PLANET_MANIFEST_ROUTE, async (request, reply) => {
    const viewer = await admit(request, reply);
    if (!viewer) return reply;
    if (!manifestPerUser.take(viewer.id)) return rateLimited(reply, manifestPerUser.retryAfterMs(viewer.id));
    const manifest = planets.manifest(request.params.planetId);
    if (!manifest) return sendError(reply, 404, "PLANET_NOT_FOUND");
    const body = JSON.stringify(manifest);
    const etag = `"${createHash("sha256").update(body).digest("hex").slice(0, 32)}"`;
    reply
      .header("cache-control", PLANET_MANIFEST_CACHE_CONTROL)
      .header("etag", etag)
      .header("content-type", "application/json; charset=utf-8");
    if (request.headers["if-none-match"] === etag) return reply.code(304).send();
    return reply.send(body);
  });

  app.get<{ Params: { planetId: string; tileKey: string }; Querystring: Record<string, unknown> }>(
    PLANET_TILE_ROUTE,
    async (request, reply) => {
      const answer = (status: number, error: string): FastifyReply => {
        planets.recordTileResponse(status, 0);
        return sendError(reply, status, error);
      };
      const viewer = await admit(request, reply);
      if (!viewer) {
        planets.recordTileResponse(reply.statusCode, 0);
        return reply;
      }
      if (!tilesPerUser.take(viewer.id)) {
        planets.recordTileResponse(429, 0);
        return rateLimited(reply, tilesPerUser.retryAfterMs(viewer.id));
      }
      if (!tilesOverall.take("all")) {
        planets.recordTileResponse(429, 0);
        return rateLimited(reply, tilesOverall.retryAfterMs("all"));
      }
      // 숫자가 아닌 키는 -1(셀 키가 아니다)로 넘겨 행성·버전 확인 뒤 TILE_NOT_FOUND가 되게 한다
      const tileKey = parseTileKey(request.params.tileKey) ?? -1;
      const version = typeof request.query.v === "string" ? request.query.v : "";
      const found = planets.tile(request.params.planetId, tileKey, version);
      switch (found.kind) {
        case "unknown_planet":
          return answer(404, "PLANET_NOT_FOUND");
        case "unknown_tile":
          return answer(404, "TILE_NOT_FOUND");
        case "wrong_version":
          return answer(404, "TILE_VERSION_NOT_FOUND");
        case "not_ready":
          reply.header("retry-after", String(NOT_READY_RETRY_SECONDS));
          return answer(409, "PLANET_NOT_READY");
        case "ok":
          break;
      }
      reply
        .header("content-type", "application/octet-stream")
        .header("cache-control", PLANET_TILE_CACHE_CONTROL)
        .header("vary", "accept-encoding");
      // 기기가 gzip을 받으면 구운 것을 그대로, 아니면 풀어서(드물다: 브라우저는 모두 gzip을 받는다)
      if (acceptsGzip(request.headers["accept-encoding"])) {
        planets.recordTileResponse(200, found.gzip.byteLength);
        return reply
          .header("content-encoding", "gzip")
          .send(Buffer.from(found.gzip.buffer, found.gzip.byteOffset, found.gzip.byteLength));
      }
      const raw = await gunzipAsync(found.gzip);
      planets.recordTileResponse(200, raw.byteLength);
      return reply.send(raw);
    },
  );
}
