# 홈 대시보드(W4): 템플릿 6개·카드 9장·편집 시트 — 가짜 자료 훅과 임시 설정 저장으로 먼저 만듦

- 일시: 2026-10-29 23:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-app-shell.md`(37, 제안) 2·5·6·7·10·11절과 사용자 결정 2, 작업 기록 `29-2015-app-shell-stage0.md`·`29-2100-app-shell-stage0-review.md`, 기획 D-6001·D-6005·D-6006·D-6014·D-6015, 커밋 `68fb9eb`(대비 검사)·`a3801ca`(홈)
- 작업 자리: 작업 트리 `.claude/worktrees/app-shell-w4`, 가지 `work/app-shell-w4`, main `507e645`에서 시작했다. W1(화면 틀)·W2(설정 넓히기)·W3(처리할 일)이 아직 없어서 그 줄기가 줄 부품은 임시 대신 것으로 두었다(아래 "함께 바꿔야 하는 파일").
- 고침(2026-10-30, 검토 반영 `30-0150-app-shell-w4-review.md`): 이 기록의 꽂는 줄·임시 부품 설명·"다섯 곳"이 틀렸거나 바뀌어 고쳤다. 바뀐 결정은 줄마다 "(바뀜)"으로 적었다.

## 한 일
- 홈 화면을 `apps/game/src/home/`에 만들었다. 아직 `/`에 꽂지 않았다(W1 `shell/routeViews.tsx`의 한 줄). 그래서 지금 빌드에는 홈 조각이 없다.
  - `HomeScreen.tsx`(기본 내보내기, 받는 값 `{ match, monitor }` — 검토 반영 전에는 `{ monitor, search }`였다): 템플릿 고르기, 원격 측정 화면 이름 `home:<템플릿>`, 자료 실패 알림과 [다시 시도], 편집 시트 지연 로딩(가리키거나 초점이 가면 미리 받는다). 제목 `h1#home-title`(tabIndex -1)부터 그린다.
  - 템플릿 6개(`templates/`): 조합(DT-HYBRID)은 홈 조각에 함께 넣고, 나머지 다섯은 따로 받는다. 템플릿은 "머리"(처리할 일 위 고정·처리함 목록·타임라인·도시 판과 처리할 일·부관 브리핑)와 카드 격자를 그린다. 격자 템플릿만 머리가 없다.
  - 카드 9장(`cards/registry.tsx` 표와 카드 부품): 처리할 일·다가올 일·부관 보고는 처리할 일 자료를 쓴다. 서버 카드 4장(사이보그·보유 유닛·자산·세력)은 늘 "준비 중"이고 숫자가 없다. 지도(2차맵·1차맵 링크), 연결·성능. 아이콘은 `cards/icons.tsx`(인라인 SVG).
  - 편집 시트(`edit/`): `<dialog>.showModal()`. 카드 더하기·빼기(빼면 [실행 취소])·↑·↓·맨 위로·크기·[카드 기본값으로], 손잡이 끌기(마우스·터치, Pointer Events로 직접 만듦). dev·admin에게만 템플릿 칸 6개와 시안 자료 스위치가 있다. 바꿀 때마다 바로 저장한다. 알림 영역(polite)이 결과를 읽는다. 순서 계산은 순수 함수(`reorder.ts`)다.
  - 자료(`homeData.ts`·`useHomeData.ts`): 필요한 조회를 같은 틱에 한 번씩 부른다. 보이는 서버 카드가 없으면 `dashboard.cards`를, 부관 보고가 없으면 `summary.get`을 부르지 않는다. 처리할 일은 위 띠 배지와 같은 W3 저장소를 쓴다(홈은 열 때 `ensureInbox()`만, 검토 반영). 바뀐 부분만 다시 받고, 늦게 온 답은 버리고, 다시 받는 동안 앞 값을 그린다. 다시 받는 때: 연결이 끊겼다가 다시 맺어질 때(또는 실패한 부분이 있을 때), 다시 보일 때(마지막으로 받은 지 60초 넘음), [다시 시도]. 주기 타이머는 없다.
  - 화면 규칙(`homeView.ts`, 순수 함수): 템플릿 고르기, 머리·격자 카드, 받을 자료, 타임라인 나누기, 분류 묶음, 항목 주소, 마감 글자 모양.
  - 기기에만 두는 값(`homePrefs.ts`): 처리할 일 접기(`localStorage` `terra.home` `{ v: 1, inboxCollapsed }`). 시안 자료 켜기는 (바뀜) W3과 같은 `terra.preview`(`inboxParts.ts`)다.
