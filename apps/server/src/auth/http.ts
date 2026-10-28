// Fastify ↔ Better Auth 사이의 작은 도우미 — 요청 머리글 변환, 쿠키 전달, 프록시 경로 1회 확인 로그
import type { FastifyReply, FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";

/**
 * Better Auth에 넘길 머리글. 접속 주소는 Fastify가 믿는 프록시를 거쳐 계산한 값(request.ip)으로 덮어쓴다.
 * 기기가 보낸 X-Forwarded-For를 그대로 넘기면 세션의 접속 주소를 위조할 수 있다.
 */
export function authHeaders(request: FastifyRequest): Headers {
  const headers = fromNodeHeaders(request.headers);
  headers.set("x-forwarded-for", request.ip);
  return headers;
}

/** Better Auth 응답 머리글 중 Set-Cookie만 기기로 보낸다(여러 개면 각각) */
export function forwardSetCookies(reply: FastifyReply, headers: Headers | null | undefined): void {
  for (const cookie of headers?.getSetCookie() ?? []) reply.header("set-cookie", cookie);
}

/**
 * 서버를 켠 뒤 첫 인증 요청에서 프록시 경로를 한 번 로그로 남긴다(ops/nas-setup.md "프록시 확인").
 * DSM 프록시가 X-Forwarded-For를 어떻게 붙이는지 확인하려는 것이다. 주소만 남기고 다른 머리글은 남기지 않는다.
 */
export function createProxyChainLogger(): (request: FastifyRequest) => void {
  let logged = false;
  return (request) => {
    if (logged) return;
    logged = true;
    request.log.info(
      {
        proxyCheck: {
          ip: request.ip,
          ips: request.ips ?? [],
          remoteAddress: request.socket.remoteAddress,
          forwardedFor: request.headers["x-forwarded-for"] ?? null,
        },
      },
      "proxy chain check (first auth request after start)",
    );
  };
}
