// 사이보그 유닛 융합(프로토콜 9부터)·유전자(프로토콜 11부터) 메시지 — 기획 D-470(휴먼 + 기계 부품 → 사이보그 유닛),
// D-478·D-481·D-516(유전자 = 수명이 다한 휴먼·크리쳐에서 남는 인스턴스: 스탯 유전자는 총합·분포·속성, 스킬 유전자는 스킬 하나),
// 49 N46·N47, docs/adr/2026-11-07-cyborg-fusion-genes.md("바뀜 (D-516)").
// - 바꾸는 명령: 융합(cyborg_fuse: 내 휴먼 하나 + 화폐·재료 → 같은 유닛이 사이보그 유닛이 된다), 개발 시험 물자 받기(dev_grant_goods),
//   유전자 합성(gene_synthesize: 스탯 유전자 둘 → 새 스탯 유전자 하나, 총합은 확률로 오름·내림·그대로), 스킬 유전자 주입(gene_inject:
//   내 휴먼이 그 스킬을 등급 1로 배운다), 인큐베이터(gene_incubate: 스탯 유전자 하나로 새 휴먼, 총합 또는 주력 스탯 적용), 개발 시험
//   유전자 받기(dev_grant_gene)·수명 끝내기(dev_expire_unit). 조회(휴먼·비용·사이보그 유닛·유전자)는 tRPC fusion.overview다.
// - 11에서 뺀 것: 유전자 환생(unit_rebirth — D-516 "무작위 +1은 불가능", 유전자는 환생 재료가 아니다 D-441). 10판 기기가 보내면
//   모르는 메시지(invalid_message)다.
// - 기기는 본 값(융합 비용 화폐)을 함께 보낸다: 그 사이 설정 칸 값이 바뀌었으면 서버가 cost_changed로 거절한다.
// - 서버가 판정한다: 소유·유닛 종류·포로·잔고·재료·유전자 종류·스킬 칸·굴림. 결과는 fusion_result 하나로 온다(id = 요청 id).
// 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다: 아이템·스킬 ID 목록은 서버가 확인하고, 여기서는 모양만 본다.
import { z } from "zod";

/** 융합·개발 물자 받기 메시지에 필요한 가장 낮은 프로토콜 버전. 더 낮게 인사한 연결이 보내면 invalid_message로 거절한다 */
export const FUSION_PROTOCOL_VERSION = 9;
/** 유전자 메시지(합성·주입·인큐베이터·개발 시험)에 필요한 가장 낮은 프로토콜 버전 */
export const GENE_PROTOCOL_VERSION = 11;
/**
 * 비활성 휴먼 유전자 변환(gene_convert, D-517 "유전자 조각(생명과학연구소)으로 변환", docs/adr/2026-11-07-temple-religion.md)에 필요한 가장
 * 낮은 프로토콜 버전. 이 메시지의 답에만 새 코드(not_inactive·not_lab·lab_closed·wrong_city)가 간다
 */
export const GENE_CONVERT_PROTOCOL_VERSION = 12;
/** 개발 시험 물자 받기 한 번의 상한(기본 단위 개 또는 화폐 최소 단위) */
export const DEV_GRANT_GOODS_MAX = 1_000_000;
/** 개발 시험 물자 받기에서 화폐(시험 화폐)를 가리키는 값 */
export const DEV_GRANT_CURRENCY = "currency";
/** 인큐베이터 적용 방식(D-516 "총합이나 주력 스탯 등을 선택하여 적용") */
export const GENE_APPLY_MODES = ["total", "main"] as const;
/** 합성 결과 총합(오름·내림·그대로) */
export const GENE_OUTCOMES = ["up", "down", "keep"] as const;

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

/** 개발 시험: 내 장부에 쌓이는 물자(아이템 ID) 또는 시험 화폐("currency")를 받는다(dev·admin) */
export const devGrantGoodsMessage = z.object({
  t: z.literal("dev_grant_goods"),
  id: requestId,
  item: listId,
  quantity: z.number().int().positive().max(DEV_GRANT_GOODS_MAX),
});

/** 내 스탯 유전자 둘(보유 물건 ID, 같은 종)을 합성해 새 스탯 유전자 하나를 만든다(둘 다 사라짐, D-516) */
export const geneSynthesizeMessage = z.object({
  t: z.literal("gene_synthesize"),
  id: requestId,
  a: rowId,
  b: rowId,
});

/** 내 스킬 유전자 하나를 내 휴먼에게 주입한다: 그 스킬을 등급 1로 배운다(스킬 칸 규칙 그대로, 유전자는 사라짐, D-478) */
export const geneInjectMessage = z.object({
  t: z.literal("gene_inject"),
  id: requestId,
  gene: rowId,
  unit: rowId,
});

/**
 * 인큐베이터: 내 스탯 유전자 하나로 새 휴먼을 만든다(적용 = 총합 또는 주력 스탯, 유전자는 사라짐, D-478·D-516). 팩에 인큐베이터 시설이
 * 아직 없어 지금은 dev·admin만(그 밖은 forbidden)
 */
export const geneIncubateMessage = z.object({
  t: z.literal("gene_incubate"),
  id: requestId,
  gene: rowId,
  apply: z.enum(GENE_APPLY_MODES),
});

