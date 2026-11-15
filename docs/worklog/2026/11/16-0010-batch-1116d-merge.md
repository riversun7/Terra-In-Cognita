# 2026-11-16 묶음 1116d 합치기 (사업장 2 D-564 · 가문 D-565 · 채집 4 D-566~568)

- 일시: 2026-11-16 00:10 (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `15-2350-business-2`·`15-2240-house-565`·`15-2300-gather-4`, 기획 D-564·D-565·D-566·D-567·D-568, 질문 1741~1749(`docs/questions/2026-11-15-house-565.md`)·1761~1769(`2026-11-15-gather-4.md`)·1781~1790(`2026-11-15-business-2.md`)

## 한 일
- 통합 가지(main d5c2b51 + 배포 기록 c3cf6a0)에 세 줄기를 차례로 합쳤다.
  1. `work/business-2`(930fcc4) → 385bf01: 지급준비금, 주인 판매가, 거래소 반입 자리, 임금 유닛 지갑, 운영자 건설 땅 검사, 장비 수리 외주(D-564).
  2. `work/house`(a4a1756) → ab2d8ce: 가문 창설 무료(설정 칸 `house_found_cost` 지움), 가문 소속 도시 → 나라 자동(`house_homes`, `house_home`), 시야 = 가문 나라, 고용에는 가문(`no_house`), 무소속 표시(D-565).
  3. `work/gather-4`(979c867) → 23141db: 건물 채집소(농장·목장·약초원 = 건물 레벨 최고 티어·권장 스탯 효율), 면적 모듈(`world_facilities.plots`, 명령 `facility_plot`), NPC 지형별 특수 자리, 레벨 0 재료 목재·석재만(D-566·D-567·D-568).
- 최종 판: 프로토콜 **41**(받는 가장 낮은 판 **40**, 39·40·41 설명 모두), 팩 **core@109**(세 줄기 106·107·108이 모두 든 새 내용이라 그 위), `SIM_VERSION` **53**.

## 손으로 푼 곳
- `packages/protocol/src/version.ts`(house·gather-4 두 번): 39(가문)·40(지급준비율)·41(면적 모듈) 설명을 모두 남기고, 자리표시 줄("같은 묶음의 다른 줄기")은 지웠다. 최소 판 설명 줄은 "41부터 39판 이하".
- `content/core/manifest.json`(두 번): 109.
- `content/core/id-changes.json`: 충돌은 없었다. house 줄기가 뒤에 더한 `house_found_cost` 지움 줄의 `since`를 106 → 109로 맞췄다(이번에 처음 main에 오르는 줄. 이미 main에 있던 줄은 손대지 않음).
- `apps/game/messages/{ko,en}.json`(house): 양쪽 키를 모두 남김(지급준비금·외주 + 가문 소속 도시). 키 7,862개, ko·en 일치.
- `apps/server/src/facilities/service.ts`(gather-4): business-2의 외주 시설 찾기(`shopFacility`)와 gather-4의 면적 모듈 고리(`plotDeps`)·`plot` 선언을 모두 남김. 두 줄기가 각자 옮긴 뒤 안 쓰게 된 `Primaries`·`Rotation` import를 지움. 레벨 올리기 주석은 business-2 기준("운영자 = 시간 0", `operatorMs`). 953줄.
- `docs/WORKLOG.md`: 받은 쪽 → `pnpm docs:index`.
- `content/core/tuning.json`은 저절로 합쳐졌다(겹친 칸 id 없음, Verified).

## 리셋 필요 여부: 필요 없음
- 마이그레이션 넷은 같은 부모에서 갈라진 형제이고 모두 더하기다: `20261115132043_house_homes`(표 더하기 + 옛 가문을 가문장 내 도시로 채움), `20261115132252_business_reserve`(열 더하기, null = 기본값), `20261115133024_facility_plots`(열 더하기, 기본 0), `20261115135818_unit_motion_speed`(이미 main). 직전 판 앱이 그대로 돈다(각 줄기 기록, Verified: 줄기 기록의 SQL 확인).
- 옛 가문 행·가문원·가문 나라(`born_of`)는 그대로 이어지고, 가문 없이 이미 고용한 유닛은 무소속으로 남는다. 채집 작업 줄은 다음 정산부터 새 규칙으로 굴린다.
- 배포 뒤 첫 정산부터 임금형 계약이 있는 사업장은 지급준비금만큼 덜 나눈다(의도, D-564).
- 프로토콜 최소 판이 40이 되어 39판 이하 기기는 새 앱을 받는다(PWA 강제 적용).

## 함께 바꿔야 하는 파일
- 다음 마이그레이션의 `prevIds`에는 네 끝(`house_homes`·`business_reserve`·`facility_plots`·`unit_motion_speed`)을 모두 적는다. 합친 뒤 `db:generate`는 "No schema changes"(Verified).
- 파일 크기: `apps/server/src/db/schema.ts` 998줄, `apps/server/src/app.ts` 985줄 — 새 표·고리는 다른 파일로. `facilities/service.ts` 953줄(타입은 `serviceTypes.ts`, 도우미는 `serviceHelpers.ts`).
- 고용하는 화면 시험을 여럿 한 번에 돌리면 같은 계정의 구인 카드가 모자란다(fusion·recruit "no card", units player 빈 목록) — 따로 돌리거나 순서를 나눈다.
- 고용하는 e2e는 `ensureHouse`(`e2e/helpers/wsCommands.ts`, 구인 카드 사기 도우미가 부른다)를 거쳐야 한다.

## 검사 (Verified)
- `pnpm check`(DB 시험 포함, 잠금 안에서): 포맷·린트·타입·경계·크기·다국어·디자인 값·콘텐츠 통과, 시험 파일 736/736, 시험 5,550/5,550 통과.
- `pnpm check:content d5c2b51`: core@109 (957677312fc8) 단계 1·2·4a·4b 통과. `pnpm check:docs d5c2b51` 통과.
- `pnpm build` 통과, `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 110,060 B / 상한 131,416 B.
- `pnpm --filter @terra/server db:generate`: No schema changes.
- 화면 시험(17개 spec 한 번에, 191개): 180 통과·11 실패(43.4분). 원인을 가른 뒤 고친 spec과 묶음 순서 탓인 spec만 따로 다시 돌려 모두 통과 — economy·fusion·recruit 45/45, boats·equip-stats 12/12, units 13/13.
  - economy 4개(앱 회귀, house 줄기): 구인 칸의 가문 안내 링크 "세력 화면으로"가 76×16px라 작은 누르는 곳 검사에 걸렸다 → `RecruitPanel.tsx` 링크에 `eco-inline-link`(누르는 곳 크기 토큰)를 달았다.
  - boats 2개(시험 기대 낡음, business-2 줄기): 운영자 모드 건설은 이제 시간 0이라(D-564 1663) 짓자마자 다 지어져 `dev_facility_finish`가 `not_damaged`로 답한다 → `ok` 또는 `not_damaged`를 받게 고쳤다(`expectFinished`).
  - equip-stats 1개(시험 기대 낡음, main a1d94ef부터): 스태미나 회복 펼침은 서버 판정 식 글("실제 회복 = …")을 보이고 옛 고정 문구는 식이 없을 때만 쓴다 → "실제 회복 = "을 보게 고쳤다.
  - fusion·recruit·units 4개(묶음 순서 탓, 앱 문제 아님): 한 번에 돌리면 앞 spec들이 같은 계정(admin)의 구인 카드 3~5장을 다 사서 "no card"가 나고, units의 player 빈 목록 기대는 앞 spec이 player로 고용한 유닛 때문에 깨졌다. 새 DB로 따로 돌리면 통과(Verified).

## 미검증·TODO·알려진 문제
- 각 줄기의 TODO는 줄기 기록에 있다: 가문 1743 나·1745 개인 세금·1746 랭킹·1748 길잡이, 채집 1761(기르는 티어 고르기)·1765·1766·1768, 사업장 운반 1786·거래소 반입 1784.
- 고용 가문 검사는 메모리 표(`houseTies`)를 본다(가문 명령 뒤·1분마다 다시 읽음, Assumed: 서버 하나라 문제없음).
- 휴대폰에서 보지 않았다.

## 사용자 결정 대기
- 질문 1741~1749(가문), 1761~1769(채집 4), 1781~1790(사업장 2) — 기획 세션에 보낸다. 모두 추천대로 [임시] 구현했다.
