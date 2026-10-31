# 유닛 화면·사이보그 화면(그럴듯한 첫 판)

- 일시: 2026-10-31 22:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR 37 `docs/adr/2026-10-29-app-shell.md` "구현하며 정한 것 (유닛·사이보그 화면, 2026-10-31)"(제안), 기획 질문 `docs/questions/2026-10-31-ui-units-cyborg.md`(132~140), 브랜치 `work/ui-units-cyborg`(main `f38e088`에서)

## 한 일
- 사용자 요청(2026-10-31) "기획서 참고하여 병렬로 가능한 부분은 함께진행하라 / 기획서가 부실하거나 다르면 질문해라 / 그럴듯하게 페이지를 빨리 구현할수있으면 좋겠다"에 따라, 준비 중이던 `/units`·`/cyborg`를 화면으로 바꿨다. 경제·거래 화면은 다른 줄기가 같이 만든다.
- 서버: tRPC 조회 `units.list`·`cyborg.get`. 실제 세계 유닛(부상·포로·화물·행성·영역, 정산 뒤 직무·피로)과 내가 잡은 포로를 읽고, 2차 스탯은 `@terra/sim` 함수와 팩 표로 계산해 보낸다. dev·admin 시안 자료(유닛 10·포로·파티·프리셋·관리인·경매 매물·사이보그 본체)를 홈 시안 자료와 같은 권한으로 더한다.
- 기기: 유닛 화면(칸 여섯: 목록·파티·직무 프리셋·관리인·경매소·포로, 걸러 보기·다중 선택·상세, 넓은 폭 옆 판), 사이보그 화면(본체·스탯·스킬·장비·인공장기·인벤토리·환생·랭킹). 바꾸는 동작은 모두 "곧 열림". 메시지 키 188개(ko·en).
- 기획이 비었거나 다른 곳 9개를 질문 132~140으로 모았다(기술 기본안 가로 만듦).
- 마무리 검토: `react-best-practices`(효과 안 바로 setState 없음, 늦은 답 버리기, 파생 상태), `web-design-guidelines`(고르기 칸 44px 하나의 누르는 곳, 제목 차례 h1 → h2, 긴 목록 `content-visibility`, 숫자 `tabular-nums`), `break-ui`(긴 이름 줄바꿈, 빈 목록 안내, 큰 수 자리 나눔·BigInt 금액, 한국어·영어 사진).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/roster.ts`, `packages/shared/package.json` | 응답 타입(진입점 `@terra/shared/roster`, 첫 화면 묶음 밖) |
| `apps/server/src/roster/catalog.ts` | 팩 → 전투 자료 + 이름 표(스탯·아이템·스킬·시설·행성) |
| `apps/server/src/roster/body.ts` | 몸 자료 → 스탯(성장·장비 보너스·2차)·장비 칸·스킬 칸, [임시] 시험 유닛 기본값 |
| `apps/server/src/roster/preview.ts` | 시안 자료(스탯은 서버 계산) |
| `apps/server/src/roster/worldUnits.ts` | 실제 유닛 읽기(정산 → 대기열 비우기 → SQL), 잡힌 유닛·내가 잡은 포로 |
| `apps/server/src/roster/services.ts` | 실제 + 시안 합치기, 쓴 ID의 이름만 |
| `apps/server/src/trpc/roster.ts`, `router.ts`, `context.ts`, `createContext.ts` | 프로시저 둘·맥락 `roster` |
| `apps/server/src/app.ts`, `main.ts`, `content.ts` | 팩 자료를 서버를 켤 때 한 번 만들어 넘김(`loadServerContent`가 팩 파일 `source`도 돌려준다), 실제 유닛 출처는 DB가 있는 월드만 |
| `apps/server/src/trpc/planetEditorRouter.test.ts` | 맥락에 `roster`가 생겨서 |
| `apps/server/src/roster/roster.test.ts`, `worldUnits.db.test.ts` | 자료 다듬기·DB 읽기 시험 |
| `apps/game/src/roster/*` | 자료 받기 훅, 문구·정렬·걸러 보기(시험 포함), 공용 부품·CSS, 시안 스위치 |
| `apps/game/src/units/*` | 유닛 화면 |
| `apps/game/src/cyborg/*` | 사이보그 화면 |
| `apps/game/src/shell/routeViews.tsx` | 두 주소를 새 지연 조각으로 |
| `apps/game/messages/ko.json`, `en.json` | `roster_*`·`units_*`·`cyborg_*` 188개 |
| `e2e/units.spec.ts` | 화면 시험 13개 |
| `docs/adr/2026-10-29-app-shell.md` | "구현하며 정한 것 (유닛·사이보그 화면)" |
| `docs/questions/2026-10-31-ui-units-cyborg.md` | 기획 질문 132~140 |

## 함께 바꿔야 하는 파일
- 팩 `unit_kinds`·`stat_rows`·`items`·`skills`가 바뀌면 시안 자료 스탯도 바뀐다. `roster.test.ts`의 Mina 손계산(STR 41+2, VIT 40, HP 201)과 `e2e/units.spec.ts`의 HP 201을 함께 고친다.
- 세계 유닛 종류 코드(`world/unitKinds.ts`)가 늘면 `roster/worldUnits.ts` `unitTypeOf`와 `@terra/shared/roster` `UNIT_TYPES`·메시지 `roster_type_*`.
- 정산 직무 코드(`@terra/sim` `JOB_*`)가 늘면 `jobOf`와 `RosterJob`.
- 시험 자산 코드(`world/settlement.ts`)가 바뀌면 `roster/rosterText.ts` `TEST_ASSETS`.
- 질문 132~140에 답이 오면 PLAN 14장(번호표)과 ADR 37 이 절, 코드의 `[임시]`.

## 건드리지 말 것
- 세계 표·정산·전투 결과 코드(규칙 줄기 R4b 몫). 이 줄기는 읽기만 한다(`settleOwner`·`writer.durable()`은 복귀 요약과 같은 읽기 전 정산).
- 홈 카드 4장의 "시안에서도 준비 중"(ADR 37 [결정 2]). 유닛·사이보그 화면의 시안 자료와 따로다.

## 검증
- `TEST_DATABASE_URL=… pnpm check`: 통과(시험 파일 259개, 시험 2,313개, DB 시험 포함).
- `TEST_DATABASE_URL=… pnpm e2e`(전체): 98개 중 97개 통과(16.4분). 실패 1개는 이 줄기가 만든 순서 의존이었다: `units.spec.ts`가 dev에게 시험 일꾼을 주자 뒤에 도는 `vision.spec.ts` "처음에는 내 유닛이 없고…"가 깨졌다 → 실제 일꾼 시험을 admin 계정으로 바꾸고 `units.spec.ts` + `vision.spec.ts`를 다시 돌려 24개 통과(7.4분).
- `pnpm check:bundle`: 첫 화면 JS 128,697 B / 상한 131,416 B(남음 2,719 B, 파일 8개). 새 화면은 지연 조각이다: `UnitsScreen` 26.1KB(gzip 약 7.3KB), `CyborgScreen` 9.0KB(약 3.1KB), 공용 `useRosterQuery`(roster 부품·문구) 13.6KB(약 4.9KB). main 대비 첫 화면 차이는 재지 않았다(Unknown).
- 사진 32장: `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/ui-units/shots/`(units-list·units-detail·units-parties·cyborg × 390·1440 × pastel·dark × ko·en). 기본 테마 둘을 눈으로 봤다.
- 첫 사진에서 목록·정의 목록의 브라우저 기본 여백(왼쪽 들여쓰기·위 여백)을 보고 두 화면 안만 지우는 규칙을 더했다(`roster.css` 맨 위).

## 미검증·TODO·알려진 문제
- 바꾸는 명령이 하나도 없다(모두 "곧 열림"). 첫 명령(직무 배치)은 WebSocket 메시지·ADR·`PROTOCOL_VERSION`과 함께 만든다.
- 고른 칸·상세·걸러 보기가 주소에 남지 않는다. 좁은 폭에서 상세를 연 채 휴대폰 뒤로를 누르면 화면을 떠난다(TODO: 주소 표에 `?tab=`·`?unit=`).
- 다중 선택 띠가 붙어 있는 동안 키보드로 맨 아래 줄에 초점을 두면 띠에 가릴 수 있다(띠 높이만큼 `scroll-margin-bottom`을 아직 주지 않았다).
- 실제 유닛 스탯은 [임시] 기본값이다. 유닛 수가 많을 때(수백) `units.list` 응답 크기·시간은 재지 않았다(Unknown). 줄마다 스탯·칸을 다 싣는다.
- 준비 중 화면 표(`sections/ComingSoon.tsx`)에 유닛·사이보그 줄이 남아 있다(쓰이지 않음). 경제 화면 줄기와 합친 뒤 지운다.
- 경로 랭킹 이름은 [임시]로 서버 시안 자료가 `{ko, en}`을 보낸다(경로 목록이 팩에 없다).
- 기획 질문 132~140은 답을 기다린다. PLAN 14장 번호표에는 아직 넣지 않았다(이끄는 세션이 다른 UI 줄기 질문과 번호를 맞춘 뒤 넣는다).

## 사용자 결정 대기
- 없음(질문은 기획 세션으로).
