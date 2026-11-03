// WebSocket 연결 하나의 보유 물건 메시지 처리(src/session.ts가 넘긴다) — docs/adr/2026-11-03-item-holdings.md 5절
// - 로그인한 사용자만. 한 연결의 요청은 받은 순서대로 하나씩 처리한다(사이보그 메시지와 같은 틀).
// - 사용자별 속도 제한(순간 20번, 분당 120번). 밀린 요청이 MAX_PENDING을 넘으면 busy.
// - 판정은 서비스(service.ts)가 동기로 하고, 바뀐 것이 있으면 커밋을 기다린 뒤 답한다(물건·소유는 커밋 뒤 응답, S3 U2).
// - 개발 시험 받기(dev_grant_item)는 dev·admin(secondMap dev-spawn — "개발 시험 명령으로 내 시험 것 받기"와 같은 권한).
import { type ClientMessageOf, type ItemResultCode, encodeMessage } from "@terra/protocol";
import { rolesAllow } from "../auth/permissions.ts";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { Viewer } from "../trpc/context.ts";
import type { HoldingService } from "./service.ts";
import { carriedBy } from "./state.ts";

export type ItemClientMessage = ClientMessageOf<
  "item_equip" | "item_unequip" | "item_use" | "dev_grant_item"
>;

const MAX_PENDING = 8;
const LIMIT = { capacity: 20, refillPerMinute: 120 };

/** 세계가 준비된 뒤 게이트웨이가 쓰는 것 */
export interface HoldingsAccess {
  readonly service: HoldingService;
  /** 사용자의 소유 주체(없으면 undefined, 만들지 않는다) */
  ownerOf(userId: string): number | undefined;
  /** 사용자의 사이보그 유닛(없으면 undefined) */
  cyborgUnitOf(userId: string): number | undefined;
  unitOwner(unitId: number): number | undefined;
  durable(): Promise<void>;
  /** 굴림 시드(운영: crypto) */
  seed(): number;
}

export interface ItemLink {
  send(text: string): void;
  viewer(): Promise<Viewer | null>;
}

export interface ItemSocket {
  handle(message: ItemClientMessage): void;
  close(): void;
}

export interface ItemGateway {
  open(link: ItemLink): ItemSocket;
}

type Reply =
  | {
      readonly ok: true;
      readonly holdings?: readonly number[];
      readonly effects?: readonly { readonly effect: string; readonly amount: number }[];
    }
  | {
      readonly ok: false;
      readonly code: ItemResultCode;
      readonly effects?: readonly string[];
      readonly readyAt?: number;
    };

function replyText(id: number, reply: Reply): string {
  if (!reply.ok)
    return encodeMessage({
      t: "item_result",
      id,
      ok: false,
      code: reply.code,
      ...(reply.effects === undefined ? {} : { effects: [...reply.effects] }),
      ...(reply.readyAt === undefined ? {} : { readyAt: reply.readyAt }),
    });
  return encodeMessage({
    t: "item_result",
    id,
    ok: true,
    ...(reply.holdings === undefined ? {} : { holdings: [...reply.holdings] }),
    ...(reply.effects === undefined ? {} : { effects: reply.effects.map((entry) => ({ ...entry })) }),
  });
}

const fail = (code: ItemResultCode): Reply => ({ ok: false, code });

/** 서비스 결과 → 답(성공이면 커밋을 기다린다) */
async function settled(
  access: HoldingsAccess,
  result: ReturnType<HoldingService["equip"]>,
  extra: Omit<Extract<Reply, { ok: true }>, "ok"> = {},
): Promise<Reply> {
  if (!result.ok)
    return {
      ok: false,
      code: result.code,
      ...(result.effects ? { effects: result.effects } : {}),
      ...(result.readyAt === undefined ? {} : { readyAt: result.readyAt }),
    };
  await access.durable();
  return { ok: true, ...extra };
}

/** 한 요청(소유 주체·권한 확인 뒤 서비스로) */
async function run(
  access: HoldingsAccess,
  viewer: Viewer,
  message: ItemClientMessage,
  now: number,
): Promise<Reply> {
  const ownerId = access.ownerOf(viewer.id);
  if (message.t === "dev_grant_item" && !rolesAllow(viewer.roles, { secondMap: ["dev-spawn"] }))
    return fail("forbidden");
  if (ownerId === undefined) return fail("no_owner");
  const { service } = access;
  if (message.t === "item_equip")
    return settled(access, service.equip(ownerId, message.holding, message.slot));
  if (message.t === "item_unequip") return settled(access, service.unequip(ownerId, message.holding));
  if (message.t === "item_use") {
    const result = service.use(ownerId, message.holding, {
      confirm: message.confirm === true,
      nowMs: now,
      seed: access.seed(),
    });
    return settled(access, result, result.ok ? { effects: result.effects } : {});
  }
  // dev_grant_item: 내 유닛(없으면 내 사이보그)이 든 것으로 받는다
  const unitId = message.unit ?? access.cyborgUnitOf(viewer.id);
  if (unitId === undefined) return fail("no_owner");
  if (access.unitOwner(unitId) !== ownerId) return fail("unknown_unit");
  const result = service.acquire({
    ownerId,
    item: message.item,
    quantity: message.quantity,
    location: carriedBy(unitId),
    source: "dev_grant",
    atMs: now,
    seed: access.seed(),
  });
  return settled(access, result, result.ok ? { holdings: result.holdings } : {});
}

export function createItemGateway(options: {
  /** 세계가 준비되면 접근(없으면 busy) */
  access: () => HoldingsAccess | undefined;
  now: () => number;
  log: { error(obj: object, message: string): void };
}): ItemGateway {
  const limiter: RateLimiter = createRateLimiter({ ...LIMIT, now: options.now });
  return {
    open(link) {
      let chain: Promise<void> = Promise.resolve();
      let pending = 0;
      let closed = false;
      const reply = (id: number, answer: Reply): void => {
        if (!closed) link.send(replyText(id, answer));
      };
      const process = async (message: ItemClientMessage): Promise<void> => {
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return reply(message.id, fail("sign_in_required"));
        const access = options.access();
        if (!access) return reply(message.id, fail("busy"));
        if (!limiter.take(viewer.id)) return reply(message.id, fail("rate_limited"));
        reply(message.id, await run(access, viewer, message, options.now()));
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
              options.log.error({ err: error, t: message.t }, "item request failed");
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