- 임시로 둔 것. 그 줄기가 합쳐지면 몸만 바꾼다.
  - `homeSettings.ts`(W2 전): `useStoredHome()`·`patchHome(patch)` 두 함수. 지금은 이 기기의 `localStorage` `terra.home.settings.tmp`에만 저장한다. 읽기는 `parseHome`, 쓰기는 `mergeHome`(0단계)이다.
  - (바뀜, 검토 반영) `inboxParts.ts`(W3 전): W3 부품의 이름·모양 그대로 내보내는 자리. 지금은 `source/standIn.ts`·`standInQueries.ts`·`previewSample.ts`(대신 것)를 가리킨다. 처음에 둔 `source/tempSource.ts`·`itemText.ts`·`dueText.ts`는 지웠다. 임시 키 `home_tmp_*`는 26개다.
  - `shellParts.tsx`(W1 전): `HomeLink`(보통 `<a>`, 받는 값 `{ to: RouteTarget }`), `DiagnosticsBody`(연결 여부와 fps·p95·메모리), `useSheetOverlay`(편집 시트 열림. 지금은 화면 상태라 뒤로 → 닫기 없음). 처음의 `useOverlayEntry`는 바꿨다(검토 기록 "찾은 것" 2).
- 메시지 키 82개(ko·en 함께, W4 자리 `status_rejected_other` 뒤): `home_*` 56개, `home_tmp_*` 19개(W3 뒤 지움), `card_*_empty` 7개.
- `tokens.css` "홈 카드" 블록: `--card-min-wide` 176px(64em 이상), `--card-icon` 32px, `--aide-size` 40px, `--timeline-dot` 12px, `--sheet-max` 560px. `--card-row` 주석을 "가장 낮은 높이"로 고쳤다(글이 길면 줄이 늘어난다).
- 대비 검사(`scripts/design-tokens.mjs`): 상태색(성공·경고·위험) 글자를 둘째 판(`--color-surface-2`) 위에서도 잰다(부관 말풍선, 처리할 일 분류 이름). 136쌍 → 148쌍, 모두 통과(최저 글자 5.29).
- 검토: `web-design-guidelines`, `impeccable`(audit·polish), `break-ui`(최악 자료), `review-animations` 기준(아래 "확인"). 검토에서 고친 것:
  - 빈 알림 영역이 세로 간격을 만들던 것(`.home-live:empty`는 흐름에서 뺀다).
  - 1×1 카드 제목이 넘치던 것(카드가 13em 이하면 머리를 세로로 쌓는다). 320px 영어 머리에서 [접기] 글자는 읽기 프로그램에만 남긴다(판 20em 이하).
  - 처리할 일 수가 꺾쇠 뒤에 있던 것(제목 바로 뒤로. "처리할 일 7"로 읽힌다). 수는 기기 언어 형식(1,284).
  - 도시 안내 문구가 건물 자리와 겹치던 것(장면과 문구를 나눴다). 편집 시트 스위치 줄이 눌려 넘치던 것.
  - 분류로 묶은 목록에서 분류 이름을 줄마다 되풀이하던 것. 시트 스크롤 막대 색.
  - 지난 마감("… 마감 지남"·"Past due …", 위험색), 다른 해의 마감(연도까지). 처리함 템플릿은 30줄까지 그리고 나머지는 "처리함에서 n개 더 보기".
  - 빼기 뒤 [실행 취소]. 지도 카드 단추를 누를 때 턱 색이 투명해지던 것(전역 단추와 같게).

