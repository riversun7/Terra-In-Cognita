// 밸런스 분석 문구 표 — 분포 출발값 이름·지표·오류 → 메시지(oxlint: 메시지 이름을 계산해 읽지 않는다, 표로 적는다)와 수 모양.
import { m } from "../../../paraglide/messages.js";
import type { AnalysisErrorKey, SensitivityMetric } from "./analysisModel.ts";

const BUILD_TEXT: Readonly<Record<string, () => string>> = {
  balanced: m.dev_an_build_balanced,
  str: m.dev_an_build_str,
  vit: m.dev_an_build_vit,
  dex_agi: m.dev_an_build_dex_agi,
  int_wis: m.dev_an_build_int_wis,
  str_dex: m.dev_an_build_str_dex,
  glass: m.dev_an_build_glass,
};

/** 분포 출발값 이름(모르는 ID는 그대로) */
export const buildName = (id: string): string => BUILD_TEXT[id]?.() ?? id;

const METRIC_TEXT: Readonly<Record<SensitivityMetric, () => string>> = {
  score: m.dev_an_metric_score,
  dps: m.dev_an_metric_dps,
  ehp: m.dev_an_metric_ehp,
  attack: m.dev_an_metric_attack,
  time: m.dev_an_metric_time,
};
export const metricText = (metric: SensitivityMetric): string => METRIC_TEXT[metric]();

const ERROR_TEXT: Readonly<Record<AnalysisErrorKey, () => string>> = {
  invalid_settings: m.dev_an_err_invalid_settings,
  invalid_unit: m.dev_an_err_invalid_unit,
  budget: m.dev_an_err_budget,
  busy: m.dev_an_err_busy,
  rate_limited: m.dev_an_err_rate_limited,
  unknown_job: m.dev_an_err_unknown_job,
  timeout: m.dev_an_err_timeout,
  failed: m.dev_an_err_failed,
  forbidden: m.dev_an_err_forbidden,
  unauthorized: m.dev_an_err_unauthorized,
  unavailable: m.dev_an_err_unavailable,
  network: m.dev_an_err_network,
  unknown: m.dev_an_err_unknown,
};
export const analysisErrorText = (key: AnalysisErrorKey): string => ERROR_TEXT[key]();

/** ‰ → "62.5" (%) */
export const pctText = (pm: number, locale: string): string =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(pm / 10);

/** ‰p 변화 → "+6.2" / "−3" (%) */
export function signedPct(pm: number, locale: string): string {
  const text = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(Math.abs(pm) / 10);
  return pm > 0 ? `+${text}` : pm < 0 ? `−${text}` : text;
}

export const intText = (value: number, locale: string): string => new Intl.NumberFormat(locale).format(value);

export function signedInt(value: number, locale: string): string {
  const text = new Intl.NumberFormat(locale).format(Math.abs(value));
  return value > 0 ? `+${text}` : value < 0 ? `−${text}` : text;
}

/** ms → "12.3" (초) */
export const secText = (ms: number, locale: string): string =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(ms / 1000);
