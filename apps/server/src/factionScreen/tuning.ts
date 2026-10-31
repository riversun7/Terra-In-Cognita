// 세력 화면이 쓰는 규칙 설정값 — 콘텐츠 팩 `tuning`을 얹은 세력·사회 계수표(@terra/sim societyCoefficientsFrom)에서 고른다.
// 서버를 켤 때 한 번 만든다(main.ts → app.ts `society` → createContext). 팩 없이 띄운 서버·시험은 sim 시험 계수표
// (TEST_SOCIETY_COEFFICIENTS, 팩 출발값과 같다)를 쓴다. 화면 시안(preview.ts)과 실제 자료가 같은 값을 쓴다.
// 판정은 규칙(@terra/sim society/*)이 하고, 여기 값은 화면에 보이는 숫자·문턱이다.
import type { FactionRules, UnrestBands } from "@terra/shared/faction";
import { type SocietyCoefficients, TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";

export interface FactionScreenRules extends FactionRules {
  /** 민심 표 문턱: 반란 S26, 예고·태업 N35(`n35_rebellion_warning`·`n35_sabotage`, D-443) */
  readonly unrest: UnrestBands;
  /** 속국·봉신 공물(주기마다 국고의 ‰, S33 `s33_tribute_rate`, D-443 R4b ②) */
  readonly tributePm: number;
}

/** 세력·사회 계수표 → 세력 화면 설정값 */
export function factionRulesFrom(c: SocietyCoefficients): FactionScreenRules {
  return {
    unrest: {
      rebellionThreshold: c.rebellionThreshold,
      warningAt: c.rebellionWarningAt,
      sabotageAt: c.sabotageAt,
    },
    tributePm: c.tributePm,
    tributeEveryMs: c.tributeEveryMs,
    dividendEveryMs: c.dividendEveryMs,
  };
}

/** 팩 없이 띄운 서버·시험 */
export const TEST_FACTION_RULES: FactionScreenRules = factionRulesFrom(TEST_SOCIETY_COEFFICIENTS);
