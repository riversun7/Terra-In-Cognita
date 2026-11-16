// 나라별 명성 → 작위(D-326 "NPC 국가마다 명성 → 작위로 출세", 46 §9.4, 49 S18 "기존 민간인 0 → 시민 100 → 공훈자 500 → 기사 1000 →
// 영주 3000 → 대공 5000+"). 기획 D-571(답 1961 "D-326 작위 6단계", 1962 "지휘 분대 수는 작위로만")이 지휘관 정원을 작위로 정하게 해서 서버가
// 작위를 쓰기 시작했다(서버 world/titles.ts). 규칙은 이 한 벌이다: 작위 = 명성이 넘은 가장 높은 문턱. 명성은 나라마다 따로(유저 × 나라).
// 얻는 길(D-326 "납품·방어·의뢰"): 방어(세계 전투에서 수비 편이 이김 → 그 편 세력 나라에 defenseRenown), 납품(그 나라 세력의 거래소 사기 주문에
// 판 체결 → 그 나라에 납품 가치 ÷ deliveryValue, 서버 world/deliveryRenown.ts, 질문 2102 → 2182), 의뢰(questRenown — 의뢰 게시판 46 §9.7이 아직
// 없어 자리만, 질문 2183). 수는 모두 설정 칸 [임시](S18 출발값 그대로, 방어·납품·의뢰 몫은 [임시]).

/** 작위 단계 이름(0 민간인 ~ 5 대공, D-326 차례 — command.ts COMMAND_TITLE_STEPS와 같은 수) */
export const TITLE_IDS = ["commoner", "citizen", "merit", "knight", "lord", "duke"] as const;
export type TitleId = (typeof TITLE_IDS)[number];

export interface RenownCoefficients {
  /** 작위 1(시민)~5(대공)의 명성 문턱(오름차순, 49 S18) */
  readonly titleRenown: readonly number[];
  /** 방어 한 번(수비 편 승리)에 그 나라 명성 */
  readonly defenseRenown: number;
  /**
   * 납품 가치 몇에 명성 1(0 이하 = 납품 명성 없음). 납품 가치 = 체결 묶음 수 × 그 물건 시작 시세(팩 startPrice — 나라 화폐와 상관없는 기준
   * 값이라 화폐가 다른 나라끼리도 같은 물건이면 같은 명성)
   */
  readonly deliveryValue: number;
  /** 의뢰 하나를 끝내면 그 나라 명성(의뢰 게시판이 생기면 쓴다) */
  readonly questRenown: number;
}

/** 출발값: S18 기존값(시민 100 → 공훈자 500 → 기사 1000 → 영주 3000 → 대공 5000), 방어 10·납품 가치 100당 1·의뢰 10 [임시] */
export const DEFAULT_RENOWN_COEFFICIENTS: RenownCoefficients = {
  titleRenown: [100, 500, 1000, 3000, 5000],
  defenseRenown: 10,
  deliveryValue: 100,
  questRenown: 10,
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
