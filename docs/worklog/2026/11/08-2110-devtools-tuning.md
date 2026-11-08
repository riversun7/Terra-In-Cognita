# 설정 칸 패널(/dev/tuning) 화면 개편

- 일시: 2026-11-08 21:10 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-01-dev-settings-panel.md` "바뀜 (2026-11-08 화면 개편)", ADR `2026-11-02-dev-ui.md`, 가지 `work/devtools-tuning`(바탕 `merge/integration` 07e08fa)

## 한 일
- 사용자 판정(원문 "/dev/tuning 은 너무 보기 힘들게 ui/ux가 불친절하다. 분명히 개발자 친화적 ux/ui로 만들라고 했다 개편해야한다.")에 따라 화면만 다시 짰다. 자료 모양·서버 API·덮어쓰기 층·담기 → [적용] 한 묶음·구조 값 확인 창·판 충돌·내보내기 → `pnpm tuning:apply`·감사 기록·분야 페이지·49 칸 목록은 그대로.
- 배치: 패널 폭(@container) 60rem 이상은 왼쪽 분야 목록(바뀐 칸 수 표시, ↑↓·Home·End, 키 안내) + 오른쪽 칸 목록. 휴대폰은 분야 고르기 상자.
- 찾기·거르기 띠(넓은 폭은 위 띠 아래에 붙음): 찾기가 풀이(ko·en)도 보고 낱말 여럿은 모두 맞는 칸, "/" 키·Esc 지우기. [바꾼 것만]·반영 범위(전체·서버 즉시·시뮬만·연결 없음)·단위·무리·[풀이 보기](이 기기에 남김). [거르기 지우기], 빈 결과 안내.
- 칸 줄: 표(가로 밀림) 대신 줄 목록. 넓은 폭은 한 줄 격자, 휴대폰은 위아래로 쌓기. 바뀐 줄·담은 줄 왼쪽 띠와 표지, 지금·팩·담음·차이, 범위 막대·글, 단위·출처·덮어쓴 사람.
- 값 칸: 바로 검사(정수·범위, `aria-invalid` + 문구, 맞으면 풀이 미리 보기), [담기]는 고쳤을 때만, Enter = 담고 다음 줄, Esc = 되돌림, ↑↓ = 줄 옮기기, 칸을 떠나면 맞는 값은 담김. 지금 값과 같은 값은 담지 않음.
- 담은 변경 막대: 펼쳐 칸마다 지금 → 담은 값과 [×], 메모, [모두 취소], [적용], Ctrl/⌘+S.
- 휴대폰 누르는 곳: 새 토큰 `--dev-touch-tap`(마우스 24px, 터치 44px)을 이 패널의 자주 누르는 조작부에 썼다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/editor/tuning/TuningPanelScreen.tsx` | 화면 틀 다시 짬: 머리·배치·화면 키("/"·Ctrl+S)·담기 규칙(지금 값과 같으면 뺌) |
| `apps/game/src/editor/tuning/TuningPageNav.tsx`(새, `TuningPageTabs.tsx` 지움) | 분야 목록(넓은 폭)·고르기 상자(휴대폰) |
| `apps/game/src/editor/tuning/TuningToolbar.tsx`(새) | 찾기·거르기 띠 |
| `apps/game/src/editor/tuning/TuningRow.tsx` | 표 줄 → 줄 목록 항목, 값 칸 바로 검사·키 |
| `apps/game/src/editor/tuning/TuningPendingBar.tsx`(새) | 담은 변경 막대(펼침·칸마다 담기 취소·모두 취소) |
| `apps/game/src/editor/tuning/tuningStorage.ts`(새) | 고른 분야·풀이 보기를 이 기기에 남김 |
| `apps/game/src/editor/tuning/tuningModel.ts`·`tuningModel.test.ts` | 질의(바꾼 것만·반영 범위·단위), 풀이 찾기·낱말 여럿, 분야별 바뀐 칸 수, 단위 목록, 입력 검사 `checkValueInput` |
| `apps/game/src/editor/tuning/tuningMessages.ts` | 반영 범위 거르기·단위 고르기 문구 표 |
| `apps/game/src/editor/tuning/tuningPanel.css`·`tuningRows.css`(새)·`tuningExtras.css`(새) | 틀·줄·곁 부품 CSS로 나눔(600줄 아래) |
| `apps/game/src/editor/tuning/TuningExtras.tsx` | 곁 부품 CSS 불러오기 |
| `apps/game/src/styles/tokens.css` | 개발 화면 층 `--dev-touch-tap`(24px, 터치 44px) |
| `apps/game/messages/ko.json`·`en.json` | 새 문구 23개, 바꾼 문구 7개(이끄는 글, 찾기 안내, [덮어쓰기 모두 지우기], [팩 값으로], [모두 취소], 분야 이름표 등) |
| `e2e/tuning.spec.ts` | 분야 고르기(휴대폰)·목록 키(데스크톱), 찾기·거르기, 값 칸 검사·막대, 키 흐름, 사진(390은 휴대폰 터치, 1440은 데스크톱 마우스 프리셋), 휴대폰 화면 안 44px |
| `docs/adr/2026-11-01-dev-settings-panel.md` | "바뀜 (2026-11-08 화면 개편)"(상태 줄은 그대로) |
| `docs/PLAN.md` | 14장 한 줄 |

