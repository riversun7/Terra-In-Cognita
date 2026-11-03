// 영토 비콘 메시지 (프로토콜 7부터) — docs/adr/2026-11-03-territory-layer.md 4절, 기획 D-485·D-486·49 N42·N51.
// - 바꾸는 명령: 비콘 놓기(beacon_place), 치우기(beacon_remove). 조회(세력 영토·비콘 목록)는 tRPC territory.*다.
// - 서버가 판정한다: 세력(가입한 세력, 개발 시험은 factionId로 다른 세력), 칸(그 행성 면 레벨 칸), 같은 칸 비콘, 기준 도시(N42 거리·개수),
//   다른 세력 도시 영향권(D-486), 팩 시설 territory_beacon이 있는지(시설은 늘 켜져 있다). 결과는 beacon_result 하나(id = 요청 id). 오류는 코드다.
// 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다: 셀 키 검사·행성 ID 목록은 서버가 본다.
import { z } from "zod";

/** 영토 메시지에 필요한 가장 낮은 프로토콜 버전. 더 낮게 인사한 연결이 보내면 invalid_message로 거절한다 */
export const TERRITORY_PROTOCOL_VERSION = 7;

const u32 = z.number().int().nonnegative().max(0xffff_ffff);
const requestId = u32;
const rowId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
/** 행성 ID(콘텐츠 팩 ID 모양). 세계에 있는지는 서버가 본다 */
const planetId = z
  .string()
  .min(2)
  .max(48)
  .regex(/^[a-z][a-z0-9_]*$/);
/** 1차맵 칸 키(면 레벨 F 칸). 셀 키·레벨 검사는 서버가 한다 */
const cellKey = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

// ---------- 기기 → 서버 ----------

/** 비콘 놓기. factionId는 개발 시험(권한 territory: dev-place)만 쓴다 — 없으면 내가 가입한 세력 */
export const beaconPlaceMessage = z.object({
  t: z.literal("beacon_place"),
  id: requestId,
  planetId,
  cellKey,
  factionId: rowId.optional(),
});

/** 비콘 치우기(내 세력 비콘, 개발 시험은 아무 비콘). 꼭짓점이 빠져 도형을 다시 셈한다(D-485) */
export const beaconRemoveMessage = z.object({
  t: z.literal("beacon_remove"),
  id: requestId,
  beaconId: rowId,
});

// ---------- 서버 → 기기 ----------

export const BEACON_RESULT_CODES = [
  "sign_in_required",
  /** 세계가 준비 중이거나 저장 대기열이 밀림 — 다시 해 볼 수 있다 */
  "busy",
  "rate_limited",
  /** 다른 세력 대신 놓기·치우기를 권한 없이 함 */
  "forbidden",
  /** 가입한 세력이 없다 */
  "no_faction",
  "unknown_planet",
  /** 셀 키가 아니거나 그 행성의 1차맵 칸(면 레벨) 칸이 아님 */
  "invalid_cell",
  /** 그 칸에 이미 비콘이 있다(1차맵 칸 하나에 하나, D-485) */
  "cell_taken",
  /** 그 세력 도시가 비콘 거리(N42) 안에 없다 */
  "out_of_range",
  /** 거리 안 도시들의 비콘 수(N42)가 모두 찼다 */
  "beacon_limit",
  /** 다른 세력 도시의 영향권 안(D-486) */
  "foreign_city",
  /** 팩에 영토 비콘 시설(territory_beacon)이 없다(시설은 늘 켜져 있고, 켬·끔 칸이 없다) */
  "disabled",
  "unknown_beacon",
  "internal_error",
] as const;
export type BeaconResultCode = (typeof BEACON_RESULT_CODES)[number];

const beaconResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("beacon_result"),
    id: requestId,
    ok: z.literal(true),
    /** beacon_place면 새 비콘 ID */
    beaconId: rowId.optional(),
  }),
  z.object({
    t: z.literal("beacon_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(BEACON_RESULT_CODES),
  }),
]);

export const territoryClientMessages = [beaconPlaceMessage, beaconRemoveMessage] as const;
export const territoryServerMessages = [beaconResultMessage] as const;
