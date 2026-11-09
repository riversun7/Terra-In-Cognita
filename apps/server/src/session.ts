// WebSocket 세션 — 접속 핸드셰이크(버전 확인), 시계 동기화 ping/pong, 연결 유지 확인, 2차맵 메시지 넘기기
// 2차맵 메시지(구독·명령)는 프로토콜 2로 인사한 연결만 보낼 수 있다. 1로 인사한 연결이 보내면 invalid_message로 거절한다
// (프로토콜 1에는 없는 메시지다). 그래서 1로 인사한 기기는 2차맵 서버 메시지를 받지 않는다.
import {
  HEARTBEAT_INTERVAL_MS,
  MIN_SUPPORTED_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  ProtocolError,
  SECOND_MAP_PROTOCOL_VERSION,
  CYBORG_PROTOCOL_VERSION,
  CYBORG_ELEMENTS_PROTOCOL_VERSION,
  TERRITORY_PROTOCOL_VERSION,
  RECRUIT_PROTOCOL_VERSION,
  ITEM_PROTOCOL_VERSION,
  TREAT_PROTOCOL_VERSION,
  UNPACK_PROTOCOL_VERSION,
  LABOR_PROTOCOL_VERSION,
  LABOR_ASSIGN_PROTOCOL_VERSION,
  LABOR_JOBS_PROTOCOL_VERSION,
  ATTACK_PROTOCOL_VERSION,
  FACILITY_PROTOCOL_VERSION,
  STORAGE_PROTOCOL_VERSION,
  FUSION_PROTOCOL_VERSION,
  GENE_PROTOCOL_VERSION,
  GENE_CONVERT_PROTOCOL_VERSION,
  GENE_INCUBATE_LAB_PROTOCOL_VERSION,
  GUARDIAN_BUFF_PROTOCOL_VERSION,
  TEMPLE_PROTOCOL_VERSION,
  FX_PROTOCOL_VERSION,
  MARKET_PROTOCOL_VERSION,
  RUINS_PROTOCOL_VERSION,
  TRAVEL_PROTOCOL_VERSION,
  UNIT_CONTROL_PROTOCOL_VERSION,
  GATHER_PROTOCOL_VERSION,
  HOSPITAL_PROTOCOL_VERSION,
  CITIZENSHIP_PROTOCOL_VERSION,
  type ServerMessage,
  decodeClientMessage,
  encodeMessage,
  isProtocolSupported,
} from "@terra/protocol";
import type { WebSocket } from "@fastify/websocket";
import type { RawData } from "ws";
import type { Viewer } from "./trpc/context.ts";
import type { CyborgGateway, CyborgSocket } from "./cyborg/gateway.ts";
import type { TerritoryGateway, TerritorySocket } from "./territory/gateway.ts";
import type { RecruitGateway, RecruitSocket } from "./recruit/gateway.ts";
import type { ItemGateway, ItemSocket } from "./holdings/gateway.ts";
import type { LaborGateway, LaborSocket } from "./labor/gateway.ts";
import type { FacilityGateway, FacilitySocket } from "./facilities/gateway.ts";
import type { FusionGateway, FusionSocket } from "./fusion/gateway.ts";
import type { TempleGateway, TempleSocket } from "./temple/gateway.ts";
import type { RuinGateway, RuinSocket } from "./ruins/gateway.ts";
import type { MarketGateway, MarketSocket } from "./market/gateway.ts";
import type { TravelGateway, TravelSocket } from "./travel/gateway.ts";
import type { GatherGateway, GatherSocket } from "./gather/gateway.ts";
import type { HospitalGateway, HospitalSocket } from "./hospital/gateway.ts";
import type { CitizenshipGateway, CitizenshipSocket } from "./citizenship/gateway.ts";
import type { WorldGateway, WorldSocket } from "./world/gateway.ts";

