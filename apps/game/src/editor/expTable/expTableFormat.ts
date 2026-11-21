// 경험치 테이블 편집기 숫자·기간 포맷 도우미(/dev/exp-table)
export function fmtInt(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(value));
}

export function fmtDecimal(value: number, locale: string, digits = 1): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function fmtCompact(value: number, locale: string): string {
  if (value >= 1_000_000) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value / 1_000_000)}M`;
  }
  if (value >= 1_000) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / 1_000)}k`;
  }
  return fmtInt(value, locale);
}

export function fmtDuration(days: number, locale: string, ko: boolean): string {
  if (days < 1) {
    return `${fmtDecimal(days * 24, locale, 1)}${ko ? "시간" : "h"}`;
  }
  return `${fmtDecimal(days, locale, 1)}${ko ? "일" : "d"}`;
}
