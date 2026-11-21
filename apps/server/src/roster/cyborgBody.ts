// 만든 사이보그의 화면 자료 — 저장된 초기 스탯·숨은 K·레벨·환생·신앙(docs/adr/2026-11-01-first-login-cyborg.md 2절)·속성값으로
// 시안 본체와 같은 계산(body.ts bodySheet: 성장·장비·스킬 칸·2차 스탯 풀이)을 한다. K·초기값은 만렙(N7)일 때만 보낸다
// (D-449: K는 환생 시설·생명공학 시설·만렙에서 보인다. 그 밖에는 숨김 D-417).
// 장비·인공장기 칸과 1차 스탯 버프는 보유 물건(입은 물건·걸린 효과, unitBody.ts — 유닛 상세·세계 전투 시작과 같은 함수)이다
// (docs/adr/2026-11-03-item-holdings.md "바뀜 (2026-11-07, 입은 장비·버프 → 스탯·전투)"). 인벤토리 칸(옛 모양)·랭킹은 빈 값이다
// (보유 물건은 화면의 보유 물건 판이 holdings.list로 받는다).
// - 속성값(D-450) = 생성·환생 값 + 장비·인공장기 몫(칸마다 10에서 자름, loadoutOf). 신앙 출처는 아직 없다. 분배 전 사이보그는 모두 0.
// - 상세 전투 스펙의 공격 값·실제 스태미나 회복(combat): 판정과 같은 전투 사양(specFromStats)에서 셈한다(D-502·D-511).
// - 버프 몫(질문 354 → D-515 "기본값과 버프를 나눠 보인다"): 2차 스탯 풀이(breakdown)·공격 값(combat)은 걸린 효과를 뺀 몸으로 셈하고,
//   몫(buffs)은 unitBody.ts buffSharesOf(1차 스탯 버프 몫 + 전투 수치 버프, 판정과 같은 함수). stats·primarySources는 든 몸 그대로다.
// - 이동 속도(move, 2026-11-12): 서버가 쓰는 걷기 빠르기 그대로(unitBody.ts rosterMoveOf — D-540 실효 AGI → 계산식 walk_speed). 원자재별 채집 예상(gather)은 서비스가 붙인다
//   (services.ts — 실효 팩 채집 시설·컨디션이 필요하다, gatherSheet.ts).
// - 생활비(D-453): 마지막 유지비를 못 냈으면 효율 불이익(N38 ‰, @terra/sim livingEfficiencyPm).
import { DEFAULT_EXP_TABLE, type ExpTableEntryJson, expSpanAt } from "@terra/shared/expTable";
import type { CyborgBody } from "@terra/shared/roster";
import { livingEfficiencyPm, skillGradeCap } from "@terra/sim";
import type { CyborgRecord } from "../cyborg/state.ts";
import { bodyParts, bodySheet } from "./body.ts";
import type { RosterCatalog } from "./catalog.ts";
import { FATIGUE_MAX } from "./preview.ts";
import {
  NO_GEAR,
  type UnitGear,
  bodySpecOf,
  buffSharesOf,
  combatSummaryOfSpec,
  rosterMoveOf,
  startEffectsOf,
  withoutBuffs,
} from "./unitBody.ts";

/** 유닛 공통 경험치 테이블(팩 exp_table, 48 §2.4 · 49 N8)에서 레벨 구간 경험치를 읽는다 */
export function levelSpan(level: number, table: readonly ExpTableEntryJson[] = DEFAULT_EXP_TABLE): number {
  return expSpanAt(table, level);
}

export function realCyborgBody(
  catalog: RosterCatalog,
  record: CyborgRecord,
  livingUnpaid: boolean,
  /** 입은 물건·걸린 효과(보유 물건 서비스). 없으면 빈 몸 */
  gear: UnitGear = NO_GEAR,
  /** 읽는 시각(UTC ms) — 전투 수치 버프의 남은 시간(끝난 것은 몫에서 뺀다) */
  nowMs = 0,
): CyborgBody {
  // K가 보이는 곳(D-449): 사이보그 화면은 만렙일 때만 처음 값·K를 보낸다
  const maxed = record.level >= catalog.society.cyborg.maxLevel;
  const spec = bodySpecOf({ kind: "cyborg", record }, gear);
  const body = bodySheet(catalog, spec, { revealGrowth: maxed });
  // 걸린 효과를 뺀 몸: 줄 값(풀이·공격 값)의 기본. 버프 몫은 든 몸과의 차이 + 전투 수치 버프
  const plainSpec = withoutBuffs(spec);
  const plain = { spec: plainSpec, parts: bodyParts(catalog, plainSpec) };
  const buffed = { spec, parts: bodyParts(catalog, spec) };
  return {
    level: record.level,
    maxLevel: catalog.society.cyborg.maxLevel,
    exp: { into: record.exp, span: levelSpan(record.level, catalog.expTable) },
    rebirths: record.rebirths,
    skillGradeCap: skillGradeCap(record.rebirths, catalog.society),
    faith: record.faith,
    religion: record.religion,
    faithPoints: record.faithPoints,
    living: { unpaid: livingUnpaid, efficiencyPm: livingEfficiencyPm(livingUnpaid, catalog.society) },
    ...body,
    breakdown: bodySheet(catalog, plainSpec).breakdown,
    growth: maxed ? { initial: record.initial, kPm: record.kPm } : null,
    // 본체 피로는 아직 직무·생활 규칙이 없어 0이다(피로 회복은 주거에 따른다 D-430, D-445 178 — 그 규칙이 들어올 때 건다)
    fatigue: { value: 0, max: FATIGUE_MAX },
    combat: combatSummaryOfSpec(catalog, plain.spec, plain.parts),
    buffs: buffSharesOf(catalog, plain, buffed, startEffectsOf(gear, nowMs)),
    // 이동 속도 줄(2026-11-12): 서버 걷기 빠르기(D-540 계산식 walk_speed — 2차맵과 같은 실효 AGI = 든 몸)·전투 걸음 간격
    move: rosterMoveOf(catalog, buffed.parts.loadout.primaries.agi),
    inventory: [],
    rankings: [],
    preview: false,
  };
}
