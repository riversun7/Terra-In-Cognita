# 세력·우편 화면 초안(`/faction`·`/mail`): 실제 자료 + 시안 자료, 곧 열림 동작, 기획 질문 153~162

- 일시: 2026-10-31 22:10 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-439(질문 131 기술 기본안 가, 기획 커밋 ee6d808 — 미러 전), D-270, 기획 `docs/design/40_Systems/46_Faction_Society.md`, ADR 37 `2026-10-29-app-shell.md` "구현하며 정한 것 (세력·우편 화면)", 질문 `docs/questions/2026-10-31-ui-faction-mail.md`(153~162), 가지 `work/ui-faction-mail`(main `f38e088`에서)

## 한 일
- 세력 화면(`/faction`): 기획 46을 따라 기술이 먼저 만든 초안. 요약 판(세력·가문·체제·지도자·구성원·도시·위 세력·종속국·세력 화폐·국고) + 내 몫(실제 자료) + 잠긴 메뉴(D-5055) + 탭 다섯(도시 내정 · 외교 표 · 전쟁·선포 · 정권·투표 · 도시 지분과 점령 처리 다섯). 아직 규칙이 없는 칸은 "곧 열림".
- 우편 화면(`/mail`): 받은 우편·보낸 우편·쓰기. 첨부는 물건·세력 화폐(D-270). 쓰기는 칸 검사만 하고 보내기는 곧 열림. 감시는 화면에 없다.
- 서버 조회 둘(`faction.overview`, `mail.list`, 쓰기 없음)과 시안 자료. dev·admin의 시안 스위치(홈과 같은 하나)를 두 화면에도 두었다.
- 게임 상태를 바꾸는 동작(선전포고·투표·편입 답·보내기·받기 등)은 모두 곧 열림 단추(`aria-disabled`, 누르면 "아무 명령도 보내지 않았다"를 읽는다).
- 기획 질문 10개(153~162)를 [임시] 기본안과 함께 적었다.

## 실제 자료와 시안 자료
| 칸 | 지금 | 출처 |
|---|---|---|
| 내 몫(유닛·건물 수, 원장 잔고) | 실제 | `world_owners`·`world_units`·`world_buildings`·`ledger_accounts`(위치 없음, 0 아님). 읽기 전에 그 주체를 정산하고 쓰기 대기열을 기다린다 |
| 소속 세력 요약 | 실제(있을 때) | `faction_members`·`factions`(코드·종류·위 세력·구성원 수) + 그 세력 주체의 잔고 = 국고. 이름 칸이 없어 코드·`#번호`[임시], 도시 표가 없어 도시 0 = 가문·세력 단계 |
| 잠긴 메뉴 | 실제 규칙(도시 수로 서버가 판단) | [임시] 조건: 화폐 발행·세율 도시 1개, 국가 채권 도시 5개(S32) |
| 도시·외교·전쟁·정권·지분·점령 | 곧 열림 / 시안 | 규칙(R4b) 전. 시안 장면 `apps/server/src/factionScreen/preview.ts` |
| 우편 | 빈 우편함 / 시안 | 우편 표 없음. 시안 `apps/server/src/mail/preview.ts` |

