# 국력 등급(NPC 국가의 고르지 않은 힘 분포) — 등급 표·경비대·등급 배치·이미 선 세계에 반영·랜덤 국가 추가

- 일시: 2026-11-11 17:45 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-10-nation-editor.md`·`docs/adr/2026-11-07-world-layout.md` "바뀜 (2026-11-11)", 질문 `docs/questions/2026-11-11-nation-power.md` 916~925, 기획 D-529(main `a90b374` 미러), PLAN 14장, 가지 `work/nation-power`
- 사용자 원문(2026-11-11): 질문 903에 "답1. 현재 테스트 맵에 실제 강대국 분포처럼 알아서 배치해달라.", 이름·마크 표본에 "3.샘플좋다. 추가적으로 랜덤으로 프리셋을 설정하여 추가할수도 있으면 좋을듯."

## 한 일
- **국력 등급 표(팩 core@62)**: 새 분류 `nation_tiers`(등급 다섯 — 초강대국·강대국·중견국·소국·도시국가)와 프리셋 칸 `powerTier`. 프리셋 16개 = 2·3·5·4·2. 등급 표가 시작 도시 수·주거·처음 인구·시설 수(시설 ID마다)·경비대·기술·국고·도시 간격·국가 간격의 기본값이다. 푸는 차례 = 국가 칸 → 등급 표 → 설정 칸(`@terra/shared/nationTier resolveNationStart`). 성격 칸에 `startGuards`·`startTech`. 팩 프리셋의 옛 `startCities`(4·3·2)는 뺐다. 설정 칸 `d6041_start_cities_max` 4 → 8(등급 값의 상한).
- **세계 씨앗(서버)**: 고정 국가를 등급대로 세운다 — 도시 수·주거·처음 인구·기본 시설 수·처음 기술 단계(`factions.tech_level`)·처음 국고(등급 ‰). 등급이 없는 프리셋·등급 표가 없는 팩은 어제와 같다.
- **경비대**: 표시가 붙은 휴먼(`SimUnit.guard`, `world_humans.guard`). 처음 인구와 함께 도시마다 등급 수만큼 세운다. 일꾼으로 세지 않고(도시 경제), 늘 도시 시청 칸 둘레에 머물고(집·일터 배치), 도시 수비에 먼저 나선다(공성·웨이브). 그 밖은 휴먼과 같다. NPC 사이보그 부대는 기획에 없어 세우지 않았다(질문 917).
- **시뮬**: 시나리오 세력 칸 `guards`, 수비·원정 차례(`defenseOrder`·`expeditionOrder`), 요약 `groups`(묶음별 처음·끝 수), `war16`을 팩 등급 표와 같은 다섯 묶음으로. `SIM_VERSION` 22 → 23, 출력 형식 14 → 15.
- **세계 배치**: 등급 값이 있으면 강한 등급 먼저, 두 국가 사이 = 국가 간격 × 등급 간격 평균, 초강대국·강대국은 땅 넓이 점수를 곱하고, 소국·도시국가는 큰 이웃 둘 사이, 도시 사이 칸은 등급 값. 등급이 없으면 옛 결과 그대로.
- **이미 선 세계에 반영**: 배포만으로는 선 세계가 바뀌지 않는다(이미 선 국가는 옛 규칙까지만 채운다). `/dev/world-layout`에서 미리 보기(DB 읽기만) → [반영 예약](표 `world_tier_requests`, 감사 기록) → 다음 서버 시작 때 모자란 시작 도시·주거·휴먼·경비대·기술만 더한다. 지우거나 옮기지 않는다.
- **이 세계에 국가 세우기**: 차례 밖 프리셋(새로 만든 것 포함)에 자리를 놓으면 다음 시작 때 그 국가가 등급대로 선다.
- **화면**: `/dev/nations` — 국력 등급 칸("등급 기본값 N"), 경비대·기술 칸, [국력 등급] 판(나라별 시작 합계 막대 + 등급 표 편집), [랜덤 국가 추가](후보 카드, 전부·부분 다시 굴리기, 새 영구 ID로 목록 끝에). `/dev/world-layout` — 국가 표에 등급, 등급 배치 계획 미리 보기·다시 만들기(지도에 마름모·점, 국가 시그니처 컬러), 이 세계에 반영(미리 보기 → 예약·취소), 세울 수 있는 국가.
- **문서**: ADR 둘에 "바뀜 (2026-11-11)", 질문 916~925, 질문 903 답 표시·911 일부 넣음 표시, PLAN 14장 줄.

## 정한 것(기획에 없어 [임시])
- 등급 표 수치와 프리셋 배정(질문 916·922): 초강대국 01·09, 강대국 02·05·13, 중견국 03·04·06·08·14, 소국 07·10·12·16, 도시국가 11·15. 국가 넷만 서는 서버에서 등급이 갈리게 01~03과 16을 다르게 뒀다.
- 초강대국 경비대는 6이 아니라 5로 뒀다: 이미 선 세계(시험 자료 2·4·3·2곳)에 반영할 때 유닛 +297로 300 아래다.
- 이미 선 세계의 남는 도시는 지우지 않는다(질문 924). 국고는 고치지 않는다.
- 시작 도시는 지금처럼 모두 시작 도시 표시다(D-341 보호 — 초강대국 6곳 모두, 질문 921).
- 새 프리셋은 저장만으로 서지 않고 자리를 놓아야 선다(질문 925). 팩 프리셋 켬·끔은 여전히 막았다(차례가 당겨진다).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/nation_tiers.json`(새), `nation_presets.json`, `tuning.json`, `manifest.json` | 등급 표, 프리셋 등급·도시 이름 보탬, 시작 도시 위 끝 8, 판 61 → 62 |
| `packages/shared/src/nationTier.ts`·`nationRandom.ts`(+시험), `nationEditor.ts`, `contentEdit.ts`, `worldPlacementApi.ts`, `package.json` | 등급 모양·푸는 차례, 랜덤 국가 후보, 편집기·세계 배치 응답 모양(더하기만) |
| `packages/content/src/schema/economy.ts`·`categories.ts`, `validate/nations.ts`(+시험), `tuningDiff.ts`, `index.ts`, `scripts/apply-tuning-diff.mjs` | 등급 표 스키마·분류, 프리셋 칸, 팩 검사 `nation_tier_missing`, 내보내기 분류 |
| `packages/sim/src/simulator/world.ts`·`scenario.ts`·`combatRun.ts`·`gardenerRun.ts`·`run.ts`, `society/worldSeed.ts`, `tuningWorldSeed.ts`, `version.ts`, `index.ts`, `scenarios/war16.json`, `simulator/guards.test.ts` | 경비대, 수비·원정 차례, 요약 groups, 시작 도시 위 끝, 판 23 |
| `apps/server/src/npc/nations.ts`·`presets.ts`·`runtime.ts`·`state.ts`·`persist.ts`·`economy.ts`·`humanPlaces.ts` | 등급 시작 값, 경비대 씨앗·저장·일꾼 제외·자리, 반영 요청 때 더하기, 차례 밖 국가 |
| `apps/server/src/world/worldLayout.ts`·`worldBoot.ts`·`world.ts`·`placementService.ts`, `tierApply.ts`·`tierPlan.ts`(새), `persist/tables.ts` | 등급 자리 고르기, 반영 요청·미리 보기, 국가 세우기, 쓰기 표 `humanGuard` |
| `apps/server/src/nationEdit/services.ts`·`views.ts`, `trpc/nations.ts`·`worldLayout.ts`, `contentEdit/core.ts`·`state.ts`, `app.ts`, `main.ts` | 등급 표·새 프리셋 저장, tRPC 더하기 |
| `apps/server/src/db/populationSchema.ts`·`worldPlacementSchema.ts`·`contentEditSchema.ts`·`schema.ts`, `drizzle/20261111070141_nation_power/` | 열 `world_humans.guard`, 표 `world_tier_requests`, 분류 검사에 `nation_tiers` |
| `apps/server/src/world/nationTiers.db.test.ts`·`worldLayoutTiers.test.ts`(새), `testSupport.ts`, 옛 시험 열 개 | 등급 씨앗·반영·세우기 시험, 옛 규칙 시험은 `legacyNationPresets`(등급 없는 프리셋)로 |
| `apps/game/src/editor/nations/*`(`NationPowerPanel`·`NationPowerSection`·`NationRandomPanel` 새), `editor/worldLayout/*`(`WorldTierPanel` 새), `messages/{ko,en}.json` | 화면·모델·문구(메시지 95개) |
| `e2e/nations.spec.ts`, `e2e/world-layout.spec.ts` | 화면 시험·사진 |
| `docs/adr/*`, `docs/questions/*`, `docs/PLAN.md` | 결정·질문 |

