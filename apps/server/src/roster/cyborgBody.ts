// 만든 사이보그의 화면 자료 — 저장된 초기 스탯·숨은 K·레벨·환생·신앙도(docs/adr/2026-11-01-first-login-cyborg.md 2절)로
// 시안 본체와 같은 계산(body.ts bodySheet: 성장·장비·스킬 칸·2차 스탯 풀이)을 한다. K·초기값은 만렙(N7)일 때만 보낸다
// (D-449: K는 환생 시설·생명공학 시설·만렙에서 보인다. 그 밖에는 숨김 D-417).
// 장비·인공장기·인벤토리·랭킹은 아직 세계에 없어 빈 값이다(그 시스템이 생기면 채운다).
// 속성값(D-182 12칸, 출처 D-450)은 저장·규칙이 아직 없어 판정과 같은 0이다(전투 사양 specFromStats도 없으면 0). 다음 줄기가 채운다.
import type { CyborgBody } from "@terra/shared/roster";
import { skillGradeCap } from "@terra/sim";
import type { CyborgRecord } from "../cyborg/state.ts";
import { NO_ELEMENTS, bodySheet } from "./body.ts";
import type { RosterCatalog } from "./catalog.ts";
import { FATIGUE_MAX } from "./preview.ts";

/** [임시] 레벨 구간 경험치 = floor(40 × 레벨^1.9)(48 §2.4 출발값 후보, 시안 본체와 같은 식) */
export function levelSpan(level: number): number {
  return Math.floor(40 * Math.max(1, level) ** 1.9);
}

export function realCyborgBody(catalog: RosterCatalog, record: CyborgRecord): CyborgBody {
  const body = bodySheet(catalog, {
    kind: "cyborg",
    initial: record.initial,
    kPm: record.kPm,
    level: record.level,
    rebirths: record.rebirths,
    equipped: new Map(),
    innateSkills: [],
    source: "computed",
  });
  return {
    level: record.level,
    maxLevel: catalog.society.cyborg.maxLevel,
    exp: { into: record.exp, span: levelSpan(record.level) },
    rebirths: record.rebirths,
    skillGradeCap: skillGradeCap(record.rebirths, catalog.society),
    faith: record.faith,
    ...body,
    growth:
      record.level >= catalog.society.cyborg.maxLevel ? { initial: record.initial, kPm: record.kPm } : null,
    elements: NO_ELEMENTS,
    // 본체 피로는 아직 직무·생활 규칙이 없어 0이다(피로 회복은 주거에 따른다 D-430, D-445 178 — 그 규칙이 들어올 때 건다)
    fatigue: { value: 0, max: FATIGUE_MAX },
    inventory: [],
    rankings: [],
    preview: false,
  };
}
