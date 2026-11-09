// WebSocket 연결 하나의 융합·유전자·개발 시험 메시지 처리(src/session.ts가 넘긴다) — D-470·D-478·D-516,
// docs/adr/2026-11-07-cyborg-fusion-genes.md. 구인 카드 게이트웨이(recruit/gateway.ts)와 같은 틀이다:
// - 로그인한 사용자만. 한 연결의 요청은 받은 순서대로 하나씩 처리한다(잔고·재료·조각을 차례로 본다).
// - 사용자별 속도 제한(순간 20번, 분당 60번 — 유전자 명령이 더해져 보유 물건 순간 20과 맞춤). 밀린 요청이 MAX_PENDING을 넘으면 busy.
//   세계가 아직 없으면 busy.
// - 개발 시험(dev_grant_goods·dev_grant_gene·dev_expire_unit)과 연구소 칸이 없는 인큐베이터(gene_incubate 개발 시험)는 dev·admin
//   (secondMap dev-test — 보유 물건 dev_grant_item과 같은 권한). 연구소 칸이 있는 인큐베이터(판 13, 기획 답 459 가)는 누구나.
// - 판정·저장은 서비스(service.ts)가 한다.
import { type ClientMessageOf, type FusionResultCode, encodeMessage } from "@terra/protocol";
import { rolesAllow } from "../auth/permissions.ts";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { Viewer } from "../trpc/context.ts";
import type { FusionCommandResult, FusionService } from "./service.ts";

export type FusionClientMessage = ClientMessageOf<
  | "cyborg_fuse"
  | "dev_grant_goods"
  | "gene_synthesize"
  | "gene_inject"
  | "gene_incubate"
  | "dev_grant_gene"
  | "dev_expire_unit"
  | "gene_convert"
>;

const MAX_PENDING = 8;
const LIMIT = { capacity: 20, refillPerMinute: 60 };

export interface FusionLink {
  send(text: string): void;
  viewer(): Promise<Viewer | null>;
}

export interface FusionSocket {
  handle(message: FusionClientMessage): void;
  close(): void;
}

export interface FusionGateway {
  open(link: FusionLink): FusionSocket;
}

function resultText(id: number, result: FusionCommandResult): string {
  if (!result.ok) return encodeMessage({ t: "fusion_result", id, ok: false, code: result.code });
  return encodeMessage({
    t: "fusion_result",
    id,
    ok: true,
    ...(result.unitId === undefined ? {} : { unitId: result.unitId }),
    ...(result.stats === undefined ? {} : { stats: result.stats }),
    ...(result.bonusPm === undefined ? {} : { bonusPm: result.bonusPm }),
    ...(result.gene === undefined ? {} : { gene: result.gene }),
    ...(result.genes === undefined ? {} : { genes: result.genes }),
    ...(result.outcome === undefined ? {} : { outcome: result.outcome }),
    ...(result.total === undefined ? {} : { total: result.total }),
    ...(result.skill === undefined ? {} : { skill: result.skill }),
  });
}

const fail = (code: FusionResultCode): FusionCommandResult => ({ ok: false, code });

/** 개발 시험 명령 권한(dev·admin) */
export const canDevGrant = (viewer: Viewer): boolean => rolesAllow(viewer.roles, { secondMap: ["dev-test"] });

async function run(service: FusionService, viewer: Viewer, message: FusionClientMessage) {
  switch (message.t) {
    case "cyborg_fuse":
      return service.fuse(viewer.id, { human: message.human, cost: message.cost });
    case "dev_grant_goods":
      if (!canDevGrant(viewer)) return fail("forbidden");
      return service.devGrant(viewer.id, { item: message.item, quantity: message.quantity });
    case "gene_synthesize":
      return service.synthesize(viewer.id, { a: message.a, b: message.b });
    case "gene_inject":
      return service.inject(viewer.id, { gene: message.gene, unit: message.unit });
    case "gene_incubate":
      // 생명과학 연구소에서는 누구나(기획 답 459 가). 연구소 칸이 없으면 개발 시험(사이보그 둘레·값 없음)
      if (message.buildingId !== undefined && message.cost !== undefined)
        return service.incubate(viewer.id, {
          gene: message.gene,
          apply: message.apply,
          lab: { buildingId: message.buildingId, cost: message.cost },
        });
      if (!canDevGrant(viewer)) return fail("forbidden");
      return service.incubate(viewer.id, { gene: message.gene, apply: message.apply });
    case "dev_grant_gene":
      if (!canDevGrant(viewer)) return fail("forbidden");
      return service.devGrantGene(viewer.id, { kind: message.kind, skill: message.skill });
    case "dev_expire_unit":
      if (!canDevGrant(viewer)) return fail("forbidden");
      return service.devExpire(viewer.id, { unit: message.unit });
    case "gene_convert":
      return service.convert(viewer.id, {
        buildingId: message.buildingId,
        unit: message.unit,
        cost: message.cost,
      });
    default: {
      const unknown: never = message;
      return unknown;
    }
  }
}

export function createFusionGateway(options: {
  /** 세계가 준비되면 서비스(없으면 busy) */
  service: () => FusionService | undefined;
  now: () => number;
  log: { error(obj: object, message: string): void };
}): FusionGateway {
  const limiter: RateLimiter = createRateLimiter({ ...LIMIT, now: options.now });
  return {
    open(link) {
      let chain: Promise<void> = Promise.resolve();
      let pending = 0;
      let closed = false;
      const reply = (id: number, result: FusionCommandResult): void => {
        if (!closed) link.send(resultText(id, result));
      };

      const process = async (message: FusionClientMessage): Promise<void> => {
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return reply(message.id, fail("sign_in_required"));
        const service = options.service();
        if (!service) return reply(message.id, fail("busy"));
        if (!limiter.take(viewer.id)) return reply(message.id, fail("rate_limited"));
        reply(message.id, await run(service, viewer, message));
      };

      return {
        handle(message) {
          if (closed) return;
          if (pending >= MAX_PENDING) {
            reply(message.id, fail("busy"));
            return;
          }
          pending += 1;
          chain = chain
            .then(() => process(message))
            .catch((error: unknown) => {
              options.log.error({ err: error, t: message.t }, "fusion request failed");
              reply(message.id, fail("internal_error"));
            })
            .finally(() => {
              pending -= 1;
            });
        },
        close() {
          closed = true;
        },
      };
    },
  };
}
