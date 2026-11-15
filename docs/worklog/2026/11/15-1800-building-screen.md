# 건물 판 개편·임금형/임대형·건물 관리·재무 화면·생산시설 지분 사고팔기

- 일시: 2026-11-15 18:00 (KST)
- 작업 도구: Claude Code
- 관련: 사용자 요청 2026-11-15 17:07(건물 판 "Ui개편"), ADR `docs/adr/2026-11-15-building-screen.md`(제안), 질문 `docs/questions/2026-11-15-building-screen.md`(1701~1708),
  가지 `work/building-screen`(base 94affd477b), 프로토콜 38(최소 37), 팩 core@104, SIM_VERSION 그대로, 마이그레이션 `20261115082440_business_shares`

## 한 일
1. **주인 이름표**: 건물 판 머리의 "남의 건물"·"내 건물" 대신 주인 이름(유저 = 사이보그 이름, NPC = 나라 이름) 또는 "대주주 이름 %". "내 것"·"내 지분 %"·"운영자 관리" 칩.
   새 tRPC `facilities.owner`(이름은 `business/names.ts` — DB 한 번, 1분 기억, 나라 이름은 영토 서비스 `factionNameOf`).
2. **반경 고리**: 건물 선택 때 칸과 상관없이 채집소 반경(오브젝트 채집소), 건축 모드에서 오브젝트 채집소를 놓을 자리에 레벨 1 반경 고리 + "채집 반경 N칸".
   시설 목록에 `gatherRadiusCells`(서버 `facilities/views.ts`).
3. **건물 판 개편**(`apps/game/src/map/building/BuildingPanel.tsx`·`building.css`): 머리(이름·레벨·분류·주인) + 칸(개요·일꾼·창고·장부·지분·관리) + 아래 고정
   [들어가기]·[닫기]. 채집소 판은 칸마다 나눠 보인다(`StationPanel` part, 자료는 `useStation` 한 번). 옛 접는 장부 칸(`BusinessBooks.tsx`)은 조각으로 나눠 지웠다.
4. **임금형·임대형**(`BuildingLabor.tsx`, 새 tRPC `labor.building`): 걸린 임대료·열린 구인·자리·이 건물 계약(보증금 남은 주기 막대·다음 지급·유예), 남은
   [일자리 받기]·[빌리기], 관리는 임대료·구인 내기/바꾸기/거두기·해고·보증금 채우기. 규칙은 이미 있던 판정 그대로(D-479).
5. **관리 권한**: 노동 관리 명령(임대료·구인·해고·채우기)과 사업장 관리 명령(정산·넣기·값)이 주인 + 가장 많은 주주 + 운영자 모드 연결에 된다. 돈은 늘 건물 주인
   사업장 금고(대주주 넣기도 주인 금고로 — 옛 `invest`는 넣는 사람 계정에 넣던 것을 고쳤다).
6. **재무 화면** `/buildings/:buildingId/books`(누구나): 손익계산서(1·7·30일)·재무상태(금고·창고 값·갚을 돈·순자산)·현금 흐름·날마다 막대·주주·지분 시장·최근 거래.
   `facilities.books`를 넓혔다(`ownerName`·`stockValue`·`market`, 주주 `name`·`pm`).