## 정한 것 (ADR 37·계획서가 정하지 않은 것)
1. 템플릿의 머리: 머리가 된 카드는 격자에서 빼고, 편집 목록에는 "맨 위 고정"으로만 보인다(옮기기·빼기 없음). 조합·처리함·도시 = 처리할 일, 타임라인 = 처리할 일 + 다가올 일, 브리핑 = 처리할 일 + 부관 보고. 격자 템플릿은 머리가 없고, 저장 목록에 처리할 일이 없으면 맨 앞에 기본 크기(2×1)로 넣어 그린다(저장값은 그대로).
2. 처리할 일 카드는 뺄 수 없다(D-6001 "처리할 일 먼저"의 기술 해석).
3. (바뀜, 검토 반영) 도시 템플릿은 처리할 일 판이 먼저이고 그 아래가 도시 판이다. 거점이 생기면 건물 위의 할 일이 맨 위가 된다(그 시스템 몫).
4. 줄 수: 조합 위 고정·도시 6줄, 처리할 일·다가올 일 카드 2×1 3줄·2×2 6줄, 처리함 템플릿 30줄. 넘는 것은 "처리함에서 n개 더 보기"다. 서버 순서(ADR 37 7절: 분류 순위 → 마감 → 처음 생긴 시각, 마감 없음은 그 분류의 끝)는 바꾸지 않는다.
5. (바뀜, 검토 반영) 마감 글자는 W3 `formatDue`(남은 시간을 내려 씀: "2시간 후 마감", 1분 안이면 "1분 안에 마감", "마감 지남")다. 처리함 화면과 글이 같아야 해서다. 처음에는 시각으로 썼다("오후 8:30까지"). `<time dateTime>`은 서버 시각을 `serverLink.clockOffsetMs()`로 기기 시각으로 옮긴다.
6. 처리할 일 수는 완료를 뺀 수다(종 배지와 같다).
7. 편집: 끌다가 Esc를 누르면 끌기만 되돌리고 시트는 열어 둔다. `pointercancel`도 되돌린다. 바탕을 누르면 닫힌다. 손잡이는 44px, 시트 가장자리 48px 안이면 한 프레임에 12px씩 넘긴다. 좁은 폭(37.5em 미만)은 아래에 붙는 시트, 넓으면 가운데(최대 560px)다.
8. (바뀜, 검토 반영) 시안 자료 켜기는 W3 `terra.preview`(켠 계정 id, `localStorage`) 하나를 홈·처리함·종 배지·복귀 요약이 함께 쓴다. 처음에는 탭 단위(`sessionStorage`)였다. 시안 자료의 바로 처리 단추는 명령을 보내지 않고 누른 줄 바로 아래에 "시험 자료라서 명령을 보내지 않았습니다."를 알린다. 실제 항목에는 명령을 보낼 길이 생길 때까지 단추가 없다.
9. dev·admin 머리에 템플릿 이름("템플릿 · 조합")을, 주소로 볼 때는 "주소로 봄 · 저장 안 함"을 보인다. 주소로 볼 때 편집 시트의 템플릿 칸은 저장값을 고른 채 안내를 붙인다. 모르는 `?template=` 값이면 저장값이다.
10. 격자: 줄 높이는 `minmax(var(--card-row), auto)`다(글을 자르지 않는다). 64em 이상은 열의 가장 좁은 너비가 `--card-min-wide`다. (바뀜, 검토 반영) `auto-fit`이라 카드가 다 채우지 못한 빈 열은 접힌다.
11. 다시 받기: 앱을 켠 뒤 처음 맺은 연결로는 다시 받지 않는다(홈을 열 때 이미 받는다).
12. 영어 문구: "Coming Soon"(준비 중), "Pinned to top"(맨 위 고정), "Reset Cards"(카드 기본값으로), "Past due {time}", "{count} more in Inbox".