- 놓기 검사(`placementService.place`)도 등급 간격(국가 간격 × 두 국가 `homeGapPm` 평균)을 쓴다: 처음 화면 시험에서 등급 제안 넷 가운데 둘이 `too_close`로 막혀 고쳤다(DB 시험 `nationTiers.db.test.ts`에 "제안을 모두 놓으면 모두 ok"를 더함).

## 함께 바꿔야 하는 파일
- 등급 표 칸을 더하면: `nationTierEntrySchema` · `@terra/shared/nationTier NationTierJson`·`resolveNationStart` · `npc/presets.ts nationTierJsonOf` · `editor/nations/nationModel.ts cleanTier`(칸 차례 = 팩 파일 차례) · `NationPowerPanel.tsx FIELDS` · `packages/sim/scenarios/war16.json`(시험 `npc/presets.test.ts`가 팩과 견준다).
- 세계 씨앗이 세우는 시설 목록을 넓히면(같은 묶음 `production-six`): `npc/nations.ts nationSeedOf`가 등급 표의 넷만 설정 칸 모양으로 옮긴다 — 다른 시설 ID는 `nationStartOf(seed, preset).facilities[시설 ID]`를 읽는다.
- 덮어쓰기 분류 검사(`db/contentEditSchema.ts`)를 다른 줄기도 바꾸면 두 목록을 합치고 `db:generate`.
- `AGENTS.md` 7장 `NPC_SOCIETY=1 …` 줄에 등급 씨앗·경비대 설명은 넣지 않았다(여러 줄기가 고치는 파일 — 통합 때 한 줄 보탠다).

