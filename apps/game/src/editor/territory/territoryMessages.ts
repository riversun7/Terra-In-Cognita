// 영토 화면 문구 표 — 결과 코드 → 메시지(oxlint: 메시지 이름을 계산해 읽지 않는다, 표로 적는다). 이 조각에만 든다.
import type { BeaconResultCode } from "@terra/protocol";
import type { LocalizedName } from "@terra/shared/roster";
import type { TerritoryFactionView } from "@terra/shared/territoryApi";
import { m } from "../../paraglide/messages.js";

type Text = () => string;

export const BEACON_CODE_TEXT: Readonly<Record<BeaconResultCode | "offline" | "timeout", Text>> = {
  sign_in_required: m.dev_territory_code_sign_in_required,
  busy: m.dev_territory_code_busy,
  rate_limited: m.dev_territory_code_rate_limited,
  forbidden: m.dev_territory_code_forbidden,
  no_faction: m.dev_territory_code_no_faction,
  unknown_planet: m.dev_territory_code_unknown_planet,
  invalid_cell: m.dev_territory_code_invalid_cell,
  cell_taken: m.dev_territory_code_cell_taken,
  out_of_range: m.dev_territory_code_out_of_range,
  beacon_limit: m.dev_territory_code_beacon_limit,
  foreign_city: m.dev_territory_code_foreign_city,
  disabled: m.dev_territory_code_disabled,
  unknown_beacon: m.dev_territory_code_unknown_beacon,
  internal_error: m.dev_territory_code_internal_error,
  offline: m.dev_territory_code_offline,
  timeout: m.dev_territory_code_timeout,
};

/** 세력 이름(이름이 없으면 코드, 코드도 없으면 #ID) */
export function factionLabel(
  faction: TerritoryFactionView | undefined,
  id: number,
  locale: keyof LocalizedName,
): string {
  if (!faction) return `#${id}`;
  return faction.name?.[locale] ?? faction.code ?? `#${id}`;
}

/** 1000분율 칸 → "1.9" 같은 칸 글자 */
export function cellsText(milli: number): string {
  return (milli / 1000).toFixed(milli % 1000 === 0 ? 0 : 1);
}