## 검사·측정
- `TEST_DATABASE_URL=postgres://terra@127.0.0.1:55432/postgres pnpm check`: 포맷·린트·타입·경계·크기·다국어(1,145키)·디자인 값(148쌍)·콘텐츠 통과. 단위 시험 2,343개 중 2,342개 통과, 1개 실패 — `apps/server/src/world/battles.db.test.ts`(전투 인스턴스, 이 가지가 건드리지 않은 파일)가 두 번 모두 실패했다. 같은 실행에 `pg-pool` "timeout exceeded when trying to connect"가 있었고, 시험이 50ms 고정 대기 뒤 끝 상태를 본다. 혼자 돌리면 3번 모두 통과(Verified). 기계 부하 평균 14~16(4코어, 다른 줄기 e2e·DB 시험이 같이 돎) 때문으로 본다(Assumed). 푸시 전 훅의 `pnpm check`는 DB 시험을 건너뛴다.
- 단위 시험(Verified, 실행): `packages/shared` `faction.test.ts`·`mail.test.ts`, 서버 `factionScreen/overview.test.ts`·`mail/list.test.ts`·`factionScreen/factionScreen.db.test.ts`(DB: 401·403, 플레이어 빈 상태, dev 시안, 실제 자료 읽기 — 소속·국고·위 세력·유닛·건물·잔고), 게임 앱 `faction/factionView.test.ts`·`mail/mailView.test.ts`·`sections/queryStore.test.ts`·`sections/screenFormat.test.ts`.
- 화면 시험(Verified, 실행): `e2e/faction.spec.ts` 13개·`e2e/mail.spec.ts` 13개 = 26개 통과(2.1~2.3분, 개발 컨테이너, 다른 줄기 e2e와 같이 돎). 전체 `pnpm e2e` 111개 통과(18.2분, 새 빌드). 그 뒤 CSS 두 줄(곧 열림 알림을 하단 탭 위로, 첨부 고르기 칸 오류 테두리)을 고치고 두 파일을 다시 돌렸다.
  - 플레이어: 세력 없음·여섯 칸 곧 열림·시안 스위치 없음·조회에 preview 없음. 우편 빈 상태, 쓰기 검사(틀린 칸에 초점), 맞으면 곧 열림 안내.
  - dev 시안: 장면 내용(도시 3·외교 4 + 정원사·전쟁 2·투표·지분·점령 처리 10단계), 탭 화살표·End, 스위치 끄기 → 실제 자료 → 켜기, 우편 목록 ↔ 읽기(390)·나란히(1440), [목록으로] 초점 되돌림, [답장] 채움, 첨부 수 초과 오류 → 고침.
  - 곧 열림 단추 뒤 WebSocket 기능 메시지 0개(인사·ping 뺌). 가로 넘침·44px 미만 누르는 곳 없음(390). 기기 오류 0.
  - 긴 이름(띄어쓰기 없는 56자)·큰 수(24자리 금액, 인구 1억)·긴 우편 제목·본문: 가로 넘침 없음(break-ui 기준 최악 자료를 tRPC 응답 고치기로 넣음).
- 사진(Verified): `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/ui-faction/shots/` — `faction-{cities,diplomacy,wars,votes,shares}-{pastel,dark}-{ko,en}-{390,1440}.png`(40장), `mail-{inbox,read,compose}-{pastel,dark}-{ko,en}-{390,1440}.png`(24장), 플레이어 `faction-player-pastel-ko-390.png`·`faction-player-dark-en-1440.png`·`mail-player-dark-en-1440.png`. 문서 높이만큼 화면을 늘려 찍었다(fullPage는 고정 위 띠·하단 탭이 가운데에 겹쳐서).
- 첫 화면 JS(Verified: `pnpm check:bundle`, 빌드 소스 맵): 129,027B(파일 10개) / 상한 131,416B, 남음 2,389B. 같은 때 main `f38e088` 빌드는 127,772B(파일 7개). 첫 화면 모듈 목록은 main과 같다(소스 맵 비교: 이 가지 모듈 0개). 늘어난 1,255B는 rolldown이 공용 모듈(`jsx-runtime`·`utf8`·`session`)을 미리 받는 조각 3개로 더 나눈 몫이다(AGENTS 6장 "지연 조각을 더하면 공용 조각 나눔이 바뀐다"). 상한은 올리지 않았다.
- 새 지연 조각(gzip 9): `FactionScreen` JS 11,033B + CSS 1,757B, `MailScreen` JS 6,252B + CSS 1,376B, 공용 `screenText` 조각(두 화면이 같이 씀).

