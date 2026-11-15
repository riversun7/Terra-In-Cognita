# 운영자 모드·시설 분류·개발 도구 후속·옛 2D 초상 정리 (D-560)

- 일시: 2026-11-15 13:30 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-560(사용자 결정 1236·1237·1239·1241·1242·1246~1248·1376·1380·1381·1421, 시설 분류표), D-561(거래소 건물 — 이 줄기 밖), 가지 `work/operator-mode`
- ADR "바뀜": `docs/adr/2026-11-07-unit-control.md`(2026-11-15, D-560), `docs/adr/2026-11-08-building-art.md`(D-560 시설 분류), `docs/adr/2026-11-11-character-3d.md`(D-560 1421), `docs/adr/2026-11-14-battle-report.md`(D-560)
- 질문: `docs/questions/2026-11-15-operator-mode.md`(1661~1669)
- 판: 팩 core@102, 프로토콜 36(최소 35), 마이그레이션 `20261115041940_cyborg_look_auto`. SIM_VERSION 그대로(판정 바뀜 없음).

## 한 일
1. **시설 분류 칸**(D-560 시설 분류표): 팩 시설 `category`(선택 칸, 9가지 — `@terra/shared/facilityCategory`), core 시설 25개 모두 적음. 서버 겉모습 답(`facilities.mapLooks`)에 `category`, 도시 화면 거르기 칩·지도 이름표 색·아이콘이 분류를 따른다(분류 없는 옛 답은 그림 모델에서). 건물 편집기 기본 칸에 [시설 분류] 고르기. 상업(거래소)은 시설이 없어 칩이 숨는다.
2. **운영 메뉴·탭**: 운영 메뉴 항목(단추·칩)을 누르면 닫힌다(1239). [주변] 탭 차례 건물 → 주변 유닛 → 자원, 처음 열면 건물(1241). 데스크톱(64em 이상) 2차맵 아래 탭 → 왼쪽 세로 띠(1242).
3. **운영자 속도**(1246~1248): 연결마다 운영자 배율(기본 1, `operator_pace`로 1~100), 운영 메뉴 [운영자 속도] 칩 1×·10×·100×. 운영자 모드를 끄면 서버가 배율 1·그 연결이 단 빠른 표시를 바로 지움·가는 길 빠르기 1. 다시 구독할 때 기기가 배율을 다시 보낸다.
4. **1차맵 텔레포트**(1239): `travel_start.teleport`(dev·admin만, 서버 확인). 1차맵 명령 판 [텔레포트], 1차맵 운영 메뉴에 [운영자 모드] 토글(2차맵과 같은 기기 기억).
5. **제한 없는 건설**(1239): 운영자 모드 연결의 짓기·레벨 올리기는 재료·땅 규칙 없이, 시간 ÷ 배율. 건설 판도 운영자 모드면 재료·땅 문제를 막지 않는다.
6. **개발 도구**: [스탯 영향도]를 2차 스탯 화면 맨 아래 판으로(1376, 옛 주소는 그 화면으로). 전투 보고서 기록 상한 없음(1380). A/B의 B 계산식 바꿈(1381 — 식 칸 고르기 + 식 글, 서버가 B에만 얹음).
7. **옛 2D 초상 정리**(1421): 켤 때 3D 외형 없는 옛 사이보그를 옛 칸에서 넘긴 3D 외형으로 채우고 옛 칸을 비운다(멱등, `look_auto`로 한 번 무료 고르기 유지). 앱은 `appearance`를 쓰지 않고 조회에서 뺐다. `cyborg_create.appearance`는 선택 칸. 2D 전용 공용 코드(프리셋·넘기기·무작위·3D→2D) 지움.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/facilityCategory.ts`(새)·`package.json` | 분류 이름표·생산 단계 기본값 |
| `packages/content/src/schema/economy.ts`, `content/core/facilities.json`, `content/core/manifest.json` | `category` 칸, core@102 |
| `packages/shared/src/buildingEditor.ts`·`mapLooks.ts` | 편집기 JSON·겉모습 답 `category` |
| `apps/server/src/facilities/catalog.ts`·`mapLooks.ts`·`appSource.ts`, `buildingEdit/views.ts` | 분류 싣기 |
| `apps/game/src/map/city/cityRows.ts`·`CitySheet.tsx`, `map/facilityCategoryText.ts`(새), `mapIcons.tsx`, `mapHud.css` | 분류 무리·이름·아이콘·색 |
| `apps/game/src/editor/buildings/BuildingDetail.tsx`·`buildingModel.ts` | 분류 고르기·합치기 |
| `apps/game/src/map/OperatorMenu.tsx` | 항목 누르면 닫힘 |
| `apps/game/src/map/nearby/nearbyState.ts`, `useBottomSheet.ts` | 탭 차례·처음 탭 |
| `apps/game/src/map/mapHud.css` | 데스크톱 왼쪽 세로 띠, 속도 칩 |
| `packages/protocol/src/version.ts`·`secondMap.ts`·`travel.ts`·`cyborg.ts`·`index.ts` | 프로토콜 36: `operator_pace`, `teleport`, `appearance` 선택 |
| `apps/server/src/world/operatorPace.ts`·`gateway.ts`, `session.ts`, `gather/gateway.ts`, `labor/gateway.ts`, `boats/gateway.ts`, `travel/gateway.ts` | 연결마다 운영자 배율·해제 |
| `apps/server/src/travel/service.ts`·`serviceTypes.ts` | `teleport`·`releasePace` |
| `apps/server/src/facilities/service.ts`·`gateway.ts` | 운영자 모드 건설 |
| `apps/game/src/map/operatorPace.ts`(새), `UnitControlPanels.tsx`, `SecondaryMapScreen.tsx`, `mapFeed.ts`·`mapFeedPool.ts`·`feedTypes.ts` | 속도 칩·다시 구독 때 배율 보내기 |
| `apps/game/src/map/PlanetMapScreen.tsx`·`PlanetCommandPanel.tsx` | 1차맵 운영자 모드 토글·[텔레포트] |
| `apps/game/src/map/construction/BuildSheet.tsx` | 운영자 모드 건설 판 |
| `apps/game/src/editor/secondaryStats/StatInfluenceSection.tsx`(새)·`SecondaryStatsEditorScreen.tsx`·`secondaryExtras.css`, `editor/balance/BalancePanelScreen.tsx` | 영향도 옮김 |
| `apps/server/src/battleReport/store.ts` | 기록 상한 없음 |
| `packages/shared/src/battleReport.ts`, `apps/server/src/battleReport/schema.ts`·`services.ts`, `apps/server/src/tuning/state.ts` | B 계산식 |
| `apps/game/src/editor/balance/report/VariantFormulas.tsx`(새)·`ReportPanel.tsx`·`reportModel.ts`·`reportMessages.ts`·`report.css` | B 계산식 화면 |
| `apps/server/src/cyborg/state.ts`·`service.ts`, `roster/services.ts`, `world/world.ts`, `world/persist/tables.ts`, `db/schema.ts`, `drizzle/20261115041940_cyborg_look_auto/` | 켤 때 옮기기, 옛 칸 안 씀, `look_auto` |
| `packages/shared/src/cyborgLooks.ts`·`characterLook.ts`·`cyborg.ts`·`cyborgApi.ts`·`roster.ts` | 2D 전용 코드·조회 칸 지움 |
| `apps/game/src/start/cyborgGate.ts`·`StartScreen.tsx`, `cyborg/LookPick.tsx`·`CyborgScreen.tsx` | 옛 칸 안 보냄·안 씀 |
| `apps/game/messages/{ko,en}.json` | 새 문구(ko·en) |
| 시험: `facilityCategory.test.ts`, `content validate/facilities.test.ts`·`node/load.test.ts`, `cityRows.test.ts`, `operatorPace.test.ts`, `world/gateway.test.ts`, `travel/gateway.test.ts`, `gather·labor gateway.test.ts`, `facilities/gateway.test.ts`·`facilities.db.test.ts`, `battleReport.test.ts`, `reportModel.test.ts`, `cyborg.db.test.ts`, `cyborgLooks.test.ts`, `characterLook.test.ts`, 사이보그 기록 고정값 셋 | 위 바뀜 |
| e2e: `map-hud.spec.ts`, `helpers/mapHud.ts`, `vision.spec.ts`, `map-viewdist.spec.ts`, `unit-control.spec.ts`, `balance.spec.ts`, `battleReport.spec.ts` | 메뉴 닫힘·속도·데스크톱 띠·[주변]·영향도·B 계산식 |

## 함께 바꿔야 하는 파일
- 시설 분류 이름표를 더하면: `facilityCategory.ts`, `cityRows.ts` 수 표, `facilityCategoryText.ts`, `mapIcons.tsx`, `mapHud.css` 색, ko·en 메시지.
- 운영자 배율을 쓰는 새 게이트웨이: `session.ts`에서 `operatorPace`를 넘기고 `operatorFactor`·`withPace(…, link.operatorPace)`.

## 건드리지 말 것
- `look_auto`가 켜진 사이보그의 한 번 고르기 규칙(질문 961 나) — 옮기기가 기회를 없애지 않게 둔 칸이다.

## 리셋 필요 여부
- **필요 없음.** 옛 2D 외형은 켤 때 멱등으로 옮긴다(옛 칸 → 3D 외형, 옛 칸 null). 마이그레이션은 추가(`look_auto`)와 not null 풀기뿐이라 직전 앱도 그대로 돈다(Verified: DB 시험 `cyborg.db.test.ts` "옛 2D 외형 정리" — 직전 앱 줄을 흉내 내 켜고 다시 켬).
- 다음 배포(이 앱이 한 번 켜진 뒤): `cyborgs.appearance` 열, `cyborg_create.appearance` 칸, 옛 2D 부위 목록(색 표 빼고) 지우기.

## 미검증·TODO·알려진 문제
- 운영자 모드를 끌 때 이미 걷기 시작한 한 구간(2차맵 안 이동·2차맵 사이 길의 지금 다리)은 그 빠르기로 끝난다(다음 걸음부터 보통) — Assumed: 그 구간이 짧다.
- 배(조선소)의 운영자 모드 시간 ÷ 100은 그대로(질문 1664).
- 전투 보고서 기록 상한 없음: 보고서 하나 약 60KB(ADR 측정) → 1만 개 약 600MB(Assumed). 지우기 단추 없음(질문 1667).
- 1차맵 텔레포트는 서버 단위 시험(`travel/gateway.test.ts`)만, 텔레포트 e2e는 없다(1차맵 명령 판까지 가는 시험 길이 길다).
- 시험 결과·빌드·사진은 아래 "검사" 절.

## 검사
- Verified `pnpm check`(TEST_DATABASE_URL 있음): 포맷·린트·타입·경계·파일 크기·다국어(7,559키)·디자인 값·콘텐츠 core@102 통과, 단위 시험 5,418 통과·1 실패 → 실패는 `itemEdit.db.test.ts`가 "더 새 팩" 줄을 `core@99`로 흉내 내던 것(팩이 102가 되어 더 옛 판이 됨) — `core@9999`로 고치고 그 파일만 다시 돌려 9/9 통과.
- Verified 빌드 + `node scripts/check-pwa.mjs` 통과(밸런스·2차 스탯 화면 공용 조각 `analysis-*`를 미리 캐시에서 뺌 — `vite.config.ts` globIgnores·`pwa-build.mjs` DEV_ONLY_CHUNK), `pnpm check:bundle` 109,799 B / 상한 131,416 B.
- Verified e2e(바꾼 화면: map-hud·balance·battleReport·character-3d·first-login·unit-control·vision·secondaryStats·map-viewdist) 106개 중 99 통과·4 건너뜀·3 실패 → 운영자 속도 시험(메뉴 다시 열기 빠짐)·보고서 웨이브 시험(앞 시험이 시작을 많이 눌러 429 한 번 — `withoutBusy`로 거름)을 고쳐 다시 돌려 통과. `vision.spec.ts` "이웃 8장(3×3) 끌기"는 두 번 다 240초 시간 넘김(끌기 중 `mouse.move`) — 같은 시험이 2026-11-09·11-12 다른 줄기 기록에서도 같은 모양으로 실패했다(기계 부하·소프트웨어 WebGL, 이 줄기 바뀜과 무관 — Assumed).
- 사진(390): `map-hud-city-390-pastel.png`(분류 칩), `map-hud-ops-390-pastel.png`·`-dark.png`(운영자 속도 칩), `map-hud-rail-1280-pastel.png`(데스크톱 왼쪽 띠·[주변] 건물 탭), `balance-sensitivity-neon-ko-390.png`(2차 스탯 화면 영향도 판).

## 사용자 결정 대기
- 질문 1661~1669(`docs/questions/2026-11-15-operator-mode.md`).
