// 정부 판 나라 세금 칸의 글자·입력 셈(순수 함수 — NationTaxPolicy.tsx가 쓴다). 줄기 tax-2(질문 2322 나·2373 가).
// 소득세는 만분율(화면은 %, 소수 둘째 자리까지), 주민세·국세 몫은 ‰, 주기는 날. 빈칸 = 정하지 않음(기본값을 따른다). 범위는 프로토콜과 같다(NATION_TAX_LIMITS).
import type { GovernmentTaxField, GovernmentTaxSource, GovernmentTaxes } from "@terra/shared/government";
import { NATION_TAX_LIMITS } from "@terra/protocol";
import { m } from "../paraglide/messages.js";
import { type Locale, getLocale } from "../paraglide/runtime.js";

/** 정한 곳 → 덧말 */
export function taxSourceText(source: GovernmentTaxSource): string {
  if (source === "leader") return m.government_tax_source_leader();
  return source === "npc" ? m.government_tax_source_npc() : m.government_tax_source_default();
}

/** ‰ 값 → "5‰" */
export function permilleText(value: number, locale: Locale = getLocale()): string {
  return m.government_tax_pm({ value: new Intl.NumberFormat(locale).format(value) });
}

/** 입력 칸 처음 값(정한 값이 없으면 빈칸) — 소득세는 % 글자 */
export function draftOf(field: GovernmentTaxField, percent: boolean): string {
  if (field.own === null) return "";
  return percent ? String(field.own / 100) : String(field.own);
}

/** 정수 칸 하나 읽기: 빈칸 = null(정하지 않음), 범위 밖·글자면 undefined */
function parseWhole(
  text: string,
  range: { readonly min: number; readonly max: number },
): number | null | undefined {
  const value = text.trim();
  if (value === "") return null;
  if (!/^[0-9]{1,6}$/.test(value)) return undefined;
  const n = Number(value);
  return n >= range.min && n <= range.max ? n : undefined;
}

/** 소득세 % 글자 → 만분율(소수 둘째 자리까지 — "2.5" → 250). 빈칸 = null, 틀리면 undefined */
export function parseIncomePercent(text: string): number | null | undefined {
  const value = text.trim().replace(",", ".");
  if (value === "") return null;
  const match = /^([0-9]{1,3})(?:\.([0-9]{1,2}))?$/.exec(value);
  if (!match) return undefined;
  const bp = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return bp <= NATION_TAX_LIMITS.incomeTaxBp.max ? bp : undefined;
}

export interface NationTaxDraft {
  readonly income: string;
  readonly resident: string;
  readonly every: string;
  readonly share: string;
}

/** 지금 칸들의 처음 입력 값 */
export function draftsOf(taxes: GovernmentTaxes): NationTaxDraft {
  return {
    income: draftOf(taxes.incomeTaxBp, true),
    resident: draftOf(taxes.residentTaxPm, false),
    every: draftOf(taxes.residentEveryDays, false),
    share: draftOf(taxes.residentNationPm, false),
  };
}

/** 입력 → 보낼 값(칸마다 null = 정하지 않음). 하나라도 틀리면 null */
export function parseNationTaxDraft(draft: NationTaxDraft): {
  incomeTaxBp: number | null;
  residentTaxPm: number | null;
  residentEveryDays: number | null;
  residentNationPm: number | null;
} | null {
  const incomeTaxBp = parseIncomePercent(draft.income);
  const residentTaxPm = parseWhole(draft.resident, NATION_TAX_LIMITS.residentTaxPm);
  const residentEveryDays = parseWhole(draft.every, NATION_TAX_LIMITS.residentEveryDays);
  const residentNationPm = parseWhole(draft.share, NATION_TAX_LIMITS.residentNationPm);
  if (
    incomeTaxBp === undefined ||
    residentTaxPm === undefined ||
    residentEveryDays === undefined ||
    residentNationPm === undefined
  )
    return null;
  return { incomeTaxBp, residentTaxPm, residentEveryDays, residentNationPm };
}

type TaxBody = NonNullable<ReturnType<typeof parseNationTaxDraft>>;

/**
 * 정한 뒤 바로 보일 칸(서버가 다시 셈하기 전): 정한 칸은 지도자 값, 빈칸은 기본값. 지도자가 정했던 칸을 비우면 기본값 수치를 모르므로 stale = true(다시 열면
 * 서버 값 — 화면이 알린다)
 */
export function applySavedTaxes(
  before: GovernmentTaxes,
  body: TaxBody,
): { taxes: GovernmentTaxes; stale: boolean } {
  let stale = false;
  const pick = (field: GovernmentTaxField, own: number | null): GovernmentTaxField => {
    if (own !== null) return { value: own, own, source: "leader" };
    if (field.own === null) return field;
    stale = true;
    return { ...field, own: null, source: "default" };
  };
  const taxes: GovernmentTaxes = {
    ...before,
    incomeTaxBp: pick(before.incomeTaxBp, body.incomeTaxBp),
    residentTaxPm: pick(before.residentTaxPm, body.residentTaxPm),
    residentEveryDays: pick(before.residentEveryDays, body.residentEveryDays),
    residentNationPm: pick(before.residentNationPm, body.residentNationPm),
  };
  return { taxes, stale };
}