export interface SessionContext {
  simVersion: number;
  contentVersion: string;
  now: () => number;
  /** 2차맵(S1). 없으면 2차맵 요청에 unknown_map */
  world?: WorldGateway | undefined;
  /** 사이보그 만들기(프로토콜 4, docs/adr/2026-11-01-first-login-cyborg.md 4절). 없으면 busy */
  cyborg?: CyborgGateway | undefined;
  /** 영토 비콘(프로토콜 7, docs/adr/2026-11-03-territory-layer.md 4절). 없으면 busy */
  territory?: TerritoryGateway | undefined;
  /** 구인 카드 고용(프로토콜 7, D-469). 없으면 busy */
  recruit?: RecruitGateway | undefined;
  /** 보유 물건(프로토콜 6, docs/adr/2026-11-03-item-holdings.md 5절). 없으면 busy */
  items?: ItemGateway | undefined;
  /** 노동 계약 명령(docs/adr/2026-11-03-labor-contracts.md). 없으면 busy */
  labor?: LaborGateway | undefined;
  /** 사이보그 유닛 융합·개발 물자 받기(프로토콜 9)·유전자(11, docs/adr/2026-11-07-cyborg-fusion-genes.md). 없으면 busy */
  fusion?: FusionGateway | undefined;
  /** 건물 짓기·수리 명령(프로토콜 10, docs/adr/2026-11-07-buildings-runtime.md). 없으면 busy */
  facilities?: FacilityGateway | undefined;
  /** 신전 기도·헌금·의식(프로토콜 12, docs/adr/2026-11-07-temple-religion.md). 없으면 busy */
  temple?: TempleGateway | undefined;
  /** 폐허 복원 모금(프로토콜 13, docs/adr/2026-11-07-ruins-restoration.md). 없으면 busy */
  ruins?: RuinGateway | undefined;
  /** 물자 거래소 주문·취소·체결 알림(프로토콜 14, docs/adr/2026-11-07-play-flow.md WP4). 없으면 busy */
  market?: MarketGateway | undefined;
  /** 2차맵 사이 이동(프로토콜 16, docs/adr/2026-11-07-play-flow.md WP9). 없으면 busy */
  travel?: TravelGateway | undefined;
  /** 원자재 오브젝트 채집·건물 들어가기(프로토콜 17, docs/adr/2026-11-07-gather-objects.md) */
  gather?: GatherGateway | undefined;
  /** 병원 치료(프로토콜 17, docs/adr/2026-11-08-injury.md). 없으면 busy */
  hospital?: HospitalGateway | undefined;
  /** 국적 바꾸기(프로토콜 18, docs/adr/2026-11-08-citizenship.md). 없으면 busy */
  citizenship?: CitizenshipGateway | undefined;
  /** 이 연결의 로그인 사용자(쿠키). 로그인하지 않았거나 인증이 꺼져 있으면 null */
  viewer?: (() => Promise<Viewer | null>) | undefined;
  /**
   * 접속 상태(S3 ADR 4절, D-136): 인사한 로그인 연결마다 connect, 끊기면 돌려받은 함수를 부른다.
   * 모든 연결이 끊긴 시각부터 오프라인 24시간을 센다
   */
  presence?: { connect(userId: string): () => void } | undefined;
}

// 정책 위반으로 닫을 때 쓰는 WebSocket 종료 코드
const CLOSE_POLICY_VIOLATION = 1008;

const signedOut = (): Promise<Viewer | null> => Promise.resolve(null);

/** ws가 넘겨주는 메시지 데이터(Buffer, ArrayBuffer, Buffer 배열)를 UTF-8 문자열로 */
function rawDataToText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  return data.toString("utf8");
}

