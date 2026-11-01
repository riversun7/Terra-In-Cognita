# 첫 접속: 사이보그 만들기(/start)와 시작 도시 강하, 사이보그 없는 계정 길잡이

- 일시: 2026-11-01 09:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-01-first-login-cyborg.md`(제안, 기획 답 D-445), 질문 파일 `docs/questions/2026-11-01-first-login.md`(168~179 → D-445 모두 가), ADR 37 `2026-10-29-app-shell.md` 끝 "구현하며 정한 것 (첫 접속)", 기획 `60_UX_FTUE.md` 7.1·D-096·D-134·D-140·D-163·D-218·D-058·D-341·D-372·D-444 164·D-6039~D-6045. 가지 `work/first-login`(main `9900b52`에서, main `8e1faae`(D-444)를 합침)

## 한 일
- 왜: 사용자가 NAS에서 새 계정으로 들어가 보니 사이보그·시작 도시가 없어 메뉴가 안 되고 2차맵이 까맸다. 요청(원문): "신규 로그인시 사이보그가 없다면 캐릭터도 없고 스타팅포인트도 선택되지 않아 메뉴들을 이용할수 없고 오류가난다(2차맵이 아예 안보이는 등) / 신규는 로그인시 사이보그 생성창부터 구현해야한다 / 지금처럼 필요한 질문은 기획서 제작을 통해 질문해서 결정한다".
- 먼저 ADR 초안과 기획 질문 168~179를 냈고(D-267 방식, 기술 추천 가), 기획이 D-445로 모두 가를 받았다(덧붙임: 네 성향이 "목록은 Step 5"를 채우고 치우침은 설정값, 사칭 목록은 데이터·욕설은 나중에 같은 자리, [무작위]를 남기고 네 방식을 한 화면에·부위 수는 개발자 페이지 콘텐츠, 본체는 보유 유닛·생필품 유지비 밖이고 피로 회복은 주거).
- 규칙(시험 먼저, `tdd`)
  - 이름 `packages/shared/src/cyborgName.ts`: NFC, 한글 완성형·영문·숫자만, 글자 하나 이상, 한글 2칸·영문 1칸으로 3~16칸(D-134), 열쇠 = 소문자, 사칭 목록(`CYBORG_NAME_RESERVED`). 기기·서버가 같은 함수.
  - 외형 `packages/shared/src/cyborgLooks.ts`: 부위 넷 × 4, 색 둘 × 8, 프리셋 넷, 검사·넘기기·무작위.
  - 굴리기: 세력 줄기(`work/d444`)가 같은 때 만든 `packages/sim/src/society/cyborgStats.ts`(생성·환생 공용)를 쓴다. 처음에 이 줄기가 만든 `packages/sim/src/cyborg/initialStats.ts`·팩 항목 `n9_rerolls`·`n9_bias_*`·`n9_spread`는 합치며 지웠다(굴리기 규칙·다시 굴리기 횟수를 한 곳에). 치우침 출발값을 D-445 168 값으로 바꿨다(`n9_initial_favor` 3000 → 4000: 고른 두 칸 평균 14, 나머지 8, 균형 10). 이 줄기의 시험 생각(시드 2000개 합 60·칸 1~20, 평균 14·8·10, 표준편차 약 3)을 `cyborgStats.test.ts`로 옮겼다. 환생(`rebirthCyborg`)은 같은 굴림을 쓴다(시험 통과).
  - 시작 도시 붐빔 문턱 `d6041_crowd_normal`·`d6041_crowd_busy`(20·50)를 세력·사회 계수표 `cyborg.startCrowd*`와 팩 tuning에 더했다. 팩 core 13.
- 서버(`apps/server/src/cyborg/`): 표 `cyborgs`(계정당 하나, `name_key` 유일, 초기 스탯·숨은 K·외형·세력·시작 도시·본체 유닛·레벨·경험치·환생·신앙도)와 `cyborg_rolls`(만드는 중 굴림·쓴 횟수·시드). 마이그레이션 `20261031230615_first_login_cyborgs`(새 표만). 굴리기·만들기는 월드 쓰기 대기열로 쓰고 커밋 뒤 답한다(만들기는 소유 주체·본체 유닛·사이보그 행·세력 가입·굴림 지우기가 한 커밋). 본체 = 세계 유닛 종류 3(`UNIT_KIND_CYBORG`), 시작 도시 칸부터 나선으로 빈 칸. 부팅이 본체 행을 잃은 사이보그를 다시 놓는다(불변 조건 I13). 본체는 정산(직무·유지비)·보유 유닛 수·유닛 목록에서 뺀다(D-445 178).
- 프로토콜 4: `cyborg_roll`·`cyborg_create` → `cyborg_result`(코드 15개). 받는 가장 낮은 판은 3 그대로. tRPC `cyborg.status`·`creation`·`nameCheck`. `cyborg.get`은 만든 사이보그의 이름·외형·본체.
- 화면: `/start`(틀 숨김) 여섯 단계(`apps/game/src/start/`), 2D 사이보그 그림 `cyborg/CyborgAvatar.tsx`, 틀 길잡이 `start/cyborgGate.ts`(사이보그가 없으면 /start로, 예외 설정과 dev·admin의 관리자·개발자 도구·지도, 만들면 홈). 사이보그 화면이 실제 이름·외형·본체를 보이고 시안 표시를 본체가 시안일 때만 붙인다. 2차맵 화면에 `data-explored`. 메시지 키 `start_*` 94개와 `cyborg_appearance_label`(ko·en). 길잡이의 조회는 홈 자료 조각(`net/homeQueries.ts`)과 나눈 작은 조각(`start/cyborgStatusQuery.ts`)이고 조각·조회가 10초 안에 오지 않으면 막지 않는다(처음엔 홈 자료 조각에 넣었다가 `inbox.spec.ts`의 "조각 받기가 멈추면" 시험에서 길잡이가 화면을 막아 나눴다).
- 화면 시험: 전역 준비가 player·dev·admin의 사이보그를 그 계정 브라우저에서 실제 프로토콜로 만든다(E2EPlayer·E2EDev·E2EChief). 새 계정 `fresh`·`fresh_shots`. 새 `e2e/first-login.spec.ts` 5개. 기존 `units.spec.ts`(플레이어 사이보그 = 만든 본체), `faction.spec.ts`(player·dev는 첫 접속에서 시험 NPC 세력에 들었다 — "세력 없음" 화면은 응답을 개인으로 고쳐 본다), `vision.spec.ts`(dev는 처음부터 본체가 있음, "탐사 없음" 화면은 탐사 칸 메시지를 빈 비트로 바꿔 봄, player는 2차맵이 열림)를 고쳤다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/cyborgName.ts`·`cyborgLooks.ts`·`cyborgApi.ts`·`cyborg.ts`(+시험 2), `package.json` | 이름 규칙·외형 목록·조회 응답 모양, 진입점 `@terra/shared/cyborg` |
| `packages/shared/src/roster.ts` | `CyborgBody.preview`를 boolean으로(만든 본체), `CyborgGetResponse.appearance` |
| `packages/shared/src/routes.ts`(+시험) | 주소 `start` |
| `packages/protocol/src/cyborg.ts`(+시험)·`messages.ts`·`index.ts`·`version.ts`·`codec.test.ts` | 프로토콜 4 메시지 |
| `packages/sim/src/society/cyborgStats.ts`(+시험)·`coefficients.ts`·`tuning.ts`(+시험) | 굴리기 합치기·D-445 치우침 값·붐빔 문턱 |
| `content/core/tuning.json`·`manifest.json` | 붐빔 문턱 두 항목, 치우침 4000, 판 13 |
| `apps/server/src/db/schema.ts`, `apps/server/drizzle/20261031230615_first_login_cyborgs/` | 표 둘 |
| `apps/server/src/cyborg/*`(+DB 시험·게이트웨이 시험) | 서버 규칙·저장·WebSocket |
| `apps/server/src/world/{world,settlement,invariants,unitKinds}.ts`, `world/persist/tables.ts` | 부팅·본체 정산 제외·I13·종류 3·쓰기 표 |
| `apps/server/src/roster/{services,worldUnits,cyborgBody}.ts` | 실제 본체, 보유 유닛에서 본체 빼기 |
| `apps/server/src/trpc/{roster,context,createContext}.ts`, `session.ts`, `app.ts` | tRPC 조회·WebSocket 연결 |
| `apps/game/src/start/*`, `cyborg/CyborgAvatar.tsx`·`CyborgScreen.tsx`·`cyborg.css`, `shell/{Shell,routeViews}.tsx`, `map/{mapFeed,SecondaryMapScreen}.tsx`, `sections/ComingSoon.tsx`, `messages/{ko,en}.json` | 화면 |
| `e2e/global-setup.ts`·`helpers/harness.ts`·`first-login.spec.ts`·`units.spec.ts`·`faction.spec.ts`·`vision.spec.ts` | 화면 시험 |
| `docs/adr/2026-11-01-first-login-cyborg.md`, `docs/adr/2026-10-29-app-shell.md`, `docs/questions/2026-11-01-first-login.md` | 결정·질문·답 |

