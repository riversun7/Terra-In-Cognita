# 2026-11-15 열셋째 묶음 합치기 (배 2·건물 화면)

- 일시: 2026-11-15 20:40 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-559(배: 도크·연료·오버히트·보직·빼앗기)·D-555 1514(내 시설 요금은 내 사업장 금고로)·D-548·D-555(사업장 금고)·건물 화면 개편, 줄기 작업 기록 `15-1610-boats-2`·`15-1800-building-screen`, ADR `2026-11-15-shipyard-harbor.md` "바뀜 (2026-11-15) D-559"·`2026-11-15-building-screen.md`, 질문 1681~1693·1701~1708

## 한 일
- 통합 가지(바탕 main 4b50b32 + 미러 D-562 + 배포 기록 + AGENTS 푸시 규칙 커밋 = ee21a08)에 줄기 둘을 차례로 `--no-ff`로 합쳤다.
  - c2a03d2 `work/boats-2`(a143a2e, 바탕 map-coords 471a288): 다 된 배는 조선소 도크에(출고·남의 배 장기 보관료), 조선소 모듈 묶음, 연료 보급·오버히트·보직·표류한 배 빼앗기, 처리할 일 `boat_in_dock`·`boat_homeless`, 요금 화폐 = 시설이 선 나라 화폐(1524). 마이그레이션 `20261115064023_boats_dock_fuel`(열 추가만).
  - d0adf50 `work/building-screen`(592b478, 바탕 94affd4): 건물 화면 개편(탭 6개), 생산시설 지분 주문(`business/shares.ts`), 관리 권한 = 건물 주인·최대 주주·운영자, 금고 돈은 늘 건물 주인의 사업장 금고로(최대 주주 계정으로 가던 버그 고침). 마이그레이션 `20261115082440_business_shares`(표 2개 추가). 옛 `e2e/business-books.spec.ts` → `e2e/building-screen.spec.ts`.
- 버전(최종): 프로토콜 38(최소 37), 팩 core@104, `SIM_VERSION` 47(main에 바로 오른 경로 다듬기 — 두 줄기는 SIM을 바꾸지 않음).

## 손으로 푼 곳
- `apps/server/src/boats/harbor.ts` `charge`: 배 2는 `const asset = assetAt(buildingId)`(그 시설이 선 나라 화폐, D-559 1524), main(사업장 장부)은 `facilityOwner === boatOwner` 조건을 지움(D-555 1514). 두 뜻을 다 살려 `assetAt(buildingId)` + 주인 같음 조건 없음.
- `apps/server/src/boats/service.ts` 교역 부두 시간 사기: main의 "제 부두도 낸다"(주인 다름 조건 없음) + 배 2의 `balanceOf(boat.ownerId, buildingId)`(나라 화폐 잔고).
- **배 2의 새 요금도 D-555 1514에 맞춤**(합친 뒤 손으로): `boats/shipyard.ts` `foreignFee`(조선소 수리 요금)와 `boats/voyage.ts` `refuel`(연료값)에서 `!== boatOwner` 조건을 뺐다 — 제 조선소·제 부두를 써도 요금을 내고 그 돈은 제 사업장 금고로 간다(사업장 장부가 받는다).
  - `boats/dock.ts` `storageOf`(장기 보관료)는 **고치지 않았다**: D-559 1523이 "배가 다른 사람거라면 장기보관료를 청구"라고 남의 배로 못 박았고 1514보다 나중 결정이다. 사용자가 다르게 보면 한 줄(`owner === state.ownerId` 조건)만 지우면 된다.
