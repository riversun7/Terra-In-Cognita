# 캐릭터 3D 2 — 옛 사이보그의 한 번 외형 고르기(961 나)와 2차맵 발밑 나라 색 고리(963 나)

- 일시: 2026-11-11 20:10 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-11-character-3d.md` "바뀜 (2026-11-11, 961·963)", 질문 `docs/questions/2026-11-11-character-3d.md`(답 옴 — 기획 D-529 포인터, 모두 추천대로), 앞 작업 기록 `docs/worklog/2026/11/11-1854-character-3d.md`, 가지 `work/character-3d-2`(통합 `36f2cc22c9`에서, 뒤에 `origin/merge/integration`을 합침)

## 한 일
기획이 질문 961~968에 모두 추천안으로 답했다(D-529 포인터, 사용자에게는 묻지 않음). 코드가 필요한 둘을 넣었다. 962(더 가까운 확대)는 카메라 줄기(`map-seamless-2`) 뒤로 미뤘고, 964~968은 지금 그대로다.

1. **961 나 — 한 번 외형 고르기**
   - 프로토콜 22(최소 21): `cyborg_look { id, look }` → `cyborg_result`, 새 결과 코드 `look_locked`. 처음에는 21로 올렸으나 통합 가지에서 물가 조건(`needs_water`)이 21을 먼저 써서 22로 옮겼다. 최소 판은 "현재 + 직전 1개" 시험(여러 `*.test.ts`) 때문에 21이다 — 21과 22가 같이 나가면 통합에서 21 하나로 합쳐도 된다(그러면 최소 20).
   - 서버 `CyborgService.chooseLook`: 사이보그가 없으면 `no_cyborg`, 저장한 3D 외형이 있으면 `look_locked`, `isCharacterLook`이 틀리면 `appearance_invalid`(기회를 쓰지 않음). 맞으면 `look` 저장 + 옛 칸 `appearance`를 그 외형에서 넘긴 값으로, 쓰기 대기열 → durable.
   - `cyborg.get`에 `look`(저장한 것 또는 넘긴 값)·`lookPick`(저장한 3D 외형 없음, 시안이면 false).
   - 사이보그 화면 머리 판 그림 아래 [외형 고르기] + "한 번 무료" 안내 → 지연 조각 `LookPick` 창: 만들기 외형 단계(`LooksStep`)를 그대로 쓴다(포크 없음), 처음 값 = 넘긴 외형. [이 모습으로 정하기] → 확인(되돌릴 수 없음) → 저장 → 자료를 다시 받아 단추가 사라지고 위 띠 얼굴도 바로 바뀐다(`markCyborgAppearance`).
2. **963 나 — 발밑 나라 색 고리**
   - 서버: 새 조회 없이 `world.unitLooks` 답에 `nations: [{ factionId, unitIds }]`(보는 유닛 전부, 외형과 같은 보는 규칙). 주인 → 나라는 건물 겉모습과 같은 `ownerFactionsOf`. 조회가 비동기가 됐다(플레이어 주체의 가입 국가를 DB에서 한 번에).
   - 기기: `unitModels.ts`가 같은 답의 나라를 건물 깃발과 같은 국가 색 번호(`accentOf`)로 바꿔 `engine.setUnitRings`. 국가 차례는 건물 겉모습이 받은 world.cities를 같이 쓴다(`onFactions` → `setFactions`). `?unit-models=0`이어도 고리는 그린다.
   - 엔진 `units/nationRings.ts`: 인스턴스 고리 하나(그리기 호출 1, 고리당 삼각형 48), 캡슐·모델 모두, 점이면 없음, 반지름 = 몸 × 1.7(하한 화면 5px). 통계 `nationRings`·`selectedRing`, 화면 표지 `data-nation-rings`·`data-selected-ring`.
   - 처음에는 renderOrder −1이라 땅보다 먼저 그려져 땅이 덮었다(그린 고리 15개인데 사진에 하나도 안 보임 — Verified: 실행). 18로 바꿔 땅·유닛 뒤에 그리니 보인다(Verified: 사진).

## 정한 것
- 고리 자료는 `world.unitLooks`에 실었다(새 조회 대신): 묻는 때·보는 규칙이 같고, 나라는 유닛 움직임보다 훨씬 드물게 바뀐다. 나라마다 유닛 ID를 모아 짧게 보낸다.
- 고리 색 = 건물과 같은 `accentOf` 번호. 세력 정체성 줄기가 건물 색 규칙을 바꾸면 고리도 따라간다.
- 외형 고르기 창은 확인 단계를 하나 더 둔다(되돌릴 수 없는 일).
- 감사 기록은 따로 두지 않았다(지시대로).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/protocol/src/cyborg.ts`·`.test.ts`, `version.ts`, `index.ts` | `cyborg_look`, `look_locked`, 판 22(최소 21) |
| `apps/server/src/cyborg/service.ts`·`state.ts`·`gateway.ts`·`gateway.test.ts`·`cyborg.db.test.ts`, `session.ts` | 한 번 고르기 판정·저장, 판 확인, 시험 |
| `apps/server/src/roster/services.ts`, `packages/shared/src/roster.ts` | `cyborg.get`의 `look`·`lookPick` |
| `apps/server/src/worldMap/mapUnits.ts`·`.test.ts`, `reads.ts`, `trpc/world.ts`, `packages/shared/src/mapUnits.ts` | `world.unitLooks`의 `nations` |
| `packages/engine/src/units/nationRings.ts`·`.test.ts`(새), `secondMapEngine.ts`, `engineTypes.ts`, `engineParts.ts`, `index.ts` | 고리 그리기·`setUnitRings`·통계 |
| `apps/game/src/map/unitModels.ts`·`.test.ts`, `buildingLooks.ts`, `mapSession.ts`, `mapHudData.ts` | 나라 → 국가 색 번호 → 엔진, 화면 표지 |
| `apps/game/src/cyborg/LookPick.tsx`·`lookPick.css`(새), `CyborgScreen.tsx`, `cyborg.css` | [외형 고르기]와 창 |
| `apps/game/src/start/cyborgCommands.ts`, `cyborgGate.ts`, `startText.ts` | 명령 타입, 위 띠 얼굴 바꾸기, 결과 코드 문구 |
| `apps/game/messages/ko.json`·`en.json` | `cyborg_look_pick*` 12개씩 |
| `e2e/character-3d.spec.ts`, `e2e/first-login.spec.ts`, `e2e/global-setup.ts`, `e2e/helpers/harness.ts` | 고르기 흐름·고리 표지 시험, relook 계정(3D 외형 없이 만든 사이보그) |
| `docs/adr/2026-11-11-character-3d.md`, `docs/questions/2026-11-11-character-3d.md` | 바뀜 절, 답 옴 표시 |