## 함께 바꿔야 하는 파일
- 성향·치우침·다시 굴리기는 세력·사회 계수표 하나(`society/coefficients.ts` `cyborg.*`)다. 환생 화면이 실제 환생 명령을 만들 때 첫 접속처럼 굴림 상태를 서버에 둔다(`cyborg_rolls` 모양 참고).
- 외형 목록을 팩으로 옮기면(ADR "다음 단계") `CyborgAvatar.tsx`의 그림과 `cyborgLooks.ts`를 함께 바꾼다. 저장된 ID는 그대로 쓴다.
- 세력·도시가 세계에 더 들어오면(편집기 D-076·D-154, R5) `service.ts`의 [임시] 세력 이름 표를 팩 이름으로 바꾼다.

## 건드리지 말 것
- 올라간 마이그레이션(`20261031230615_first_login_cyborgs` 포함)은 고치지 않는다.
- 사칭 목록에 걸리는 이름("admin" 등)은 시험 계정 이름에도 쓰지 않는다.

## 미검증·TODO·알려진 문제
- 튜토리얼(D-6042·D-6043)·정착 안내 목표 카드·정착 지원금(공식 Step 5)·시작 도시 자원·기후는 다음 단계다(D-445 174~176).
- 위 띠 얼굴 그림은 첫 화면 JS 상한(남음 567B) 때문에 미뤘다.
- 휴대폰 실기기에서는 보지 않았다(헤드리스 Chromium 390px 사진만). 강하 연출은 1.6초 CSS 떨어짐 하나(움직임 줄이기면 없음).
- NAS에 배포하지 않았다(미실행). 배포 뒤 기존 계정은 처음 들어갈 때 `/start`로 간다(admin은 관리자·개발자 도구·지도·설정은 연다).
- 같은 시작 도시에 사이보그가 붙어 선다(시험 2차맵 하나·도시 하나). 붐빔 표시는 시작한 수만 센다.