- 시험: `boats/service.test.ts` 수리 시험이 제 조선소 수리를 요금 없이 했다 → 요금이 모자라면 `insufficient_funds`, 요금을 주면 수리하고 그 돈이 조선소 금고(`buildingLocation(yard)`)에 든다고 고침. `inbox/preview.test.ts`는 배 처리할 일 둘(`boat_*`)에 시안 자료가 없어 실패 → 가문 셋(`house_*`)처럼 "시안 자료 없는 종류"에 넣음(시안 자료 8개는 그대로).
- `packages/protocol/src/version.ts`: 34·36·37·38 설명을 모두 두고 상수 38, 최소 37, 최소 판 설명 줄에 "37부터 35판 이하", "38부터 36판 이하"를 덧붙임(building-screen의 "37: 다른 줄기가 받은 판" 줄은 배 2의 실제 37 설명으로 바꿈).
- `content/core/manifest.json` 102 → 103 → 104. `content/core/tuning.json`: 두 번 모두 id로 3방향 합치기(우리 차례 그대로, 상대가 새로 더한 칸을 뒤에). 677 → 697(배 2 20칸) → 700(지분 칸 3개 `business_share_count`·`business_share_round_ms`·`business_share_order_max`). 둘 다 바꾼 칸·지운 칸 없음(Verified: 스크립트 출력). `pnpm check:content --no-compat` core@104(ad37dd07a345) 통과.
- `docs/WORKLOG.md`: 받은 쪽을 쓰고 `pnpm docs:index`로 다시 만듦. 메시지 파일은 충돌 없이 합쳐짐, paraglide 다시 만듦.
- `apps/server/src/db/schema.ts`는 합친 뒤 998줄(상한 1,000 안) — 나누지 않음. 지분 표는 building-screen이 이미 `db/businessSchema.ts`에 둠.

## 리셋 필요 여부: 필요 없음
- boats-2: 마이그레이션은 열 추가 + 색인 + 검사 제약뿐(Verified: `migration.sql` 읽음, `fuel_milli`는 null 허용). 이미 조선소 옆에 뜬 다 된 배는 출고한 배로 보고, 옛 배 연료 = 가득(줄기 기록).
  - **되돌리기 주의**: 직전 판 앱으로 되돌리면 부팅 정리가 도크 배 상태를 지워 배를 잃는다(줄기 기록) — 되돌리기 전에 도크의 배를 출고한다.
- building-screen: 마이그레이션은 표 2개 `CREATE TABLE`뿐(Verified). 지분은 처음 주문 때 발행, 그 전에는 주인이 전부(줄기 기록). 직전 판 앱은 새 표를 모르고 돈다.
- 마이그레이션 갈래: `boats_dock_fuel`(부모 `boats_harbor`)과 `business_shares`(부모 `business_ledger`·`cyborg_look_auto` 두 끝)가 따로 이어진 갈래다. AGENTS.md 6장대로 다시 만들지 않고 그대로 합쳤다. 합친 뒤 `pnpm --filter @terra/server db:generate` = "No schema changes"(Verified, 두 번째 합치기 뒤). 다음 마이그레이션의 `prevIds`에는 두 끝(`boats_dock_fuel`·`business_shares`)을 모두 적는다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/boats/harbor.ts`, `apps/server/src/boats/service.ts` | 합치기 충돌(나라 화폐 + 제 시설도 요금) |
| `apps/server/src/boats/shipyard.ts`, `apps/server/src/boats/voyage.ts` | 제 조선소 수리·제 부두 연료도 요금(D-555 1514) |
| `apps/server/src/boats/service.test.ts`, `apps/server/src/inbox/preview.test.ts` | 위 규칙·배 처리할 일 종류에 맞춘 시험 |
| `packages/protocol/src/version.ts`, `content/core/manifest.json`, `content/core/tuning.json` | 판 합치기 |
| `docs/WORKLOG.md` | 목차 |

## 함께 바꿔야 하는 파일
- `apps/server/src/db/schema.ts` 998줄, `apps/server/src/app.ts` 999줄, `apps/server/src/world/world.ts`·`apps/server/src/travel/service.ts`도 상한 가까이 — 더할 것은 새 모듈로.
- 프로토콜을 올리면 최소 판 = 지금 − 1. 다음 마이그레이션 `prevIds` = 두 끝.
- 숙소 요금 화폐(질문 1683)를 정하면 `boats/harbor.ts` `assetAt`과 함께.
- 사업장 돈을 나라 화폐로 바꾸면 `facilities/world.ts`의 `createShareMarkets({ asset })`도 함께(building-screen 기록).

## 건드리지 말 것
- 이번에 main에 오르는 마이그레이션 `20261115064023_boats_dock_fuel`·`20261115082440_business_shares`.

## 미검증·TODO·알려진 문제
- 검사(Verified, 통합 가지)
  - boats-2만 합친 뒤 `pnpm check`(TEST_DATABASE_URL, 무거운 일 잠금): 729 파일·5,503 시험 통과.
  - building-screen까지 합친 뒤 `pnpm check`: 730 파일·5,508 시험 통과. `db:generate` "No schema changes".
  - `pnpm build` 통과, `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 110,037 B / 131,416 B.
  - `pnpm check:content --no-compat` core@104(ad37dd07a345), `pnpm check:docs origin/main` 통과.
  - 배 2 줄기가 "바탕에서도 실패"라 적은 `app.test.ts`·`trpc/system.test.ts`는 `apps/server` 폴더에서 vitest를 돌리면 서버 `vite.config.ts`의 빌드 도장 플러그인이 붙어 `build`가 null이 아니어서 실패한다(Verified: 같은 시험을 저장소 뿌리에서 돌리면 통과). 코드 문제가 아니다 — 서버 시험은 뿌리에서(`pnpm vitest run apps/server/...` 또는 `pnpm --filter @terra/server test`) 돌린다. `inbox/preview.test.ts`는 진짜 실패였고 위처럼 고쳤다.
