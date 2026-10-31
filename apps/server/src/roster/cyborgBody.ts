// 만든 사이보그의 화면 자료 — 저장된 초기 스탯·숨은 K·레벨·환생·신앙도(docs/adr/2026-11-01-first-login-cyborg.md 2절)로
// 시안 본체와 같은 계산(body.ts bodyView: 성장·장비·스킬 칸)을 한다. K는 보내지 않는다(D-417 숨김).
// 장비·인공장기·인벤토리·랭킹은 아직 세계에 없어 빈 값이다(그 시스템이 생기면 채운다).
import type { CyborgBody } from "@terra/shared/roster";
import { skillGradeCap } from "@terra/sim";
import type { CyborgRecord } from "../cyborg/state.ts";
import { bodyView } from "./body.ts";
import type { RosterCatalog } from "./catalog.ts";
import { FATIGUE_MAX } from "./preview.ts";

/** [임시] 레벨 구간 경험치 = floor(40 × 레벨^1.9)(48 §2.4 출발값 후보, 시안 본체와 같은 식) */
export function levelSpan(level: number): number {
  return Math.floor(40 * Math.max(1, level) ** 1.9);
}

export function realCyborgBody(catalog: RosterCatalog, record: CyborgRecord): CyborgBody {
  const body = bodyView(catalog, {
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
    // 본체 피로는 아직 직무·생활 규칙이 없어 0이다(피로 회복은 주거에 따른다 D-430, D-445 178 — 그 규칙이 들어올 때 건다)
    fatigue: { value: 0, max: FATIGUE_MAX },
    inventory: [],
    rankings: [],
    preview: false,
  };
}
