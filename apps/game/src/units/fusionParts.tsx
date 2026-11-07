// 유닛 화면 [융합] 칸이 같이 쓰는 조각 — 스탯 줄·결과 문구·종 이름·배율 글자(FusionPanel·GenePanel).
// docs/adr/2026-11-07-cyborg-fusion-genes.md. 유닛 화면 지연 조각 안에서만 쓴다.
import type { FusionResultCode } from "@terra/protocol";
import { FUSION_STAT_ORDER } from "@terra/shared/fusion";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { formatNumber } from "../roster/rosterText.ts";
import type { FusionCommand, FusionSuccess } from "./fusionCommands.ts";

/** 화면 언어(팩 이름 ko·en 고르기) */
export const getLang = (): "ko" | "en" => (getLocale() === "en" ? "en" : "ko");

export const STAT_CODE = {
  str: m.roster_stat_str_code,
  dex: m.roster_stat_dex_code,
  agi: m.roster_stat_agi_code,
  vit: m.roster_stat_vit_code,
  int: m.roster_stat_int_code,
  wis: m.roster_stat_wis_code,
} as const;

export const RESULT_TEXT: Readonly<Record<FusionResultCode | "offline" | "timeout", () => string>> = {
  sign_in_required: m.fusion_err_sign_in,
  busy: m.fusion_err_busy,
  rate_limited: m.fusion_err_rate_limited,
  internal_error: m.fusion_err_internal,
  forbidden: m.fusion_err_forbidden,
  no_cyborg: m.fusion_err_no_cyborg,
  unknown_unit: m.fusion_err_unknown_unit,
  wrong_kind: m.fusion_err_wrong_kind,
  captive: m.fusion_err_captive,
  cost_changed: m.fusion_err_cost_changed,
  insufficient_funds: m.fusion_err_funds,
  insufficient_materials: m.fusion_err_materials,
  no_gene: m.fusion_err_no_gene,
  unknown_item: m.fusion_err_unknown_item,
  unknown_gene: m.fusion_err_unknown_gene,
  wrong_gene: m.fusion_err_wrong_gene,
  same_gene: m.fusion_err_same_gene,
  unknown_skill: m.fusion_err_unknown_skill,
  skill_known: m.fusion_err_skill_known,
  no_skill_slot: m.fusion_err_no_skill_slot,
  no_room: m.fusion_err_no_room,
  offline: m.fusion_err_offline,
  timeout: m.fusion_err_timeout,
};

export const SPECIES_NAME: Readonly<Record<string, () => string>> = {
  human: m.roster_type_human,
  creature: m.roster_type_creature,
  android: m.roster_type_android,
  cyborg: m.roster_type_cyborg,
};

/** ‰ → 배율 글자(1150 → "1.15") */
export const times = (pm: number): string =>
  new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 3 }).format(pm / 1000);
/** ‰ → % 글자(정수) */
export const percent = (pm: number): string => formatNumber(Math.round(pm / 10));

/** 명령 실행기(FusionPanel이 만든다): 누른 단추 키, 보낼 명령들, 성공 문구 */
export type RunFusion = (
  busyKey: string,
  commands: readonly FusionCommand[],
  success: (outcome: FusionSuccess) => string,
) => Promise<void>;

/** 1차 스탯 여섯 칸(값 또는 범위). main = 강조할 칸(유전자 주력 스탯) */
export function StatRow({
  values,
  high,
  label,
  main,
}: {
  values: readonly number[];
  high?: readonly number[] | undefined;
  label: string;
  main?: number | null | undefined;
}) {
  return (
    <div className="fusion-stat-row">
      <span className="fusion-stat-label">{label}</span>
      <dl className="fusion-stats">
        {FUSION_STAT_ORDER.map((stat, index) => {
          const low = values[index] ?? 0;
          const top = high?.[index];
          return (
            <div key={stat} className="fusion-stat" data-stat={stat} data-main={main === index || undefined}>
              <dt>{STAT_CODE[stat]()}</dt>
              <dd className="fusion-num">
                {top === undefined || top === low
                  ? formatNumber(low)
                  : `${formatNumber(low)}–${formatNumber(top)}`}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
