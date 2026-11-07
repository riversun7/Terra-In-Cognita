// 보유 물건 메시지(프로토콜 6부터) — docs/adr/2026-11-03-item-holdings.md 5절, 기획 D-496·D-501·N49.
// - 바꾸는 명령: 입기(item_equip, 내구도 0이면 못 입음)·벗기(item_unequip)·쓰기(item_use, 효과량은 서버가 D-501 식으로 굴림, 수량 −1,
//   물약은 유닛마다 쿨 D-509)·
//   개발 시험 받기(dev_grant_item, dev·admin)·개발 시험 병원 치료(dev_treat_unit, dev·admin, 프로토콜 9, D-514). 조회(가진 물건·걸린
//   효과)는 tRPC holdings.list, 생명 수치는 vitals.list다.
// - 서버가 판정한다: 소유·자리·칸·내구도·효과 교체(같은 효과는 높은 것만, 같은 묶음의 다른 효과는 confirm). 기기는 결과만 보인다.
// - 결과는 item_result 하나로 온다(id = 요청 id). 오류는 코드다(기기가 번역).
// 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다: 아이템 ID 목록은 서버가 확인하고, 여기서는 모양만 본다.
import { z } from "zod";

/** 보유 물건 메시지에 필요한 가장 낮은 프로토콜 버전 */
export const ITEM_PROTOCOL_VERSION = 6;

const requestId = z.number().int().nonnegative().max(0xffff_ffff);
const rowId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const listId = z
  .string()
  .min(2)
  .max(48)
  .regex(/^[a-z][a-z0-9_]*$/);

// ---------- 기기 → 서버 ----------

/** 든 물건을 그 유닛의 칸(유닛 종류 칸 배치 차례)에 입는다. 그 칸에 있던 것은 벗어 든다 */
export const itemEquipMessage = z.object({
  t: z.literal("item_equip"),
  id: requestId,
  holding: rowId,
  slot: z.number().int().nonnegative().max(31),
});

/** 입은 물건을 벗어 든다 */
export const itemUnequipMessage = z.object({ t: z.literal("item_unequip"), id: requestId, holding: rowId });

/** 든 소모품 하나를 그 유닛이 쓴다. confirm = 같은 묶음의 다른 효과가 사라져도 쓴다(확인 창 뒤, D-501) */
export const itemUseMessage = z.object({
  t: z.literal("item_use"),
  id: requestId,
  holding: rowId,
  confirm: z.boolean().optional(),
});

/** 개발 시험: 내 유닛(없으면 내 사이보그)에 아이템을 받는다(dev·admin, 굴림은 얻는 때 규칙 그대로) */
export const devGrantItemMessage = z.object({
  t: z.literal("dev_grant_item"),
  id: requestId,
  item: listId,
  quantity: z.number().int().positive().max(1000),
  unit: rowId.optional(),
});

/** 개발 시험(D-514): 내 유닛(없으면 내 사이보그)을 병원 치료한다 — 부상을 지우고 HP를 가득(dev·admin, 병원 시설이 생기기 전 규칙 고리) */
export const devTreatUnitMessage = z.object({
  t: z.literal("dev_treat_unit"),
  id: requestId,
  unit: rowId.optional(),
});

/** 개발 시험 병원 치료에 필요한 가장 낮은 프로토콜 버전 */
export const TREAT_PROTOCOL_VERSION = 9;

// ---------- 서버 → 기기 ----------

export const ITEM_RESULT_CODES = [
  "sign_in_required",
  /** 세계가 준비 중이거나 저장 대기열이 밀림 — 다시 해 볼 수 있다 */
  "busy",
  "rate_limited",
  "internal_error",
  /** 권한 없음(개발 시험 명령) */
  "forbidden",
  /** 월드에 내 소유 주체·유닛이 아직 없다 */
  "no_owner",
  /** 내 것이 아니거나 없는 물건·유닛 */
  "unknown_holding",
  "unknown_unit",
  /** 실효 팩에 없거나 꺼진 아이템(끈 항목은 새로 나오지 않는다 D-398) */
  "unknown_item",
  /** 보유 물건이 아닌 물자(원장 물자) */
  "not_holdable",
  /** 유닛이 들고 있지 않음(창고에 있는 물건) */
  "not_carried",
  /** 그 칸에 입을 수 없음(칸 종류·유닛 종류) */
  "wrong_slot",
  /** 내구도 0(입지 못함, 수리 필요) */
  "broken",
  /** 쓸 수 없는 물건(사용 효과 없음) */
  "not_usable",
  /** 전투 중에만 쓰는 효과(회복 등, 287) */
  "battle_only",
  /** 바뀌는 것이 없음(지금 효과가 같거나 더 높음, 낭비 막기 D-501) */
  "not_better",
  /** 같은 묶음의 다른 효과가 사라짐 — confirm으로 다시 보낸다(D-501) */
  "confirm_replace",
  /** 쓰기 쿨 중(D-509 물약 30초) — readyAt에 다시 쓸 수 있다 */
  "cooldown",
] as const;
export type ItemResultCode = (typeof ITEM_RESULT_CODES)[number];

const itemResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("item_result"),
    id: requestId,
    ok: z.literal(true),
    /** dev_grant_item이면 받은 칸 ID들 */
    holdings: z.array(rowId).max(1000).optional(),
    /** item_use면 굴린 효과량 */
    effects: z
      .array(z.object({ effect: listId, amount: z.number().int() }))
      .max(8)
      .optional(),
  }),
  z.object({
    t: z.literal("item_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(ITEM_RESULT_CODES),
    /** confirm_replace면 사라질 효과 */
    effects: z.array(listId).max(16).optional(),
    /** cooldown이면 다시 쓸 수 있는 시각(서버 ms) */
    readyAt: z.number().int().nonnegative().optional(),
  }),
]);

export const itemClientMessages = [
  itemEquipMessage,
  itemUnequipMessage,
  itemUseMessage,
  devGrantItemMessage,
  devTreatUnitMessage,
] as const;
export const itemServerMessages = [itemResultMessage] as const;
