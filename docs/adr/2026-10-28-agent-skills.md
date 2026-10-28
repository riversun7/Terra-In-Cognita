# AI 스킬 구성 (디자인 스킬 설치, 한국어 스킬)

- 상태: 확정
- 날짜: 2026-10-28
- 관련: PLAN 10.4, `2026-10-28-dev-workflow.md`, AGENTS.md 8장, `THIRD_PARTY_NOTICES.md`

## 배경
사용자는 웹 화면을 만들 때 디자인 스킬(frontend-design, ui-ux-pro-max, web-design-guidelines 등)을 최대한 쓰기를 원한다(2026-10-28 요청, 스크린샷 목록 포함). 새 저장소만 연 세션을 띄워 점검했더니 디자인·다국어·글쓰기 스킬이 하나도 없었다(Verified: 점검 세션의 스킬 목록). 그동안 보이던 1,300여 개 스킬은 기존 저장소(AntiGravt01)의 `.claude/skills`에 있던 외부 스킬 팩이다. 리부트는 "외부 스킬 팩을 저장소에 통째로 쌓지 않는다"를 원칙으로 했다(dev-workflow ADR 배경).

## 선택지
1. 기존 스킬 팩 1,333개를 통째로 복사
2. 필요한 것만 원본 저장소에서 복사해 커밋(고정 커밋)
3. 세션 시작 때 스크립트로 내려받기
4. 계정 플러그인에만 의존

## 결정
- 2번. 원본 저장소에서 스킬 폴더를 그대로 복사하고, 원본 커밋·라이선스를 `THIRD_PARTY_NOTICES.md`에 적는다.
  - 설치: frontend-design(Anthropic), ui-ux-pro-max, web-design-guidelines·react-best-practices(Vercel), impeccable, hallmark, taste-skill, Emil Kowalski 스킬 8개(emil-design-eng, animate, review-animations, animation-performance, find-animation-opportunities, improve-animations, animation-vocabulary, break-ui).
  - 한국어 전용 스킬은 원본이 없어 직접 썼다: `korean-writing`(쉬운 말, 확인 표기, 화면 문구 말투).
- Antigravity는 `.agent/skills` → `../.claude/skills` 링크로 같은 폴더를 읽는다.
- 사용 순서와 안전 규칙(훅 설치·실행 파일 다운로드·새 의존성)은 AGENTS.md 8장에 둔다.
- 설치하지 않은 것(사용자 스크린샷 목록 중):
  - Open Design: 별도 앱·데몬이고, 위 스킬과 기능이 겹친다.
  - Google Stitch: 구글 계정과 MCP 서버 설정이 필요하다. 필요해지면 따로 붙인다.
  - Claude Motion: claude.ai 안의 기능이라 저장소에 설치하는 형태가 아니다.
  - Remotion, HyperFrames, Opus 5.5 Videos: 영상 제작용이라 게임 화면과 관계없다. 홍보 영상을 만들 때 다시 본다.
  - React Bits: 컴포넌트 모음(웹사이트·라이브러리)이지 스킬이 아니다. 쓸 때 라이선스를 확인하고 필요한 것만 가져오며, 새 의존성이면 ADR을 쓴다.
  - Keyframe Gallery: 참고용 웹사이트.

## 이유
- 1번은 오래되거나 출처가 불분명한 내용이 섞이고(기존 팩의 개별 스킬 대부분에 라이선스 표시가 없음, Verified), 지금 쓰는 최신 버전(TS 7, Vite 8, Zod 4)과 어긋나는 조언을 줄 수 있다.
- 2번은 출처·라이선스가 분명하고 커밋이 고정돼 재현된다. 복사본이 원본과 같음을 비교로 확인했다(Verified: `diff -r`).
- 3번은 세션마다 네트워크가 필요하고, 받을 때마다 내용이 바뀔 수 있다.
- 4번은 세션마다 다르다. 계정 플러그인(frontend-design 등)은 이 세션에서는 보였지만 점검 세션에서는 보이지 않았다(Verified, 원인 Unknown).
- 같은 일을 하는 디자인 엔진이 여럿이면 지시가 충돌한다 → 기본 엔진을 `ui-ux-pro-max` 하나로 정하고, 나머지는 쓰는 때를 정했다.

## 결과
- 저장소가 약 17MB 커진다(대부분 ui-ux-pro-max·hallmark·taste-skill의 데이터와 예시 이미지).
- 외부 스킬 폴더는 검사 도구(포맷, 파일 크기)에서 뺀다. 비밀값 검사는 그대로 받는다.
- 일부 스킬은 실행 시 스크립트를 쓴다(ui-ux-pro-max는 `python3`, impeccable은 첫 실행에 GitHub에서 실행 파일을 받아 체크섬 확인, hallmark·taste-skill은 Node 스크립트). 훅 설치·설정 변경은 사용자 승인 뒤에만 한다.
- 갱신: 원본 저장소의 새 커밋에서 폴더를 다시 복사하고 `THIRD_PARTY_NOTICES.md`의 커밋을 바꾼 뒤 작업 기록을 남긴다.
