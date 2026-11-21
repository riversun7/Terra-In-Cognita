// 유닛 2차 지수(행동 지수) — docs/adr/2026-11-21-npc-needs-drives.md
// 스탯의 1차 → 2차처럼 층을 나눈다: 1차(원본) = 7축 성향 + 욕구(그날 식사 몫·피로) + 만족도, 2차 = 여기서 뽑는 지수 넷.
// 판단(유닛 상태기계 unitBrain.ts, 다음 단계의 가문장 지시·도시 징발)은 2차 지수만 읽는다 — 7축을 판단마다 제각각 공식으로 읽지 않는다.
// - 근로 의욕: 성향 바탕 × 만족도 배율 × 식사 배율. 만족도가 낮으면 덜 일한다(기획 46 §2.4 태업), 굶으면 덜 일한다(N33 굶은 일꾼 효율과 같은 방향).
// - 복종도: 1000 − 충성도 개입률(@terra/shared/unitTraits loyaltyOverridePm — 전투 작전에 쓰던 곡선을 일 지시에도 같이 쓴다, D-253 만족도 = 충성도).
// - 위험 감수·소비 성향: 성향만으로 정한다.
// 성향 가중치(합 10)는 [임시] 코드 상수, 만족도·식사 배율 바닥은 설정 칸(npc_ai_drive_work_*_floor_pm)이다. 정수만 쓴다.
import type { LoyaltyOverrideRules, UnitTraits } from "@terra/shared/unitTraits";
import { loyaltyOverridePm } from "@terra/shared/unitTraits";
import type { NpcAiCoefficients } from "./aiCoefficients.ts";

/** 2차 지수(각 0~1000) */
export interface UnitDrives {
  /** 근로 의욕: 높을수록 오래·성실히 일한다 */
  readonly work: number;
  /** 복종도: 높을수록 지시를 그대로 따른다 */
  readonly obedience: number;
  /** 위험 감수: 높을수록 위협에 맞서고 먼 곳까지 나간다 */
  readonly risk: number;
  /** 소비 성향: 높을수록 여가에 시장을 찾는다 */
  readonly spend: number;
}

/** 1차 값(원본) */
export interface UnitDriveInputs {
  readonly traits: UnitTraits;
  /** 만족도 밀리점(0~100,000). null = 아직 세지 않음(만족도 요소를 빼고 본다) */
  readonly satisfactionMilli: number | null;
  /** 그날 받은 생필품 몫(‰, humanPurse.ts livingDay). null = 모름(가득으로 본다) */
  readonly fedPm: number | null;
  readonly loyaltyRules?: LoyaltyOverrideRules | undefined;
  /** 근로 의욕 배율 바닥(설정 칸). 없으면 출발값(DRIVE_WEIGHTS) */
  readonly rules?: UnitDriveRules | undefined;
}

/** 근로 의욕 배율 바닥(‰): 만족도 0일 때·식사 몫 0일 때 */
export interface UnitDriveRules {
  readonly workMoodFloorPm: number;
  readonly workHungerFloorPm: number;
}

/** 계수표 → 2차 지수 규칙 */
export const driveRulesFromAi = (
  c: Pick<NpcAiCoefficients, "driveWorkMoodFloorPm" | "driveWorkHungerFloorPm">,
): UnitDriveRules => ({
  workMoodFloorPm: c.driveWorkMoodFloorPm,
  workHungerFloorPm: c.driveWorkHungerFloorPm,
});

/** [임시] 1차 → 2차 가중치 */
export const DRIVE_WEIGHTS = {
  /** 근로 의욕 성향 바탕(합 10) */
  work: { discipline: 5, greed: 3, communalism: 2 },
  /** 만족도 0일 때 근로 의욕 배율(‰) — 100이면 1000‰ */
  workMoodFloorPm: 400,
  /** 식사 몫 0일 때 근로 의욕 배율(‰) — 가득이면 1000‰ */
  workHungerFloorPm: 500,
  /** 위험 감수(합 10) */
  risk: { boldness: 6, belligerence: 2, autonomy: 2 },
  /** 소비 성향(합 10) */
  spend: { greed: 4, openness: 3, communalism: 3 },
} as const;

const clampPm = (v: number): number => {
  const n = Math.trunc(v);
  return n < 0 ? 0 : n > 1000 ? 1000 : n;
};

/** 바닥 ‰ ~ 1000‰ 사이를 0~1000 값으로 선형 */
const floorScalePm = (floorPm: number, valuePm: number): number =>
  floorPm + Math.floor(((1000 - floorPm) * clampPm(valuePm)) / 1000);

/** 1차 값 → 2차 지수 */
export function deriveUnitDrives(input: UnitDriveInputs): UnitDrives {
  const t = input.traits;
  const w = DRIVE_WEIGHTS;
  const workBase = Math.floor(
    (t.discipline * w.work.discipline + t.greed * w.work.greed + t.communalism * w.work.communalism) / 10,
  );
  const moodPm =
    input.satisfactionMilli === null
      ? 1000
      : floorScalePm(
          clampPm(input.rules?.workMoodFloorPm ?? w.workMoodFloorPm),
          Math.floor(input.satisfactionMilli / 100),
        );
  const hungerPm = floorScalePm(
    clampPm(input.rules?.workHungerFloorPm ?? w.workHungerFloorPm),
    input.fedPm ?? 1000,
  );
  const override = loyaltyOverridePm({
    kind: "human",
    loyaltyMilli: input.satisfactionMilli,
    traits: t,
    rules: input.loyaltyRules,
  });
  return {
    work: clampPm(Math.floor((Math.floor((workBase * moodPm) / 1000) * hungerPm) / 1000)),
    obedience: clampPm(1000 - override),
    risk: clampPm(
      Math.floor(
        (t.boldness * w.risk.boldness + t.belligerence * w.risk.belligerence + t.autonomy * w.risk.autonomy) /
          10,
      ),
    ),
    spend: clampPm(
      Math.floor(
        (t.greed * w.spend.greed + t.openness * w.spend.openness + t.communalism * w.spend.communalism) / 10,
      ),
    ),
  };
}
