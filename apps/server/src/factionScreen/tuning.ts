// 세력 화면이 쓰는 설정값 — 콘텐츠 팩 tuning에 칸이 생기면 거기서 읽도록 바꿀 값을 한곳에 모았다.
// 화면 시안(preview.ts)과 실제 자료가 같은 값을 쓴다. 판정 규칙은 @terra/sim(society/*)이고, 여기 값은 화면에 보이는 숫자다.
import { REBELLION_THRESHOLD_EXAMPLE, type UnrestBands } from "@terra/shared/faction";

/**
 * [임시] 민심 표 구간 — 기획 49 N35(D-443): 태업 조짐 60은 기술 [임시] 출발값, 반란 예고 구간 너비는 출발값이 없어 기술 [임시] 10.
 * 반란 문턱은 S26(예시 40). TODO: 팩 tuning에 N35 칸이 들어오면(다른 줄기에서 추가 중) 그 값을 읽어 넘긴다.
 */
export const UNREST_BANDS: UnrestBands = {
  rebellionThreshold: REBELLION_THRESHOLD_EXAMPLE,
  warningBand: 10,
  slowdownBelow: 60,
};

/**
 * 봉신 공물 = 주마다 봉신 국고의 50‰(5%). 규칙 시뮬의 출발값(packages/sim scenario.ts society.tributeBp 기본 500 만분율)과 같다.
 * 기획 값은 없고 설정값이다(D-443 R4b ②: 세력 화면 시안의 공물 표시와 같은 값을 쓴다). 시험이 규칙 출발값과 같은지 본다.
 */
export const VASSAL_TRIBUTE_PM = 50;