## 함께 바꿔야 하는 파일
- 설정 칸 문구(`dev_tuning_*`)를 바꾸면 `e2e/tuning.spec.ts`의 `message(...)` 비교도 본다.
- `--dev-touch-tap`을 다른 개발 화면에서 쓰면 ADR `2026-11-02-dev-ui.md`에 적는다(지금은 이 패널만).

## 건드리지 말 것
- 서버 `tuning.*`·덮어쓰기 층·내보내기 형식(이번 개편은 화면만).
- 미리 캐시 규칙 `[Tt]uningPanel`·`src/editor/tuning/`(조각 이름 그대로).

## 미검증·TODO·알려진 문제
- 사진은 헤드리스 Chromium(390 터치 프리셋·1440 데스크톱). 실제 휴대폰은 미확인(Unknown).
- 480칸을 한 번에 그린다(가상 스크롤 없음). 찾는 글은 늦춰 거르지만 낮은 기기에서 분야 "전체"는 무거울 수 있다(Assumed, 재지 않음).
- 기준을 origin/main(c18ad1b)으로 둔 `pnpm check:content origin/main`은 이 가지에 없는 main 쪽 팩 바뀜(citizenship 칸 둘·core@56 판) 때문에 실패한다 — 이 가지는 팩을 건드리지 않았다. 바탕 07e08fa 기준으로는 통과.

## 검사
- `TEST_DATABASE_URL=… pnpm check`: 통과(vitest 543파일·4114시험 통과, 포맷·린트·타입·경계·크기·다국어·디자인 값·콘텐츠).
- `pnpm check:docs 07e08fa`·`pnpm check:content 07e08fa`: 통과. `pnpm check:docs origin/main`: 통과.
- `pnpm e2e e2e/tuning.spec.ts`: 32시험 통과(개편 뒤 첫 실행은 390px에서 [적용]·[×] 폭이 44px보다 좁아 4개 실패 → 화면 안 단추 최소 폭을 `--dev-touch-tap`으로 고쳐 통과). 사진: 개발 테마 둘(네온·라이트) × 390(휴대폰 터치)·1440(데스크톱) × 한국어·영어, 분야 8개마다, 담은 변경 막대 펼침, N43·N44 줄(`E2E_SHOTS_DIR`). 사진을 보고 고친 것: 휴대폰에서 칸이 화면 아래에서야 보이던 것(거르기 줄을 [거르기 N]으로 접고 분야 한 줄 풀이 숨김), ID를 이름 줄로 올려 줄 높이 줄임, "단위 단위 없음" 겹침, [Filters] 줄바꿈.

## 사용자 결정 대기
- 화면 개편을 사용자가 본 뒤 ADR 상태 확정(통합 담당).
