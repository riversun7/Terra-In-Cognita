// 가문 금고 채우기·가문세·도시 짓기 정책 메시지(프로토콜 64부터) — 기획 D-574(사용자 답 2026-11-16):
// - 2150 나: 가문 금고는 가문원 기부 + 가문원 수입의 일부(가문세)로 채운다. 가문세율은 가문장이 정한다(기획 해석, 상한은 설정 칸).
// - 2124 나: 같은 나라의 다른 가문 도시에 짓는 것은 그 도시(가문)의 정책으로 정한다. 자기 가문 도시는 늘 짓는다.
// - 2222 → 사용자 D-576: 가문장이 금고에서 개인 지갑으로 꺼낸다(넣기·꺼내기 모두 장부로 가문원에게 공개, 해산 때 남은 돈은 가문장 몫).
// 답은 모두 house_member_result(한 일 donated·tax_set·build_policy_set·vault_taken). house.ts 파일 줄 수 때문에 따로 둔다.
// docs/adr/2026-11-11-faction-identity.md "바뀜 (house-8, D-574)". 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다.
import { z } from "zod";

/** 이 파일의 메시지에 필요한 가장 낮은 프로토콜 버전(더 낮게 인사한 연결이 보내면 invalid_message) */
export const HOUSE_POLICY_PROTOCOL_VERSION = 64;

const requestId = z.number().int().nonnegative().max(0xffff_ffff);
const rowId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
/** 양의 10진 최소 단위(15자리까지 — 가입비 칸과 같은 폭) */
const positiveAmount = z.string().regex(/^[1-9][0-9]{0,14}$/);

/** 가문원이 자기 지갑에서 가문 금고로 기부한다(D-574 2150) */
export const houseDonateMessage = z.object({
  t: z.literal("house_donate"),
  id: requestId,
  /** 기부할 양(그 사람 지갑의 기본 화폐 최소 단위) */
  amount: positiveAmount,
});

/** 가문장이 가문 금고에서 자기 지갑으로 꺼낸다(D-576 — 금고 잔고보다 많으면 insufficient_funds, 가문장이 아니면 not_leader) */
export const houseVaultTakeMessage = z.object({
  t: z.literal("house_vault_take"),
  id: requestId,
  amount: positiveAmount,
});

/** 가문장이 가문세율을 정한다(‰ — 가문원 수입에서 떼어 가문 금고로. 상한은 설정 칸 house_tax_max_pm, 넘으면 tax_too_high) */
export const houseTaxMessage = z.object({
  t: z.literal("house_tax"),
  id: requestId,
  ratePm: z.number().int().min(0).max(1000),
});

/**
 * 도시를 가진 가문의 가문장이 그 도시에 같은 나라의 다른 가문이 짓게 할지 정한다(D-574 2124). allow null = 정하지 않음(설정 칸 기본값
 * house_city_build_default를 따른다)
 */
export const houseBuildPolicyMessage = z.object({
  t: z.literal("house_build_policy"),
  id: requestId,
  cityId: rowId,
  allow: z.boolean().nullable(),
});

export const housePolicyClientMessages = [
  houseDonateMessage,
  houseVaultTakeMessage,
  houseTaxMessage,
  houseBuildPolicyMessage,
] as const;
