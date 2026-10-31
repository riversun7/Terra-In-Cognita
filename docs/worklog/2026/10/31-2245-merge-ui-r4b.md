# 화면 셋(유닛·사이보그, 경제·거래창, 세력·우편)과 R4b 합치기

- 일시: 2026-10-31 22:45 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-app-shell.md`("구현하며 정한 것" 유닛·사이보그, 경제·거래창, 세력·우편), ADR `2026-10-31-faction-society-core.md`, 가지 `work/ui-units-cyborg`(65fc1a4)·`work/ui-economy-market`(b5c73b7)·`work/ui-faction-mail`(352b57d)·`work/rules-r4b`(7e9b0ea)

## 한 일
- 네 가지를 main에 차례로 합쳤다: 유닛·사이보그(먼저 푸시, 7b83dc1) → 경제 → 세력·우편 → R4b.
- 공용 파일 충돌은 모두 "둘 다 남김"으로 풀었다: 서버 맥락·라우터·앱 연결(roster·economy·faction·mail 넷이 나란히), 화면 표(`routeViews.tsx`), 메시지 ko·en(끝에 덧붙인 키), `packages/shared/package.json` 내보내기, ADR 37 메모 셋.
- 이제 모든 주소가 진짜 화면이라 `routeViews.tsx`에서 준비 중 화면(`ComingSoon`) 줄과 지연 import를 뺐다.
- 시험 맥락 두 곳(`roster.test.ts`, `economy.test.ts`)에 새로 필수가 된 다른 화면 자료를 넣었다(빈 자료).
- 의미 충돌 하나: R4b가 팩 `stat_rows`의 HP 줄을 기획 48 N1 값(base 0, 가중 1500·1000·1500·3000·1000·1200)으로 바꿔 유닛 화면 시안 Mina(Lv18)의 HP 손계산이 201 → 281이 됐다. `roster.test.ts`와 `e2e/units.spec.ts`의 기대값을 281로 고쳤다. ADR 37 유닛 메모의 "Mina HP 201"은 그때 시험한 값이라 두었다.
- 기획 질문 번호가 겹쳤다(경제 141~152, 세력·우편 151~160) → 세력·우편을 153~162로 옮겼다(질문 파일·작업 기록·ADR 37 메모·`factionScreen/overview.ts` 주석).
- PLAN 14장: 130·131 답, 132~162는 기본안을 화면에 넣고 답을 기다림, 새 질문은 163부터.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/{app.ts,main.ts}`, `trpc/{context,createContext,router}.ts`, `trpc/planetEditorRouter.test.ts` | 화면 넷의 서버 자료를 함께 연결 |
| `apps/server/src/roster/roster.test.ts`, `apps/server/src/trpc/economy.test.ts` | `TrpcContext` 필수 칸(roster·economy·faction·mail), Mina HP 281 |
| `e2e/units.spec.ts` | Mina HP 281 |
| `apps/game/src/shell/routeViews.tsx` | 화면 넷, 준비 중 화면 빼기 |
| `apps/game/messages/{ko,en}.json` | 세 가지의 새 키를 모두 |
| `packages/shared/package.json` | `./economy`·`./faction`·`./mail`·`./roster` 내보내기 |
| `docs/questions/2026-10-31-ui-faction-mail.md` 등 | 질문 번호 153~162 |
| `docs/PLAN.md` | 14장 질문 상태 |

## 함께 바꿔야 하는 파일
- 새 화면 자료를 서버에 더하면 `TrpcContext`를 손으로 만드는 시험(`planetEditorRouter.test.ts`, `roster.test.ts`, `economy.test.ts`, 세력·우편 시험)도 함께 고친다.

## 건드리지 말 것
- 각 가지의 작업 기록·ADR 메모 본문(번호만 바꿨다).

## 미검증·TODO·알려진 문제
- `apps/game/src/sections/ComingSoon.tsx`는 이제 어디서도 쓰지 않는다. 지우는 것은 사용자 승인 뒤(지금은 그대로 둠).
- 세력 화면의 도시 수는 아직 0이다: R4b가 `world_cities` 표를 만들었지만 세력 화면(`factionScreen/source.ts`)은 그 표를 아직 읽지 않는다(다음 연결 작업).

## 검사
- `TEST_DATABASE_URL=… pnpm check`(DB 시험 포함): 처음 2,456개 중 1개 실패(위 Mina HP) → 고친 뒤 그 파일 13/13 통과. 나머지 2,455개 통과. `db:generate` "No schema changes". 콘텐츠 core@10.
- `pnpm e2e`(전체): 140 통과, 1 건너뜀(11.1분, 부하 4 안팎).
- `pnpm check:bundle`: 첫 화면 JS 129,361 B / 상한 131,416 B(남음 2,055 B). 세 화면 가지가 따로 잰 값(128,919·129,027 B)과 비슷하다(공용 조각 나눔 차이).

## 사용자 결정 대기
- 없음