## 건드리지 말 것
- 등급 ID 다섯(`POWER_TIERS`): 팩 줄 ID이자 프리셋에 저장된 값이다.
- 팩 프리셋 16개의 차례·켬 상태: 국가 차례가 켜진 프리셋의 차례다(새 프리셋은 뒤에만 붙는다).
- `world_humans.guard`는 쓰기 표 `humanGuard`만 쓴다(`humans` 행은 이 칸을 쓰지 않는다 — 유저 휴먼을 쓰는 다른 곳이 몰라도 된다).

## 미검증·TODO·알려진 문제
- NAS에서 돌리지 않았다(Unknown): 미리 보기 수·반영 뒤 메모리·틱 시간. 시험 자료(2·4·3·2곳 세계)로는 도시 +4·휴먼 +238·경비대 +59.
- 국가 16개 새 세계는 DB 시험 틀로만 재 보았다(Verified, 한 번 — 가짜 행성 값·임시 지형·시험 2차맵 2장): 국가 16, 시작 도시 49(자리 모자람 0), 유닛 1,891(휴먼 1,698 + 경비대 177 + 지도자 16), 띄운 2차맵 51장, 부팅 4.4초, 불변 조건 위반 0. 실제 서버(지형 워커·경로 워커·NAS 1GiB)의 메모리·틱 시간은 재지 않았다(Unknown, 질문 919).
- 경비대는 지도에서 다른 NPC 휴먼과 겉모습이 같다(프로토콜 칸을 더하지 않았다). 죽은 경비대를 다시 채우지 않는다(질문 920).
- 등급 표의 창고·농장·벌목장·광산 밖 시설 줄은 지금 세계 씨앗에 들지 않는다(자료로만 실린다).
- `war16` 30일이 7초 → 약 3분으로 늘었다: 힘이 고르지 않아 공성이 실제로 일어난다(전에는 공성 0회). `sim:speed`의 war16 몫도 그만큼 는다.
- 등급 배치의 "소국은 바닷가"는 땅 넓이 점수가 낮은 칸을 같은 조건일 때만 고른다(큰 이웃 사이가 먼저다).
- 세계 배치 화면 평면 지도에서 국가 넷이 첫 수도 둘레 48칸 안에 모여 표시(수도·계획 마름모)가 겹쳐 보인다(옛 동작 — 국가 간격 30칸이 행성 전체에 비해 작다).
- 파일 크기 경고(600줄 초과, 실패 아님): `nationEditor.css` 640, `nationEdit.db.test.ts` 629, `npc/nations.ts` 613, `npc/runtime.ts` 903, `world/world.ts` 954(전부터 넘던 파일 포함).
- 화면 시험은 바꾼 spec 둘만 돌렸다. 시험 세계의 도시 수가 11 → 15곳으로 늘어 다른 spec이 도시 수에 기대면 고쳐야 한다(글자 찾기로는 못 찾았다, Assumed).