/** 개발 시험: 시험 유전자 하나를 받는다(dev·admin). 스탯 유전자는 굴린 값, 스킬 유전자는 skill(없으면 팩 첫 스킬) */
export const devGrantGeneMessage = z.object({
  t: z.literal("dev_grant_gene"),
  id: requestId,
  kind: z.enum(["stat", "skill"]),
  skill: listId.optional(),
});

/**
 * 개발 시험: 내 휴먼을 바로 유전자로 바꾼다(연구소·비활성·값 없이 변환 처리만 — 유전자가 남고 유닛이 떠난다, dev·admin). 이름은 판 11 그대로다.
 * 수명을 끝내 비활성으로 만드는 시험은 temple.ts dev_inactivate_unit
 */
export const devExpireUnitMessage = z.object({
  t: z.literal("dev_expire_unit"),
  id: requestId,
  unit: rowId,
});

/**
 * 비활성인 내 휴먼을 그 생명과학 연구소에서 유전자로 바꾼다(스탯 유전자 하나 + 배운 스킬마다 스킬 유전자, 유닛은 떠난다, D-517). 연구소가 선
 * 도시에 그 유닛이 있어야 한다. cost = 기기가 본 변환 화폐(10진 문자열). 프로토콜 12부터
 */
export const geneConvertMessage = z.object({
  t: z.literal("gene_convert"),
  id: requestId,
  buildingId: rowId,
  unit: rowId,
  cost: amount,
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
  /** 그 명령을 받을 수 없는 유닛 종류(융합·주입·수명 끝내기 = 내가 고용한 휴먼만) */
  "wrong_kind",
  /** 잡힌 유닛(포로) */
  "captive",
  /** 기기가 본 값이 지금 설정 칸 값과 다르다 — 다시 받는다 */
  "cost_changed",
  /** 화폐가 모자람 */
  "insufficient_funds",
  /** 재료가 모자람(티타늄 괴·마이크로칩) */
  "insufficient_materials",
  /** 그 종·종류의 유전자 아이템이 팩에 없다(꺼짐 포함) */
  "no_gene",
  /** 개발 시험 받기: 쌓이는 물자가 아니거나 없는 아이템 */
  "unknown_item",
  /** 내 유전자가 아니거나 없다 */
  "unknown_gene",
  /** 그 명령에 맞지 않는 유전자(합성·인큐베이터 = 스탯 유전자, 주입 = 스킬 유전자, 합성은 같은 종끼리, 주입은 그 종 유닛에게) */
  "wrong_gene",
  /** 합성에 같은 유전자를 두 번 골랐다 */
  "same_gene",
  /** 그 스킬이 팩에 없거나 꺼졌다 */
  "unknown_skill",
  /** 이미 배운 스킬 */
  "skill_known",
  /** 스킬 칸이 모두 찼다(유닛 종류 스킬 칸 규칙) */
  "no_skill_slot",
  /** 새 휴먼을 세울 빈 칸이 없다 */
  "no_room",
  /** 비활성이 아니다(수명이 남았다, 변환 — 판 12) */
  "not_inactive",
  /** 생명과학 연구소가 아니거나 없다(판 12) */
  "not_lab",
  /** 연구소가 짓는 중이거나 기능 정지(30% 미만, 판 12) */
  "lab_closed",
  /** 그 유닛이 연구소가 선 도시에 있지 않다(판 12) */
  "wrong_city",
] as const;
export type FusionResultCode = (typeof FUSION_RESULT_CODES)[number];

const stats = z.array(z.number().int().nonnegative().max(1_000_000)).length(6);

const fusionResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("fusion_result"),
    id: requestId,
    ok: z.literal(true),
    /** 융합한 유닛·주입받은 유닛·인큐베이터로 태어난 유닛·수명이 끝난 유닛(그 밖은 없음) */
    unitId: rowId.optional(),
    /** 새 1차 스탯 STR·DEX·AGI·VIT·INT·WIS(융합·인큐베이터) */
    stats: stats.optional(),
    /** 융합 보너스 배율(‰) */
    bonusPm: z.number().int().nonnegative().max(1_000_000).optional(),
    /** 새로 생긴 유전자(합성·개발 시험 받기, 보유 물건 ID) */
    gene: rowId.optional(),
    /** 변환으로 남은 유전자(gene_convert·개발 시험) */
    genes: z.array(rowId).max(64).optional(),
    /** 합성 결과 총합(오름·내림·그대로)과 새 총합 */
    outcome: z.enum(GENE_OUTCOMES).optional(),
    total: z.number().int().nonnegative().max(1_000_000).optional(),
    /** 주입으로 배운 스킬 */
    skill: listId.optional(),
  }),
  z.object({
    t: z.literal("fusion_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(FUSION_RESULT_CODES),
  }),
]);

export const fusionClientMessages = [
  cyborgFuseMessage,
  devGrantGoodsMessage,
  geneSynthesizeMessage,
  geneInjectMessage,
  geneIncubateMessage,
  devGrantGeneMessage,
  devExpireUnitMessage,
  geneConvertMessage,
] as const;
export const fusionServerMessages = [fusionResultMessage] as const;
