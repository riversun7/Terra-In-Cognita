// 팩 스키마의 공용 조각 — ID, 언어별 문구, 다른 항목 참조, 금액 (docs/adr/2026-10-28-content-pack-format.md)
import { z } from "zod";
import { ko } from "zod/locales";

/** 영어 snake_case, 소문자로 시작, 2~48자. 분류(파일) 안에서 하나만 있고, 한 번 쓴 ID는 다시 쓰지 않는다 */
export const ID_PATTERN = /^[a-z][a-z0-9_]{1,47}$/;

export const contentId = z
  .string({ error: "ID가 없습니다. 영어 snake_case 문자열로 적으세요." })
  .regex(ID_PATTERN, {
    error: (issue) =>
      `ID 형식이 아닙니다: ${preview(issue.input)}. 영어 소문자로 시작하고 소문자·숫자·밑줄(_)만 2~48자로 씁니다.`,
  });

function localizedString(label: string) {
  return z
    .string({ error: `${label}가 없습니다. ko·en을 함께 적으세요.` })
    .refine((text) => text.trim() !== "", { error: `${label}가 비어 있습니다. ko·en을 함께 적으세요.` });
}

/** 언어별 문구. 한국어(기본)와 영어 둘 다 비어 있지 않아야 한다 */
export const localizedText = z.strictObject(
  { ko: localizedString("한국어(ko)"), en: localizedString("영어(en)") },
  {
    error: (issue) => {
      if (issue.code !== "invalid_type") return undefined;
      if (issue.input === undefined) return "값이 없습니다. ko·en을 함께 적으세요.";
      return 'ko·en을 가진 객체로 적으세요(예: {"ko": "…", "en": "…"}).';
    },
  },
);
export type LocalizedText = z.output<typeof localizedText>;

/**
 * 다른 항목을 가리키는 참조. 스키마 검사 뒤 2단계(참조 무결성)가 파싱 결과에서 모아 대상이 있는지 본다.
 * JSON으로 다시 쓰면 ID 문자열이 된다.
 */
export class ContentRef {
  readonly category: string;
  readonly id: string;

  constructor(category: string, id: string) {
    this.category = category;
    this.id = id;
  }

  toJSON(): string {
    return this.id;
  }
}

/** 분류 `category`의 항목 ID를 받는 필드. 참조는 스키마에 한 번만 선언한다 */
export function ref(category: string) {
  return contentId.transform((id) => new ContentRef(category, id));
}

/** 금액: 최소 단위 정수를 숫자 문자열로 적고 BigInt로 읽는다 (AGENTS.md 4장, 소수 금지) */
export const amount = z
  .string({ error: '금액이 없습니다. 최소 단위 정수를 문자열로 적으세요(예: "1500").' })
  .regex(/^(0|[1-9][0-9]{0,18})$/, {
    error: '금액 형식이 아닙니다. 최소 단위 정수를 문자열로 적으세요(예: "1500", 소수·음수 불가).',
  })
  .transform((text) => BigInt(text));

const koLocale = ko().localeError;

/** 문구에 넣을 값 미리보기 (긴 값은 자른다) */
export function preview(value: unknown): string {
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 40 ? `${text.slice(0, 37)}...` : text;
}

/** Zod 기본 문구 대신 쓰는 한국어 문구. 여기 없는 경우는 Zod 한국어 문구를 쓴다 */
export const koreanErrorMap: z.core.$ZodErrorMap = (issue) => {
  switch (issue.code) {
    case "invalid_type":
      if (issue.input === undefined) return "값이 없습니다. 꼭 적어야 하는 필드입니다.";
      return `형식이 다릅니다(필요: ${issue.expected}, 받은 값: ${preview(issue.input)}).`;
    case "unrecognized_keys":
      return `모르는 필드입니다: ${issue.keys.join(", ")}. 이름에 오타가 없는지 확인하세요.`;
    case "invalid_value":
      return `허용하지 않는 값입니다(허용: ${issue.values.map((value) => preview(value)).join(", ")}).`;
    case "too_small":
      if (issue.origin !== "number") return koLocale(issue);
      return issue.inclusive
        ? `값이 너무 작습니다(최소 ${String(issue.minimum)}).`
        : `값이 너무 작습니다(${String(issue.minimum)}보다 커야 합니다).`;
    case "too_big":
      if (issue.origin !== "number") return koLocale(issue);
      return issue.inclusive
        ? `값이 너무 큽니다(최대 ${String(issue.maximum)}).`
        : `값이 너무 큽니다(${String(issue.maximum)}보다 작아야 합니다).`;
    default:
      return koLocale(issue);
  }
};
