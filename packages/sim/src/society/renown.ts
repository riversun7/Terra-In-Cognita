// 나라별 명성 → 작위(D-326 "NPC 국가마다 명성 → 작위로 출세", 46 §9.4, 49 S18 "기존 민간인 0 → 시민 100 → 공훈자 500 → 기사 1000 →
// 영주 3000 → 대공 5000+"). 기획 D-571(답 1961 "D-326 작위 6단계", 1962 "지휘 분대 수는 작위로만")이 지휘관 정원을 작위로 정하게 해서 서버가
// 작위를 쓰기 시작했다(서버 world/titles.ts). 규칙은 이 한 벌이다: 작위 = 명성이 넘은 가장 높은 문턱. 명성은 나라마다 따로(유저 × 나라).
// 얻는 길(D-326 "납품·방어·의뢰"): 지금 서버에 있는 것은 방어(세계 전투에서 수비 편이 이김 → 그 편 세력 나라에 defenseRenown)뿐이다. 납품·
// 의뢰는 그 기능이 생기면 더한다(질문 2102). 수는 모두 설정 칸 [임시](S18 출발값 그대로, 방어 몫은 [임시]).

/** 작위 단계 이름(0 민간인 ~ 5 대공, D-326 차례 — command.ts COMMAND_TITLE_STEPS와 같은 수) */
export const TITLE_IDS = ["commoner", "citizen", "merit", "knight", "lord", "duke"] as const;
export type TitleId = (typeof TITLE_IDS)[number];

export interface RenownCoefficients {
  /** 작위 1(시민)~5(대공)의 명성 문턱(오름차순, 49 S18) */
  readonly titleRenown: readonly number[];
  /** 방어 한 번(수비 편 승리)에 그 나라 명성 */
  readonly defenseRenown: number;
}

/** 출발값: S18 기존값(시민 100 → 공훈자 500 → 기사 1000 → 영주 3000 → 대공 5000), 방어 10 [임시] */
export const DEFAULT_RENOWN_COEFFICIENTS: RenownCoefficients = {
  titleRenown: [100, 500, 1000, 3000, 5000],
  defenseRenown: 10,
};

/** 명성 → 작위 단계(0 민간인 ~ 5 대공). 문턱은 차례대로 본다(앞 문턱을 못 넘으면 뒤 문턱도 보지 않는다) */
export function titleOfRenown(renown: number, c: Pick<RenownCoefficients, "titleRenown">): number {
  let title = 0;
  for (const threshold of c.titleRenown.slice(0, TITLE_IDS.length - 1)) {
    if (renown < threshold) break;
    title += 1;
  }
  return title;
}
