// 유닛 상세 사양(units.sheet·cyborg.get이 같이 쓴다) — 몸 사양(BodySpec) 하나에서 사이보그 판의 핵심 사양·상세 전투 스펙 자료를 만든다
// (사용자 결정 2026-11-24 "모든 유닛은 사이보그 화면처럼 세부 정보가 뜨게 해야한다", docs/adr/2026-11-24-unit-cyborg-unify.md).
// - 줄 값(2차 스탯 풀이 breakdown·공격 값 combat)은 걸린 효과를 뺀 몸으로 셈하고, 버프 몫(buffs)은 든 몸과의 차이 + 전투 수치 버프다
//   (질문 354 → D-515, unitBody.ts buffSharesOf — 판정과 같은 함수). stats·primarySources는 든 몸 그대로다.
// - 이동 속도(move): 서버가 쓰는 걷기 빠르기 그대로(unitBody.ts rosterMoveOf — D-540 실효 AGI = 든 몸).
// - 처음 값·성장 K(growth)는 K가 보이는 곳(D-449)에서만 부르는 쪽이 넣는다. 원자재별 채집 예상(gather)은 서비스가 붙인다(services.ts).
import type { RosterSheet } from "@terra/shared/roster";
import { type StartEffect, skillGradeCap } from "@terra/sim";
import { type BodySpec, bodyParts, bodySheet } from "./body.ts";
import type { RosterCatalog } from "./catalog.ts";
import { buffSharesOf, combatSummaryOfSpec, rosterMoveOf, withoutBuffs } from "./unitBody.ts";

export function sheetOfSpec(
  catalog: RosterCatalog,
  spec: BodySpec,
  options: {
    /** 전투 시작 때 걸려 있는 전투 수치 버프(unitBody.ts startEffectsOf). 없으면 몫 0 */
    readonly effects?: readonly StartEffect[] | undefined;
    /** 1차 스탯 출처를 처음 값·레벨 성장으로 나눠 보일지(K가 보이는 곳, D-449) */
    readonly revealGrowth?: boolean | undefined;
    readonly preview?: boolean | undefined;
  } = {},
): RosterSheet {
  const body = bodySheet(catalog, spec, { revealGrowth: options.revealGrowth === true });
  // 걸린 효과를 뺀 몸: 줄 값(풀이·공격 값)의 기본. 버프 몫은 든 몸과의 차이 + 전투 수치 버프
  const plainSpec = withoutBuffs(spec);
  const plain = { spec: plainSpec, parts: bodyParts(catalog, plainSpec) };
  const buffed = { spec, parts: bodyParts(catalog, spec) };
  return {
    level: spec.level,
    rebirths: spec.rebirths,
    skillGradeCap: skillGradeCap(spec.rebirths, catalog.society),
    ...body,
    breakdown: bodySheet(catalog, plainSpec).breakdown,
    growth: null,
    combat: combatSummaryOfSpec(catalog, plain.spec, plain.parts),
    buffs: buffSharesOf(catalog, plain, buffed, options.effects ?? []),
    move: rosterMoveOf(catalog, buffed.parts.loadout.primaries.agi),
    preview: options.preview === true,
  };
}
