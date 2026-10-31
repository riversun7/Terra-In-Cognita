# 홈 대시보드(W4) 검토 고침 — 지적 11개 처리, W3·W1 부품 자리, 합친 나무 리허설

- 일시: 2026-10-30 01:50 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-app-shell.md`(37, 제안) 2·5·6·7·10·11절, 작업 기록 `29-2300-app-shell-w4-home.md`(이 가지의 첫 기록, 이번에 틀린 곳을 고쳤다), W1·W2·W3·W5 기록 `29-2310`·`29-2220`·`29-2240`·`29-2300-app-shell-w5`와 검토 기록, 합치기 기록 `30-0140-app-shell-w125-integration.md`(main)
- 작업 자리: 작업 트리 `.claude/worktrees/app-shell-w4`, 가지 `work/app-shell-w4`(커밋 전 `6e0e80c`). 화면 확인은 저장소 밖 스크립트(Playwright 1.63.0, 헤드리스 Chromium 1243)와 저장소 밖 작업 트리 두 개(하네스·리허설)로 했다. 둘 다 커밋하지 않았다.

## 한 일
### 지적 처리
고치기 전에 지적마다 다시 확인했다(하네스 빌드에서 재현하거나 W1·W3 가지 코드와 맞대 봄). 11개 모두 맞는 지적이라 고쳤다. 하나는 고치는 방법을 지적과 다르게 했다(1번).

| # | 지적 | 확인 | 처리 |
|---|---|---|---|
| 1 | W3과 이름·모양·뜻이 어긋남(시안 자료 스위치, 문구·마감, 저장소, 바로 처리 규칙, 오류 문구) | 맞음(W3 `11120e7`과 맞대 봄) | `home/inboxParts.ts` 한 파일이 W3 이름·모양 그대로 내보낸다. W3이 main에 오기 전에는 `home/source/`의 대신 것을 가리킨다. 시안 자료 스위치는 W3 `terra.preview`(`{ v: 1, user }`), 줄 글·마감은 W3 `describeItem`·`formatDue`(남은 시간, 내림), 처리할 일은 위 띠 배지와 같은 저장소(홈은 `ensureInbox()`만 부르고 카드·복귀 요약만 따로 받는다), 실패 문구는 W3 `apiErrorInfo`. 지적이 권한 "지금 W3 위로 옮기기"는 하지 않았다: W3이 main에 없고 검토 뒤에도 커밋이 더해지는 중이었다(`5908498..11120e7`). 꽂는 줄은 W3이 main에 온 뒤 한 파일에서 바꾼다(아래) |
| 2 | W1 받는 값과 어긋남(`.screen-wide`, `{ match, monitor }`, 꽂는 줄이 틀림) | 맞음 | `section.screen.screen-wide.home`, 받는 값 `{ match, monitor }`(`match.search.template`). `shellParts.tsx` 꽂는 줄을 W1 실제 이름으로 고쳤다(`useConnectionStatus().status`, `AppLink`의 `to`). 편집 시트 열림은 `useSheetOverlay()`로 바꿨다(아래 "찾은 것" 2) |
| 3 | 모르는 분류(더 새 서버)에서 화면이 깨짐 | 맞음(`TypeError` 재현) | 줄을 남기고 기본 아이콘·색 없이 그린다. 처리함 템플릿은 끝에 "그 밖의 알림" 묶음. 그리기 시험 추가 |
| 4 | 모르는 종류의 줄이 `/units`로 가고 [수락]이 보임 | 맞음 | W3 규칙: 모르는 종류는 "새 알림"이고 처리함(`?item=`)으로, 단추 없음 |
| 5 | 실제 항목에도 바로 처리 단추, 결과 안내가 화면 위 | 맞음 | 단추는 시안 자료에만(W3 `quickActionsFor`). 결과 안내는 누른 줄 바로 아래(알림 영역은 늘 둔다) |
| 6 | 도시 화면에서 처리할 일이 판 아래, 줄 수가 모자란 칸에서 마감 없는 줄이 안 보임 | 맞음 | 도시 화면은 처리할 일 판이 먼저. "처리함에서 n개 더 보기"에 가린 줄의 분류별 수(아이콘 + 이름 + 수). 기술 해석이라 아래 "정한 것"에 적었다 |
| 7 | 처리할 일 바로 뒤 줄을 빼면 초점이 문서 몸으로 빠짐 | 맞음(재현) | 가장 가까운 뺄 수 있는 줄(뒤가 먼저)의 빼기 단추로, 없으면 시트 제목으로(`reorder.ts` `nearestRemovable`) |
| 8 | 타임라인 "지금"에 완료가 섞임 | 맞음 | 완료는 맨 끝 칸. "지금"이 마감 없는 일이라 마감 있는 위협이 뒤에 오는 것은 D-6005 비교 메모로 남겼다 |
| 9 | 템플릿 조각 실패가 다른 템플릿으로 바꿔도 남음 | 맞음(처리함 조각을 막아 재현) | 오류 경계에 `key={template}` |
| 10 | 넓은 격자 오른쪽 빈 열, 요약 띠에 키보드로 못 감, 편집 조각 안내가 화면 아래 | 맞음 | `auto-fit`(1440에서 남는 폭 0px), 띠 칸 `tabIndex={0}`(→ 키로 0 → 84px 넘김), 안내는 [편집] 바로 아래(알림 영역, 첫 화면 안, 실패면 [닫기]) |
| 11 | 주석 틀림·그리기 시험 없음 | 맞음 | 주석 고침, `homeRender.test.ts`(시험 19개) |

### 검토 밖에서 찾은 것
1. CSS 이름 겹침: 홈 처리함 템플릿의 `.inbox-group*`이 W3 처리함 화면 이름과 같았다 → `.home-inbox-group*`.
2. 편집 시트 열림을 효과(`useEffect`)에서 W1 라우터 겹침 칸으로 열면 개발 모드(StrictMode)에서 열리자마자 닫힌다. 효과 → 정리 → 효과 순서에서 닫기(`history.go(-1)`)가 늦게 끝나는 동안 라우터가 다시 열기를 무시한다(Verified: W1 `router.ts`를 가짜 기록으로 돌린 시험, 저장소 밖). 그래서 열기는 [편집] 누르기 처리기에서만 하는 `useSheetOverlay()`로 바꿨고, 닫히면(Esc·[닫기]·바탕·뒤로) HomeScreen이 열림이 꺼진 것을 보고 [편집]으로 초점을 돌려준다.
3. 도시 화면 빈 터(점선)가 넓은 화면에서 판 위로 잘렸다(820px 가운데 터, 1440px 셋 다, 합친 리허설 사진). 폭을 `min(18%, --card-row × 0.6)`으로 막았다.
4. W2 `chooseHome`은 저장하지 못하면 `false`다(4KB 넘음 등). 그때도 시트가 "옮겼습니다"와 [실행 취소]를 보였다 → `patchHome`이 결과를 돌려주고, 시트는 바꾸지 않고 오류(`home_edit_save_failed`)를 보인다(W1 메뉴 설정과 같은 방식).

### 커밋(이 가지, `6e0e80c` 뒤)
1. `7c6bef8` refactor(home): 처리할 일·복귀 요약·화면 틀 부품을 W3·W1 이름·모양 그대로 받는다 — 지적 1~5, 찾은 것 1·2
2. `60ec0bc` fix(home): 템플릿 배치 — 도시 화면은 처리할 일 먼저, 가린 줄의 분류별 수, 타임라인 완료는 맨 아래 — 지적 6·8
3. `7217b07` fix(home): 편집 시트에서 줄을 빼면 가까운 뺄 수 있는 줄로, 없으면 시트 제목으로 초점 — 지적 7
4. `206789b` fix(home): 조각 경계는 템플릿마다, 넓은 격자 auto-fit, 요약 띠 초점, 편집 조각 안내는 [편집] 아래 — 지적 9·10
5. `9bd0003` fix(home): 도시 화면 빈 터가 넓은 화면에서 판 밖으로 나가지 않게 — 찾은 것 3
6. `015bab7` test(home): 더 새 서버의 모르는 값이 와도 홈이 그대로 그려지는지 본다 — 지적 11
7. `e918067` fix(home): 홈 설정을 저장하지 못하면 바꾸지 않고 알린다 — 찾은 것 4

커밋마다 그 상태로 포맷·타입·린트·게임 앱 시험·크기·다국어·대비 검사를 돌려 통과한 뒤 만들었다(Verified).

## 정한 것 (첫 기록에서 바뀐 것)
- 첫 기록 "정한 것" 3(도시 판이 위) → 처리할 일 판이 위(지적 6).
- 5(마감은 시각으로) → W3 `formatDue`를 쓴다: 남은 시간을 내려 쓴다("2시간 후 마감", 1분 안이면 "1분 안에 마감", 지나면 "마감 지남"). 처리함 화면과 글이 같아야 해서다(W3 우선). 남은 시간이라 켜 둔 채 시간이 지나면 글이 늦다: 다시 받을 때(연결 다시 맺음·다시 보임 60초·바로 처리 뒤) 고쳐진다.
- 8(시안 자료 켜기는 탭 단위 `sessionStorage`) → W3 `terra.preview`(`localStorage`, 켠 계정 id). 홈·처리함·종 배지·복귀 요약이 스위치 하나를 쓴다(W3 우선). 켠 계정이 로그인해 있고 dev·admin일 때만 켜진다.
- 10(64em 이상 `auto-fill`) → `auto-fit`(지적 10).
- 새로: 가린 줄의 분류별 수(지적 6의 기술 해석, D-6005·ADR 37 6절 "마감 없는 항목도 빠지지 않는다"). 격자의 2×1 처리할 일 카드는 서버 순서대로 3줄만 그리고, 가린 줄은 분류별 수로 보인다. 줄 순서는 서버 것을 그대로 둔다.
- 새로: 편집 시트 열림은 누르기 처리기에서만 연다(찾은 것 2).

## 확인
### W4 작업 트리(W1 전, 임시 부품)
| 확인 | 결과 |
|---|---|
| `TEST_DATABASE_URL=… pnpm check`(커밋 6 뒤) | 통과: 시험 파일 143개, 시험 1,334개(건너뜀 0) |
| 커밋 7 뒤 | 포맷·타입·린트·홈 시험(파일 5개, 60개)·다국어(411개 키) 통과. 마지막 `pnpm check`는 아래 "마지막 확인" |
| 지적별 화면 확인(하네스: `App.tsx`에 홈을 꽂고 W1 넓은 본문을 흉내 냄, 포트 4641) | 33/33 통과. 시안 자료 스위치가 `terra.preview`, 새로고침 뒤 남음, W3 줄 글·곳·마감, 시안 자료만 단추, 줄 바로 아래 결과 안내, 처리할 일 수 = 종 배지 수(7), player 기기에 남은 admin 표시는 시안 자료 아님·403 없음, 1440·820·390 너비, 격자 2×1 3줄 + 분류별 수, 도시 순서, 빼기 뒤 초점("보유 유닛 빼기", 남은 줄이 처리할 일뿐이면 시트 제목), 조각 실패·되받기, auto-fit, 띠 초점, 편집 조각 안내 자리 |
| 편집·역할·원격 측정 회귀 | 42/42. 주소 템플릿·초점 순서·배치(76/76) 회귀 통과 |
| 사진 44장(파스텔·다크 × ko·en: 템플릿 6개 시안 자료 390, 조합 1440 시안·빈 상태, 조합 player 빈 상태 390, 편집 시트 player·admin 390) | 넘침 0, 44px 미만 누르는 곳 0, 기기 오류 0 |

### 합친 나무 리허설(저장소 밖 작업 트리)
main `dbe87c2` + W2 `4936097` + W5 `d791857` + W1 `c2b9a50` + W3 `11120e7` + W4 `e918067`을 ADR 순서로 합치고, W3 꽂는 줄과 W4 꽂는 줄(아래)을 걸었다. 지금 main(`51ddd5f`)은 이 나무의 W2·W5·W1까지와 같은 커밋이다. W1 `shellPrefs.ts`의 W2 전환은 main 합치기 기록과 같은 뜻으로 따로 걸었다(e2e 두 번째 실행부터). W3 꽂는 줄은 W1 최신과 겹쳐서 손으로 풀었다(아래 "미검증").

| 확인 | 결과 |
|---|---|
| 합치기 | W4는 `docs/WORKLOG.md`(목차)만 충돌. 목차는 다시 만들어 풀었다 |
| `pnpm check`(꽂는 줄·임시 홈 지우기까지 건 뒤) | 통과: 시험 파일 170개(9개 건너뜀), 시험 1,691개(81개 건너뜀, DB). 같은 때 다른 검사가 함께 돌던 한 번은 서버 지표 시험(`eventLoopP50Ms < 5`) 하나가 부하로 실패했다(홈과 무관) |
| `pnpm check:bundle` | 첫 화면 JS 126,278B(gzip 9단계, 파일 4개). main 상한 131,416B 안. 첫 화면 조각의 소스 맵에 `src/home/`·`homeQueries`·`dashboard`가 없다(Verified) |
| 묶음(Vite 빌드 출력 gzip) | `HomeScreen` 4.21kB, `EditSheet` 5.04kB, `homeQueries` 0.69kB(W3 조회 + `loadCards`) |
| `TEST_DATABASE_URL=… pnpm e2e`(W5 틀, W1 `shell.spec.ts` 15 + `smoke.spec.ts` 2) | 첫 실행(W1 W2 전환 전): 15 통과, 2 실패(둘 다 W1 W2 전환 뒤에만 맞는 메뉴 설정 시험). 두 번째(전환 뒤): 16 통과, 1 실패: "서랍을 연 채 새로고침하면 …"이 `openDrawerByKeyboard`(☰에 초점 → Enter)에서 서랍이 열리지 않았다. 그 시험만 두 번 다시 돌리면 통과(14.0초·10.4초). 앞선 전체 실행(W1 W2 전환 전)에서도 통과했다. 흔들리는 시험이다(4번 중 1번). 원인은 확인하지 않았다(Assumed: 탭으로 옮긴 직후 틀이 새 화면 제목으로 초점을 옮기는 것과 시험의 초점·Enter가 겹침) |
| 틀 안의 홈(390·820·1440 × player 빈 상태·admin 시안 자료 × 파스텔·다크, 12장) | 모두 `#main.frame-main` 안, `.screen-wide`, 넘침 0, 44px 미만 0, 기기 오류 0. 종 배지 = 홈 처리할 일 수(7, 6장 모두) |
| 편집 시트 = 겹침 칸 | 열면 같은 주소로 기록 한 칸(`overlay: "sheet"`), 뒤 화면 스크롤 그대로(40 → 40). 뒤로 → 시트 닫힘·홈에 남음·초점 [편집]. Esc → 칸 빠짐·초점 [편집]. 닫은 뒤 스크롤 40 → 10: 40에서 [편집]이 위 띠 아래에 걸쳐 있어 초점을 둘 때 보이게 올린 것이다(W1 `scroll-margin`) |
| 설정 저장(W2) | 템플릿 바꾸기 → `terra.settings`의 `home` → 새로고침 뒤 남음 → 계정 `settings.get`에도 있음 |
| 저장하지 못할 때(기기 `home`에 4,200자 칸) | 6/6: 오류 "홈 설정을 저장하지 못해 바꾸지 않았습니다."가 보임, 카드 순서 그대로, [실행 취소] 없음, "옮겼습니다"를 읽지 않음, 기기 값 그대로 |
| 앱 안 링크(W1 `AppLink`) | 처리할 일 줄을 누르면 페이지를 새로 읽지 않고 옮김, 뒤로 → 홈. 연결·성능 카드는 W1 `DiagnosticsPanel`(연결됨) |
| 홈 조회 요청 | 앱을 켤 때: `settings.get` / `settings.set,settings.set` / `inbox.list,summary.get` / `dashboard.cards`. 처리할 일 저장소·복귀 요약 문이 홈 조각보다 먼저 부르므로 `dashboard.cards`는 한 요청 더다. 앱 안에서 홈으로 돌아오면 5초 뒤 `dashboard.cards`, 62초 뒤 `inbox.list,dashboard.cards`(한 요청) |
| 도시 판(320·390·820·1440 × 파스텔·다크) | 8/8: 빈 터가 판 안, 서로·해와 안 겹침(320 51×38px, 390 64×48px, 820·1440 77×58px) |

