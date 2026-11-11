# 묶음 합치기: 시작 국가 설정 편집기·편집기 입력 도구·남의 유닛 누르기 2

- 일시: 2026-11-11 09:30 (KST)
- 작업 도구: Claude Code
- 관련: 작업 기록 `10-2350-nation-editor.md`, `10-2230-editor-inputs.md`, `10-2230-map-tap-2.md`, ADR `2026-11-10-nation-editor.md`·`2026-11-10-editor-input-controls.md`·`2026-11-07-unit-control.md` "바뀜 (2026-11-10)"

## 한 일
- 세 줄기를 main 6bb226d 위에 합쳤다: nation-editor(팩 core@61, 마이그레이션 `20261110123352_nation_editor`) → editor-inputs → map-tap-2. 코드 충돌 없음. `docs/PLAN.md` 14장 표 한 줄 충돌은 두 줄 모두 남겼다.
- 합친 뒤 `e2e/government.spec.ts`가 실패했다: 시험이 옛 지도자 이름("임시 지도자 N")의 "지도자" 글자를 찾았다. 팩 이름이 가상 이름으로 바뀌어서다(nation-editor). 시험이 받은 지도자 이름과 견주게 고쳤다(앱은 그대로).

## 검사 결과 (**Verified**)
- 합친 끝(6155c39): `pnpm check`(DB 시험 포함) 시험 4,475개, `check:docs`·`check:content`·빌드·`check-pwa`·`check:bundle`(108,084 B / 131,416 B) 통과.
- 화면 시험 dev·nations·unit-control·play-map·government·gather-tiers·tuning·buildings·creatures·items: 194개 중 193 통과, 실패 1(위 government 시험) → 고친 뒤 government 8개 통과.
- unit-control 21개가 한 실행에서 모두 통과했다(줄기 단계에서는 한 번에 모두 통과한 실행이 없었다).

## 함께 바꿔야 하는 파일
- 팩 국가 이름을 바꾸면 그 이름을 글자로 찾는 시험이 깨진다(이번 government 시험). 시험은 받은 값과 견준다.

## 미검증·TODO·알려진 문제
- 실제 휴대폰에서 보지 않았다: 남의 유닛 누르기(몸통 6px 여유·최소 14px), 입력 도구의 터치 끌기, 화폐 기호 16개 글꼴.
- NAS 세계의 NPC 국가 이름은 `/dev/nations` [이 세계의 NPC 국가에 반영]을 눌러야 바뀐다.
- `apps/server/src/app.ts` 984줄(상한 1,000). 다음에 나눈다.
- `e2e/dev.spec.ts` "플레이어 … 권한 없음"이 줄기 실행에서 가끔 실패했다(합친 실행에서는 통과). 원인 Unknown.

## 사용자 결정 대기
- 질문 901~915(`docs/questions/2026-11-10-nation-editor.md`): 903 NPC 사이보그·유닛 수, 905 플레이어 마크 올리기, 909 NAS 이름 반영 방법.
- 입력 도구: `/dev/tuning` ↑↓ = 값 바꾸기, 범위 밖 값 맞춰 담기, 슬라이더 줄 기본 켬.
