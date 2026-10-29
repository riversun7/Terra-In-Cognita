# 앱 뼈대 W4 합치기(홈 대시보드) — 앱 뼈대 W1~W5가 모두 main에

- 일시: 2026-10-30 02:20 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-app-shell.md`(37) 5·6·7·10·11절, 머지 `5121010`(가지 `work/integrate-w4`), 작업 기록 `29-2300-app-shell-w4-home.md`·`30-0150-app-shell-w4-review.md`(W4 가지), `30-0210-app-shell-w3-integration.md`

## 한 일
- `work/app-shell-w4`(0단계 `507e645` 위, 검토 고침까지)를 main `18acf73`(W1·W2·W3·W5가 들어간 뒤) 위에 합쳤다. 충돌은 `docs/WORKLOG.md`뿐이었다(목차를 다시 만듦).
- 꽂는 줄은 W4 고침 단계가 main `18acf73` 위에서 리허설하고 남긴 패치를 그대로 붙였다(`git apply --3way`, 충돌 없음).
  - `shell/routeViews.tsx`: `/` = `home/HomeScreen.tsx`. 임시 홈(`sections/HomeStatus.tsx`, 연결·성능 진단만)을 지웠다.
  - `home/shellParts.tsx`: 앱 안 링크 = W1 `AppLink`, 연결·성능 카드 = W1 `DiagnosticsPanel`, 편집 시트 열림 = 라우터 겹침 칸 `sheet`(뒤로 → 닫힘).
  - `home/homeSettings.ts`: W2 계정 설정 묶음 `home`(`useSettings().device.home`, `chooseHome(mergeHome(…))`). 임시 기기 저장(`terra.home.settings.tmp`)을 지웠다.
  - `home/inboxParts.ts`: W3 모듈(처리할 일 저장소·문구·시안 자료 스위치·바로 처리·복귀 요약 문구·오류 문구)을 다시 내보낸다. 대신 것(`home/source/`)과 임시 메시지 키 26개(`home_tmp_*`, ko·en)를 지웠다.
  - `net/homeQueries.ts`: 서버 카드 조회 `loadCards`(`dashboard.cards`)를 더했다. 처리할 일·복귀 요약과 같은 조각이라 같은 틱의 조회가 요청 하나로 묶인다.
  - 시험 두 개: 임시 키 시험을 지웠고(`homeMessages.test.ts`), 그리기 시험은 SW 등록 모듈을 비운다(`homeRender.test.ts`, W1 `DiagnosticsPanel`이 Vite 전용 모듈을 가져온다).
- 합칠 때 더 고친 것
  - 홈의 처리할 일 분류 아이콘(`home/cards/icons.tsx` `CategoryIcon`)을 화면 틀 아이콘(`ui/icons.tsx`)으로 바꿨다. 그 파일의 [임시] 주석이 적어 둔 꽂는 줄이다. 처리함 화면(W3 합치기 때 바꿈)과 같은 분류가 같은 그림이 된다. 모르는 분류는 종(`bell`)이다.
  - `shell/routeViews.tsx` 주석: 홈 줄 설명, 꽂는 줄 목록에서 W4를 뺐다.
- 확인: 아래 "확인" 표.
- W3 배포(CI 101, `sha-18acf73a1472`): 적용할 마이그레이션 없음, 배포 점검 통과. 10분 뒤 `nas-metrics`: 두 행성 캐시로 켬(캐시 읽기 137ms·33.9ms), 기기 오류 0건(Verified: 작업 로그).

## 확인
| 확인 | 결과 |
|---|---|
| `pnpm check`(DB 시험 없이) | 통과: 시험 파일 170개, 시험 1,691개 통과·81개 건너뜀(DB 시험은 CI에서). 포맷·린트·타입·경계·크기·다국어(473개 키)·대비(148쌍)·콘텐츠 모두 통과 |
| 화면 시험 `pnpm e2e` | 17개 모두 통과(2.1분, 기존 `shell.spec.ts`·`smoke.spec.ts`: 로그인 뒤 `/`가 이제 홈 대시보드다). W4 리허설에서 한 번 실패한 서랍 새로고침 시험도 통과 |
| 첫 화면 JS `pnpm check:bundle` | 125,940B(gzip 9단계, 파일 3개, 원본 410,159B) / 상한 131,416B(남음 5,476B). W3까지는 126,188B(파일 5개)였다: 홈이 지연 조각이 되며 공용 조각 나뉨이 바뀌었다. 홈 코드는 첫 화면에 없다(W4 리허설 확인) |

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/shell/routeViews.tsx` | 홈 = 홈 대시보드 조각 |
| `apps/game/src/home/shellParts.tsx`·`homeSettings.ts`·`inboxParts.ts` | W1·W2·W3 부품으로 꽂기 |
| `apps/game/src/net/homeQueries.ts` | 서버 카드 조회 |
| `apps/game/src/home/cards/icons.tsx` | 분류 아이콘을 화면 틀 아이콘으로 |
| `apps/game/src/home/homeMessages.test.ts`·`homeRender.test.ts` | 임시 키 시험 지움, SW 등록 모듈 비움 |
| `apps/game/messages/{ko,en}.json` | 임시 키 26개 지움 |
| 지움: `apps/game/src/home/source/*`, `apps/game/src/sections/HomeStatus.tsx` | 대신 것·임시 홈 |
| `docs/worklog/2026/10/30-0220-app-shell-w4-integration.md` | 이 기록 |

## 함께 바꿔야 하는 파일
- 홈이 다른 줄기 부품을 쓰는 곳은 `home/shellParts.tsx`(W1)·`home/homeSettings.ts`(W2)·`home/inboxParts.ts`(W3) 셋뿐이다. 그 부품 이름·모양을 바꾸면 이 세 파일을 함께 고친다.
- 처리할 일 분류를 더하면 `ui/icons.tsx`에 같은 이름의 아이콘을 더한다(처리함·홈이 분류 ID로 고른다).

## 건드리지 말 것
- 편집 시트는 [편집] 누르기 처리기에서만 연다(효과에서 열면 개발 모드에서 열리자마자 닫힌다, 기록 `30-0150` "찾은 것" 2).

## 미검증·TODO·알려진 문제
- 앱을 켤 때는 홈 자료가 HTTP 요청 두 번으로 나간다(`inbox.list,summary.get` 다음 `dashboard.cards`, W4 리허설 10번 중 10번). ADR 37 6절 "요청 하나"는 앱 안에서 홈으로 돌아올 때만 맞다. 켤 때도 하나로 하려면 첫 화면의 처리할 일 저장소가 카드도 함께 받아야 한다. 바꾸지 않았다.
- W4 리허설 때 W1 화면 시험 하나("서랍을 연 채 새로고침하면…")가 네 번 중 한 번 실패했다. 따로 돌리면 통과했고 원인은 확인하지 못했다(W4 기록 `30-0150`).
- W4 화면 확인 스크립트(저장소 밖)를 저장소 화면 시험(`e2e/home.spec.ts`)으로 옮기는 일은 남았다.
- 휴대폰·화면 읽기 프로그램으로는 보지 않았다(헤드리스 Chromium만).

## 사용자 결정 대기
- 없음.
