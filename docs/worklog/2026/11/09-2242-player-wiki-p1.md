# 플레이어 위키 P1: 항목 40개·길잡이 3개, 설정 화면에 도움말 입구

- 일시: 2026-11-09 22:42 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-09-player-wiki.md`, 앞 기록 `09-2202-player-wiki-skeleton.md`, `docs/wiki/README.md`

## 한 일
- 위키 항목을 **5개 → 40개**로 늘렸다(초보자가 처음 30분에 만나는 것 중심). 길잡이 3개와 시작 문서를 썼다.
- 사용자 결정(2026-11-09): ① main 합치기는 P1 글까지 쌓은 뒤 한 번에 ② 게임 입구는 **설정 화면 안에**.
- 설정 화면 맨 아래에 "도움말 — 위키 열기"를 넣었다. 새 창으로 깃허브의 `docs/wiki/start.md`를 연다. 글은 앱 묶음에 들어가지 않으므로 **문서를 고쳐도 앱을 다시 빌드하지 않는다**.
- 검사를 넓혔다: 길잡이·시작 문서의 링크도 보고, 머리 칸 `status`와 본문 `지금` 줄이 어긋나면 실패하고, 이름에 쉼표가 있으면(목록 구분자를 잘못 씀) 실패한다. 코드 울타리·한 줄 코드 안의 보기 링크는 보지 않는다.
- 색인에 길잡이 목록을 더했다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `docs/wiki/pages/*.md` (35개 추가, 모두 40개) | 지도·도시·세력·생산·경제·전투·UX 항목 |
| `docs/wiki/guides/first-hour.md`·`first-trade.md`·`first-city.md` | 순서대로 읽는 길잡이 3개 |
| `docs/wiki/start.md` | 10분이면 아는 큰 그림 8개와 길잡이 목록으로 다시 씀 |
| `docs/wiki/{index,categories,terms}.md` | 자동 생성 다시 돌림 |
| `scripts/check-wiki.mjs`·`wiki-lib.mjs`·`build-wiki-index.mjs` | 위 검사 3개 추가, 길잡이 목록 생성 |
| `apps/game/src/settings/SettingsPage.tsx` | 설정 화면에 도움말 칸(단추 하나). 주소는 상수 하나 |
| `apps/game/messages/ko.json`·`en.json` | `settings_help_legend`·`settings_help_hint`·`settings_help_open` (한국어·영어 함께) |

## 함께 바꿔야 하는 파일
- 항목을 더하거나 고치면 `pnpm wiki:index`를 돌려 생성물을 함께 커밋한다(푸시 전 훅이 막는다).
- 기획서 미러를 새로 복사하면 `pnpm check:wiki --stale`로 다시 볼 항목을 찾는다.
- 위키 주소를 옮기면 `SettingsPage.tsx`의 `WIKI_URL`도 함께 고친다(지금은 main 브랜치의 `docs/wiki/start.md`를 가리킨다).

## 건드리지 말 것
- `docs/design/`(미러)은 고치지 않는다. 위키를 쓰다 찾은 모순은 `docs/questions/`로 넘긴다.
- `docs/wiki/{index,categories,terms}.md`는 자동 생성이다.
- 링크에 `#앵커`를 쓰지 않는다(검사가 막는다).

## 미검증·TODO·알려진 문제
- **Verified(실행)**: `pnpm check` 전체 통과(시험 4,009개 통과 / 274개 건너뜀 — DB 주소 없이 돌린 회차). `pnpm build` + `pnpm check:bundle` 통과 — 첫 화면 JS **107,240 B** / 상한 131,416 B(남음 24,176 B). `pnpm check:wiki`(항목 40개), `pnpm wiki:index --check` 통과.
- **Verified(화면 사진)**: 임시 PostgreSQL 16 + `pnpm dev:server` + `pnpm dev:game`으로 띄워 가짜 계정(`wikitest`)으로 들어가 `/settings`를 390px에서 찍었다. 파스텔·다크 두 테마와 한국어 문구까지 확인했다(사진은 작업 폴더 밖 임시 폴더라 저장소에 없다). 콘솔 오류 0건.
  - 처음에는 `<a className="button-small">`로 넣었는데 버튼 모양이 `button` 요소 선택자에 묶여 있어 파란 밑줄 링크로 보였다 → `<button>` + `window.open(…, "_blank", "noopener")`로 바꿔 다른 단추와 같은 모양이 되었다.
- **미실행**: `pnpm e2e`(화면 시험)는 돌리지 않았다. 이 환경에 시험용 DB 설정이 없어 전역 준비가 돌지 않는다. 설정 화면 spec이 있으면 다음에 함께 돌린다.
- 진행: 항목 40개(초안 35 / 뼈대 5), 기능 상태는 지금 되는 것 12 / 만드는 중 20 / 기획만 8. 장별 분포는 `docs/wiki/categories.md` 진행 표.
- 남은 것(P2): 기획서 소제목 462개 기준으로 약 110항목이 더 남는다. 우주·증권·신앙·스킬·아이템·랭킹·BM은 아직 항목이 없다. 영어 본문도 없다(한국어 먼저, 사용자 결정).
- 상태(`status`)는 코드를 찾아보고 적었지만 기능이 늘면 낡는다. 큰 기능이 들어갈 때 그 항목의 `지금` 줄을 함께 고친다.

## 사용자 결정 대기
- 없음. 다음은 P2(나머지 기획서 덮기) 진행 여부.
