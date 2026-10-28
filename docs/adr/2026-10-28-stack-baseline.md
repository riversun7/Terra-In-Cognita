# 기술스택 기준선과 버전 정책

- 상태: 확정
- 날짜: 2026-10-28
- 관련: PLAN 3장, `docs/research/2026-10-27-stack-versions.md`

## 배경
모바일 웹 우선, 게임엔진급 3D 지도, 빠른 반응, HTS급 거래창, 1인 + AI 에이전트 개발. 기존 스택(Next.js + Express + raw pg + PixiJS)은 서버 렌더링 계층의 혼선, 타입 부재, 맵 연산 문제가 있었다.

## 선택지 (계층별 주요 대안)
- 클라이언트 골격: Next.js / **Vite + React SPA**
- 3D: Babylon.js, PlayCanvas, Unity·Godot 웹 빌드 / **Three.js(React와 분리된 엔진 모듈)**
- 서버: Express, Hono, NestJS / **Fastify 5**
- API 타입 공유: oRPC, ts-rest(아카이브됨) / **tRPC 11 + Zod 4**
- DB 접근: Prisma, Kysely, raw SQL / **Drizzle ORM(1.0 RC)**
- 인증: Lucia(지원 중단), Auth.js(유지보수 모드) / **Better Auth**
- 런타임: Bun, Deno / **Node.js(24 LTS → 26 LTS)**
- 린트·포맷: ESLint 9(지원 종료), Biome 단독 / **oxlint + tsgolint(린트) + Biome(포맷)**

## 결정
PLAN 3장 표의 스택과 버전을 기준선으로 한다. 모든 의존성 버전은 정확히 고정하고, 새 런타임 의존성은 ADR을 쓴다.

## 이유
- 게임 클라이언트는 서버 렌더링이 필요 없다. Vite SPA가 가장 단순하다.
- Three.js는 생태계와 AI 학습량이 가장 크다. 성능 핵심 경로를 React 재렌더링에서 떼어내려고 엔진을 분리한다.
- tRPC는 서버 API 변경을 클라이언트 컴파일 오류로 알려준다. AI 실수를 막는 효과가 크다.
- oxlint의 타입 인식 린트는 TS 7과 같은 타입 검사기를 쓴다. Biome의 빠뜨린-await 검사는 아직 다듬는 중이다(Verified: Biome v2 블로그).
- 버전·상태는 2026-10-27~28 npm 레지스트리와 공식 문서로 확인했다(Verified).

## 결과
- TS 7, Vite 8, Zod 4, tRPC 11, Drizzle 1.0은 AI 학습 데이터보다 새롭다 → AGENTS.md 6장에 확인된 차이만 적고 갱신한다.
- Zod 4와 tRPC 11의 연동은 Standard Schema 경유로 동작할 것으로 예상한다(Assumed) → 골격 작성 시 확인한다.
