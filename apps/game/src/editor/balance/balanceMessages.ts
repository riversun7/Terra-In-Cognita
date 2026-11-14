// 밸런스 화면 문구 표 — 1차 이름 → 메시지(옛 가중치 표의 칸·오류 문구는 탭과 함께 지웠다, 2026-11-14)(oxlint: 메시지 이름을 계산해 읽지 않는다, 표로 적는다).
// 이 조각(BalancePanelScreen)에만 든다. 설정 칸 패널(editor/tuning)의 표는 가져오지 않는다(두 개발자 조각이 같이 쓰는 모듈은
// 따로 한 조각이 되어 미리 캐시 규칙에 걸리지 않을 수 있다, scripts/pwa-build.mjs DEV_ONLY_SOURCE).
import type { PrimaryStat } from "@terra/shared/roster";
import { m } from "../../paraglide/messages.js";

const CODE_TEXT: Readonly<Record<PrimaryStat, () => string>> = {
  str: m.roster_stat_str_code,
  vit: m.roster_stat_vit_code,
  int: m.roster_stat_int_code,
  wis: m.roster_stat_wis_code,
  dex: m.roster_stat_dex_code,
  agi: m.roster_stat_agi_code,
};

const NAME_TEXT: Readonly<Record<PrimaryStat, () => string>> = {
  str: m.roster_stat_str,
  vit: m.roster_stat_vit,
  int: m.roster_stat_int,
  wis: m.roster_stat_wis,
  dex: m.roster_stat_dex,
  agi: m.roster_stat_agi,
};

/** 1차 코드(STR 등, 영어 표기 그대로) */
export const primaryCode = (stat: PrimaryStat): string => CODE_TEXT[stat]();
/** 1차 이름(지금 언어) */
export const primaryName = (stat: PrimaryStat): string => NAME_TEXT[stat]();
