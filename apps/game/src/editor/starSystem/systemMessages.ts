// 항성계 편집기 문구 도우미 — 항성 종류·천체 종류 이름 표, 실패 문구, 수 모양(ADR 2026-10-31-star-system-editor).
// 키로 고르는 문구는 표에 적는다(네임스페이스를 계산해서 읽지 않는다: oxlint import(namespace)).
import type { StarSystemBodyKind, StarTypeId } from "@terra/shared";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import type { LibraryFailure } from "../planet/libraryClient.ts";

const STAR_TYPE_NAMES = {
  a0v: m.star_type_a0v,
  f5v: m.star_type_f5v,
  g2v: m.star_type_g2v,
  k0v: m.star_type_k0v,
  k5v: m.star_type_k5v,
  m0v: m.star_type_m0v,
  m5v: m.star_type_m5v,
} satisfies Record<StarTypeId, () => string>;

const BODY_KIND_NAMES = {
  planet: m.star_system_body_planet,
  empty: m.star_system_body_empty,
  asteroid_belt: m.star_system_body_asteroid_belt,
  structure: m.star_system_body_structure,
} satisfies Record<StarSystemBodyKind, () => string>;

const REASONS: Readonly<Record<string, () => string>> = {
  invalid_name: m.star_system_reason_invalid_name,
  invalid_definition: m.star_system_reason_invalid_definition,
  system_not_found: m.star_system_reason_not_found,
  planet_not_found: m.planet_editor_reason_planet_not_found,
  not_author: m.star_system_reason_not_author,
  rate_limited: m.planet_editor_reason_rate_limited,
};

export function starTypeName(id: StarTypeId): string {
  return STAR_TYPE_NAMES[id]();
}

export function bodyKindText(kind: StarSystemBodyKind): string {
  return BODY_KIND_NAMES[kind]();
}

/** 호출 실패 → 문구(충돌은 화면이 따로 묻는다) */
export function failureText(failure: LibraryFailure): string {
  switch (failure.kind) {
    case "conflict":
      return m.star_system_conflict_title();
    case "unauthorized":
    case "forbidden":
      return m.star_system_reason_denied();
    case "network":
      return m.star_system_reason_network();
    case "reason":
      return REASONS[failure.reason]?.() ?? failure.reason;
    default: {
      const unhandled: never = failure;
      return unhandled;
    }
  }
}

/** 지금 언어의 수 모양(소수 자리 상한) */
export function formatValue(value: number, maximumFractionDigits: number): string {
  return new Intl.NumberFormat(getLocale(), { maximumFractionDigits }).format(value);
}

/** 받는 빛(지구 = 1): 10배 이상은 정수, 그 밖은 유효 숫자 둘 */
export function formatFlux(flux: number): string {
  if (flux >= 10) return formatValue(Math.round(flux), 0);
  return new Intl.NumberFormat(getLocale(), { maximumSignificantDigits: 2 }).format(flux);
}

/** 광도(태양 = 1): 유효 숫자 둘 */
export function formatLuminosity(luminosity: number): string {
  return new Intl.NumberFormat(getLocale(), { maximumSignificantDigits: 2 }).format(luminosity);
}

/** 부호 붙은 정수(+24, −20, 0) */
export function signed(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return "0";
}
