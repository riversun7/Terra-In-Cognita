// 메시지 정의 (Zod 스키마 = 런타임 검증 + 타입)
// 2차맵 메시지(구독·명령·전송)는 secondMap.ts(프로토콜 2부터), 사이보그 만들기 메시지는 cyborg.ts(프로토콜 4부터),
// 보유 물건 메시지는 items.ts(프로토콜 6부터), 영토 비콘 메시지는 territory.ts, 구인 카드 고용 메시지는 recruit.ts, 노동 계약 명령은
// labor.ts(셋 다 프로토콜 7부터, 노동 계약의 구인 게시는 8부터), 사이보그 유닛 융합은 fusion.ts(프로토콜 9부터, 유전자는 11부터),
// 건물 짓기·수리 명령은 facilities.ts(프로토콜 10부터), 신전 기도·헌금·의식은 temple.ts(프로토콜 12부터), 폐허 복원 모금은
// ruins.ts(프로토콜 13부터), 물자 거래소 주문·취소·체결 알림은 market.ts(프로토콜 14부터), 2차맵 사이 이동은 travel.ts(프로토콜 16부터),
// 원자재 오브젝트 채집·건물 들어가기는 gather.ts, 병원 치료는 hospital.ts(둘 다 프로토콜 17부터), 국적 바꾸기(귀화)는 citizenship.ts(프로토콜
// 18부터), 가문 창설은 house.ts(프로토콜 22부터, 가문 가입은 23부터, 넘기기·해산·가문 도시는 24부터), 가문 도시 구인은
// houseRecruit.ts(프로토콜 25부터), 나라 의결(안건·투표·후보)은 governance.ts, 배 만들기·타기·내리기는 boats.ts(프로토콜 27부터), 사업장 장부 명령은 business.ts(프로토콜 34부터),
// 나라 세금 정하기는 nationTax.ts(프로토콜 57부터), 사는 곳 고르기는 residence.ts(줄기 판 99부터)에 있다.
import { z } from "zod";
import { citizenshipClientMessages, citizenshipServerMessages } from "./citizenship.ts";
import { cyborgClientMessages, cyborgServerMessages } from "./cyborg.ts";
import { facilityClientMessages, facilityServerMessages } from "./facilities.ts";
import { fusionClientMessages, fusionServerMessages } from "./fusion.ts";
import { hospitalClientMessages, hospitalServerMessages } from "./hospital.ts";
import { houseClientMessages, houseServerMessages } from "./house.ts";
import { houseRecruitClientMessages, houseRecruitServerMessages } from "./houseRecruit.ts";
import { governanceClientMessages, governanceServerMessages } from "./governance.ts";
import { housePolicyClientMessages } from "./housePolicy.ts";
import { nationTaxClientMessages, nationTaxServerMessages } from "./nationTax.ts";
import { residenceClientMessages, residenceServerMessages } from "./residence.ts";
import { itemClientMessages, itemServerMessages } from "./items.ts";
import { laborClientMessages, laborServerMessages } from "./labor.ts";
import { marketClientMessages, marketServerMessages } from "./market.ts";
import { recruitClientMessages, recruitServerMessages } from "./recruit.ts";
import { ruinsClientMessages, ruinsServerMessages } from "./ruins.ts";
import { secondMapClientMessages, secondMapServerMessages } from "./secondMap.ts";
import { templeClientMessages, templeServerMessages } from "./temple.ts";
import { territoryClientMessages, territoryServerMessages } from "./territory.ts";
import { travelClientMessages, travelServerMessages } from "./travel.ts";
import { gatherClientMessages, gatherServerMessages } from "./gather.ts";
import { boatClientMessages, boatServerMessages } from "./boats.ts";
import { businessClientMessages, businessServerMessages } from "./business.ts";
import { battleOrderClientMessages, battleOrderServerMessages } from "./battleOrder.ts";

const nonNegativeInt = z.number().int().nonnegative();
const timestampMs = z.number().nonnegative();

// ---------- 기기 → 서버 ----------

/** 접속 직후 첫 메시지. 버전이 맞지 않으면 서버가 reject 후 연결을 끊는다. */
const helloMessage = z.object({
  t: z.literal("hello"),
  protocolVersion: nonNegativeInt,
  clientBuild: z.string().min(1).max(64),
});

/** 시계 차이 측정용 */
const pingMessage = z.object({
  t: z.literal("ping"),
  id: nonNegativeInt,
  clientSendTime: timestampMs,
});

export const clientMessageSchema = z.discriminatedUnion("t", [
  helloMessage,
  pingMessage,
  ...secondMapClientMessages,
  ...cyborgClientMessages,
  ...territoryClientMessages,
  ...itemClientMessages,
  ...recruitClientMessages,
  ...laborClientMessages,
  ...fusionClientMessages,
  ...facilityClientMessages,
  ...templeClientMessages,
  ...ruinsClientMessages,
  ...marketClientMessages,
  ...travelClientMessages,
  ...gatherClientMessages,
  ...hospitalClientMessages,
  ...citizenshipClientMessages,
  ...houseClientMessages,
  ...houseRecruitClientMessages,
  ...housePolicyClientMessages,
  ...governanceClientMessages,
  ...nationTaxClientMessages,
  ...residenceClientMessages,
  ...boatClientMessages,
  ...businessClientMessages,
  ...battleOrderClientMessages,
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

// ---------- 서버 → 기기 ----------

const welcomeMessage = z.object({
  t: z.literal("welcome"),
  protocolVersion: nonNegativeInt,
  simVersion: nonNegativeInt,
  contentVersion: z.string().min(1),
  serverTime: timestampMs,
});

/** 거절 사유는 문장 대신 코드로 보낸다 (기기가 번역) */
const rejectMessage = z.object({
  t: z.literal("reject"),
  code: z.enum(["protocol_unsupported", "hello_required", "invalid_message"]),
  minProtocolVersion: nonNegativeInt,
});

const pongMessage = z.object({
  t: z.literal("pong"),
  id: nonNegativeInt,
  clientSendTime: timestampMs,
  serverTime: timestampMs,
});

export const serverMessageSchema = z.discriminatedUnion("t", [
  welcomeMessage,
  rejectMessage,
  pongMessage,
  ...secondMapServerMessages,
  ...cyborgServerMessages,
  ...territoryServerMessages,
  ...itemServerMessages,
  ...recruitServerMessages,
  ...laborServerMessages,
  ...fusionServerMessages,
  ...facilityServerMessages,
  ...templeServerMessages,
  ...ruinsServerMessages,
  ...marketServerMessages,
  ...travelServerMessages,
  ...gatherServerMessages,
  ...hospitalServerMessages,
  ...citizenshipServerMessages,
  ...houseServerMessages,
  ...houseRecruitServerMessages,
  ...governanceServerMessages,
  ...nationTaxServerMessages,
  ...residenceServerMessages,
  ...boatServerMessages,
  ...businessServerMessages,
  ...battleOrderServerMessages,
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;

/** `t`로 고른 메시지 타입 (예: `ClientMessageOf<"subscribe">`) */
export type ClientMessageOf<T extends ClientMessage["t"]> = Extract<ClientMessage, { t: T }>;
export type ServerMessageOf<T extends ServerMessage["t"]> = Extract<ServerMessage, { t: T }>;
