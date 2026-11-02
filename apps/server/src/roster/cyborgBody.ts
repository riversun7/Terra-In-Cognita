// 만든 사이보그의 화면 자료 — 저장된 초기 스탯·숨은 K·레벨·환생·신앙(docs/adr/2026-11-01-first-login-cyborg.md 2절)·속성값으로
// 시안 본체와 같은 계산(body.ts bodySheet: 성장·장비·스킬 칸·2차 스탯 풀이)을 한다. K·초기값은 만렙(N7)일 때만 보낸다
// (D-449: K는 환생 시설·생명공학 시설·만렙에서 보인다. 그 밖에는 숨김 D-417).
// 장비·인공장기·인벤토리·랭킹은 아직 세계에 없어 빈 값이다(그 시스템이 생기면 채운다).
// - 속성값(D-450) = 생성·환생 값 + 장비·인공장기·신앙 몫(칸마다 10에서 자름). 장비·인공장기 아이템 인스턴스와 신앙 데이터가 없어
//   지금 출처는 생성·환생 값 하나다(sumElementSources에 넘길 출처가 생기면 더한다). 분배 전 사이보그는 모두 0.
//   전투 사양(specFromStats)에는 아직 넣지 않는다(본체 전투가 서버에 생길 때).
// - 생활비(D-453): 마지막 유지비를 못 냈으면 효율 불이익(N38 ‰, @terra/sim livingEfficiencyPm).
import { type ElementSource, elementsToArray, sumElementSources, zeroElements } from "@terra/shared/cyborg";
import type { CyborgBody } from "@terra/shared/roster";
import { livingEfficiencyPm, skillGradeCap } from "@terra/sim";
import type { CyborgRecord } from "../cyborg/state.ts";
import { bodySheet } from "./body.ts";
import type { RosterCatalog } from "./catalog.ts";
import { FATIGUE_MAX } from "./preview.ts";

/** [임시] 레벨 구간 경험치 = floor(40 × 레벨^1.9)(48 §2.4 출발값 후보, 시안 본체와 같은 식) */
export function levelSpan(level: number): number {
  return Math.floor(40 * Math.max(1, level) ** 1.9);
}

export function realCyborgBody(
  catalog: RosterCatalog,
  record: CyborgRecord,
  livingUnpaid: boolean,
  /** 장비·인공장기·신앙에서 오는 속성값(데이터 고리, 아직 없음) */
  elementSources: readonly ElementSource[] = [],
): CyborgBody {
  // K가 보이는 곳(D-449): 사이보그 화면은 만렙일 때만 처음 값·K를 보낸다
  const maxed = record.level >= catalog.society.cyborg.maxLevel;
  const body = bodySheet(
    catalog,
    {
      kind: "cyborg",
      initial: record.initial,
      kPm: record.kPm,
      level: record.level,
      rebirths: record.rebirths,
      equipped: new Map(),
      innateSkills: [],
      source: "computed",
      // 장비 밖 속성값(생성·환생 값 + 신앙 등 출처, D-450). 장비·인공장기 속성값은 bodySheet(loadoutOf)가 더한다
      elements: elementsToArray(sumElementSources(record.elements ?? zeroElements(), elementSources)),
    },
    { revealGrowth: maxed },
  );
  return {
    level: record.level,
    maxLevel: catalog.society.cyborg.maxLevel,
    exp: { into: record.exp, span: levelSpan(record.level) },
    rebirths: record.rebirths,
    skillGradeCap: skillGradeCap(record.rebirths, catalog.society),
    faith: record.faith,
    religion: record.religion,
    faithPoints: record.faithPoints,
    living: { unpaid: livingUnpaid, efficiencyPm: livingEfficiencyPm(livingUnpaid, catalog.society) },
    ...body,
    growth: maxed ? { initial: record.initial, kPm: record.kPm } : null,
    // 본체 피로는 아직 직무·생활 규칙이 없어 0이다(피로 회복은 주거에 따른다 D-430, D-445 178 — 그 규칙이 들어올 때 건다)
    fatigue: { value: 0, max: FATIGUE_MAX },
    inventory: [],
    rankings: [],
    preview: false,
  };
}