## 검사
- Verified: `TEST_DATABASE_URL=postgres://terra@127.0.0.1:55432/postgres pnpm check` 통과 — 시험 파일 299개·시험 2,556개(DB 시험 포함), 다국어 1,797키, 콘텐츠 core@13. `pnpm check:docs`·`check:content`·`docs:index --check` 통과.
- Verified: 서버 규칙 시험 — `apps/server/src/cyborg/cyborg.db.test.ts` 4개(굴림 합 60·칸 1~20·처음 1 + 다시 3·다 쓰면 rolls_exhausted·다시 켜도 횟수 남음 / 굴림 없이·이름 규칙·사칭·대소문자 무시 고유·외형·세력·도시·계정당 하나 / 시작 도시 둘레 내 유닛(종류 3)·시야로 2차맵 열림·한 커밋·보유 유닛 밖·다시 켜도 그대로·불변 조건 0 / 잃은 본체 다시 놓기 I13), `gateway.test.ts` 3개, `cyborgName.test.ts` 8개·`cyborgLooks.test.ts` 5개, `cyborgStats.test.ts`(시드 2000개 합·범위·평균 14·8·10·표준편차), 프로토콜 4개, 길잡이 4개.
- Verified: 화면 시험 전체 `pnpm e2e` 175개 중 174 통과·1 건너뜀(측정 시험, `E2E_MEASURE=1`일 때만), 12.6분. 새 `first-login.spec.ts` 5개 통과(새 플레이어 만들기 끝까지 약 10초).
- Verified: 첫 화면 JS `pnpm check:bundle` 130,849B / 상한 131,416B(남음 567B). 앞 main(d443 기록 129,802B) 대비 약 +1KB: 길잡이 저장소·프로토콜 4 스키마(첫 화면 `schemas` 조각)·주소 줄. 상한은 올리지 않았다.
- 사진(390px × 파스텔·다크 × 한국어·영어, 단계 여섯 + 만든 뒤 2차맵): 저장소 밖 `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/first-login/shots/`.

## 사용자 결정 대기
- 없음(168~179는 D-445로 답 받음). 새 기획 질문은 180부터(이번에 낸 것 없음).