### 지금 main 위 리허설(W1·W2·W3·W5가 main에 들어간 뒤)
main `18acf73`(W3 합치기까지) + 이 가지 `602bc69`를 합치고 꽂는 줄(아래)을 걸었다. 저장소 밖 작업 트리다.

| 확인 | 결과 |
|---|---|
| 합치기 | `docs/WORKLOG.md`만 충돌(목차를 다시 만들어 풂). 꽂는 줄 1(`routeViews.tsx`)은 바로 아래 줄이 main에서 W3 처리할 일 주석으로 바뀌어, W4 두 줄만 바꾸면 된다 |
| `pnpm check` | 통과: 시험 파일 170개(9개 건너뜀), 시험 1,691개(81개 건너뜀, DB) |
| `pnpm check:bundle` | 첫 화면 JS 125,942B(파일 3개) / 상한 131,416B. W4 전 main은 126,188B(W3 합치기 기록). 홈 소스는 지연 조각(`HomeScreen`·`registry`·템플릿 다섯·`EditSheet`)에만 있다(소스 맵) |
| `TEST_DATABASE_URL=… pnpm e2e` | 17/17 통과(1.1분) |
| 화면 확인(위 리허설과 같은 스크립트) | 72/74: 틀 안 12장·종 배지 = 홈 수·시트 겹침 칸·초점·설정 저장·앱 안 링크·진단 카드 통과. 남은 2개는 닫은 뒤 스크롤 40 → 10(위 표의 까닭, 고칠 것 아님). 도시 판 8/8, 저장 실패 6/6 |
| 앱을 켤 때 홈 자료 요청(admin 시안 자료 5번 + player 5번) | 10번 모두 두 요청(`inbox.list,summary.get` / `dashboard.cards`). 앞서 한 번은 세 조회가 한 요청이었다(홈 조각이 처리할 일보다 먼저 받아졌을 때) |

