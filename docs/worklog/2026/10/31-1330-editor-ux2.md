# 행성 편집기: 적용 줄 자리 옮김, 누르는 조작은 바로 적용

- 일시: 2026-10-31 13:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-planet-editor-stage1.md`(38) "구현하며 정한 것 (WP-D)" 적용 단추의 "고침". 앞 작업 기록 `2026/10/31-1115-editor-ux.md`. 가지 `work/editor-ux2`(main `7bec7cb`에서)

## 한 일
사용자 두 번째 의견(2026-10-31, 원문은 ADR): "적용바 인터페이스 위치가 안좋다. 더 조정해야하는데 너무 가린다. 그리고 슬라이더만 적용버튼인거고 클릭메뉴는 적용버튼이 아니라 바로 적용하라(시드무작위나 3개중 고르는메뉴)".
- 적용 줄을 설정 판 아래 sticky에서 지구본 자리 맨 아래 한 줄로 옮겼다. 넓은 화면은 지구본·미니맵 아래, 휴대폰 세로는 아래 판 바로 위 띠. 슬라이더 목록 밖이라 가리지 않는다. 문구를 "적용 전 값 N개"로 줄였다.
- 슬라이더만 [적용]을 기다린다. 프리셋 단계, 시드 [무작위]·[바꾸기]·Enter, 슬라이더 [되돌리기]는 누르면 바로 적용한다. 적용 전 슬라이더 변경이 있으면 함께 적용한다(미리보기 한 번, 자동 저장 한 번). 시드 칸에 [바꾸기] 단추를 다시 두었다.
- 다른 큰 요청(이름 붙은 여러 행성, 태양계 샘플, 대륙 개념, 항성계, 은하 지도)은 하지 않았다(조정자가 사용자와 따로 계획).

## 검사·측정 (Verified, 이 가지에서 실행)
- `TEST_DATABASE_URL=… pnpm check` 통과: 시험 파일 200개·시험 1,913개.
- 편집기 화면 시험 11개 통과(1.4분). dev 시험: 슬라이더 → 적용 줄이 지구본 자리에 있고 판 안에는 없음 → [적용] → 새 F7·판. 슬라이더를 바꿔 둔 채 프리셋 [습윤] → 적용 줄 사라짐·새 F7·새 판·슬라이더 값 남음(함께 적용). 시드 [무작위] → 바로 새 F7·새 판.
- 전체 화면 시험 60개 통과(2.8분).
- `pnpm check:bundle`: 첫 화면 JS 127,075B / 상한 131,416B. 미리 캐시 61개 그대로, 편집기·생성기 모듈 없음. 편집기 조각 104,963 → 105,169B.
- 사진: `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/editor-ux2/shots/` — `planet-editor-*` 32장(390px 설정·적용 대기·평면·면적, 1440px 설정·적용 대기·면적·칸 × 파스텔·다크 × ko·en).
- 시험 DB(55432)가 또 꺼져 있어 같은 방법으로 다시 켰다(`pg_ctl -D /var/lib/postgresql/terra-test -o '-p 55432 -k /tmp -c listen_addresses=localhost' start`).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/editor/planet/EditorWorkspace.tsx` | 적용 줄을 지구본 자리 아래로, `commitEntry`(바로 적용, 적용 전 변경 함께) |
| `apps/game/src/editor/planet/SettingsPanel.tsx` | 누르는 조작 → `onCommit`, 슬라이더만 `onEdit`, 시드 [바꾸기]·Enter |
| `apps/game/src/editor/planet/planetEditor.css` | sticky 줄 지움, 한 줄 적용 줄 |
| `apps/game/messages/ko.json`·`en.json` | `planet_editor_pending`·`planet_editor_details_hint` 문구, `planet_editor_seed_set` 더함 |
| `e2e/planet-editor.spec.ts` | dev 시험(프리셋·시드 바로 적용, 함께 적용), 데스크톱 적용 대기 사진 |
| `docs/adr/2026-10-29-planet-editor-stage1.md` | WP-D 적용 단추 "고침" |

## 함께 바꿔야 하는 파일
- 새 설정 조작을 더하면 이어지는 값(슬라이더)은 `onEdit`, 누르는 조작은 `onCommit`으로 잇는다.

## 건드리지 말 것
- 미리보기 관리자·작업 줄(WP-C)은 그대로다.

## 미검증·TODO·알려진 문제
- 휴대폰 실기기에서 적용 띠 자리를 손으로 보지 않았다(헤드리스 390px만).

## 사용자 결정 대기
- 없음.
