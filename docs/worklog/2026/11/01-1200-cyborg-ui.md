# 사이보그 화면 다듬기: 스탯 두 칸씩 묶음·색, 옛 /character 수준의 /cyborg, 새 사이보그 그림, 정거장 네온 테마

- 일시: 2026-11-01 12:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-01-ui-visibility.md`(새로, 확정), `docs/adr/2026-10-28-design-system.md`(상태 줄만 "일부 바뀜"), 질문 `docs/questions/2026-11-01-cyborg-ui.md`(181~183 → D-448·D-450·D-449), 기획 D-448~D-451(미러 main `f872151`)·D-454(정거장 네온·선명 보류, 미러 `c9c8e1b`), 48 §3.1·§3.2·§3.3, 50 §2.1, 옛 프로젝트 AntiGravt01 `terra-client/src/app/character/page.tsx`·`components/character/CyborgProfile.tsx`·`StatBar.tsx`·`SecondaryStatsCard.tsx`·`app/globals.css`(읽기만). 가지 `work/cyborg-ui`(main `7671c05`에서, `f872151`로 앞당기고 `c9c8e1b` 위로 다시 얹음)

## 한 일
- 왜: 사용자가 휴대폰으로 새 첫 접속을 써 본 뒤(원문) "사이보그 생성시 스탯 배치 오류. 힘 체력은 같은 계열인데 너무 떨어져있다 / 사이보그 스탯창이 이전 /chracter 페이지에 비해 매우 빈약하다 / 스탯은 두쌍씩 묶이며 고유 색상이 있다 / 캐릭터도 너무 허접하다 톤앤매너는 맵구현이나 캐릭터등 이미지에 한정되고 ui에는 이전 프로젝트처럼 더 가시적이게 가도 좋다 너무 톤을 헤치지는 않고." 덧붙임(원문): "테마 중에 선명은 일단 더 만들지말고, 정거장은 기존프로젝트처럼 고대비 모드로 sf나 네온사인색처럼 선명한 테마로 해달라".
- 기획 확인: 묶음 이름·색은 기획에 없었다 → 질문 181(가 = 옛 프로젝트 차례·색). 사이보그 속성값의 출처가 미결(D-182) → 182. 처음 값·레벨 성장을 나누면 K가 드러나 D-443 136과 엇갈림 → 183. K 숨김(D-024·D-417)과 투자 없음(D-024)은 이미 정해져 묻지 않았다. 기획이 바로 답했다: D-448(181 가), D-450(속성값 = 생성·환생 분배 + 인공장기·장비 + 신앙), D-449(K는 환생 시설·생명공학 시설·만렙에서만), D-451(신앙도는 쌓이는 문턱, 환생하면 0).
- 스탯 묶음·색(D-448): 화면 차례 `PRIMARY_STATS` = STR·VIT·INT·WIS·DEX·AGI, `PRIMARY_STAT_PAIRS`(두 칸씩). 판정 차례는 `RULE_STAT_ORDER`(가중치 열)로 따로. 색 토큰 `--color-stat-*` 테마 넷(대비 검사에 바탕·판·둘째 판 18쌍 × 4 추가). 공용 부품 `roster/StatPairs.tsx`(약자 칩 + 이름 + 값(스탯 색, 큰 글자) + 막대, 묶음 위 두 색 띠)를 첫 접속 초기 스탯·사이보그 핵심 사양·유닛 상세가 쓴다. 성향 카드에 치우친 스탯 칩, 강하 요약도 묶음 칩. 영어 스탯 이름을 약자에서 전체 이름(Strength 등)으로 바꿨다(약자는 칩).
- 서버 풀이: `@terra/sim` `explainSecondary`(computeSecondary와 같은 식, 무작위 2,000번 같은 값 시험) + `Loadout.gear`(장비 수치, 결과 그대로). 서버 `roster/body.ts` `bodySheet` → `CyborgBody.breakdown`(항 = 보너스 포함 1차 × 가중치‰ · 곱, 기본, 가중합 내림, 장비, 확률 상한·반감 상수, 결과), `skillSlotsMax`·`skillSlotUnlocks`(닫힌 칸이 열리는 환생 횟수, 서버가 skillSlotCount로 셈), `elements`(12칸, 지금 0), `growth`(만렙일 때만 처음 값·K‰, D-449). 기기는 다시 계산하지 않는다(막대 몫·가중합 보이기만).
- `/cyborg`: 머리 판(이름, 큰 그림 + 포인트 색 빛 고리, 인공장기 3·장비 6칸 — 넓으면 인공장기 | 그림 | 장비, 경험치·피로·신앙도), 핵심 사양(묶음 + 막대, 평소 두 칸·만렙이면 세 칸 + "K 0.97"), 상세 전투 스펙(48 §3.2 묶음, 줄마다 스탯 색 막대, 누르면 공식·상한·항·가중합·장비·곡선·결과, `aria-expanded`), 스킬 칸(연 칸·빈 칸·자물쇠 칸 "환생 n회에 열림"), 속성 12칸(6계열 × 기본·강화, 눈금 10, D-450 출처 안내), 인벤토리·환생(조건·비용, 신앙도 "50 이상", "신앙도는 0으로", "환생 시설에서는 K가 보입니다")·랭킹, 상태 줄.
- 그림 `cyborg/CyborgAvatar.tsx` 다시 그림: 껍데기 명암 그라데이션·광택, 짙은 얼굴 화면 위 빛나는 바이저·눈(빛 필터), 귀·안테나·볏·투구, 관절·리벳·집게·바퀴, 볼, 바닥 그림자, 사이보그 화면용 빛 고리(`halo`). 그림마다 ID가 다르다(useId). 저장된 부위·색 ID는 그대로.
- 정거장 테마(사용자 결정, 기획 D-454): 네온 SF(바탕 `#05050c`, 시안 `#00f0ff`, 자홍 초점 `#ff5cf4`, 보라 빛, 호박·초록 포인트, 시안 테두리·제목 빛). 주소창 색(`settings/theme.ts`·`public/theme-init.js`)도. 설정의 정거장 설명 "네온 SF, 고대비". 선명은 손대지 않았다.
- 화면 시험: 새 `e2e/cyborg.spec.ts`(플레이어 사이보그 화면 검사, 만렙 K 화면(응답 고침), 나쁜 자료 390 ko·en, 사진 390 × 파스텔·다크·정거장 + 1440 × 파스텔·다크 × ko·en, 정거장 홈·설정). `first-login.spec.ts`(초기 스탯 묶음 차례, 사진 1440·정거장, 프리셋 그림 넷), `units.spec.ts`(선택자). 도우미 `elementShot`.
- break-ui: 가장 긴 이름(16칸)·1차 13,629·HP 1,234,567·긴 아이템 이름·순위 1,284,000으로 390 ko·en — 넘침·작은 누르는 곳 없음. 긴 이름이 3xl에서 줄 중간에 끊겨 좁은 폭은 2xl로 낮췄다. web-design-guidelines: 스탯 약자 `translate="no"`, 잘리는 스탯 이름에 `title`, 전투 스펙 줄 hover.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/roster.ts` | 화면 차례·묶음·판정 차례·속성 코드, 풀이·K·속성·스킬 칸 규칙 응답 모양 |
| `packages/sim/src/combat/stats.ts`(+시험)·`equipment.ts`·`index.ts` | `explainSecondary`, `Loadout.gear`(판정 결과 그대로, SIM_VERSION 그대로) |
| `apps/server/src/roster/body.ts`·`cyborgBody.ts`·`preview.ts`(+`roster.test.ts`) | `bodySheet`(풀이·스킬 칸), 만렙이면 `growth`, 속성 0 |
| `apps/game/src/roster/StatPairs.tsx`·`statPairs.css`·`statGroups.ts`(+시험)·`parts.tsx`·`roster.css`·`rosterText.ts`(+시험) | 스탯 묶음 부품, 48 §3.2 묶음, `formatMilli`·`formatK`·약자 |
| `apps/game/src/cyborg/*` | 화면(머리 판·핵심 사양·전투 스펙·아래 판), 그림, 문구·막대 몫(+시험) |
| `apps/game/src/start/statsStep.tsx`·`placeSteps.tsx`·`start.css` | 초기 스탯·성향·강하 요약을 묶음·색으로 |
| `apps/game/src/styles/tokens.css`, `scripts/design-tokens.mjs`(+시험) | 스탯 색·막대·그림 크기 토큰, 정거장 네온, 스탯 색 대비 쌍 |
| `apps/game/src/settings/theme.ts`, `apps/game/public/theme-init.js` | 정거장 주소창 색 `#05050c` |
| `apps/game/messages/{ko,en}.json` | 새 키 54개(스탯 약자·묶음·풀이·속성·K·상태 줄, 1,797 → 1,851), 영어 스탯 이름, 환생 신앙도 문구(D-451), 정거장 설명 |
| `e2e/cyborg.spec.ts`·`first-login.spec.ts`·`units.spec.ts`·`helpers/screen.ts` | 화면 시험·사진 |
| `docs/adr/2026-11-01-ui-visibility.md`, `docs/adr/2026-10-28-design-system.md`(상태 줄), `AGENTS.md` 8장 한 줄, `docs/questions/2026-11-01-cyborg-ui.md` | 결정·질문·답 |

## 함께 바꿔야 하는 파일
- 속성값 저장·생성 분배(D-450)를 넣으면 `apps/server/src/roster/cyborgBody.ts`의 `NO_ELEMENTS` 대신 저장 값을, 판정(`specFromStats` `elements`)도 같은 값을 쓴다. 화면은 그대로 눈금이 찬다.
- 신앙도 문턱 규칙(D-451)을 바꾸면 `CyborgBody.faith` 주석(`packages/shared/src/roster.ts`, "써서 줄어든다")과 환생 판 주석을 맞춘다. 문구는 이미 "50 이상"이다.
- 환생 시설·생명공학 시설 화면이 생기면 그 응답에도 `growth`(처음 값·K)를 보내고 `StatPairs`에 넘기면 세 칸 + K가 그대로 보인다(D-449).
- 2차 스탯 식을 바꾸면 `computeSecondary`와 `explainSecondary`를 함께 고친다(시험이 무작위 입력으로 같은지 본다).
- 스탯 색을 바꾸면 테마 넷을 함께, 대비 검사(`pnpm check:contrast`)로 확인한다.

## 건드리지 말 것
- 선명 테마 값(사용자 결정: 지금 그대로). 기기 설정 따르기(고대비 → 선명)도 그대로.
- 판정 코드의 스탯 차례(STR·DEX·AGI·VIT·INT·WIS, 가중치 열). 화면 차례만 바뀌었다.

## 미검증·TODO·알려진 문제
- 위 띠 얼굴은 그대로다(새 그림을 넣으면 그림 코드가 첫 화면 묶음에 들어가 상한을 넘을 수 있다).
- 휴대폰 실기기에서는 보지 않았다(헤드리스 Chromium 390·1440 사진만). 빛 필터(SVG feGaussianBlur)의 저사양 폰 성능은 재지 않았다(Unknown).
- 사이보그 속성값은 아직 모두 0이다(저장·생성 분배 단계는 다음 줄기, D-450).
- 전투 스펙 줄을 펼친 상태는 주소에 남지 않는다(새로고침하면 접힌다).
- NAS에 배포하지 않았다(미실행).

## 검사
- Verified: `TEST_DATABASE_URL=postgres://terra@127.0.0.1:55432/postgres pnpm check` 통과 — 시험 파일 301개·시험 2,570개(DB 시험 포함), 다국어 1,851키, 대비 테마 4개 232쌍(최저 글자 5.05), 화면 CSS 35개 직접 쓴 값 없음, 콘텐츠 core@13. `pnpm check:content`(4b 기준 f872151)·`pnpm docs:index` 통과.
- Verified: 시험 `stats.test.ts`(풀이 = computeSecondary, 무작위 2,000번), `roster.test.ts`(풀이 행 = 2차 스탯 값, 항 = 보너스 포함 1차 × 가중치, 스킬 칸 열림 [2…7], 만렙에서만 growth), `statGroups.test.ts`, `cyborgText.test.ts`, `rosterText.test.ts`(formatMilli·formatK·화면 차례), `design-tokens.test.mjs`.
- Verified: 화면 시험 전체 `pnpm e2e` 197개 중 196 통과·1 건너뜀(측정 시험, `E2E_MEASURE=1`일 때만), 15.1분. 새 `cyborg.spec.ts` 16개 통과(플레이어 검사, 만렙 K, 나쁜 자료 ko·en, 사진 10 + 정거장 홈·설정 2). `first-login.spec.ts`는 사진이 4 → 10개(1440·정거장).
- Verified: 첫 화면 JS `pnpm check:bundle` 130,988B / 상한 131,416B(남음 428B). 시작 전 main 130,972B 대비 +16B(첫 화면 `index` 조각이 지연 조각 목록·정거장 주소창 색 줄로 원본 +40B). 그림(`CyborgAvatar-*.js`)과 화면(`CyborgScreen-*.js`)은 지연 조각에만 있다(빌드 결과에서 `feGaussianBlur`·`spec-toggle` 검색). 상한은 올리지 않았다.
- 사진(저장소 밖): `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/cyborg-ui/shots/` — `cyborg-ui-{390,1440}-{테마}-{언어}`(접은 화면), `cyborg-ui-open-…`(HP·회피·크리 배율 펼침), `cyborg-ui-hero-…`(머리 판·그림), `cyborg-ui-worst-390-{ko,en}`(나쁜 자료), `first-login-3-stats-{390,1440}-…`(초기 스탯), `avatar-preset-{0..3}-{폭}-{테마}`(그림), `station-home-390-…`·`station-settings-390-…`. 390은 파스텔·다크·정거장, 1440은 파스텔·다크, 한국어·영어.

## 사용자 결정 대기
- 없음(181~183은 D-448·D-450·D-449로 답 받음). 새 질문은 184부터.
