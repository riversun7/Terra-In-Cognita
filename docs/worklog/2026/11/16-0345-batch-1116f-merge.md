# 2026-11-16 묶음 1116f 합치기 (D-569 고침 셋 — 한 줄 소속 · 건물 채집소 2 · 사업장 판매만)

- 일시: 2026-11-16 03:45 (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `16-0200-house-4`·`16-0310-gather-5`·`16-0230-business-3`, 기획 D-569, ADR `2026-11-11-faction-identity.md` "바뀜 (2026-11-16, D-569)"·`2026-11-15-gather-object-tiers.md` "바뀜 (D-569)"·사업장 ADR 둘 "바뀜 (D-569)", 질문 1841~1848(`docs/questions/2026-11-16-house-4.md`)·1861~1864(`2026-11-16-gather-5.md`)·1881~1887(`2026-11-16-business-3.md`)·1785(`2026-11-15-business-2.md`)

## 한 일
- 통합 가지(main c4182f5 + 1116e 배포 기록 c24f46c)에 줄기 셋을 차례로 `--no-ff`로 합쳤다(셋 모두 바탕 5708981 = main 6bc4ee7 + 미러 b7b7cff).
  1. `work/house-4`(0daba0e) → 03f4e87: 나라는 하나(가문원 시민권·내 도시 = 가문 소속 도시의 나라, 부팅·1분마다·가문 명령 뒤 `houseTies.reload`가 맞춤), 고용 유닛은 고용한 사람의 가문(표 `house_units`), 가문 랭킹 판, 도시 가진 가문의 소속 도시, 가문원 귀화 막기(`in_house`).
  2. `work/gather-5`(1ea9ed6) → a5434a1: 건물 채집소 기를 티어 고르기(`facility_gather_tier`, 열 `world_facilities.gather_tier`), 면적 모듈 짓기 작업·떼기(`facility_plot_remove`), 레벨 0 재료 = 콘텐츠 `bareHand` 칸, NPC 모듈·티어, 흔들리던 DB 시험(`cityBuildUpgrade` "1186 나") 고침.
  3. `work/business-3`(d9b5ff0) → e00ae3d: 주인 꺼내기 없앰(`sale_only`, 주인도 판매가로 산다), 거래소 반입·산 물건은 운반꾼이 실제로 나름(`no_carrier`), NPC 건물 시설 옮김 시간.
- 최종 판: 프로토콜 **46**(받는 가장 낮은 판 **45**, 39~46 설명 모두 남김), 팩 **core@112**, `SIM_VERSION` **55**(54 설명도 남김), 시뮬 출력 형식 **21**.
- 마이그레이션: 형제 둘 `20261115164538_house_units`(house-4)·`20261115165931_facility_gather_tier`(gather-5) 그대로. 합친 뒤 `db:generate` = No schema changes(Verified). 다음 마이그레이션의 `prevIds`에는 두 끝을 모두 적는다.

## 손으로 푼 곳
- `packages/protocol/src/version.ts`(세 번):
  - house-4: 줄기의 "42·43 자리표시" 줄을 지우고 main의 실제 42(바뀜 없음)·43(배) 설명을 남긴 채 44를 이었다.
  - gather-5: 45 설명의 "(42~44는 같은 묶음의 다른 줄기가 쓴다)"를 "(44는 같은 묶음 1116f의 다른 줄기)"로.
  - business-3: 46 설명의 "42~45는 같은 묶음 다른 줄기 몫으로 비워 두었다"를 "44·45·46은 1116f에서 함께 올렸다 — 44·45판으로 나간 기기는 없고, 받는 가장 낮은 판은 원칙(현재 − 1)대로 45라 44판 이하 기기는 새 앱을 받는다"로.
  - 최소 판 설명 줄은 main 것("… 43부터 41판 이하")에 "44부터 42판 이하, 45부터 43판 이하, 46부터 44판 이하"를 이어 붙였다. `PROTOCOL_VERSION = 46`, `MIN_SUPPORTED_PROTOCOL_VERSION = 45`. 줄기별 판 상수(`NATIONALITY_HOUSE_PROTOCOL_VERSION` 44, `GATHER_TIER_PROTOCOL_VERSION` 45, `SALE_ONLY_PROTOCOL_VERSION`·`BUSINESS_CARRY_PROTOCOL_VERSION` 46)는 줄기에서 이미 맞는 값이라 그대로.
- `packages/sim/src/version.ts`(gather-5): 54(전투 움직임 2단계, main)와 55 설명을 모두 남기고 값 55. 55 줄 끝 "(54는 같은 묶음의 다른 줄기가 쓴다)"를 "(54는 앞 묶음 1116e가 썼다)"로.
- `content/core/manifest.json`(gather-5): main 111 / 줄기 113 → **112**. gather-5는 `id-changes.json`을 바꾸지 않았고(아이템·중분류 `bareHand` 칸만 더함) 이번에 처음 오르는 ID 변경 줄은 없다. `tuning.json`은 이번 셋 중 아무도 바꾸지 않았다.
- `packages/protocol/src/facilities.ts`·`index.ts`, `apps/game/src/economy/facilityText.ts`, `apps/server/src/facilities/gateway.ts`(business-3 × gather-5): 양쪽 다 — 판 상수 `GATHER_TIER_PROTOCOL_VERSION`(45)·`SALE_ONLY_PROTOCOL_VERSION`(46)과 결과 코드 `no_plot`·`tier_locked`·`sale_only`를 모두, 머리 주석은 gather-5의 모듈 설명 + business-3의 46 줄.
- `docs/WORKLOG.md`(세 번): 받은 쪽 → `pnpm docs:index`.
- `apps/game/messages/{ko,en}.json`: 충돌 없이 합쳐짐(7,914키 ko·en 일치, JSON 유효). `pnpm check`의 게임 앱 typecheck가 paraglide를 다시 만든 뒤 린트 통과.
- **파일 크기**: 합친 `apps/server/src/facilities/service.ts`가 1,002줄(gather-5 982 + business-3가 더한 줄) → 만들기 입력 타입 `FacilityServiceOptions`를 `facilities/serviceTypes.ts`로 옮기고 `service.ts`가 다시 내보낸다(960줄, 쓰던 곳의 import는 그대로). 같은 파일에서 business-3가 `StorageOutHook`을 `GovernmentHook`의 문서 주석과 인터페이스 사이에 넣어 주석 둘이 붙어 있던 것을 제자리로 옮겼다. 이 고침은 business-3 합치기 커밋(e00ae3d)에 함께 들었다.
- 그 밖 크기(Verified): `db/schema.ts` 998, `app.ts` 985, `world/world.ts` 993줄 — 모두 1,000 이하, 새 고리는 다른 파일로.

## 리셋 필요 여부: 필요 없음
- DB는 더하기만: `house_units` 표 + 옛 사람 단위 가문 소속을 유닛 줄로 채우기(멱등), `world_facilities.gather_tier smallint null` + `facility_jobs` 종류 검사에 `'plot'` 넓힘. 직전 판 앱은 두 가지 모두 모른 채 돈다(줄기 기록, Verified: 코드).
- **house-4는 부팅 때 시민권을 가문 나라로 옮긴다**: 시민권(`cyborgs.faction_id`·`faction_members`)·내 도시(`start_city_id`)가 가문 소속 도시와 다른 옛 가문원은 첫 `houseTies.reload`(부팅·그 뒤 1분마다)가 가문 소속 도시의 나라·그 도시로 옮긴다(멱등, 메모리 + 쓰기 대기열). 도시 가진 옛 가문의 소속 도시도 같은 다시 읽기가 가문 도시로 맞춘다. 세계를 지우지 않고 제자리에서 고쳐지므로 리셋은 필요 없다 — 다만 배포 직후 일부 플레이어의 나라·내 도시가 바뀌어 보일 수 있다(의도한 D-569 동작). 가문원은 이제 귀화하지 못한다.
- gather-5: 이미 있는 채집소는 `gather_tier` null = 최고 티어라 그대로 돈다. NPC 시설은 다음 시설 맞추기부터 시세로 티어를 고르고 모듈을 붙인다.
- business-3: 이미 사업장 창고에 쌓인 주인 몫은 판매로만 나간다(주인도 판매가로 산다). 운반 중 짐은 예전처럼 메모리(다시 켜면 운반꾼 화물에 남음, 줄기 기록의 알려진 문제).
- 프로토콜 최소 판이 45가 되어 43판 이하 기기(지금 배포된 앱)는 인사에서 `protocol_unsupported`를 받고 새 앱을 받는다(PWA 강제 적용).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/protocol/src/version.ts`·`facilities.ts`·`index.ts`, `packages/sim/src/version.ts`, `content/core/manifest.json`, `apps/game/src/economy/facilityText.ts`, `apps/server/src/facilities/gateway.ts`, `docs/WORKLOG.md` | 합치기 충돌 풀기(위) |
| `apps/server/src/facilities/service.ts`·`serviceTypes.ts` | 1,000줄 상한 — 만들기 입력 타입 옮김, 주석 자리 |
| `docs/worklog/2026/11/16-0345-batch-1116f-merge.md` | 이 기록 |

## 함께 바꿔야 하는 파일
- 다음 프로토콜 판(47)은 최소 판 46.
- 다음 마이그레이션의 `prevIds`는 `house_units`·`facility_gather_tier` 두 끝을 모두 포함한다.
- 사이보그 나라를 바꾸는 새 길을 더하면 가문원에게는 `houseTies.reload`가 되돌린다(house-4 기록).
- 기를 티어: `gatherMath chosenGatherTier` ↔ `@terra/sim workerEffects tier` ↔ 서버 `facilities/world.ts`·`labor/gatherWork.ts`·`roster/gatherSheet.ts`·`gather/stationReads.ts` ↔ 화면 `StationPlots.tsx`(gather-5 기록).
- 판매만·운반: 45판 기기에 낮추는 코드는 `facilities/gateway.ts` 두 줄(business-3 기록).
- 파일 크기: `facilities/service.ts` 960줄, `world/world.ts` 993줄, `db/schema.ts` 998줄, `app.ts` 985줄 — 새 일은 다른 파일로.

## 검사 (Verified)
- `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안): 포맷·린트·타입·경계·크기·다국어(7,914키)·디자인 값·콘텐츠(core@112) 통과, 시험 파일 740/740, 시험 5,587/5,587 통과(첫 실행에 통과).
- `pnpm check:content c4182f5`: core@112 (5385bd95030d) 단계 1·2·4a·4b 통과.
- `pnpm check:docs c4182f5`: 통과.
- `pnpm build` 통과, `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 110,063 B / 상한 131,416 B.
- `pnpm --filter @terra/server db:generate`: No schema changes.

## 화면 시험
- Verified: 통합 판(e00ae3d 빌드, 헤드리스)에서 세 번에 나눠 돌림(고용하는 spec의 구인 카드가 겹치지 않게). 모두 통과, 실패·건너뜀 0.
  - faction-identity·ranking·citizenship: 32/32(6.1분) — faction-identity 19·ranking 9·citizenship 4.
  - recruit·building-screen·facilities·gather-station: 33/33(19.7분) — recruit 10·building-screen 7·facilities 5·gather-station 11.
  - items·economy·production·cyborg·labor: 103/103(10.1분) — items 44·economy 25·cyborg 22·production 8·labor 4.
  - 합 168/168. 사진: `E2E_SHOTS_DIR`(작업 공간 밖 임시 폴더 `scratchpad/1116f-shots/`).

## 미검증·TODO·알려진 문제
- 각 줄기의 TODO는 줄기 기록에 있다: 가문 — 무소속 유닛을 가문에 넣는 명령(1842)·개인 세금(1843, 기록만)·인큐베이터 휴먼 가문(1847)·NPC 도시 가문(1848). 채집소 — 경제 생산 카드에서 티어 고르기·떼기 없음, 2차맵 채집소 판 "기를 티어" 사진 없음, 서버 NPC 모듈 DB 통합 시험 없음. 사업장 — 운반 중 짐 메모리, NPC 가공품 생산 느려짐의 밸런스 측정 없음(Unknown), 보이는 NPC 운반꾼은 설계안(1886).
- 셋을 함께 돈 운영 세계(가문 나라 옮기기 + NPC 모듈 + 운반)는 NAS에서 보지 않았다(배포 뒤 nas-metrics로 본다).
- 휴대폰에서 보지 않았다.

## 사용자 결정 대기 (기획 세션에 보낸다)
- 질문 1841~1848(가문 4: 나간 사람의 나라, 무소속 유닛, 개인 세금, 가문 판 점수, 가문으로 나라 바꾸기, 가문원 귀화, 고용 밖 유닛의 가문, NPC 도시 가문) — 추천대로 [임시], 1843은 기록만.
- 질문 1861~1864(채집소 2: 기본 티어, NPC 티어 기준, 뗄 때 재료, NPC 모듈 때) — 추천대로 [임시].
- 질문 1881~1887(사업장 3: 주인 최소 묶음, 자동 옮김, 운반꾼, 창고 시설 꺼내기, 거래소 자리, 보이는 NPC 운반꾼, NPC 산출도 판매인가) — 추천대로 [임시].
- 질문 1785(외주 꼴과 요금, `2026-11-15-business-2.md`) — 답이 없어 **다시 보낸다**(D-564 1682로 가·나를 가를 수 없음).