## 확인
환경(Verified): 이 작업 트리, Node 24.22.1, pnpm 11.28.9, 빌드한 앱과 서버(포트 4620, `NODE_ENV` 비움), PostgreSQL 16 시험 클러스터 `127.0.0.1:55432`의 DB `terra_w4_home`, 가짜 계정 `w4player`(player)·`w4admin`(admin), Playwright 1.63.0 + 헤드리스 Chromium 1243.
화면 확인은 저장소 밖 임시 하네스로 했다. `App.tsx`의 상태 화면 자리에 홈을 지연 로딩으로 꽂고, 틀의 넓은 본문(1120px)을 흉내 냈다. 하네스는 커밋하지 않았다. 화면 시험 스크립트도 저장소 밖이다(W5의 `e2e/`가 아직 없다).

| 확인 | 결과 |
|---|---|
| `pnpm check` | 통과(1분 20초): 포맷·린트·타입·경계·크기·다국어 407개 키·대비 148쌍·콘텐츠 `core@2 (14495d30db2e)`, 시험 파일 136개 통과·6개 건너뜀(DB), 시험 1,270개 통과·40개 건너뜀 |
| 홈 단위 시험(`vitest run apps/game/src/home`) | 파일 4개, 시험 36개 통과(`homeView` 14·`reorder` 11·`homeData` 9·`homeMessages` 2) |
| `pnpm --filter @terra/game build`(하네스 없이) | 통과. 홈을 가져오는 곳이 아직 없어서 홈 조각이 만들어지지 않는다 |
| 편집·역할·원격 측정 42개 | 모두 통과. player 기본 카드, player에게 템플릿 칸·시안 자료 스위치 없음, 맨 위로·↓(Enter)·크기·빼기·실행 취소·더하기, 알림 영역 문구, 옮긴 뒤 초점 유지, Esc로 닫고 [편집]에 초점, 격자에 바로 반영, 새로고침 뒤 남음, 마우스 끌기·터치 끌기(CDP 터치), 끌다가 Esc, 바탕 눌러 닫기, player `?template=dt_city` → 조합, admin `?template=dt_city` → 도시, 시안 자료 켜기·끄기, 템플릿 저장, 원격 측정 `#home:dt_city`(admin)·`#home:dt_hybrid`(player) |
| 주소 템플릿 6개 | 모두 통과. `?template=dt_city`로 본 뒤 저장값 없음, 주소 없이 열면 저장값(조합), 편집 시트 템플릿 칸은 저장값, 모르는 값이면 저장값 |
| 빈 상태·시안 자료(템플릿 6개 × 빈·시안 × 파스텔 ko·다크 en, 390) | 24개 중 22개 통과: 처리할 일 칸이 첫 칸(도시는 도시 판 다음)이고 첫 화면 높이(844px) 안에서 시작, 서버 카드 4장 "준비 중", 빈 상태에 수 표시 없음, 넘침 0, 기기 오류 0. 다섯 템플릿은 시안 자료에서 마감 없는 항목이 목록에 3~4개 그려진다(첫 화면 높이 안인지는 재지 않았다). 실패 2개는 격자 템플릿의 시안 자료다(처리할 일 카드 3줄 안에 마감 없는 항목이 없다. 아래 "미검증·TODO") |
| 초점 순서(템플릿 6개 × 390·1440) | 12개 통과. 격자 칸 위치가 DOM 순서(위 → 아래, 왼쪽 → 오른쪽)다. Tab 순서는 [편집] → 머리 → 격자 카드 순서다. 양수 `tabindex` 없음 |
| `break-ui` 최악 자료(템플릿 6개 × 280·320·390 × ko·en, 큰 글자 32px, 1440, 다크) | 고친 뒤 문서 넘침 0, 칸 넘침 0, 44px 미만 누르는 곳 0, 기기 오류 0. 최악 자료: 수 1,284·1,000,000·1, 지난 마감, 400일 뒤 마감, 모르는 종류·동작·화면, 완료 여러 건, 줄 40개. 마지막 고침(지도 단추 누름 턱 색) 전에 돌렸다 |
| 사진 56장 | 파스텔·다크 × ko·en으로 템플릿 6개 시안 자료 390, 조합 1440(시안·빈 상태), 조합 player 빈 상태 390, 편집 시트 player·admin 390(44장): 모두 넘침·44px 미만 누르는 곳·기기 오류 없음. 템플릿 6개 빈 상태 390(파스텔 ko·다크 en, 12장): 넘침·기기 오류 없음(44px 검사는 하지 않았다). 저장소 밖(세션 임시 폴더)에 두었다 |
| 묶음 크기(gzip -9, 하네스 빌드) | 홈 조각 15,889B(`HomeScreen` JS 4,481 + `registry` JS 7,895 + `inbox` JS 509 + CSS 1,782 + 1,222). 목표 30KB 이하. 편집 조각 6,629B(JS 4,797 + CSS 1,832). 목표 10KB 이하. 다른 템플릿 다섯은 187~716B씩, `templates.css` 728B(합 3,559B). 시안 자료 표 808B(켤 때만). 첫 화면 JS(`index-*.js`)에 홈 코드가 없다(`home-grid`·`terra.home.settings.tmp`·`home:` 문자열 0개) |
| 주기 타이머 | 홈 코드에 `setInterval`·`setTimeout`이 없다. `requestAnimationFrame`은 끄는 동안만 쓴다. 연결·성능 카드의 1초 갱신은 원래 있던 프레임 측정기 구독이다 |
| 홈을 열 때 tRPC 요청 | 홈이 보낸 요청은 0개다(가짜 출처). 보인 요청은 원래 있던 설정 동기화(`settings.get`·`settings.set`)뿐이다 |
| 지도 카드 단추 턱(파스텔·다크) | 보통 상태가 전역 단추와 같은 `0 4px 0` 턱 색이고, 누르면 같은 색 `0 0 0`과 아래로 4px |
| `impeccable detect apps/game/src/home` | 찾은 것 없음. 파일 정규식 검사만 돌았다(그린 화면이 필요한 규칙은 돌지 않았다) |

