// WebSocket 연결 하나의 건물 명령 처리(src/session.ts가 넘긴다, 프로토콜 10 — 창고 옮기기 11, 건물·비콘 공격 12) —
// docs/adr/2026-11-07-buildings-runtime.md
// - 로그인한 사용자만. 한 연결의 요청은 받은 순서대로 하나씩 처리한다(같은 건물·유닛을 차례로 바꾼다).
// - 사용자별 속도 제한(순간 10번, 분당 30번 — 노동 계약 명령과 같은 값). 밀린 요청이 MAX_PENDING을 넘으면 busy.
// - 개발 시험 명령(dev_facility_grant·dev_facility_finish)은 dev·admin(secondMap dev-test — 보유 물건 dev_grant_item과 같은 권한).
// - 판정·저장은 서비스(service.ts)가 한다. 세계가 아직 없으면(부팅 중·DB 없음) busy.
// - 행정 건물(폐허 정부, 프로토콜 13 — docs/adr/2026-11-07-ruins-restoration.md)의 새 코드 not_ruin·ruin_claimed는 13판 연결에만 가고 더 낮은
//   판은 not_buildable을 받는다(그 판 기기가 모르는 코드라 메시지를 풀지 못한다).
// - 물가 조건(프로토콜 21, 질문 947 나)의 새 코드 needs_water도 같다: 21판 연결에만 가고 20판은 blocked_terrain을 받는다.
// - 사업장 장부 명령(프로토콜 34, docs/adr/2026-11-15-business-ledger.md)도 이 게이트웨이가 받아 business_result로 답한다(app.ts 상한 — 새 게이트웨이를
//   잇지 않는다). 34의 새 코드 insufficient_funds(주인 꺼내기 값)는 더 낮은 판에 insufficient_materials로 간다.
// - 지분 주문(프로토콜 38, docs/adr/2026-11-15-building-screen.md)도 여기서 받는다. 운영자 모드 연결(전체 보기 + 모든 유닛 명령 권한)의 관리 명령은
//   남의 사업장에도 된다(사용자 요청 2026-11-15 "운영자도 조작가능").
// - 면적 모듈 붙이기(facility_plot, 프로토콜 41 — 건물 채집소, 기획 D-567; 45부터 짓는 시간·일꾼, D-569 1765): plots.ts. 새 코드 plot_full은 이
//   메시지의 답에만 간다. 모듈 떼기(facility_plot_remove)·기르는 티어 고르기(facility_gather_tier, 45 — D-569 1761·1765)도 plots.ts(코드 no_plot·
//   tier_locked는 그 답에만).
// - 판매만·실제 운반(프로토콜 46, 기획 D-569 1781·1784): 새 코드 sale_only(storage_move)는 더 낮은 판에 forbidden, no_carrier(business_buy)는 busy로 간다.
// - 거래소 건물(프로토콜 47, 기획 D-561): 짓기의 새 코드 exchange_locked·exchange_exists는 더 낮은 판에 forbidden으로 간다.
// - 짓는 중 알박기 고르기 바꾸기(facility_claim, 프로토콜 54 — 기획 D-577): claimChoice.ts. 결과 코드는 있던 것.
import {
  BUSINESS_CARRY_PROTOCOL_VERSION,
  BUSINESS_PROTOCOL_VERSION,
  type ClientMessageOf,
  type FacilityResultCode,
  RUINS_PROTOCOL_VERSION,
  SALE_ONLY_PROTOCOL_VERSION,
  EXCHANGE_PROTOCOL_VERSION,
  OUTSOURCE_PROTOCOL_VERSION,
  WATER_PLACE_PROTOCOL_VERSION,
  encodeMessage,
} from "@terra/protocol";
import { PLACEMENT_SIZE } from "@terra/sim";
import { rolesAllow } from "../auth/permissions.ts";
import { type OperatorPaceLink, isOperatorMode } from "../world/operatorPace.ts";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { Viewer } from "../trpc/context.ts";
import type { BuildingAttack } from "./attack.ts";
import type { BusinessCommand, BusinessCommandResult } from "../business/commands.ts";
import type { FacilityCommandResult, FacilityService, OperatorBuild } from "./service.ts";

/** 사업장 장부 명령(프로토콜 34, business/commands.ts) — 건물 게이트웨이가 함께 받고 business_result로 답한다 */
export type BusinessClientMessage = ClientMessageOf<
  | "business_settle"
  | "business_invest"
  | "business_buy"
  | "business_price"
  | "unit_gift"
  | "business_share_order"
  | "business_share_cancel"
  | "business_reserve"