- 제 조선소·제 부두 요금은 단위 시험(수리)만 확인했다. 연료값의 제 부두 요금은 시험이 없다(Assumed: 같은 `charge` 길).
- 휴대폰에서 보지 않았다.

## 사용자 결정 대기
- 질문 1681~1693(배 2, `docs/questions/2026-11-15-boats-2.md`), 1701~1708(건물 화면, `docs/questions/2026-11-15-building-screen.md`) — 기획 세션에 보낸다.
- 장기 보관료를 제 배(제 조선소)에도 물릴지 — D-559 1523은 "남의 배"라 지금은 물리지 않는다(위 "손으로 푼 곳").

## 묶음 화면 시험
- 한 번에 열 시험 파일(무거운 일 잠금, 빌드한 앱·서버, 헤드리스, 56.5분, d0adf50 위) — **84/84 통과**, 건너뜀 0(Verified):
  building-screen 5/5, labor 4/4(둘은 같은 세계라 함께 돌림), facilities 5/5, build-mode 5/5, inbox 17/17, boats 2/2, unit-control 21/21,
  gather-station 11/11, gather 5/5, government 9/9.
- 화면 시험 때문에 앱·시험 코드를 고친 곳은 없다.

## 덧붙임: 푸시 전 main 따라잡기
- 화면 시험 동안 다른 세션이 main에 두 커밋을 바로 올렸다(7e90d86 경로 다듬기·텔레포트·정부 판·돈 표시, SIM_VERSION 47 / 45808fc 건물 안 유닛 숨김·[나가기]). 통합 가지에 `origin/main`(45808fc)을 합쳤다(355537c).
- 손으로 푼 곳: `apps/game/src/map/gather/GatherPanel.tsx` — main은 옛 건물 판 안에 있는 유닛 줄에 [나가기](`gather_stop`, 들어가기로 머문 내 유닛)를 넣었고, building-screen은 그 판을 `apps/game/src/map/building/BuildingPanel.tsx`로 옮겼다. 건물 판을 BuildingPanel로 두고 [나가기]를 그 "안에 있는 유닛" 줄로 옮김(`onLeave` 칸, 버튼 클래스 `gather-leave` 그대로 — `e2e/building-inside.spec.ts`가 찾는다). 메시지 파일 둘은 양쪽 키 모두, `docs/WORKLOG.md`는 다시 만듦.
- 검사(Verified, 355537c): `pnpm check` 732 파일·5,517 시험 통과. `pnpm build`·`check-pwa` 통과, `check:bundle` 110,059 B / 131,416 B.
- 화면 시험(Verified, 20.5분): building-inside 1/1, building-screen 5/5, labor 4/4, government 9/9, boats 2/2 — 21/21 통과.

## 배포 (Verified)
- main bb9d462, CI 346: 검사·이미지·NAS 배포 성공(2026-11-15 21:26 KST 무렵 끝남, core@104). 세계는 새로 시작하지 않았다.
- 바로 뒤 1116c(10d0f5d)가 22:39 KST에 다시 배포되어, 켠 뒤 지표는 1116c 작업 기록 "배포" 절에 함께 적었다.
- 배·부두 지우기(1499, 1115c에서 처음 돔) 기록을 nas-metrics가 `boat_resets` 표에서 읽었다: 1줄, 지운 배·부두·작업 0개(그 세계에는 옛 배·부두가 없었다). 1115c 기록의 "Unknown"은 이것으로 풀렸다.
