# 특산·이름 마무리 — 기획 답 600·601, 경제 화면 도시 이름 (플레이 흐름 WP12)

- 일시: 2026-11-07 23:50 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-play-flow.md` "WP12 특산·이름 마무리", 기획 D-518 포인터(기획 커밋 `f8a9c93`), 질문 `docs/questions/2026-11-07-play-nations.md`(600·601 반영, 새 620~621), 가지 `work/play-econ4`(main `51c59a9`에서)

## 한 일
- 600 나: 도시 계획 `@terra/sim planCityFacilities`가 건물이 받지 못한 같은 시설 특산(그 시설 특산 차례 ≥ 그 시설 생산 건물 수)을 휴먼의 도시 직무 Lv1로 둔다. 목재 나라 도시의 벌목장 건물 하나 = 목재, 통나무는 도시 직무. 서버 `npc/economy.ts syncCity`가 부른다(시뮬 시나리오 경제는 부르지 않음). `SIM_VERSION` 19.
- 601 나: `npc/nations.ts nationPresetOf` = 자기 프리셋 → 반란 부모 → 종주 → 태어날 때 부모(메모리). 실행 중에 세운 마을은 처음 저장할 때(`npc/persist.ts nameCity`, 쓰기 몫 `cityNames`), 이름 없이 복원된 도시는 복원 때(`ruinsPersist.ts`), 켤 때 남은 이름 없는 도시는 고정 나라 다음에(`followerNames`, 반란 부모·종주 행) 그 나라 목록의 다음 이름을 받는다. 태어날 때 부모는 런타임이 경제 고리 `factionBorn`을 감싸 적는다(`npc/runtime.ts`). 나라 성격(`personalityOfFaction`)도 같은 함수.
- 경제 화면 `#<도시 ID>`(WP5 TODO): 거래소(`market/views.ts cityLabel`)·창고 곳 이름(`holdingsFromAccounts`)은 응답 칸에 도시 이름, 구인·노동 게시판·건물(일꾼 산출·내 물건 자리)·신전 칸은 새 조회 `economy.cityNames`와 `apps/game/src/economy/cityText.ts useCityText`. 이름 없는 도시만 "#ID". 문구 8개 `{id}` → `{city}`(ko·en 함께).
- econ16 시드 1 180일 전·후를 재서 ADR WP12에 적었다(수치 그대로, 머리·요약 줄의 판 번호만 다름).
- 판: `SIM_VERSION` 19, 팩 그대로(core@50), 프로토콜 그대로(16), 마이그레이션 없음.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/simulator/cityPlan.ts`, `cityPlan.test.ts` | 600 남는 특산 직무·시험 |
| `packages/sim/src/version.ts` | SIM 19 |
| `apps/server/src/npc/economy.ts` | 600 주석, 나라 성격 = `nationPresetOf` |
| `apps/server/src/npc/nations.ts`, `nations.test.ts` | 601 `NationLink`·`nationPresetOf`·켤 때 `followerNames` |
| `apps/server/src/npc/persist.ts`, `ruinsPersist.ts`, `runtime.ts` | 601 세울 때·복원 때 이름, 태어날 때 부모 |
| `apps/server/src/npc/cityNames.db.test.ts`(새) | 601 DB 시험(독립 가문 마을·다시 켤 때·경제 화면 이름) |
| `apps/server/src/market/views.ts` | 거래소 도시 이름 |
| `apps/server/src/economyView/services.ts`, `worldSource.ts`, `economyView.test.ts` | 창고 곳 이름, `cityNames` 조회 |
| `apps/server/src/trpc/economy.ts`, `trpc/context.ts`, `packages/shared/src/economy.ts` | `economy.cityNames`·`EconomyCityNamesResponse` |
| `apps/server/src/market/market.db.test.ts` | 600 DB 시험(농업 나라에 벌목장 특산을 하나 더 얹음), 모든 특산이 돈다 |
| `apps/game/src/economy/cityText.ts`(새), `queries.ts`, `LaborJobs.tsx`, `WorkerParts.tsx`, `StorageParts.tsx`, `TemplePanel.tsx`, `RecruitPanel.tsx`, `apps/game/messages/{ko,en}.json` | 경제 화면 도시 이름 |
| `e2e/economy.spec.ts` | 거래소 도시 목록에 "#ID" 이름이 없음 |
| `docs/adr/2026-11-07-play-flow.md`, `docs/PLAN.md`, `docs/questions/2026-11-07-play-nations.md` | 기록 |

## 함께 바꿔야 하는 파일
- 부모 나라 고리를 바꾸면 `nationPresetOf` 하나만(이름·나라 성격). 화폐는 아직 따로다(`npc/currency.ts presetOfFaction`, 프리셋 모양이 달라서 — 고리 차례는 같게 둔다).
- 도시 줄 쓰기(`tables.ts` `cities`)에 이름 칸을 넣지 않는다 — 이름은 켤 때(`nameNationCities`), 세울 때·복원 때(`cityNames` 몫)만 쓴다.
- 경제 화면에 도시 ID를 보이는 곳을 더하면 `useCityText`를 쓴다.

## 건드리지 말 것
- `world/world.ts`(982줄)·`db/schema.ts`·`packages/sim/src/index.ts`는 키우지 않았다. 런타임 프리셋은 경제 입력(`o.economy.presets`)에서 읽는다.

## 검사 결과
- 작업 중(Verified): 시뮬 `cityPlan.test.ts` 4개, 서버 `npc`·`ruins`·`market`·`economyView`·`worldMap`·`trpc/economy.test.ts`·`facilities/npcSeed.db.test.ts`(DB 포함) 15파일 61개 통과, 게임 앱·서버 타입 검사 통과.
- 끝 검사(Verified, 한 번): `TEST_DATABASE_URL=… pnpm check` 통과(포맷·oxlint·타입·경계·파일 크기·다국어 4,399키·디자인 값·콘텐츠 core@50, 단위·DB 시험 475파일 3,769개), `pnpm check:docs origin/main` 통과.
- 화면 시험(Verified, 한 번): `pnpm e2e economy.spec.ts labor.spec.ts facilities.spec.ts temple.spec.ts recruit.spec.ts` 48개 통과(5.9분). 사진은 파스텔·다크(×한국어·영어) 390px·1440px — 실제 거래소 호가창 머리에 "#1" 대신 도시 이름("Highmoor"), 구인 칸 "도시 Highmoor · 행정 Lv1"(눈으로 확인: `economy-live-book-pastel-ko-390`, `economy-live-production-dark-ko-390`). 사진은 임시 폴더라 올리지 않았다.
- econ16 시드 1 180일 전·후: ADR WP12 표(수치 그대로, 줄 해시 `2c18142c` → `95df0f8b`는 판 번호 때문).

## 미검증·TODO·알려진 문제
- 빌드한 서버·NAS 실행은 미실행(DB 시험·화면 시험만).
- 태어날 때 부모는 메모리만이라, 이 판 전에 세운 독립 가문 마을은 켤 때 이름을 받지 못한다(질문 620). 독립 가문의 화폐·성격도 다시 켜면 기본이다(이 줄기 전부터).
- `economy.cityNames`는 이름 있는 도시를 모두 보낸다(도시 안개와 다름, 질문 621).

## 사용자 결정 대기
- 없음(질문 620·621은 기획 세션에).