>;

export type FacilityClientMessage = ClientMessageOf<
  | "facility_build"
  | "facility_upgrade"
  | "facility_repair"
  | "equipment_repair"
  | "dev_facility_grant"
  | "dev_facility_finish"
  | "storage_move"
  | "facility_attack"
  | "facility_plot"
  | "facility_plot_remove"
  | "facility_gather_tier"
  | "facility_claim"
>;

const MAX_PENDING = 8;
/** 개발 재료 받기 자리 칸이 빠졌을 때(2차맵 가운데 칸) */
const CENTER = PLACEMENT_SIZE >> 1;
const LIMIT = { capacity: 10, refillPerMinute: 30 };

export interface FacilityLink {
  send(text: string): void;
  viewer(): Promise<Viewer | null>;
  /** 인사한 프로토콜 판(없으면 지금 판). 13 아래면 폐허 코드를 not_buildable로, 21 아래면 needs_water를 blocked_terrain으로 */
  protocolVersion?: number | undefined;
  /**
   * 같은 연결이 2차맵을 전체 보기(운영자 모드)로 구독 중인가. 그러면서 모든 유닛 명령 권한(dev·admin)이면 짓기·레벨 올리기는 재료·건설 시간
   * 없이(기획 D-560 1239·D-564 1663 — 땅 규칙 등 그 밖의 건설 규칙은 그대로). 서버 권위: 권한은 여기서 본다(기기의 운영자 모드 단추는 화면 편의)
   */
  observing?(): boolean;
  /** 이 연결의 운영자 배율(기본 1, world/operatorPace.ts) — 운영자 모드 건설 표지에 싣는다(짓는 시간은 D-564 1663부터 0) */
  operatorPace?: OperatorPaceLink | undefined;
}

/** 13판에 생긴 건물 결과 코드(행정 건물 짓기) */
const RUIN_CODES: ReadonlySet<FacilityResultCode> = new Set(["not_ruin", "ruin_claimed"]);

export interface FacilitySocket {
  handle(message: FacilityClientMessage | BusinessClientMessage): void;
  close(): void;
}

export interface FacilityGateway {
  open(link: FacilityLink): FacilitySocket;
}

function resultText(id: number, result: FacilityCommandResult): string {
  if (!result.ok) return encodeMessage({ t: "facility_result", id, ok: false, code: result.code });
  return encodeMessage({
    t: "facility_result",
    id,
    ok: true,
    ...(result.buildingId === undefined ? {} : { buildingId: result.buildingId }),
    ...(result.doneAtMs === undefined ? {} : { doneAtMs: result.doneAtMs }),
  });
}

const fail = (code: FacilityResultCode): FacilityCommandResult => ({ ok: false, code });

const BUSINESS_TYPES: ReadonlySet<string> = new Set([
  "business_settle",
  "business_invest",
  "business_buy",
  "business_price",
  "unit_gift",
  "business_share_order",
  "business_share_cancel",
  "business_reserve",
]);
const isBusiness = (
  message: FacilityClientMessage | BusinessClientMessage,
): message is BusinessClientMessage => BUSINESS_TYPES.has(message.t);

function businessCommandOf(message: BusinessClientMessage): BusinessCommand {
  switch (message.t) {
    case "business_settle":
      return {
        kind: "settle",
        buildingId: message.buildingId,
        ...(message.asset === undefined ? {} : { asset: message.asset }),
        ...(message.amount === undefined ? {} : { amount: BigInt(message.amount) }),
      };
    case "business_invest":
      return {
        kind: "invest",
        buildingId: message.buildingId,
        asset: message.asset,
        amount: BigInt(message.amount),
      };
    case "business_buy":
      return {
        kind: "buy",
        buildingId: message.buildingId,
        item: message.item,
        qty: message.qty,
        // 물류센터에 맡기기(프로토콜 55 — 줄기 판 84, 기획 대조 2273)
        ...(message.via === undefined ? {} : { via: message.via }),
      };
    case "business_price":
      return {
        kind: "price",
        buildingId: message.buildingId,
        item: message.item,
        price: BigInt(message.price),
      };
    case "unit_gift":
      return { kind: "gift", unitId: message.unitId, amount: BigInt(message.amount) };
    case "business_share_order":
      return {
        kind: "share_order",
        ...(message.exchangeId === undefined ? {} : { exchangeId: message.exchangeId }),
        buildingId: message.buildingId,
        side: message.side,
        price: BigInt(message.price),
        shares: BigInt(message.shares),
      };
    case "business_share_cancel":
      return { kind: "share_cancel", orderId: message.orderId };
    case "business_reserve":
      return { kind: "reserve", buildingId: message.buildingId, reservePm: message.reservePm };
    default: {
      const unhandled: never = message;
      return unhandled;
    }
  }
}

