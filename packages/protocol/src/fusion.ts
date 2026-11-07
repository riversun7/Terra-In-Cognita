// 사이보그 유닛 융합·유전자 환생 메시지(프로토콜 9부터) — 기획 D-470(휴먼 + 기계 부품 → 사이보그 유닛), D-478·D-481(유전자 조각),
// 49 N46·N47, docs/adr/2026-11-07-cyborg-fusion-genes.md.
// - 바꾸는 명령: 융합(cyborg_fuse: 내 휴먼 하나 + 화폐·재료 → 같은 유닛이 사이보그 유닛이 된다), 유전자 환생(unit_rebirth: 수명이 다한
//   내 휴먼이 그 종의 스탯 유전자 조각을 써서 다시 태어난다), 개발 시험 물자 받기(dev_grant_goods, dev·admin).
//   조회(융합할 수 있는 휴먼·비용·내 사이보그 유닛·가진 조각)는 tRPC fusion.overview다.
// - 기기는 본 값(융합 비용 화폐·환생 조각 수)을 함께 보낸다: 그 사이 설정 칸 값이 바뀌었으면 서버가 cost_changed로 거절한다.
// - 서버가 판정한다: 소유·유닛 종류·포로·잔고·재료·조각·수명·굴림. 결과는 fusion_result 하나로 온다(id = 요청 id).
// 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다: 아이템 ID 목록은 서버가 확인하고, 여기서는 모양만 본다.
import { z } from "zod";

/** 융합·유전자 메시지에 필요한 가장 낮은 프로토콜 버전. 더 낮게 인사한 연결이 보내면 invalid_message로 거절한다 */
export const FUSION_PROTOCOL_VERSION = 9;
/** 개발 시험 물자 받기 한 번의 상한(기본 단위 개 또는 화폐 최소 단위) */
export const DEV_GRANT_GOODS_MAX = 1_000_000;
/** 개발 시험 물자 받기에서 화폐(시험 화폐)를 가리키는 값 */
export const DEV_GRANT_CURRENCY = "currency";

const requestId = z.number().int().nonnegative().max(0xffff_ffff);
const rowId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const amount = z.string().regex(/^(0|[1-9][0-9]{0,30})$/);
const listId = z
  .string()
  .min(2)
  .max(48)
  .regex(/^[a-z][a-z0-9_]*$/);

// ---------- 기기 → 서버 ----------

/** 내 휴먼 하나를 사이보그 유닛으로 융합한다(휴먼 + 기계 부품, D-470). cost = 기기가 본 융합 화폐(10진 문자열) */
export const cyborgFuseMessage = z.object({
  t: z.literal("cyborg_fuse"),
  id: requestId,
  human: rowId,
  cost: amount,
});

/** 수명이 다한 내 휴먼을 그 종의 스탯 유전자 조각으로 다시 태어나게 한다(옛 reincarnate). shards = 기기가 본 조각 수 */
export const unitRebirthMessage = z.object({
  t: z.literal("unit_rebirth"),
  id: requestId,
  unit: rowId,
  shards: z.number().int().positive().max(10_000),
});

/** 개발 시험: 내 장부에 쌓이는 물자(아이템 ID) 또는 시험 화폐("currency")를 받는다(dev·admin) */
export const devGrantGoodsMessage = z.object({
  t: z.literal("dev_grant_goods"),
  id: requestId,
  item: listId,
  quantity: z.number().int().positive().max(DEV_GRANT_GOODS_MAX),
});

// ---------- 서버 → 기기 ----------

/** 결과 코드. 화면 문구는 기기가 코드로 고른다 */
export const FUSION_RESULT_CODES = [
  "sign_in_required",
  /** 세계가 준비 중이거나 저장 대기열이 밀림 — 다시 해 볼 수 있다 */
  "busy",
  "rate_limited",
  "internal_error",
  /** 권한 없음(개발 시험 명령) */
  "forbidden",
  /** 사이보그가 아직 없다(유닛 소유자 = 사이보그, D-469) */
  "no_cyborg",
  /** 내 유닛이 아니거나 없다 */
  "unknown_unit",
  /** 그 명령을 받을 수 없는 유닛 종류(융합·환생 = 내가 고용한 휴먼만) */
  "wrong_kind",
  /** 잡힌 유닛(포로) */
  "captive",
  /** 기기가 본 값이 지금 설정 칸 값과 다르다 — 다시 받는다 */
  "cost_changed",
  /** 화폐가 모자람 */
  "insufficient_funds",
  /** 재료가 모자람(티타늄 괴·마이크로칩) */
  "insufficient_materials",
  /** 유전자 조각이 모자람 */
  "insufficient_genes",
  /** 그 종의 스탯 유전자가 팩에 없다(꺼짐 포함) */
  "no_gene",
  /** 수명이 아직 남았다(환생은 수명이 다한 유닛만) */
  "alive",
  /** 개발 시험 받기: 쌓이는 물자가 아니거나 없는 아이템 */
  "unknown_item",
] as const;
export type FusionResultCode = (typeof FUSION_RESULT_CODES)[number];

const stats = z.array(z.number().int().nonnegative().max(1_000_000)).length(6);

const fusionResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("fusion_result"),
    id: requestId,
    ok: z.literal(true),
    /** 융합·환생한 유닛(dev_grant_goods면 없음) */
    unitId: rowId.optional(),
    /** 새 1차 스탯 STR·DEX·AGI·VIT·INT·WIS(융합·환생) */
    stats: stats.optional(),
    /** 융합 보너스 배율(‰) */
    bonusPm: z.number().int().nonnegative().max(1_000_000).optional(),
    /** 환생이 쓴 조각 수 */
    shards: z.number().int().nonnegative().max(10_000).optional(),
  }),
  z.object({
    t: z.literal("fusion_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(FUSION_RESULT_CODES),
  }),
]);

export const fusionClientMessages = [cyborgFuseMessage, unitRebirthMessage, devGrantGoodsMessage] as const;
export const fusionServerMessages = [fusionResultMessage] as const;