### `review-animations` 기준
이 스킬은 사용자만 부를 수 있어서(`disable-model-invocation`) 부르지 않았다. 스킬의 기준 10가지를 홈의 움직임에 손으로 대 보았다. 결론은 막을 것 없음이다.

| 움직임 | 판단 |
|---|---|
| 편집 시트 열림(아래에서 32px 올라오며 나타남, 320ms, `--easing-out`) | 통과. 가끔 여는 겹침이라 200~500ms 안이다. 닫을 때는 바로 닫힌다. 지원 하한 iOS 16.4에 `@starting-style`이 없어 키프레임을 쓴다 |
| 끄는 동안 다른 줄이 비킴(transform 120ms) | 통과. transform만 쓰고 전환이라 중간에 바뀌어도 이어진다. 끄는 줄은 손가락을 바로 따른다 |
| 시안 자료 스위치 손잡이·처리할 일 접기 꺾쇠(transform 200ms) | 통과 |
| ↑·↓·맨 위로(버튼·키보드) | 움직임 없음. 통과 |
| 지도 카드 단추 누름 | 고쳤다. 누를 때 턱 그림자가 `none`으로 바뀌며 색까지 흐려지던 것을 전역 단추와 같게 했다 |
| 마우스 올림 | 마우스 기기에서만 바뀐다(`hover: hover`·`pointer: fine`). 통과 |
| 동작 줄이기 | 디자인 시스템 토큰이 길이를 모두 0ms로 만든다(ADR 30). 스킬은 투명도 변화는 남기라고 권한다. 디자인 시스템 전체의 일이라 홈에서 바꾸지 않았다 |
| 남은 다듬을 거리 | 끌어 놓을 때 놓은 줄이 제자리로 바로 붙는다(보통 반 줄 이내) |

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/home/HomeScreen.tsx` | 홈 진입점 |
| `apps/game/src/home/templates/`(템플릿 6개, `templates.css`) | 템플릿마다 머리와 격자 |
| `apps/game/src/home/cards/`(`registry.tsx`, 카드 부품 6개 — 서버 카드 4장은 `ServerCard.tsx` 하나, `CardFrame.tsx`, `icons.tsx`) | 카드 표·부품·아이콘 |
| `apps/game/src/home/edit/`(`EditSheet.tsx`, `useReorder.ts`, `reorder.ts`·`reorder.test.ts`, `editSheet.css`) | 편집 시트·끌기·순서 계산과 시험 |
| `apps/game/src/home/homeView.ts`·`homeView.test.ts` | 화면 규칙(순수 함수)과 시험 |
| `apps/game/src/home/homeData.ts`·`homeData.test.ts`·`useHomeData.ts` | 자료 저장소·다시 받기와 시험 |
| `apps/game/src/home/homeSettings.ts` | [임시] W2 전 설정 저장 |
| `apps/game/src/home/homePrefs.ts` | 기기에만 두는 값 |
| `apps/game/src/home/source/tempSource.ts`·`previewSample.ts` | [임시] W3 전 자료 출처·시안 자료 |
| `apps/game/src/home/itemText.ts`·`homeMessages.test.ts` | 처리할 일 문구([임시] 종류·동작·요약 칸)와 키 빠짐 시험 |
| `apps/game/src/home/shellParts.tsx` | [임시] W1 전 틀 부품 자리 |
| `apps/game/src/home/InboxBody.tsx`·`TodoList.tsx`·`TimelineList.tsx`·`BriefConversation.tsx`·`PinnedTodo.tsx`·`CardGrid.tsx` | 템플릿·카드가 같이 쓰는 목록 부품 |
| `apps/game/src/home/dueText.ts`·`numbers.ts`·`templateText.ts`·`homeTypes.ts` | 마감 글자, 수 형식, 템플릿 이름, 부품 타입 |
| `apps/game/src/home/home.css`·`todo.css` | 홈 화면·목록 모양 |
| `apps/game/messages/ko.json`·`en.json` | W4 자리 키 82개 |
| `apps/game/src/styles/tokens.css` | "홈 카드" 블록 값 5개 |
| `scripts/design-tokens.mjs` | 둘째 판 위 상태색 대비 쌍 |
| `docs/worklog/2026/10/29-2300-app-shell-w4-home.md`, `docs/WORKLOG.md` | 이 기록, 목차(`pnpm docs:index`) |

## 함께 바꿔야 하는 파일 (꽂는 줄)
- (바뀜) 처음 이 자리에 적은 꽂는 줄은 W1·W3 실제 이름과 어긋났다(`useConnectionStatus()`를 그대로 넘김, 홈 받는 값 `{ monitor, search }`, W3 저장소 대신 직접 조회 등). 맞는 꽂는 줄은 `30-0150-app-shell-w4-review.md` "함께 바꿔야 하는 파일"에 있다(합친 리허설에서 걸고 확인한 그대로).
- W5(시험 틀): main에 합쳐졌다. W4를 합친 뒤 이번 확인(편집·역할·주소 템플릿·초점 순서·빈 상태·사진)을 `e2e/home.spec.ts`로 옮긴다.
- 카드 크기·기본값을 바꾸면 `packages/shared/src/dashboard.ts`와 그 시험, `homeView.ts`의 머리 표(`HERO_CARDS`)를 함께 본다.
- 템플릿을 더하면 `HomeScreen.tsx` `LAZY_TEMPLATES`, `homeView.ts` `HERO_CARDS`, `templateText.ts`, 0단계 `template_*` 키를 함께 고친다.

## 건드리지 말 것
- (바뀜) 홈 파일이 W1·W2·W3 모듈을 가져오는 곳은 자리 파일 셋(`shellParts.tsx`·`homeSettings.ts`·`inboxParts.ts`)뿐이다. 다른 홈 파일에서 직접 가져오지 않는다(꽂는 곳을 모아 둔다). 처음에 적은 "다섯 곳"은 맞지 않았다(그 무렵에도 `HomeScreen.tsx`·`TodoList.tsx` 등이 시안 자료 스위치·문구를 따로 가져왔다).
- 격자에 `grid-auto-flow: dense`·`order`를 쓰지 않는다(DOM 순서 = 보이는 순서 = 초점 순서, ADR 37 6절).
- 시안 자료에 서버 카드 4장의 수를 넣지 않는다(사용자 결정 2).
- 시안 자료 표를 홈 조각에 정적으로 가져오지 않는다(플레이어 묶음에 들어간다).
- 임시 저장 열쇠 `terra.home.settings.tmp`의 값은 W2 때 옮기지 않는다(개발 가지에서만 쓴 값).

## 미검증·TODO·알려진 문제
- 통과 기준 2 "다른 기기에도 남는다": W2 전이라 미실행이다. 지금은 이 기기의 `localStorage`에만 남는다(새로고침 뒤 남는 것은 Verified).
- 통과 기준 2 "뒤로로 닫는다": 이 가지만으로는 W1 라우터가 없어 뒤로로 닫히지 않는다. W1과 합친 리허설에서 꽂는 줄을 걸면 뒤로로 닫히고 초점이 [편집]으로 돌아온다(Verified, 검토 기록). Esc·닫기·바탕 누르기로는 닫히고 값이 남는다(Verified).
- 통과 기준 6 "홈을 열 때 새 요청은 묶음 1번": 합친 리허설에서 쟀다(검토 기록). 앱 안에서 홈을 다시 열면 한 요청(`inbox.list,dashboard.cards`)이고, 앱을 켤 때는 처리할 일·복귀 요약이 먼저 나가서 `dashboard.cards`가 한 요청 더다(Verified).
- 계획대로 통과 기준 1·2·6은 W1·W2·W3이 모두 합쳐진 뒤 다시 본다.
- 격자 템플릿의 처리할 일 카드(기본 2×1, 3줄)는 서버 순서의 앞 3줄만 보인다. (바뀜, 검토 반영) 가린 줄은 "처리함에서 n개 더 보기" 아래 분류별 수(예: 멈춤 1·완료 1)로 보인다. 줄 순서는 바꾸지 않았다(기획 판단, D-6005 해석).
- 읽기 프로그램(VoiceOver·TalkBack)으로 듣지 않았다(Unknown). 알림 영역 글자와 단추 이름은 Playwright로 확인했다.
- `::backdrop` 어두운 바탕: 사용자 정의 속성을 물려받는 것은 Chrome 122·Safari 17.4·Firefox 120부터라 그 전 판에서는 바탕이 어두워지지 않는다(Assumed, 확인하지 않음). 시트는 그대로 쓸 수 있다.
- 큰 글자(뿌리 글자 32px): `--card-min`이 px라 글자를 키워도 열이 넓어지지 않아 1×1 카드 글줄이 짧다(넘침은 없다, Verified). em으로 바꿀지는 W1과 함께 본다.
- 큰 글자에서 영어 "To-dos"(0단계 키 `card_inbox`)가 하이픈에서 줄이 나뉜다.
- 휴대폰(웨일)에서 보지 않았다. W1·W4를 합친 뒤 NAS에서 본다(ADR 37). 헤드리스 Chromium만 썼다(Safari·Firefox는 Unknown).
- 화면 시험 스크립트·최악 자료·사진은 저장소 밖이다(W5 전).
- DB를 바꾸지 않았다. DB 시험은 돌리지 않았다(`TEST_DATABASE_URL` 없음, 시험 파일 6개 건너뜀).

## 사용자 결정 대기
- 없음.