function businessText(id: number, result: BusinessCommandResult): string {
  if (!result.ok) return encodeMessage({ t: "business_result", id, ok: false, code: result.code });
  return encodeMessage({
    t: "business_result",
    id,
    ok: true,
    ...(result.paid === undefined ? {} : { paid: String(result.paid) }),
    ...(result.orderId === undefined ? {} : { orderId: result.orderId }),
  });
}

function run(
  service: FacilityService,
  attack: BuildingAttack | undefined,
  userId: string,
  message: FacilityClientMessage,
  operator: OperatorBuild | undefined,
): Promise<FacilityCommandResult> {
  switch (message.t) {
    case "facility_attack":
      if (!attack) return Promise.resolve(fail("busy"));
      return attack.attack(
        userId,
        message.buildingId === undefined
          ? { beaconId: message.beaconId ?? 0 }
          : { buildingId: message.buildingId },
        message.unitIds,
      );
    case "facility_build":
      return service.build(userId, {
        mapKey: message.mapKey,
        facility: message.facility,
        x: message.x,
        y: message.y,
        rotation: message.rotation,
        unitIds: message.unitIds,
        ...(operator ? { operator } : {}),
        ...(message.claim
          ? { claim: { mode: message.claim.mode, regime: message.claim.regime ?? null } }
          : {}),
      });
    case "facility_upgrade":
      return service.upgrade(userId, message.buildingId, message.unitIds ?? [], operator);
    case "facility_plot":
      return service.plot(userId, message.buildingId, message.unitIds ?? [], operator);
    case "facility_plot_remove":
      return service.plotRemove(userId, message.buildingId);
    case "facility_gather_tier":
      return service.gatherTier(userId, message.buildingId, message.tier);
    case "facility_claim":
      return service.claimChoice(userId, message.buildingId, {
        mode: message.claim.mode,
        regime: message.claim.regime ?? null,
      });
    case "facility_repair":
      return service.repair(
        userId,
        message.buildingId === undefined
          ? { beaconId: message.beaconId ?? 0 }
          : { buildingId: message.buildingId },
        message.steps,
        message.unitIds,
      );
    case "equipment_repair":
      return service.repairEquipment(userId, message.buildingId, message.holdingId, message.unitIds);
    case "dev_facility_grant":
      return service.devFacilityGrant(
        userId,
        message.item,
        message.qty,
        message.mapKey === undefined
          ? undefined
          : { mapKey: message.mapKey, x: message.x ?? CENTER, y: message.y ?? CENTER },
      );
    case "storage_move":
      return service.storageMove(userId, {
        buildingId: message.buildingId,
        asset: message.asset,
        qty: message.qty,
        direction: message.direction,
        // 물류센터에 맡기기(프로토콜 54 거래소 넣기, 55(줄기 판 84)부터 꺼내기·own — D-576, 기획 대조 2273)
        ...(message.via === undefined ? {} : { via: message.via }),
      });
    case "dev_facility_finish":
      return service.devFinish(
        userId,
        message.buildingId === undefined
          ? { beaconId: message.beaconId ?? 0 }
          : { buildingId: message.buildingId },
      );
    default: {
      const unhandled: never = message;
      return unhandled;
    }
  }
}