7. **생산시설 지분**(`apps/server/src/business/shares.ts`): 원장 자산 `share:biz_<건물>`, 처음 주문 때 주인에게 1,000주 발행, 환전과 같은 동시호가(`createFxMarket`
   선택 칸 `prefix` — 시뮬 출력 그대로), 회차 30분(건물 노화 정시에), 주주 = 잔고 + 걸어 둔 팔 주문, 정산·대주주가 이 주주를 쓴다. 표 2개(더하기만), 프로토콜 38
   `business_share_order`·`business_share_cancel`. 지갑·물건 목록에서 `share:` 자산을 뺐다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/economy/fxMarket.ts` | 동시호가 선택 칸 `prefix`(지분 에스크로·거래 종류가 환전과 겹치지 않게, 기본값 그대로) |
| `packages/sim/src/society/businessCoefficients.ts`, `tuningBusiness.ts`, `content/core/tuning.json`, `manifest.json` | 설정 칸 `business_share_count`·`business_share_round_ms`·`business_share_order_max`, core@104 |
| `packages/shared/src/businessBooks.ts` | 지분 자산 코드·몫, 장부 응답 새 칸(이름·창고 값·시장), 이름표 응답 |
| `packages/shared/src/labor.ts`, `facilities.ts`, `gather.ts`, `routes.ts`(+시험) | 건물 노동 판, 반경, 분류, 재무 화면 주소 |
| `packages/protocol/src/business.ts`, `version.ts`, `index.ts` | 프로토콜 38 지분 주문 |
| `apps/server/src/business/{shares,names}.ts`(새), `core.ts`, `commands.ts`, `books.ts`, `store.ts`, `shares.test.ts`(새), `business.db.test.ts` | 지분 시장·이름·관리 권한·장부 확장·부팅 복원 |
| `apps/server/src/db/businessSchema.ts`, `schema.ts`, `drizzle/20261115082440_business_shares/`, `world/persist/tables.ts` | 표 2개(더하기만) |
| `apps/server/src/labor/{service,jobBoard,gateway,views}.ts`, `gateway.test.ts`, `trpc/labor.ts` | 관리 권한(대주주·운영자), `labor.building` |
| `apps/server/src/facilities/{world,gateway,service,screen,appSource,views}.ts`, `trpc/facilities.ts`, `session.ts` | 지분 시장 잇기·회차·운영자 관리·이름표·반경 |
| `apps/server/src/gather/reads.ts`, `territory/service.ts`, `economyView/services.ts` | 분류 칩·나라 이름·지분 자산 빼기 |
| `apps/game/src/map/building/*`(새), `map/business/{BooksParts,ShareMarket,BuildingBooksScreen,booksData}.*`(새), `businessText.ts`, `businessCommands.ts`, `BusinessBooks.tsx`(지움) | 건물 판·재무 화면·지분 |
| `apps/game/src/map/gather/{GatherPanel,StationPanel}.tsx`, `map/SecondaryMapScreen.tsx`, `map/construction/BuildSheet.tsx`, `shell/routeViews.tsx`, `sections/ComingSoon.tsx` | 판 잇기·칸 나누기·운영자·반경·주소 |
| `apps/game/messages/{ko,en}.json` | 문구 123개(ko·en) |
| `e2e/building-screen.spec.ts`(옛 `business-books.spec.ts`), `e2e/build-mode.spec.ts`, `e2e/gather-station.spec.ts` | 화면 시험 |

## 함께 바꿔야 하는 파일
- 거래소 건물 줄기(D-561): 지분 주문을 거래소 건물에 묶으면 `business/shares.ts` `place`에 조건만 더한다(질문 1705). 시장 모음은 사업장 ID만 받는다.
- 사업장 돈을 나라 화폐로 바꾸면 `facilities/world.ts`의 `createShareMarkets({ asset })`도 함께(D-7010).
- 프로토콜 판: 37은 같은 묶음 배 2 줄기 몫. 합칠 때 `version.ts` 설명 차례를 맞춘다.

## 건드리지 말 것
- `apps/server/src/app.ts`(999줄): 지분·이름표·노동 판은 건물 세계·세션·tRPC 라우터로 이었다.
- `apps/server/src/db/schema.ts`는 999줄(상한 1,000) — 다음 표는 다른 파일에서 다시 내보낸다.

## 리셋 필요 여부
- **필요 없음.** 마이그레이션은 표 2개 더하기만, 지분은 처음 주문 때 발행(발행 전에는 주인이 전부 — 정산 결과가 옛 "주인 1주"와 같다). 직전 판 앱은 새 표를 모르고
  그대로 돈다(지분 자산 계정은 원장 자산이라 옛 화면 목록에 안 보인다 — 옛 경제 화면은 `share:` 줄을 "자리 없음" 물건으로 보일 수 있다, Assumed 드묾).

## 미검증·TODO·알려진 문제
- 순위 국고의 사업장 금고는 아직 건물 주인 몫 전부(D-555 1512 "지분만큼"을 지분 시장으로 나누지 않음).
- 지분 가격 제한(D-165 ±30%)·거래세 없음(질문 1706). 100% 매각 때 명의 이전 없음(질문 1702).
- 건물 이름 바꾸기는 서버에 건물 이름 칸이 없어 하지 않았다.
- 반경 고리는 일정 높이(0.3m)에 투영한 다각형이라 언덕에서는 땅에 묻히거나 뜬다(이미 있던 선택 고리와 같다).
- `labor/service.ts` 867줄(권장 600 넘음, 상한 아래) — 건물 노동 판을 나중에 다른 파일로 뺄 수 있다.
- 검사 결과는 아래 "검사" 절.

## 검사
- Verified `pnpm check`(TEST_DATABASE_URL 있음): 포맷·린트·타입·경계·파일 크기·다국어(7,756키)·디자인 값·콘텐츠 core@104 통과, 시험 파일 726개·시험 5,486개 통과.
- Verified 빌드 + `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 110,049 B / 상한 131,416 B(+250 B — 주소 표 한 줄·화면 표; 건물 판·재무 화면은 지연 조각).
- Verified `pnpm check:content origin/main` 통과(core@104), `node scripts/check-docs.mjs origin/main` 통과.
- Verified 새 시험: `business/shares.test.ts` 4(발행·체결·정산 지분대로·경영권·한도·거두기), `business.db.test.ts` 지분 1(주문 → 다시 켜기 복원 → 회차 체결 → 대주주 관리·운영자
  대신 임대료·장부 주주 이름·이름표·정산 지분대로·불변 조건).
- Verified 화면 시험(빌드한 앱, 헤드리스): `build-mode` 5/5(반경 고리 새 시험 포함), `building-screen` 5/5, `labor` 4/4, `gather-station`·`gather`·`government`·`facilities`
  30/30(두 번째 실행). 첫 실행에서 재무 화면 손익 표가 빈 사업장에서 안 보여 고쳤고(0 표), 두 번째 실행에서 운영자 시험이 NPC 건물 임대료를 남겨 `labor` 4개가
  같은 세계에서 실패해 시험이 되돌리게 고친 뒤 `building-screen`+`labor` 9/9.
- 사진(저장소 밖, 390): `building-panel-390-{pastel-ko,dark-en}.png`(개요), `building-shares-390-*`, `building-books-390-*`, `building-finance-390-*`, `build-place-390-*`
  — 장부 사진의 값은 견본(rewriteTrpc).
- break-ui 관점 검토(390, 긴 이름·큰 수·빈 값): 이름표·주주 이름은 줄바꿈, 큰 금액은 표·카드에서 줄바꿈, 영어 복수형("1 shares")은 문구를 바꿨다. 탭 6개는 휴대폰에서
  가로로 넘긴다(선택한 탭이 보인다).
- 미실행: `unit-control`·`boats`·`map-hud` 화면 시험(건물 판을 열지만 이번 바뀜과 겹치는 단언 없음 — Assumed).

## 사용자 결정 대기
- 질문 1701~1708(`docs/questions/2026-11-15-building-screen.md`).