## 마무리 검토(react-best-practices·web-design-guidelines·break-ui)
- 고친 것: 영어 단추·제목을 앱 관례대로 Title Case("Show Sample Data"와 같게), 우편 칸 `name`·`autoComplete="off"`, 사람이 지은 이름·태그에 `translate="no"`, 세력 탭 패널 `tabIndex=0`, 첨부 줄 고르기·수량 칸 높이 맞춤과 오류를 그 칸에만, 곧 열림 알림이 하단 탭 뒤에 숨지 않게, 화면 시험 사진을 문서 높이로.
- 최악 자료(390px, 한·영): 띄어쓰기 없는 긴 세력·도시·사람 이름, 24자리 금액, 인구 1억, 긴 우편 제목·본문·보낸 사람 → 가로 넘침·잘린 단추 없음(`overflow-wrap: anywhere`, 표는 좁으면 카드). 수는 `Intl.NumberFormat`(BigInt 금액 포함), 시간 길이는 Intl 단위라 영어 복수형("1 day", "20 hours")이 맞다. 빈 상태(세력 없음·빈 우편함·보낸 우편 없음·첨부 고를 것 없음)마다 문구가 있다.
- 남긴 것(결정·나중): 탭을 주소에 두기, 1,000줄 우편·세력 목록(쪽 나누기), 아래 "미검증·TODO".

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/faction.ts`(새)·`faction.test.ts`, `package.json` exports `./faction` | 세력 화면 전송 타입·46 목록(체제·공식 상태·조약 카드·명분·안건·띠·민심·독립 길·점령 처리)과 작은 판단(`relationBand`·`unrestLevel`) |
| `packages/shared/src/mail.ts`(새)·`mail.test.ts`, exports `./mail` | 우편 전송 타입, 쓰기 칸 검사 `checkMailDraft`([임시] 상한) |
| `apps/server/src/factionScreen/{source,preview,overview}.ts`(새)·시험 둘 | 실제 자료 읽기, 시안 장면, 응답 만들기·잠긴 메뉴 |
| `apps/server/src/mail/{preview,list}.ts`(새)·시험 | 우편 목록(실제 빈 우편함 + 시안) |
| `apps/server/src/trpc/{faction,mail}.ts`(새), `router.ts`, `context.ts`, `createContext.ts`, `app.ts`, `planetEditorRouter.test.ts` | 조회 프로시저 둘과 맥락 서비스(`faction`·`mail`), 월드가 있을 때 실제 자료 출처 |
| `apps/game/src/faction/*`(새) | 세력 화면 조각(요약·도시·외교·전쟁·투표·지분/점령), 문구 표, 자료 다듬기 |
| `apps/game/src/mail/*`(새) | 우편 화면 조각(목록·읽기·쓰기), 자료 다듬기 |
| `apps/game/src/sections/{screenParts.tsx,screenParts.css,screenText.ts,screenFormat.ts,queryStore.ts,useScreenQuery.ts}`(새)·시험 | 두 화면이 같이 쓰는 부품·글·조회 저장소(다음 화면도 쓸 수 있다) |
| `apps/game/src/shell/routeViews.tsx` | `/faction`·`/mail`을 준비 중에서 새 조각으로(두 줄 + switch) |
| `apps/game/messages/{ko,en}.json` | 화면 문구 293개(ko·en, 끝에 더함) |
| `e2e/faction.spec.ts`·`e2e/mail.spec.ts`(새) | 화면 시험·사진 |
| `docs/adr/2026-10-29-app-shell.md` | 구현하며 정한 것 (세력·우편 화면) |
| `docs/questions/2026-10-31-ui-faction-mail.md`(새) | 기획 질문 153~162 |

## 함께 바꿔야 하는 파일
- R4b가 도시·외교·전쟁·정권·지분·점령 자료를 만들면 `apps/server/src/factionScreen/overview.ts`의 `buildFactionOverview`에서 그 칸을 `{ status: "ready", data }`로 채운다(모양은 `@terra/shared/faction`). 기기는 그대로다. 세력 이름·태그 칸이 생기면 `factionRef`를 바꾼다.
- 기획 답(153~162)이 오면: 띠 이름·문턱(`RELATION_BANDS`·`relationBand`), 태업 문턱(`SLOWDOWN_BELOW`), 잠긴 메뉴(`LOCK_RULES`), 우편 상한(`MAIL_*`), 탭 구성(`FACTION_TABS`)과 메시지.
- 보내기·받기·투표 등 명령을 만들 때 `SoonButton`을 실제 단추로 바꾸고 프로토콜(`packages/protocol`, `PROTOCOL_VERSION`)·ADR을 함께.
- 우편 표를 만들면 `apps/server/src/mail/list.ts`의 `EMPTY_MAILBOX` 자리에 실제 우편을 넣는다(쪽 나누기도 그때).

## 건드리지 말 것
- 시안 자료는 보기 전용이다(D-439). 판정·잔고·소유에 쓰지 않는다. ID는 `preview_`로 시작한다(실제 ID와 겹치지 않게, 시험이 본다).
- `sections/ComingSoon.tsx` 표의 `faction`·`mail` 줄은 쓰이지 않지만 다른 화면 줄기와 겹치지 않게 남겼다(합칠 때 정리해도 된다).

## 미검증·TODO·알려진 문제
- 탭 고르기는 주소에 남지 않는다(주소 표 `faction` 검색어가 없다, `packages/shared/src/routes.ts`). 새로고침하면 첫 탭이다.
- 우편 목록·외교 표에 쪽 나누기·가상 스크롤이 없다. 실제 우편 표·세력 목록이 생기면 서버 쪽 쪽 나누기와 같이 넣는다(break-ui "1,000줄"은 아직 해당 없음, 시안 6통).
- 우편을 열어도 읽음으로 바뀌지 않는다(읽음은 서버 상태라 명령과 함께).
- 휴대폰 실기기(웨일)·선명·정거장 테마는 눈으로 보지 않았다(대비는 `pnpm check:contrast`가 본다).
- 세력 이름이 서버 코드(`s3_test_npc`)로 보인다 [임시](S3 최소 표에 이름 칸이 없다).

## 사용자 결정 대기
- 없음. 기획 질문 153~162는 리드가 기획 세션에 넘긴다.