export function createFacilityGateway(options: {
  /** 세계가 준비되면 서비스(없으면 busy) */
  service: () => FacilityService | undefined;
  /** 건물·영토 비콘 공격(질문 381, 프로토콜 12). 없으면 busy */
  attack?: (() => BuildingAttack | undefined) | undefined;
  now: () => number;
  log: { error(obj: object, message: string): void };
}): FacilityGateway {
  const limiter: RateLimiter = createRateLimiter({ ...LIMIT, now: options.now });
  return {
    open(link) {
      let chain: Promise<void> = Promise.resolve();
      let pending = 0;
      let closed = false;
      const old = (link.protocolVersion ?? RUINS_PROTOCOL_VERSION) < RUINS_PROTOCOL_VERSION;
      const beforeWater =
        (link.protocolVersion ?? WATER_PLACE_PROTOCOL_VERSION) < WATER_PLACE_PROTOCOL_VERSION;
      const beforeBusiness = (link.protocolVersion ?? BUSINESS_PROTOCOL_VERSION) < BUSINESS_PROTOCOL_VERSION;
      const beforeSaleOnly =
        (link.protocolVersion ?? SALE_ONLY_PROTOCOL_VERSION) < SALE_ONLY_PROTOCOL_VERSION;
      const beforeExchange = (link.protocolVersion ?? EXCHANGE_PROTOCOL_VERSION) < EXCHANGE_PROTOCOL_VERSION;
      const beforeCarry =
        (link.protocolVersion ?? BUSINESS_CARRY_PROTOCOL_VERSION) < BUSINESS_CARRY_PROTOCOL_VERSION;
      const beforeOutsource =
        (link.protocolVersion ?? OUTSOURCE_PROTOCOL_VERSION) < OUTSOURCE_PROTOCOL_VERSION;
      const reply = (id: number, result: FacilityCommandResult): void => {
        if (closed) return;
        // 외주 수리(48, D-570 1785): 공방 일꾼 없음은 일꾼 바쁨, 받지 않음은 수리 못 함으로
        if (
          beforeOutsource &&
          !result.ok &&
          (result.code === "no_shop_worker" || result.code === "service_closed")
        ) {
          link.send(resultText(id, fail(result.code === "no_shop_worker" ? "unit_busy" : "cannot_repair")));
          return;
        }
        // 판매만(46)·거래소 건물 짓기(47)는 더 낮은 판에 권한 없음으로
        if (
          !result.ok &&
          ((beforeSaleOnly && result.code === "sale_only") ||
            (beforeExchange && (result.code === "exchange_locked" || result.code === "exchange_exists")))
        ) {
          link.send(resultText(id, fail("forbidden")));
          return;
        }
        // 돈 모자람(34)은 더 낮은 판에 재료 모자람으로
        if (beforeBusiness && !result.ok && result.code === "insufficient_funds") {
          link.send(resultText(id, fail("insufficient_materials")));
          return;
        }
        const shown =
          old && !result.ok && RUIN_CODES.has(result.code)
            ? fail("not_buildable")
            : beforeWater && !result.ok && result.code === "needs_water"
              ? fail("blocked_terrain")
              : result;
        link.send(resultText(id, shown));
      };
      const processBusiness = async (message: BusinessClientMessage): Promise<void> => {
        const viewer = await link.viewer();
        if (closed) return;
        const send = (result: BusinessCommandResult): void => {
          if (closed) return;
          // 운반꾼 없음(46)은 더 낮은 판에 busy로
          const shown: BusinessCommandResult =
            beforeCarry && !result.ok && result.code === "no_carrier" ? { ok: false, code: "busy" } : result;
          link.send(businessText(message.id, shown));
        };
        if (!viewer) return send({ ok: false, code: "sign_in_required" });
        const service = options.service();
        if (!service) return send({ ok: false, code: "busy" });
        if (!limiter.take(viewer.id)) return send({ ok: false, code: "rate_limited" });
        const operator = isOperatorMode(link.observing?.() === true, viewer.roles);
        send(await service.businessCommand(viewer.id, businessCommandOf(message), operator));
      };
      const process = async (message: FacilityClientMessage | BusinessClientMessage): Promise<void> => {
        if (isBusiness(message)) return processBusiness(message);
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return reply(message.id, fail("sign_in_required"));
        const dev = message.t === "dev_facility_grant" || message.t === "dev_facility_finish";
        if (dev && !rolesAllow(viewer.roles, { secondMap: ["dev-test"] }))
          return reply(message.id, fail("forbidden"));
        const service = options.service();
        if (!service) return reply(message.id, fail("busy"));
        if (!limiter.take(viewer.id)) return reply(message.id, fail("rate_limited"));
        // 운영자 모드 건설(D-560 1239·D-564 1663 재료·시간 없음): 전체 보기 구독 + 모든 유닛 명령 권한일 때만
        const operator: OperatorBuild | undefined = isOperatorMode(link.observing?.() === true, viewer.roles)
          ? { pace: link.operatorPace?.factor() ?? 1 }
          : undefined;
        reply(message.id, await run(service, options.attack?.(), viewer.id, message, operator));
      };
      return {
        handle(message) {
          if (closed) return;
          if (pending >= MAX_PENDING) {
            if (isBusiness(message)) link.send(businessText(message.id, { ok: false, code: "busy" }));
            else reply(message.id, fail("busy"));
            return;
          }
          pending += 1;
          chain = chain
            .then(() => process(message))
            .catch((error: unknown) => {
              options.log.error({ err: error, t: message.t }, "facility request failed");
              if (isBusiness(message)) {
                if (!closed) link.send(businessText(message.id, { ok: false, code: "internal_error" }));
              } else reply(message.id, fail("internal_error"));
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
