# 첫 접속 다듬기 — 다시 굴리기 5번·운영진 제한 없음, 속성 옮기기, 나라 카드 자세한 정보

- 일시: 2026-11-11 23:08 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-01-first-login-cyborg.md` "바뀜 (2026-11-11, 다시 굴리기·속성 옮기기·나라 카드)", 질문 `docs/questions/2026-11-11-creation-tweaks.md`(1011·1012), 브랜치 `work/creation-tweaks`

## 한 일
- 사용자 요청(2026-11-11) 세 가지: 다시 굴리기 3 → 5번(설정 칸 N9 팩 값)과 운영진(gm·admin·dev) 제한 없음(서버 판정, 화면 "제한 없음"), 속성 10점을 다 쓴 뒤 다른 속성 [+]가 가장 많은 속성에서 1점을 옮겨 옴(세 번째 속성은 막고 힌트), 나라 고르기 카드에 국력 등급·인구·도시 수·체제·거래세·화폐·지도자·마크·한 줄 소개.
- 추천 표지를 좁혔다: 시작 도시 하나당 사이보그가 적고 시작 도시가 많은 나라 앞의 3곳(열린 나라 3곳 이하면 1곳). "사이보그 0"은 어느 나라든 1 이상일 때만 보인다.
- 국가 프리셋에 선택 칸 `intro {ko,en}`(160자)을 더하고 16개 프리셋에 [임시] 소개 글, 국가 편집기 정체성 칸에서 보고 고친다. 팩 core@66.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/tuning.json` | N9 `n9_initial_rerolls` 3 → 5(사용자 요청) |
| `packages/sim/src/society/coefficients.ts` | TEST 계수표 `initialRerolls` 3 → 5(팩 = TEST 계수표 검사). 시뮬 실행은 이 값을 안 써서 SIM_VERSION 그대로 |
| 시험: `sim/society/cyborgStats.test.ts`, `server/roster/roster.test.ts`, `e2e/units.spec.ts`(미실행) | 다시 굴리기 5번 |
| `content/core/nation_presets.json`, `content/core/manifest.json` | 16개 프리셋 `intro`([임시]), 판 66 |
| `packages/content/src/schema/economy.ts` | 프리셋 `intro` 선택 칸(언어마다 160자) |
| `packages/shared/src/cyborgApi.ts`, `cyborg.ts` | `CreationNationProfile`, `CreationFaction.profile`, `rules.rollsUnlimited`, 추천 규칙 주석 |
| `packages/shared/src/roles.ts`, `index.ts` | `STAFF_ROLES`·`hasStaffRole`(운영진 판정 공용) |
| `packages/shared/src/nationEditor.ts` | `NationPresetJson.intro`, `NATION_LIST_LIMITS.introLength` |
| `apps/server/src/cyborg/service.ts` | 운영진 굴림 제한 없음(`roll` 옵션), `creation(…, view)`, `recommendedNations`, 나라 정보 칸, `cyborgReadsOf`가 역할·올린 마크를 채움 |
| `apps/server/src/cyborg/gateway.ts` | 굴리기에 로그인 역할로 `unlimited` 넘김 |
| `apps/server/src/cyborg/nationProfile.ts` (새) | 나라 정보(프리셋 + NPC 거울 세계 + 도시 경제 세율) |
| `apps/server/src/world/world.ts`, `app.ts`, `trpc/context.ts` | 나라 정보·올린 마크 잇기, `creation`이 약속을 돌려줄 수 있게 |
| `apps/server/src/npc/nations.ts`, `npc/presets.ts`, `nationEdit/views.ts` | 프리셋 `intro`·`tradeTaxBp` 전달 |
| `apps/game/src/start/elementDraft.ts` (새), `elementsStep.tsx`, `StartScreen.tsx` | [+] 옮기기 규칙(순수 함수)·힌트 |
| `apps/game/src/start/statsStep.tsx` | "다시 굴리기 (제한 없음)" |
| `apps/game/src/start/placeSteps.tsx`, `startText.ts`, `start.css` | 나라 카드(마크·등급·인구·소개, 고른 카드 펼침) |
| `apps/game/src/editor/nations/NationDetail.tsx`, `nationModel.ts`, `nationText.ts` | 편집기 소개 칸·검사 문구 |
| `apps/game/messages/{ko,en}.json` | 새 키(ko·en), 안 쓰는 `start_faction_cities` 지움, `start_faction_note` 새 규칙 |
| 시험: `cyborg/nationProfile.test.ts`(새), `cyborg/gateway.test.ts`, `cyborg/cyborgTuning.db.test.ts`, `cyborg/cyborg.db.test.ts`, `start/elementDraft.test.ts`(새), `e2e/first-login.spec.ts` | 굴림 상한 6·운영진 제한 없음, 추천·나라 정보, [+] 옮기기, 화면 흐름 |

## 함께 바꿔야 하는 파일
- 나라 정보 칸을 더하면 `CreationNationProfile`(shared) ↔ `nationProfile.ts` ↔ `placeSteps.tsx` `NationFacts`.
- 프리셋 칸을 더하면 스키마 ↔ `NationPresetJson` ↔ `nationEdit/views.ts` ↔ `nationModel.ts` `cleanNation`(칸 차례 같게).

## 건드리지 말 것
- 서버 분배 판정(`checkElementAllocation`)은 그대로다. 옮기기는 화면 규칙이다.
- 프로토콜 판은 그대로다(운영진 굴림은 "남은 = 상한"으로 보낸다).

## 검증
- Verified: `pnpm vitest run`(서버 `src/cyborg/` 4파일 24개 통과, DB 포함), 게임 `elementDraft.test.ts` 7개 통과, `pnpm check:content origin/main` 통과(core@66).
- Verified: e2e `first-login.spec.ts` `--grep "새 플레이어|390 pastel|다음 접속"` 4개 통과(390 파스텔 ko·en 사진: 나라 카드 넘침·작은 단추 없음).
- 나머지 검사 결과는 아래 "끝 검사"에 적는다.

## 미검증·TODO·알려진 문제
- 운영진 제한 없음은 e2e로 보지 않았다(e2e 운영진 계정은 이미 사이보그가 있다). 서버 시험(게이트웨이·DB)이 본다.
- "{count} cyborgs" 영어 단수(1 cyborgs)는 옛 문구 그대로다.
- 다크·정거장·1440 사진은 이번에 찍지 않았다(Unknown — 토큰만 썼다).

## 사용자 결정 대기
- 질문 1011(환생에도 5번인가), 1012(추천 규칙).