## 검사
Verified: 실행(공유 개발 컨테이너, `TEST_DATABASE_URL` 있음).
- 단위: protocol 21파일 119개, server `cyborg/gateway.test.ts`·`worldMap/mapUnits.test.ts` 18개(새 2), server DB `cyborg.db.test.ts` 10개(새 1: 한 번만·잘못된 외형은 기회 안 씀·다시 켜도 막힘·다른 길이 행을 다시 써도 남음), engine 56파일 481개(새 `nationRings` 4), game `unitModels`·`buildingLooks` 11개(새 1).
- `pnpm check`(`TEST_DATABASE_URL` 있음, 통합을 합친 뒤 `45603f2` 위): 통과 — 포맷·린트·타입·경계·파일 크기·다국어(6,626키)·디자인 값·콘텐츠 팩(core@64)·단위 시험 610파일 4,726개.
- 빌드 통과, `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 통과(첫 화면 JS 108,703 B / 상한 131,416 B, 합친 뒤), `pnpm check:docs origin/main` 통과. `LookPick` 조각 3.3 kB(미리 보기 엔진·외형 단계는 지연 조각).
- 합친 뒤 화면 시험 다시: `character-3d.spec.ts` 3개 통과(2개 건너뜀), `first-login.spec.ts`의 새 플레이어 흐름·속성 분배 전 사이보그 2개 통과(만들 때 3D 외형을 고른 사이보그에는 [외형 고르기]가 없다는 확인 더함). 사진 시험(first-login 사진 묶음)은 디스크 때문에 돌리지 않았다.
- 화면 시험(헤드리스 Chromium): `character-3d.spec.ts` 3개 통과(측정 2개는 `E2E_MEASURE` 없어 건너뜀) — 넓은 화면 모델·고리(5/5 고리 ≥ 1·`data-selected-ring` 0~5·`nations`에 내 사이보그, 3/5 캡슐이면 고리 ≥ 1, 점이면 0), 390 먼 단계, relook 한 번 고르기(단추 → 창 처음 값 = 넘긴 외형 → 기사 프리셋 → 확인·더 고르기·정하기 → 단추 사라짐·`lookPick` false·저장 외형 = 고른 것 → 새로 고쳐도 없음 → WebSocket 직접 보내기 `look_locked`).
- 사진(`/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/character-3d-2-shots/`): `character-3d-map-close-1440-pastel.png`(발밑 빨간 고리), `character-3d-map-close-390-pastel.png`, `character-3d-relook-390-pastel.png`(확인 단계).

## 함께 바꿔야 하는 파일
- 건물 국가 색 규칙(`buildingLooks.ts` `accentOf`, 엔진 `nationAccent`)을 바꾸면 고리도 같이 바뀐다(같은 함수를 쓴다).
- 환생(D-352 무료 다시 고르기)을 만들면 `cyborgs.look`을 바꾸는 길을 따로 둔다(`chooseLook`은 빈 값일 때만).
- 새 화면 시험 계정을 더하면 `e2e/global-setup.ts` ACCOUNTS·SETUP_CYBORGS와 `e2e/helpers/harness.ts`를 함께.

## 건드리지 말 것
- relook 계정의 기회는 `character-3d.spec.ts`가 쓴다. 다른 시험이 그 계정의 [외형 고르기]를 기대하면 안 된다(player·dev·admin도 3D 외형 없이 만들어 단추가 보이지만, 그 기회를 쓰지 않는다).

## 미검증·TODO·알려진 문제
- 고른 표시 고리(`unitView.ts`, renderOrder 0·깊이 안 씀)도 같은 까닭으로 땅에 덮일 수 있다(Assumed — 사진에서 고른 사이보그 발밑 노란 고리가 보이지 않았다. 나무에 가려서일 수도 있다). 이 줄기 범위 밖이라 고치지 않았다.
- 휴대폰 실기기에서 고리 보이기·비용을 재지 않았다(Unknown).
- 프로토콜: 통합에서 21(물가 조건)과 22(이 줄기)가 같이 나가면 하나로 합칠 수 있다.

## 사용자 결정 대기
- 없음(962는 카메라 줄기 뒤에 이어 한다).
