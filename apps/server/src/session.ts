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
  CYBORG_LOOK_PROTOCOL_VERSION,
  TERRITORY_PROTOCOL_VERSION,
  RECRUIT_PROTOCOL_VERSION,
  ITEM_PROTOCOL_VERSION,
  TREAT_PROTOCOL_VERSION,
  UNPACK_PROTOCOL_VERSION,
  LABOR_PROTOCOL_VERSION,
  LABOR_ASSIGN_PROTOCOL_VERSION,
  LABOR_JOBS_PROTOCOL_VERSION,
  LABOR_WAIT_PROTOCOL_VERSION,
  FACILITY_CLAIM_PROTOCOL_VERSION,
  ATTACK_PROTOCOL_VERSION,
  FACILITY_PROTOCOL_VERSION,
  STORAGE_PROTOCOL_VERSION,
  BUSINESS_PROTOCOL_VERSION,
  BUSINESS_RESERVE_PROTOCOL_VERSION,
  BUSINESS_SHARES_PROTOCOL_VERSION,
  PLOT_PROTOCOL_VERSION,
  GATHER_TIER_PROTOCOL_VERSION,
  FUSION_PROTOCOL_VERSION,
  GENE_PROTOCOL_VERSION,
  GENE_CONVERT_PROTOCOL_VERSION,
  GENE_INCUBATE_LAB_PROTOCOL_VERSION,
  GUARDIAN_BUFF_PROTOCOL_VERSION,
  BATTLE_ORDER_PROTOCOL_VERSION,
  TEMPLE_PROTOCOL_VERSION,
  FX_PROTOCOL_VERSION,
  LOCKER_PROTOCOL_VERSION,
  MARKET_PROTOCOL_VERSION,
  RUINS_PROTOCOL_VERSION,
  OPERATOR_PACE_PROTOCOL_VERSION,
  TELEPORT_PROTOCOL_VERSION,
  TRAVEL_PROTOCOL_VERSION,
  UNIT_TACTICS_PROTOCOL_VERSION,
  UNIT_CONTROL_PROTOCOL_VERSION,
  GATHER_PROTOCOL_VERSION,
  HOSPITAL_PROTOCOL_VERSION,
  CITIZENSHIP_PROTOCOL_VERSION,
  HOUSE_CITY_PROTOCOL_VERSION,
  HOUSE_INDEPENDENCE_PROTOCOL_VERSION,
  HOUSE_HOME_PROTOCOL_VERSION,
  HOUSE_ENTRY_POLICY_PROTOCOL_VERSION,
  HOUSE_MEMBER_PROTOCOL_VERSION,
  HOUSE_POLICY_PROTOCOL_VERSION,
  NATION_TAX_PROTOCOL_VERSION,
  HOUSE_PROTOCOL_VERSION,
  HOUSE_RECRUIT_PROTOCOL_VERSION,
  COUP_PROTOCOL_VERSION,
  GOVERNANCE_PROTOCOL_VERSION,
  CITY_SHARE_PROTOCOL_VERSION,
  BOAT_PROTOCOL_VERSION,
  GEAR_PROTOCOL_VERSION,
  HARBOR_PROTOCOL_VERSION,
  VOYAGE_PROTOCOL_VERSION,
  HOLD_PROTOCOL_VERSION,
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
import type { BattleOrderGateway, BattleOrderSocket } from "./world/battleOrders.ts";
import type { RuinGateway, RuinSocket } from "./ruins/gateway.ts";
import type { MarketGateway, MarketSocket } from "./market/gateway.ts";
import type { TravelGateway, TravelSocket } from "./travel/gateway.ts";
import type { GatherGateway, GatherSocket } from "./gather/gateway.ts";
import type { BoatGateway, BoatSocket } from "./boats/gateway.ts";
import type { HospitalGateway, HospitalSocket } from "./hospital/gateway.ts";
import type { CitizenshipGateway, CitizenshipSocket } from "./citizenship/gateway.ts";
import type { HouseShareGateway } from "./cityShares/gateway.ts";
import type { WorldGateway, WorldSocket } from "./world/gateway.ts";
import { createOperatorPace } from "./world/operatorPace.ts";

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
  /** 실시간 세계 전투 명령(프로토콜 49, D-571 답 1969 — world/battleOrders.ts). 없으면 busy */
  battles?: BattleOrderGateway | undefined;
  /** 폐허 복원 모금(프로토콜 13, docs/adr/2026-11-07-ruins-restoration.md). 없으면 busy */
  ruins?: RuinGateway | undefined;
  /** 물자 거래소 주문·취소·체결 알림(프로토콜 14, docs/adr/2026-11-07-play-flow.md WP4). 없으면 busy */
  market?: MarketGateway | undefined;
  /** 2차맵 사이 이동(프로토콜 16, docs/adr/2026-11-07-play-flow.md WP9). 없으면 busy */
  travel?: TravelGateway | undefined;
  /** 원자재 오브젝트 채집·건물 들어가기(프로토콜 17, docs/adr/2026-11-07-gather-objects.md) */
  gather?: GatherGateway | undefined;
  /** 배 만들기·타기·내리기(프로토콜 27, docs/adr/2026-11-13-boats.md). 없으면 busy */
  boats?: BoatGateway | undefined;
  /** 병원 치료(프로토콜 17, docs/adr/2026-11-08-injury.md). 없으면 busy */
  hospital?: HospitalGateway | undefined;
  /** 국적 바꾸기(프로토콜 18, docs/adr/2026-11-08-citizenship.md). 없으면 busy */
  citizenship?: CitizenshipGateway | undefined;
  /** 가문 창설(프로토콜 22, docs/adr/2026-11-11-faction-identity.md "바뀜 (926~935 답)"). 없으면 busy */
  /** 가문 + 나라 의결(gov_*, governance/gateway.ts withGovernance) */
  house?: HouseShareGateway | undefined;
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
  let battleSocket: BattleOrderSocket | undefined;
  let ruinSocket: RuinSocket | undefined;
  let marketSocket: MarketSocket | undefined;
  let travelSocket: TravelSocket | undefined;
  let gatherSocket: GatherSocket | undefined;
  let boatSocket: BoatSocket | undefined;
  let hospitalSocket: HospitalSocket | undefined;
  let citizenshipSocket: CitizenshipSocket | undefined;
  let houseSocket: ReturnType<HouseShareGateway["open"]> | undefined;
  let releasePresence: (() => void) | undefined;
  // 이 연결의 운영자 배율(기획 D-560 1246~1248, world/operatorPace.ts): 2차맵 게이트웨이가 바꾸고 유닛 명령 게이트웨이들이 같이 본다
  const operatorPace = createOperatorPace();

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
    battleSocket?.close();
    ruinSocket?.close();
    marketSocket?.close();
    travelSocket?.close();
    gatherSocket?.close();
    boatSocket?.close();
    hospitalSocket?.close();
    citizenshipSocket?.close();
    houseSocket?.close();
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
      case "remove_building":
      case "operator_pace": {
        // 멈추기(stop_unit)는 프로토콜 17, 운영자 배율(operator_pace)은 36의 메시지다(docs/adr/2026-11-07-unit-control.md). 더 낮게 인사한 연결은
        // 모르는 메시지로 본다
        const needs =
          message.t === "stop_unit"
            ? UNIT_CONTROL_PROTOCOL_VERSION
            : message.t === "operator_pace"
              ? OPERATOR_PACE_PROTOCOL_VERSION
              : SECOND_MAP_PROTOCOL_VERSION;
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
          operatorPace,
        });
        worldSocket.handle(message);
        return;
      }
      case "cyborg_roll":
      case "cyborg_create":
      case "cyborg_elements":
      case "cyborg_look": {
        // 굴리기·만들기는 프로토콜 4, 속성 분배는 5, 3D 외형 한 번 고르기는 22의 메시지다. 더 낮게 인사한 연결은 모르는 메시지로 본다
        // (2차맵 메시지와 같은 규칙)
        const needs =
          message.t === "cyborg_look"
            ? CYBORG_LOOK_PROTOCOL_VERSION
            : message.t === "cyborg_elements"
              ? CYBORG_ELEMENTS_PROTOCOL_VERSION
              : CYBORG_PROTOCOL_VERSION;
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
        recruitSocket ??= context.recruit.open({
          send: sendText,
          viewer: context.viewer ?? signedOut,
          protocolVersion,
        });
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
      case "labor_unassign":
      case "labor_wait": {
        // 구인 게시 셋은 판 8부터, 직무 배치 둘은 판 14부터, 멈춘 계약 기다림은 54부터(그 앞 판 기기는 보내지 않는다)
        const needs =
          message.t === "labor_wait"
            ? LABOR_WAIT_PROTOCOL_VERSION
            : message.t === "labor_assign" || message.t === "labor_unassign"
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
          // 운영자 모드(전체 보기) 연결의 직무 배치는 그 유닛에 운영자 빠르기 표시(world/operatorPace.ts)
          observing: () => worldSocket?.observing() === true,
          operatorPace,
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
      case "facility_attack":
      case "facility_plot":
      case "facility_plot_remove":
      case "facility_gather_tier":
      case "facility_claim": {
        // 건물 명령은 프로토콜 10, 창고 옮기기는 11, 건물·비콘 공격은 12, 면적 모듈은 41, 모듈 떼기·기르는 티어는 45, 짓는 중 알박기 고르기
        // 바꾸기는 72의 메시지다. 더 낮게 인사한 연결은 모르는 메시지로 본다
        const needs =
          message.t === "facility_claim"
            ? FACILITY_CLAIM_PROTOCOL_VERSION
            : message.t === "facility_plot_remove" || message.t === "facility_gather_tier"
              ? GATHER_TIER_PROTOCOL_VERSION
              : message.t === "facility_plot"
                ? PLOT_PROTOCOL_VERSION
                : message.t === "facility_attack"
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
          // 운영자 모드(전체 보기) 연결의 건설은 제한 없이(기획 D-560 1239 — facilities/gateway.ts가 권한을 본다)
          observing: () => worldSocket?.observing() === true,
          operatorPace,
        });
        facilitySocket.handle(message);
        return;
      }
      case "business_settle":
      case "business_invest":
      case "business_buy":
      case "business_price":
      case "unit_gift":
      case "business_share_order":
      case "business_share_cancel":
      case "business_reserve": {
        // 사업장 장부 명령은 프로토콜 34, 지분 주문은 38, 지급준비율은 40의 메시지다(건물 게이트웨이가 받는다)
        const needs =
          message.t === "business_reserve"
            ? BUSINESS_RESERVE_PROTOCOL_VERSION
            : message.t === "business_share_order" || message.t === "business_share_cancel"
              ? BUSINESS_SHARES_PROTOCOL_VERSION
              : BUSINESS_PROTOCOL_VERSION;
        if (protocolVersion < needs) {
          reject("invalid_message");
          return;
        }
        if (!context.facilities) {
          send({ t: "business_result", id: message.id, ok: false, code: "busy" });
          return;
        }
        facilitySocket ??= context.facilities.open({
          send: sendText,
          viewer: context.viewer ?? signedOut,
          protocolVersion,
          // 운영자 모드(전체 보기) 연결의 사업장 관리 명령은 남의 사업장에도(facilities/gateway.ts가 권한을 본다)
          observing: () => worldSocket?.observing() === true,
          operatorPace,
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
      case "battle_list":
      case "battle_order": {
        // 세계 전투 명령은 프로토콜 49의 메시지다. 더 낮게 인사한 연결은 모르는 메시지로 본다
        if (protocolVersion < BATTLE_ORDER_PROTOCOL_VERSION) {
          reject("invalid_message");
          return;
        }
        if (!context.battles) {
          const t = message.t === "battle_list" ? "battle_list_result" : "battle_order_result";
          send({ t, id: message.id, ok: false, code: "busy" });
          return;
        }
        battleSocket ??= context.battles.open({ send: sendText, viewer: context.viewer ?? signedOut });
        battleSocket.handle(message);
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
      case "market_locker_expand":
      case "fx_place":
      case "fx_cancel": {
        // 거래소 명령은 프로토콜 14, 환전은 15, 개인 창고 넓히기는 49의 메시지다. 더 낮게 인사한 연결은 모르는 메시지로 본다
        const fx = message.t === "fx_place" || message.t === "fx_cancel";
        const need = fx
          ? FX_PROTOCOL_VERSION
          : message.t === "market_locker_expand"
            ? LOCKER_PROTOCOL_VERSION
            : MARKET_PROTOCOL_VERSION;
        if (protocolVersion < need) {
          reject("invalid_message");
          return;
        }
        if (!context.market) {
          if (fx) send({ t: "fx_result", id: message.id, ok: false, code: "busy" });
          else send({ t: "market_result", id: message.id, ok: false, code: "busy" });
          return;
        }
        marketSocket ??= context.market.open({
          send: sendText,
          viewer: context.viewer ?? signedOut,
          protocolVersion,
        });
        marketSocket.handle(message);
        return;
      }
      case "travel_start":
      case "travel_cancel":
      case "unit_tactics": {
        // 2차맵 사이 이동은 프로토콜 16, 운영자 텔레포트 칸(teleport)은 36, 유닛 AI 작전 저장은 50이다. 더 낮게 인사한 연결은 모르는 메시지로 본다
        const teleport = message.t === "travel_start" && message.teleport === true;
        const needs =
          message.t === "unit_tactics"
            ? UNIT_TACTICS_PROTOCOL_VERSION
            : teleport
              ? TELEPORT_PROTOCOL_VERSION
              : TRAVEL_PROTOCOL_VERSION;
        if (protocolVersion < needs) {
          reject("invalid_message");
          return;
        }
        if (!context.travel) {
          send({ t: "travel_result", id: message.id, ok: false, code: "busy" });
          return;
        }
        travelSocket ??= context.travel.open({
          send: sendText,
          viewer: context.viewer ?? signedOut,
          // 같은 연결이 운영자 모드(전체 보기)로 2차맵을 보고 있으면 보내는 길도 운영자 빠르기
          observing: () => worldSocket?.observing() === true,
          operatorPace,
        });
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
        gatherSocket ??= context.gather.open({
          send: sendText,
          viewer: context.viewer ?? signedOut,
          // 운영자 모드(전체 보기) 연결의 채집·들어가기도 운영자 빠르기(world/operatorPace.ts)
          observing: () => worldSocket?.observing() === true,
          operatorPace,
        });
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
          protocolVersion,
        });
        citizenshipSocket.handle(message);
        return;
      }
      case "house_found": {
        // 가문 창설은 프로토콜 22의 메시지다. 더 낮게 인사한 연결은 모르는 메시지로 본다
        if (protocolVersion < HOUSE_PROTOCOL_VERSION) {
          reject("invalid_message");
          return;
        }
        if (!context.house) {
          send({ t: "house_result", id: message.id, ok: false, code: "busy" });
          return;
        }
        houseSocket ??= context.house.open({
          send: sendText,
          viewer: context.viewer ?? signedOut,
          protocolVersion,
        });
        houseSocket.handle(message);
        return;
      }
      case "nation_tax": {
        // 나라 세금 정하기는 프로토콜 57의 메시지다(질문 2322 나·2373 가 — 가문 게이트웨이가 받아 government/nationTaxPolicy.ts로)
        if (protocolVersion < NATION_TAX_PROTOCOL_VERSION) {
          reject("invalid_message");
          return;
        }
        if (!context.house) {
          send({ t: "nation_tax_result", id: message.id, ok: false, code: "busy" });
          return;
        }
        houseSocket ??= context.house.open({
          send: sendText,
          viewer: context.viewer ?? signedOut,
          protocolVersion,
        });
        houseSocket.handle(message);
        return;
      }
      case "house_invite":
      case "house_apply":
      case "house_answer":
      case "house_withdraw":
      case "house_leave":
      case "house_kick":
      case "house_donate":
      case "house_vault_take":
      case "house_tax":
      case "house_build_policy": {
        // 가문 가입은 프로토콜 23의 메시지다(질문 985 다). 더 낮게 인사한 연결은 모르는 메시지로 본다. 가문 금고 기부·꺼내기·가문세율·도시
        // 짓기 정책은 54부터(D-574·D-576)
        if (
          protocolVersion < HOUSE_MEMBER_PROTOCOL_VERSION ||
          ((message.t === "house_donate" ||
            message.t === "house_vault_take" ||
            message.t === "house_tax" ||
            message.t === "house_build_policy") &&
            protocolVersion < HOUSE_POLICY_PROTOCOL_VERSION)
        ) {
          reject("invalid_message");
          return;
        }
        if (!context.house) {
          send({ t: "house_member_result", id: message.id, ok: false, code: "busy" });
          return;
        }
        houseSocket ??= context.house.open({
          send: sendText,
          viewer: context.viewer ?? signedOut,
          protocolVersion,
        });
        houseSocket.handle(message);
        return;
      }
      case "house_handover":
      case "house_dissolve":
      case "house_home":
      case "house_entry_policy":
      case "house_village":
      case "house_ruin":
      case "house_independence": {
        // 가문장 넘기기·해산·가문 도시는 프로토콜 24, 소속 도시 바꾸기는 39, 가문 이동 정책은 51, 독립 선언은 53의 메시지다(D-565·2018·D-575)
        if (
          protocolVersion < HOUSE_CITY_PROTOCOL_VERSION ||
          (message.t === "house_independence" && protocolVersion < HOUSE_INDEPENDENCE_PROTOCOL_VERSION) ||
          (message.t === "house_home" && protocolVersion < HOUSE_HOME_PROTOCOL_VERSION) ||
          (message.t === "house_entry_policy" && protocolVersion < HOUSE_ENTRY_POLICY_PROTOCOL_VERSION)
        ) {
          reject("invalid_message");
          return;
        }
        if (!context.house) {
          if (
            message.t !== "house_village" &&
            message.t !== "house_ruin" &&
            message.t !== "house_independence"
          )
            send({ t: "house_member_result", id: message.id, ok: false, code: "busy" });
          else send({ t: "house_city_result", id: message.id, ok: false, code: "busy" });
          return;
        }
        houseSocket ??= context.house.open({
          send: sendText,
          viewer: context.viewer ?? signedOut,
          protocolVersion,
        });
        houseSocket.handle(message);
        return;
      }
      case "house_recruit_auto":
      case "house_recruit_hire": {
        // 가문 도시 구인은 프로토콜 25의 메시지다(질문 1041 다)
        if (protocolVersion < HOUSE_RECRUIT_PROTOCOL_VERSION) {
          reject("invalid_message");
          return;
        }
        if (!context.house) {
          send({ t: "house_recruit_result", id: message.id, ok: false, code: "busy" });
          return;
        }
        houseSocket ??= context.house.open({
          send: sendText,
          viewer: context.viewer ?? signedOut,
          protocolVersion,
        });
        houseSocket.handle(message);
        return;
      }
      case "gov_propose":
      case "gov_vote":
      case "gov_candidate":
      case "gov_coup":
      case "gov_coup_join": {
        // 나라 의결(docs/adr/2026-11-21-governance.md)은 GOVERNANCE_PROTOCOL_VERSION(56)의 메시지다(쿠데타는 COUP_PROTOCOL_VERSION). 가문 소켓이 함께 받는다
        const coupOnly = message.t === "gov_coup" || message.t === "gov_coup_join";
        if (protocolVersion < (coupOnly ? COUP_PROTOCOL_VERSION : GOVERNANCE_PROTOCOL_VERSION)) {
          reject("invalid_message");
          return;
        }
        if (!context.house) {
          send({ t: "gov_result", id: message.id, ok: false, code: "busy" });
          return;
        }
        houseSocket ??= context.house.open({
          send: sendText,
          viewer: context.viewer ?? signedOut,
          protocolVersion,
        });
        houseSocket.handle(message);
        return;
      }
      case "city_share_order":
      case "city_share_cancel": {
        // 도시(정부) 지분 주문(docs/adr/2026-11-21-share-market.md)은 CITY_SHARE_PROTOCOL_VERSION의 메시지다. 가문 소켓이 함께 받는다
        if (protocolVersion < CITY_SHARE_PROTOCOL_VERSION) {
          reject("invalid_message");
          return;
        }
        if (!context.house) {
          send({ t: "city_share_result", id: message.id, ok: false, code: "busy" });
          return;
        }
        houseSocket ??= context.house.open({
          send: sendText,
          viewer: context.viewer ?? signedOut,
          protocolVersion,
        });
        houseSocket.handle(message);
        return;
      }
      case "boat_build":
      case "boat_board":
      case "boat_leave":
      case "boat_repair":
      case "boat_berth":
      case "boat_dock_time":
      case "harbor_policy":
      case "boat_release":
      case "boat_refuel":
      case "boat_overheat":
      case "boat_crew":
      case "boat_seize":
      case "boat_unload":
      case "boat_gear":
      case "boat_load": {
        // 배는 프로토콜 27의 메시지, 수리·정박장·교역 부두·주인 설정은 30(docs/adr/2026-11-15-shipyard-harbor.md), 도크 출고·연료·오버히트·보직·빼앗기는 37(D-559),
        // 배 창고 내리기는 43(D-568), 포획 장비·싣기는 49(D-570)
        const harbor = message.t !== "boat_build" && message.t !== "boat_board" && message.t !== "boat_leave";
        const voyage =
          message.t === "boat_release" ||
          message.t === "boat_refuel" ||
          message.t === "boat_overheat" ||
          message.t === "boat_crew" ||
          message.t === "boat_seize";
        const needed =
          message.t === "boat_gear" || message.t === "boat_load"
            ? GEAR_PROTOCOL_VERSION
            : message.t === "boat_unload"
              ? HOLD_PROTOCOL_VERSION
              : voyage
                ? VOYAGE_PROTOCOL_VERSION
                : harbor
                  ? HARBOR_PROTOCOL_VERSION
                  : BOAT_PROTOCOL_VERSION;
        if (protocolVersion < needed) {
          reject("invalid_message");
          return;
        }
        if (!context.boats) {
          send({ t: "boat_result", id: message.id, ok: false, code: "busy" });
          return;
        }
        boatSocket ??= context.boats.open({
          send: sendText,
          viewer: context.viewer ?? signedOut,
          // 운영자 모드(전체 보기) 연결은 남의 부두·배에 명령하고 재료 없이 만든다
          observing: () => worldSocket?.observing() === true,
          operatorPace,
          protocolVersion,
        });
        boatSocket.handle(message);
        return;
      }
    }
  });
}