## 사용자 결정 대기
- 질문 916~925. 급한 것: 918(NAS에 반영 예약만 할지, 세계를 새로 시작할지 — 자리까지 등급 계획대로 서려면 새로 시작이 깨끗하다), 919(NAS 고정 국가 수), 917(NPC 사이보그 부대).

## 검사
Verified = 이 작업 트리에서 실행해 결과를 봄. 바탕 main `8370909`(origin/main `a90b374`은 설계 미러만 — 콘텐츠 호환 검사를 그 기준으로 돌림).
- `TEST_DATABASE_URL=… pnpm check`: 통과 — 583파일 4,511시험(DB 시험 포함). 그 뒤 고친 것(놓기 검사의 등급 간격·world.ts 도우미 옮김)은 타입 검사·린트·`nationTiers.db.test.ts`·`nationPlacement.db.test.ts`·`world.db.test.ts`·`npcSeed.db.test.ts`를 따로 다시 돌려 통과.
- `pnpm build` + `node scripts/check-pwa.mjs`: 통과. `pnpm check:bundle`: 첫 화면 JS 108,093 B / 상한 131,416 B(상한 그대로 — 화면은 `NationEditorScreen-*`·`WorldLayoutScreen-*` 조각).
- `pnpm check:content origin/main`: 통과(core@62, 호환 4b 포함).
- `pnpm e2e nations.spec.ts world-layout.spec.ts`: 18시험 가운데 17 통과·1 실패(`world-layout` 관리자 시험 — 등급 제안을 모두 놓으면 둘이 `too_close`) → 놓기 검사를 등급 간격으로 고친 뒤 `pnpm e2e world-layout.spec.ts` 7시험 통과. `nations.spec.ts` 11시험은 고치기 전 실행에서 통과(그 뒤 nations 화면 코드는 바꾸지 않음).
- 시뮬 `pnpm --filter @terra/sim sim war16 --days 30`: 불변 조건 위반 0, 걸린 시간 약 2분 56초(등급 전 약 9초 — 공성이 0회 → 347회). 30일 끝 묶음별 도시 수: 초강대국 12 → 13, 강대국 12 → 16, 중견국 15 → 20, 소국 8 → 5, 도시국가 2 → 2. 고정 세력은 모두 살아 있다. 경비대는 공성에서 줄었다(초강대국 60 → 36).
- 국가 16개 새 세계(DB 시험 틀, 위 "미검증" 참조): 도시 49·유닛 1,891·불변 조건 0.
- 사진(저장소 밖, `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/nation-power-shots/`): `nations-power-{neon,light}-ko-1440.png`(나라별 합계 막대·등급 표), `world-layout-tiers-{neon,light}-ko-{1440,390}.png`(등급 배치 계획·반영·국가 세우기), `world-layout-{neon,light}-ko-{1440,390}.png`(지도), `nations-{neon,light}-{ko,en}-1440.png`, `nations-neon-ko-390.png`, `nations-light-en-390.png`.
- 돌리지 않은 것: 다른 화면 시험 spec(시험 세계 도시 수가 11 → 15곳), NAS·실제 서버 메모리, 실제 휴대폰.