사진은 세션 임시 폴더에 있다(저장소 밖): 하네스 `…/shell-w4/fix/shots-final/`, 리허설 `…/shell-w4/fix/shots-rehearsal-final/`·`…/shell-w4/fix/shots-main/`.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/home/inboxParts.ts`(새) | W3 부품 자리(이름·모양 W3 그대로). W3 뒤 import만 바꾼다 |
| `apps/game/src/home/source/standIn.ts`·`standInQueries.ts`(새)·`previewSample.ts` | [임시] W3 대신 것(W3 서버 시안 자료와 같은 줄). W3 뒤 지운다 |
| `apps/game/src/home/itemView.ts`·`deadline.ts`(새), `itemText.ts`·`dueText.ts`·`source/tempSource.ts`(지움) | 줄 하나의 값(W3 `describeItem` + 홈 쪽 값), 마감 `dateTime` |
| `apps/game/src/home/shellParts.tsx` | W1 부품 자리: `HomeLink { to }`, 진단 몸, `useSheetOverlay` |
| `apps/game/src/home/homeSettings.ts` | `patchHome`이 저장했는지 돌려준다(W2 `chooseHome`) |
| `apps/game/src/home/HomeScreen.tsx` | `{ match, monitor }`, `.screen-wide`, 시트 열림·초점, 조각 경계 `key`, 편집 조각 안내 자리, 실패 까닭 |
| `apps/game/src/home/homeData.ts`·`useHomeData.ts`·`homeData.test.ts` | 홈 저장소는 카드·복귀 요약만, 처리할 일은 W3 저장소 |
| `apps/game/src/home/TodoList.tsx`·`TimelineList.tsx`·`InboxBody.tsx`·`PinnedTodo.tsx`·`BriefConversation.tsx`·`cards/*`·`templates/*` | W3 규칙(글·갈 곳·단추·모르는 값), 배치 고침 |
| `apps/game/src/home/homeView.ts`·`homeView.test.ts` | 가린 줄 분류별 수, 타임라인 완료, "other" 묶음 |
| `apps/game/src/home/edit/EditSheet.tsx`·`reorder.ts`·`reorder.test.ts` | 빼기 뒤 초점, 저장 실패 알림, 시트 열림을 HomeScreen으로 |
| `apps/game/src/home/CardGrid.tsx`·`home.css`·`todo.css`·`templates/templates.css` | 띠 초점, auto-fit, 더 보기 칩, 줄 아래 안내, 클래스 이름, 도시 빈 터 |
| `apps/game/src/home/homeRender.test.ts`(새)·`homeMessages.test.ts` | 그리기 시험, 대신 키 시험 |
| `apps/game/messages/ko.json`·`en.json` | W4 자리: `home_tmp_*` 26개(W3 뒤 지움), `home_edit_save_failed`, 쓰지 않는 키 5개 지움 |
| `docs/worklog/2026/10/29-2300-app-shell-w4-home.md` | 첫 기록의 틀린 꽂는 줄·"다섯 곳"·바뀐 결정·통과 기준 줄 고침 |
| `docs/worklog/2026/10/30-0150-app-shell-w4-review.md`, `docs/WORKLOG.md` | 이 기록, 목차 |

## 함께 바꿔야 하는 파일 (꽂는 줄 — W4를 main에 합칠 때. W1·W2·W3은 main `18acf73`에 들어왔다)
홈의 다른 파일은 고치지 않는다. 아래는 지금 main 위 리허설에서 걸고 `pnpm check`·`check:bundle`·e2e·화면 확인을 통과한 그대로다.
1. `apps/game/src/shell/routeViews.tsx`: `// 꽂는 줄(W4): …` 주석 줄과 `const HomeScreen = lazy(() => import("../sections/HomeStatus.tsx"));`를 `const HomeScreen = lazy(() => import("../home/HomeScreen.tsx"));` 한 줄로(바로 아래 W3 처리할 일 주석 줄은 그대로). 홈 줄 `<HomeScreen match={match} monitor={monitor} />`는 그대로다. `apps/game/src/sections/HomeStatus.tsx`는 지운다(그 파일 머리 주석대로).
2. `apps/game/src/home/shellParts.tsx` 몸:
   - `export { AppLink as HomeLink } from "../shell/AppLink.tsx";`
   - `DiagnosticsBody({ monitor })`: `const { status } = useConnectionStatus();`(`../net/connectionStatus.ts`) → `<DiagnosticsPanel status={status} monitor={monitor} />`(`../ui/DiagnosticsPanel.tsx`)
   - `useSheetOverlay()`: `const [shown, setShown] = useState(false); const overlay = useRoute().overlay;` `show = useCallback(() => { setShown(true); openOverlay("sheet"); }, [])`, `hide = useCallback(() => { setShown(false); closeOverlay(); }, [])`, `return { open: shown && overlay === "sheet", show, hide };`(`../shell/routerStore.ts`). W1 라우터는 겹침만 열고 닫으면 화면 version을 그대로 두어 틀이 스크롤·초점을 건드리지 않는다(W1 `40869f3`).
3. `apps/game/src/home/homeSettings.ts` 몸: `useStoredHome()` → `return useSettings().device.home;`, `patchHome(patch)` → `return chooseHome(mergeHome(getSettingsSnapshot().device.home, patch));`(`../settings/settings.ts`). 임시 열쇠 `terra.home.settings.tmp`와 저장소 코드는 지운다(값은 옮기지 않는다).
4. `apps/game/src/home/inboxParts.ts`: `./source/…`를 W3 모듈로 — `usePreviewOn·setPreviewOn·isPreviewOn` ← `../inbox/preview.ts`, `useInbox·ensureInbox·refreshInbox·bellCount·InboxState` ← `../inbox/store.ts`, `describeItem·inboxItemTarget·CATEGORY_NAMES·isKnownCategory·ItemView` ← `../inbox/inboxText.ts`, `quickActionsFor·quickActionLabel·QuickActionId` ← `../inbox/quickActions.ts`, `SECTION_LABELS·visibleSections·VisibleSection` ← `../summary/summaryText.ts`, `apiErrorInfo` ← `../net/apiErrors.ts`, `HomeQueryResult` ← `../net/homeQueries.ts`(타입). `loadSummary`·`loadCards`는 `import("../net/homeQueries.ts")`(늘 동적). `INBOX_TEXT`는 `m.inbox_preview_tag`·`m.inbox_preview_notice`·`m.inbox_action_preview_done`·`OTHER_GROUP_NAME`(`../inbox/inboxText.ts`).
5. `apps/game/src/net/homeQueries.ts`(W3 파일) 끝에 `loadCards(ids, preview)`: `api.dashboard.cards.query({ ids: [...ids], ...(preview ? { preview: true } : {}) }, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })`, 실패는 `failure(error)`. 맨 위에 `import type { DashboardCardsResponse } from "@terra/shared/dashboard";`.
6. `apps/game/src/home/source/` 폴더와 메시지 키 `home_tmp_*` 26개(ko·en)를 지운다.
7. `apps/game/src/home/homeMessages.test.ts`: `[임시]` 시험 두 개와 `INBOX_KINDS`·`SUMMARY_SECTION_KINDS` import를 지운다.
8. `apps/game/src/home/homeRender.test.ts`: `vi.mock("../pwa/updates.ts", () => ({ forceUpdate: () => undefined }));`를 더한다(`vi`도 import). W1 `DiagnosticsPanel` → `shell/ConnectionNotice.tsx`가 Vite 전용 `virtual:pwa-register`를 가져와 vitest에서 못 읽는다.
- (고르기) `home/cards/icons.tsx`의 분류 아이콘을 W1 `ui/icons.tsx`의 `Icon`(`threat`·`money_survival`·`stalled`·`decision`·`done`·`bell`)으로 바꿀 수 있다. 바꾸지 않아도 된다.
- 합칠 때 겹칠 파일: `docs/WORKLOG.md`만(main `51ddd5f`·`18acf73`, W1·W3 가지와 `git merge-tree`, 두 리허설). `pnpm docs:index`로 다시 만든다.

## 건드리지 말 것
- 홈이 다른 줄기 모듈을 가져오는 곳은 자리 파일 셋(`shellParts.tsx`·`homeSettings.ts`·`inboxParts.ts`)뿐이다. 다른 홈 파일에서 W1·W2·W3 모듈을 직접 가져오지 않는다.
- 편집 시트를 효과에서 열지 않는다(찾은 것 2).
- 처리할 일을 홈 저장소가 따로 받지 않는다(위 띠 배지와 같은 W3 저장소, 두 번 받지 않게).
- 조회 모듈(`net/homeQueries.ts`)을 정적으로 가져오지 않는다(첫 화면에 tRPC가 들어간다).

## 미검증·TODO·알려진 문제
- 첫 리허설에서 W3과 main이 부딪힌 곳(tRPC 맥락·라우터, `planetEditorRouter.test.ts`의 `home`, W3 꽂는 줄과 W1 최신)은 W3 합치기(`30-0210`)에서 같은 방식으로 풀렸다. W4 몫은 없다.
- 앱을 켤 때 홈 자료는 보통 HTTP 요청 두 개다(위 "홈 조회 요청"·"앱을 켤 때 홈 자료 요청"). ADR 37 6절 "홈을 열 때 필요한 조회를 같은 틱에 … 요청 하나"는 앱 안에서 홈을 다시 열 때만 맞다. 켤 때 하나로 하려면 첫 화면 쪽(처리할 일 저장소)이 홈 카드 조회도 함께 불러야 한다. 바꾸지 않았다.
- 마감 글자는 남은 시간이라 켜 둔 채 시간이 지나면 다음에 다시 받을 때까지 늦다(W3과 같다).
- 흔들리는 W1 화면 시험 하나(첫 리허설 e2e 줄, 4번 중 1번). 지금 main 위에서는 17/17이었다.
- 휴대폰(웨일)·읽기 프로그램으로 보지 않았다. W1·W4를 합친 뒤 NAS에서 본다(ADR 37).
- 화면 확인 스크립트는 저장소 밖이다. W5 `e2e/`가 main에 들어왔으므로, W4를 합친 뒤 홈 시험(편집·역할·주소 템플릿·초점·빈 상태·저장 실패)을 `e2e/home.spec.ts`로 옮긴다.

## 사용자 결정 대기
- 없음.