export function handleSession(socket: WebSocket, context: SessionContext): void {
  let greeted = false;
  let protocolVersion = 0;
  let alive = true;
  let closed = false;
  let worldSocket: WorldSocket | undefined;
  let cyborgSocket: CyborgSocket | undefined;
  let territorySocket: TerritorySocket | undefined;
  let recruitSocket: RecruitSocket | undefined;
  let itemSocket: ItemSocket | undefined;
  let laborSocket: LaborSocket | undefined;
  let fusionSocket: FusionSocket | undefined;
  let facilitySocket: FacilitySocket | undefined;
  let templeSocket: TempleSocket | undefined;
  let ruinSocket: RuinSocket | undefined;
  let marketSocket: MarketSocket | undefined;
  let travelSocket: TravelSocket | undefined;
  let gatherSocket: GatherSocket | undefined;
  let hospitalSocket: HospitalSocket | undefined;
  let citizenshipSocket: CitizenshipSocket | undefined;
  let releasePresence: (() => void) | undefined;

  const sendText = (text: string): void => {
    if (socket.readyState === socket.OPEN) socket.send(text);
  };
  const send = (message: ServerMessage): void => {
    sendText(encodeMessage(message));
  };

  const reject = (code: "protocol_unsupported" | "hello_required" | "invalid_message"): void => {
    send({ t: "reject", code, minProtocolVersion: MIN_SUPPORTED_PROTOCOL_VERSION });
    socket.close(CLOSE_POLICY_VIOLATION, code);
  };

  // 프록시 유휴 끊김 방지 + 죽은 연결 정리
  const heartbeat = setInterval(() => {
    if (!alive) {
      socket.terminate();
      return;
    }
    alive = false;
    socket.ping();
  }, HEARTBEAT_INTERVAL_MS);
  socket.on("pong", () => {
    alive = true;
  });
  socket.on("close", () => {
    closed = true;
    clearInterval(heartbeat);
    worldSocket?.close();
    cyborgSocket?.close();
    territorySocket?.close();
    recruitSocket?.close();
    itemSocket?.close();
    laborSocket?.close();
    fusionSocket?.close();
    facilitySocket?.close();
    templeSocket?.close();
    ruinSocket?.close();
    marketSocket?.close();
    travelSocket?.close();
    gatherSocket?.close();
    hospitalSocket?.close();
    citizenshipSocket?.close();
    releasePresence?.();
  });

  socket.on("message", (data, isBinary) => {
    if (isBinary) {
      reject("invalid_message");
      return;
    }
    let message: ReturnType<typeof decodeClientMessage>;
    try {
      message = decodeClientMessage(rawDataToText(data));
    } catch (error) {
      if (error instanceof ProtocolError) {
        reject("invalid_message");
        return;
      }
      throw error;
    }

    if (!greeted) {
      if (message.t !== "hello") {
        reject("hello_required");
        return;
      }
      if (!isProtocolSupported(message.protocolVersion)) {
        reject("protocol_unsupported");
        return;
      }
      greeted = true;
      protocolVersion = message.protocolVersion;
      send({
        t: "welcome",
        protocolVersion: PROTOCOL_VERSION,
        simVersion: context.simVersion,
        contentVersion: context.contentVersion,
        serverTime: context.now(),
      });
      const { presence, viewer } = context;
      if (presence && viewer) {
        void viewer().then(
          (found) => {
            if (found && !closed) releasePresence = presence.connect(found.id);
          },
          () => undefined,
        );
      }
      return;
    }

    switch (message.t) {
      case "ping":
        send({
          t: "pong",
          id: message.id,
          clientSendTime: message.clientSendTime,
          serverTime: context.now(),
        });
        return;
      case "hello":
        // 이미 인사한 연결의 중복 hello는 무시한다
        return;
      case "subscribe":
      case "unsubscribe":
      case "move_unit":
      case "stop_unit":
      case "place_building":
      case "remove_building": {
        // 멈추기(stop_unit)는 프로토콜 17의 메시지다(docs/adr/2026-11-07-unit-control.md). 더 낮게 인사한 연결은 모르는 메시지로 본다
        const needs = message.t === "stop_unit" ? UNIT_CONTROL_PROTOCOL_VERSION : SECOND_MAP_PROTOCOL_VERSION;
        if (protocolVersion < needs) {
          reject("invalid_message");
          return;
        }
        if (!context.world) {
          send({ t: "result", id: message.id, ok: false, code: "unknown_map" });
          return;
        }
        worldSocket ??= context.world.open({
          send: sendText,
          bufferedAmount: () => socket.bufferedAmount,
          viewer: context.viewer ?? signedOut,
          protocolVersion,
        });
        worldSocket.handle(message);
        return;
      }
      case "cyborg_roll":
      case "cyborg_create":
      case "cyborg_elements": {
        // 굴리기·만들기는 프로토콜 4, 속성 분배는 5의 메시지다. 더 낮게 인사한 연결은 모르는 메시지로 본다(2차맵 메시지와 같은 규칙)
        const needs =
          message.t === "cyborg_elements" ? CYBORG_ELEMENTS_PROTOCOL_VERSION : CYBORG_PROTOCOL_VERSION;
        if (protocolVersion < needs) {
          reject("invalid_message");
          return;
        }
        if (!context.cyborg) {
          send({ t: "cyborg_result", id: message.id, ok: false, code: "busy" });
          return;
        }
        cyborgSocket ??= context.cyborg.open({
          send: sendText,
          viewer: context.viewer ?? signedOut,
          protocolVersion,
        });
        cyborgSocket.handle(message);
        return;
      }
      case "beacon_place":
      case "beacon_remove": {
        // 영토 비콘은 프로토콜 7의 메시지다. 더 낮게 인사한 연결은 모르는 메시지로 본다
        if (protocolVersion < TERRITORY_PROTOCOL_VERSION) {
          reject("invalid_message");
          return;
        }
        if (!context.territory) {
          send({ t: "beacon_result", id: message.id, ok: false, code: "busy" });
          return;
        }
        territorySocket ??= context.territory.open({
          send: sendText,
          viewer: context.viewer ?? signedOut,
          protocolVersion,
        });
        territorySocket.handle(message);
        return;
      }
      case "recruit_hire": {
        // 구인 카드 고용은 프로토콜 7의 메시지다. 더 낮게 인사한 연결은 모르는 메시지로 본다
        if (protocolVersion < RECRUIT_PROTOCOL_VERSION) {
          reject("invalid_message");
          return;
        }
        if (!context.recruit) {
          send({ t: "recruit_result", id: message.id, ok: false, code: "busy" });
          return;
        }
        recruitSocket ??= context.recruit.open({ send: sendText, viewer: context.viewer ?? signedOut });
        recruitSocket.handle(message);
        return;
      }
      case "item_equip":
      case "item_unequip":
      case "item_use":
      case "item_unpack":
      case "dev_grant_item":
      case "dev_treat_unit": {
        // 프로토콜 6의 메시지다(병원 치료는 9, 포장 풀기는 19). 더 낮게 인사한 연결은 모르는 메시지로 본다(사이보그 메시지와 같은 규칙)
        if (
          protocolVersion < ITEM_PROTOCOL_VERSION ||
          (message.t === "dev_treat_unit" && protocolVersion < TREAT_PROTOCOL_VERSION) ||
          (message.t === "item_unpack" && protocolVersion < UNPACK_PROTOCOL_VERSION)
        ) {
          reject("invalid_message");
          return;
        }
        if (!context.items) {
          send({ t: "item_result", id: message.id, ok: false, code: "busy" });
          return;
        }
        itemSocket ??= context.items.open({ send: sendText, viewer: context.viewer ?? signedOut });
        itemSocket.handle(message);
        return;
      }
      case "labor_create":
      case "labor_terminate":
      case "labor_top_up":
      case "labor_set_rent":
      case "labor_post_job":
      case "labor_withdraw_job":
      case "labor_accept_job":
      case "labor_assign":
      case "labor_unassign": {
        // 구인 게시 셋은 판 8부터, 직무 배치 둘은 판 14부터(그 앞 판 기기는 보내지 않는다)
        const needs =
          message.t === "labor_assign" || message.t === "labor_unassign"
            ? LABOR_ASSIGN_PROTOCOL_VERSION
            : message.t === "labor_post_job" ||
                message.t === "labor_withdraw_job" ||
                message.t === "labor_accept_job"
              ? LABOR_JOBS_PROTOCOL_VERSION
              : LABOR_PROTOCOL_VERSION;
        if (protocolVersion < needs) {
          reject("invalid_message");
          return;
        }
        if (!context.labor) {
          send({ t: "labor_result", id: message.id, ok: false, code: "busy" });
          return;
        }
        laborSocket ??= context.labor.open({
          send: sendText,
          viewer: context.viewer ?? signedOut,
          protocolVersion,
        });
        laborSocket.handle(message);
        return;
      }
      case "cyborg_fuse":
      case "dev_grant_goods":
      case "gene_synthesize":
      case "gene_inject":
      case "gene_incubate":
      case "dev_grant_gene":
      case "dev_expire_unit":
      case "gene_convert": {
        // 융합·개발 물자 받기는 프로토콜 9, 유전자 명령은 11, 비활성 휴먼 유전자 변환은 12, 연구소 인큐베이터(연구소 칸)는 13의 메시지다.
        // 더 낮게 인사한 연결은 모르는 메시지로 본다
        const needs =
          message.t === "cyborg_fuse" || message.t === "dev_grant_goods"
            ? FUSION_PROTOCOL_VERSION
            : message.t === "gene_convert"
              ? GENE_CONVERT_PROTOCOL_VERSION
              : message.t === "gene_incubate" && message.buildingId !== undefined
                ? GENE_INCUBATE_LAB_PROTOCOL_VERSION
                : GENE_PROTOCOL_VERSION;
        if (protocolVersion < needs) {
          reject("invalid_message");
          return;
        }
        if (!context.fusion) {
          send({ t: "fusion_result", id: message.id, ok: false, code: "busy" });
          return;
        }
        fusionSocket ??= context.fusion.open({ send: sendText, viewer: context.viewer ?? signedOut });
        fusionSocket.handle(message);
        return;
      }
      case "facility_build":
      case "facility_upgrade":
      case "facility_repair":
      case "equipment_repair":
      case "dev_facility_grant":
      case "dev_facility_finish":
      case "storage_move":
      case "facility_attack": {
        // 건물 명령은 프로토콜 10, 창고 옮기기는 11, 건물·비콘 공격은 12의 메시지다. 더 낮게 인사한 연결은 모르는 메시지로 본다
        const needs =
          message.t === "facility_attack"
            ? ATTACK_PROTOCOL_VERSION
            : message.t === "storage_move"
              ? STORAGE_PROTOCOL_VERSION
              : FACILITY_PROTOCOL_VERSION;
        if (protocolVersion < needs) {
          reject("invalid_message");
          return;
        }
        if (!context.facilities) {
          send({ t: "facility_result", id: message.id, ok: false, code: "busy" });
          return;
        }
        facilitySocket ??= context.facilities.open({
          send: sendText,
          viewer: context.viewer ?? signedOut,
          protocolVersion,
        });
        facilitySocket.handle(message);
        return;
      }
      case "temple_pray":
      case "temple_offer":
      case "temple_rite":
      case "dev_inactivate_unit":
      case "dev_guardian_buff": {
        // 신전 명령은 프로토콜 12, 수호신 버프 편집은 13의 메시지다. 더 낮게 인사한 연결은 모르는 메시지로 본다
        const needs =
          message.t === "dev_guardian_buff" ? GUARDIAN_BUFF_PROTOCOL_VERSION : TEMPLE_PROTOCOL_VERSION;
        if (protocolVersion < needs) {
          reject("invalid_message");
          return;
        }
        if (!context.temple) {
          send({ t: "temple_result", id: message.id, ok: false, code: "busy" });
          return;
        }
        templeSocket ??= context.temple.open({ send: sendText, viewer: context.viewer ?? signedOut });
        templeSocket.handle(message);
        return;
      }
      case "restoration_open":
      case "restoration_fund":
      case "dev_make_ruin": {
        // 폐허 복원 명령은 프로토콜 13의 메시지다. 더 낮게 인사한 연결은 모르는 메시지로 본다
        if (protocolVersion < RUINS_PROTOCOL_VERSION) {
          reject("invalid_message");
          return;
        }
        if (!context.ruins) {
          send({ t: "restoration_result", id: message.id, ok: false, code: "busy" });
          return;
        }
        ruinSocket ??= context.ruins.open({
          send: sendText,
          viewer: context.viewer ?? signedOut,
          protocolVersion,
        });
        ruinSocket.handle(message);
        return;
      }
      case "market_place":
      case "market_cancel":
      case "market_watch":
      case "fx_place":
      case "fx_cancel": {
        // 거래소 명령은 프로토콜 14, 환전은 15의 메시지다. 더 낮게 인사한 연결은 모르는 메시지로 본다
        const fx = message.t === "fx_place" || message.t === "fx_cancel";
        if (protocolVersion < (fx ? FX_PROTOCOL_VERSION : MARKET_PROTOCOL_VERSION)) {
          reject("invalid_message");
          return;
        }
        if (!context.market) {
          if (fx) send({ t: "fx_result", id: message.id, ok: false, code: "busy" });
          else send({ t: "market_result", id: message.id, ok: false, code: "busy" });
          return;
        }
        marketSocket ??= context.market.open({ send: sendText, viewer: context.viewer ?? signedOut });
        marketSocket.handle(message);
        return;
      }
      case "travel_start":
      case "travel_cancel": {
        // 2차맵 사이 이동은 프로토콜 16의 메시지다. 더 낮게 인사한 연결은 모르는 메시지로 본다
        if (protocolVersion < TRAVEL_PROTOCOL_VERSION) {
          reject("invalid_message");
          return;
        }
        if (!context.travel) {
          send({ t: "travel_result", id: message.id, ok: false, code: "busy" });
          return;
        }
        travelSocket ??= context.travel.open({ send: sendText, viewer: context.viewer ?? signedOut });
        travelSocket.handle(message);
        return;
      }
      case "gather_start":
      case "gather_stop":
      case "unit_enter": {
        // 채집·들어가기는 프로토콜 17의 메시지다. 더 낮게 인사한 연결은 모르는 메시지로 본다
        if (protocolVersion < GATHER_PROTOCOL_VERSION) {
          reject("invalid_message");
          return;
        }
        if (!context.gather) {
          send({ t: "gather_result", id: message.id, ok: false, code: "busy" });
          return;
        }
        gatherSocket ??= context.gather.open({ send: sendText, viewer: context.viewer ?? signedOut });
        gatherSocket.handle(message);
        return;
      }
      case "hospital_treat":
      case "dev_injure_unit": {
        // 병원 치료는 프로토콜 17의 메시지다. 더 낮게 인사한 연결은 모르는 메시지로 본다
        if (protocolVersion < HOSPITAL_PROTOCOL_VERSION) {
          reject("invalid_message");
          return;
        }
        if (!context.hospital) {
          send({ t: "hospital_result", id: message.id, ok: false, code: "busy" });
          return;
        }
        hospitalSocket ??= context.hospital.open({ send: sendText, viewer: context.viewer ?? signedOut });
        hospitalSocket.handle(message);
        return;
      }
      case "nationality_change": {
        // 국적 바꾸기는 프로토콜 18의 메시지다. 더 낮게 인사한 연결은 모르는 메시지로 본다
        if (protocolVersion < CITIZENSHIP_PROTOCOL_VERSION) {
          reject("invalid_message");
          return;
        }
        if (!context.citizenship) {
          send({ t: "nationality_result", id: message.id, ok: false, code: "busy" });
          return;
        }
        citizenshipSocket ??= context.citizenship.open({
          send: sendText,
          viewer: context.viewer ?? signedOut,
        });
        citizenshipSocket.handle(message);
        return;
      }
    }
  });
}
