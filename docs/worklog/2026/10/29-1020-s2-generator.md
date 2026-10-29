# S2 행성 생성기 1판: 결정적 수학·투영, 행성·바이옴 콘텐츠, `generatePlanet`, 벤치마크·그림

- 일시: 2026-10-29 10:20 (KST)
- 작업 도구: Claude Code
- 가지: `worktree-wf_855dd1b7-352-1`(작업 트리, main `1c566bf` 위, 서브에이전트)
- 관련: ADR `2026-10-29-s2-planet-lod.md`(36, 제안 — "구현하며 정한 것 (생성기)"를 더함), `2026-10-28-planet-generation-order.md`(31), `2026-10-28-planet-generation-and-versioning.md`(10), `2026-10-29-cell-key-layout.md`(34), PLAN 5.5, 기획 D-154. 커밋 `8973ed2` `f268760` `a9049ee` `c95c492` `126a84e` `2ac9e84` `9824fad`과 이 기록의 문서 커밋
- S2는 네 에이전트가 함께 했다(생성기 = 이 작업, 타일·서버 굽기, LOD 렌더러, WebGPU 측정). 이 작업은 `apps/**`, `packages/protocol`, `packages/engine`, `packages/sim`, `packages/planet/src/tiles/`를 건드리지 않았다. 다른 작업과 만나는 곳은 `PlanetFields` 모양뿐이다.

## 한 일
1. 결정적 수학 `packages/shared/src/detMath.ts`(`8973ed2`, `a9049ee`)
   - `detSin`·`detCos`·`detTan`·`detAtan`·`detAtan2`·`detAsin`·`detExp`. 사칙연산과 명세가 정한 `Math` 함수(`sqrt`·`floor`·`round`·`abs`·`min`·`max` 등)만 쓴다.
   - 인수 줄이기(Cody–Waite: π/2 세 조각, ln 2 두 조각) + 테일러 다항식. atan은 m/8 값 표 + 급수. 상수는 Python decimal 90자리로 계산했다.
   - 오차는 4배 정밀도 C(gcc quadmath)로 만든 기준과 따로 쟀다(스크래치 도구, 저장소에 넣지 않음). 결과는 아래 표.
   - 시험 11개(`detMath.test.ts`): 넓은 범위를 촘촘히 돌며 엔진 `Math`와 비교(엔진 자체 오차 1ulp를 더한 상한), 특수값(±0·±∞·NaN), `atan2`의 명세 경우(`Object.is`로 −0까지), 골든 비트(함수마다 점 4개의 16진수 비트).
2. 결정적 투영(`f268760`)
   - `packages/planet/src/projection.ts`가 `detTan`·`detAtan`을 쓴다. API는 그대로이고 기존 시험이 그대로 통과한다. 투영을 쓰는 곳은 아직 패키지 밖에 없다(Verified: grep).
   - `scripts/check-boundaries.mjs`: 투영 예외를 지우고 `**` 연산자 검사를 더했다(주석 줄 제외). 시험 파일과 시험 도우미(`test`로 시작하는 파일: `testOracle.ts`·`testFixtures.ts`)는 뺀다. 일부러 `Math.tan`과 `2 ** 3`을 넣은 파일로 검사가 실패하는 것을 보고 지웠다(Verified).
   - AGENTS.md 4장 두 줄(투영 진입점, 판정 코드 규칙에 `**`와 `det*` 함수).
3. 콘텐츠 팩 `planets`·`biomes`(`c95c492`)
   - 공용 어휘 `packages/shared/src/planetDefinition.ts`: 프리셋 축·단계(D-154), 세부 수치 13개의 이름·정수 범위, 수심 등급, 바이옴 규칙 종류, 생성기 면 레벨(4~10). 콘텐츠 스키마와 생성기가 같은 이름을 쓴다(둘은 서로를 가져올 수 없다).
   - 스키마 `packages/content/src/schema/planets.ts`: 행성(면 레벨·시드·프리셋 6축 필수·덮어쓰기·바이옴 참조 목록)과 바이옴(이름·색·숲 밀도·규칙). 같은 바이옴 두 번, 극 기온 > 적도 기온, 범위 min ≥ max는 오류다. 시험 8개(`validate/planets.test.ts`).
   - z.enum 값이 빠졌을 때 한국어 문구를 "값이 없습니다. 꼭 적어야 하는 필드입니다(허용: …)"로 고쳤다(`common.ts`).
   - 팩 자료: S2 시험 행성(`s2_test_planet`, 면 레벨 9, 시드 20261029, 모두 보통)과 바이옴 14개. 팩 버전 1 → 2, 모두 `placeholder: true`.
4. 생성기 1판 `packages/planet/src/generator/`(`126a84e`, `9824fad`) — 진입점 `@terra/planet/generator`
   - 단계(ADR 31 순서): 격자 → 판 구조(무늬 공간 회전, 흔든 구면 보로노이, 대륙 지각, 경계 수렴·발산 × 지각 종류로 충돌·안데스·해구·섬 호·열곡, 해령 깊이, 열점 사슬, fBm·능선 노이즈) → 해수면(면적 백분위, 꼭짓점 바다) → Priority-Flood → 기후 → 유출·침식 3번·물 수지·강 → 수심·습도·바이옴·숲 → 해시.
   - 출력 `PlanetFields`는 ADR 36 모양 그대로다. 정한 세부(물 비트, 해시 바이트 순서 등)는 ADR 36 "구현하며 정한 것 (생성기)".
   - 프리셋 → 세부 수치(`resolvePlanetSettings`), JSON·팩 정의 읽기(`planetInputFromDefinition`). 팩 검증 결과(바이옴 참조가 `ContentRef`)도 받는다(`9824fad`).
   - 시험 28개(+ 고친 뒤 1개): 골든 해시 3개, 결정성(두 번 생성 바이트 비교), 메타, 바다 비율(프리셋 3개 ±3%p), 강은 내리막이고 바다·호수·마른 분지에서 끝남, 하천 등급은 하류로 줄지 않음, 바이옴 재판정, 물 비트, 꼭짓점 24칸 바다(시드 여러 개), 기온 띠, 프리셋 방향(추움·건조·젊은 산), F5·F6 육지 일치, 입력 검사, JSON 정의 오류, 팩 행성.
   - 그림을 보며 고친 것: 꼭짓점의 둥근 구멍(무늬 공간 회전 + 살짝 누르기), 넓은 대륙붕, 마른 적도 내륙(열대 습기 되살림·대류 비), 바람길 줄무늬(습기 흐림), 산맥이 끊기는 선(경계 지형 섞기), 끊김 없는 섬 호(노이즈로 쪼개기), 너무 많은 호수(깊이 35m·면적 3,000km² 문턱), 계단 무늬 언덕 그림자(칸마다 계산).
   - `tectonics.ts`가 600줄을 넘어 `plates.ts`·`boundaries.ts`·`hotspots.ts`로 나눴다. 나눈 뒤 골든 해시가 같다(Verified).
5. 벤치마크·그림 `packages/planet/bench/`(`2ac9e84`): `pnpm --filter @terra/planet bench [면 레벨 …]`, `pnpm --filter @terra/planet render <출력 폴더> [면 레벨] [시드]`. PNG는 의존성 없이 만든다(`node:zlib`). `pnpm test`에는 넣지 않았다.
6. 문서: ADR 36에 "구현하며 정한 것 (생성기)", PROTECTED(생성기·결정적 수학 행), AGENTS.md 6장(결정적 계산 확인 사항)·7장(명령 2개), `planetDefinition.ts`의 면 레벨 상한 주석을 잰 값으로.

## 잰 수치

### 결정적 수학 최대 오차 (Verified: 함수마다 무작위 점 4~8만 개, 4배 정밀도 기준)
| 함수 | 범위 | 최대 오차 |
|---|---|---|
| `detSin`·`detCos` | \|x\| ≤ 100 | 1ulp |
| `detAtan` | 모든 실수 | 1ulp |
| `detExp` | [−700, 700] | 1ulp |
| `detAsin`·`detAtan2` | 모든 범위 | 2ulp |
| `detTan` | \|x\| ≤ π/4 / \|x\| ≤ 20(극 근처 \|cos x\| < 1e-3 제외) | 2ulp / 3ulp |
| (참고) Node 24.22.1 `Math.*` | 같은 점 | 1ulp |

### 생성 시간·메모리 (Verified: 이 컨테이너 4코어 공유, Node 24.22.1, S2 시험 행성 정의, `pnpm --filter @terra/planet bench 6 7 9`와 `… bench 10`)
| 단계(ms) | F6 | F7 | F9 | F10 |
|---|---|---|---|---|
| grid | 11 | 17 | 56 | 192 |
| tectonics | 227 | 732 | 8,878 | 38,055 |
| seaLevel | 21 | 33 | 173 | 822 |
| flowDirections | 13 | 26 | 256 | 1,338 |
| climate | 71 | 180 | 1,685 | 7,954 |
| erosion | 25 | 70 | 1,032 | 4,784 |
| hydrology | 2 | 6 | 67 | 276 |
| surface | 22 | 42 | 389 | 1,516 |
| hash | 6 | 11 | 34 | 117 |
| **합계** | **0.40초** | **1.12초** | **12.57초** | **55.05초** |
| 최대 RSS | 100MiB | 123MiB | 300MiB | 771MiB |
| 결과 해시 | `e04b0413` | `10330ff7` | `07cb630b` | `c93cc0b1` |
- 목표(F9 1분보다 훨씬 짧게, F6·F7 1~2초 이하)를 지킨다. 판 구조가 약 70%다. 공유 CPU라 값은 ±10% 정도 흔들린다(F6 0.40·0.45초, F9 12.1~13.0초).
- 그림 스크립트가 잰 생성 시간(그림 그리기 제외): F7 1.2초, F9 13.0초.

### 생성 결과 요약 (Verified: `render` 출력, S2 시험 행성)
| | F7 | F9 |
|---|---|---|
| 육지(칸 수 기준, 목표는 면적 30%) | 29.7% | 29.7% |
| 호수 / 강 칸 / 마른 분지 | 1.1% / 2.7% / 0.5% | 1.4% / 0.5% / 0.5% |
| 최대 하천 등급 | 4 | 4 |
| 고도(게임 m, 실제 환산) | −888 ~ 793 (−10.7 ~ 9.5km) | −890 ~ 830 (−10.7 ~ 10.0km) |
| 바이옴(바다 3종 합 / 빙상 / 툰드라 / 타이가 / 온대림 / 초지 / 사막 / 사바나 / 열대우림) | 70.4 / 3.7 / 3.8 / 5.2 / 2.1 / 4.2 / 2.5 / 3.5 / 2.6% | 70.3 / 3.5 / 3.7 / 5.4 / 1.8 / 4.3 / 2.6 / 4.9 / 1.3% |
- 시드 1·42(F7)도 그려 봤다. 육지 30.4%·29.4%, 꼭짓점은 모두 바다다.
- 눈으로 본 것(Assumed: 사람 판단): 대륙 서너 개와 섬들, 수렴 경계를 따라 산맥, 바다에 해령·해구, 열점 사슬, 극 빙상, 아열대 내륙 사막, 열대 해안 우림, 고위도 타이가·툰드라. F7과 F9의 대륙·산맥 배치가 같다. 면 경계 이음새는 보이지 않았다. 바다 위 강수는 위도 띠가 뚜렷하다(단순 기후 모형).
- 그림 위치(저장소 밖): `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/s2-gen/final-f7/`, `…/final-f9/`, `…/final-seed1-f7/`, `…/final-seed42-f7/`. 면마다 `face{0~5}-{elevation,biome,temperature}.png`, 전체 `equirect-{elevation,biome,temperature,precipitation,humidity}.png`.

## 확인 (Verified: 이 작업 트리, Node 24.22.1, pnpm 11.28.9)
| 명령 | 결과 |
|---|---|
| `pnpm install --frozen-lockfile` | 통과(Already up to date). 잠금 파일은 `packages/planet`·`packages/content`에 `@terra/shared` 작업공간 의존만 늘었다 |
| `pnpm --filter @terra/game typecheck` | 통과 |
| `pnpm check` | 통과. 시험 파일 86개(81 통과·5 건너뜀), 시험 683개 통과·39개 건너뜀(DB 시험). 콘텐츠 `core@2 (14495d30db2e)`. 이 뒤 시험 1개를 더했다(아래 줄) |
| `TEST_DATABASE_URL=postgres://…@127.0.0.1:55432/… pnpm test` (일회용 로컬 DB) | 723개 모두 통과 |
| `pnpm --filter @terra/planet bench 5 6`, `pnpm --filter @terra/planet render <폴더> 5` | 둘 다 동작. F5·F6 해시가 골든 값(`3321d859`·`e04b0413`)과 같다 = 팩 정의 → 생성기 입력이 시험 자료와 같다 |
| `git merge-tree --write-tree origin/main HEAD` (origin/main `577f74d`, 이 가지 `9824fad`) | 충돌 없음. 문서 커밋 뒤 다시 본 결과는 최종 보고에 적는다 |
| `node scripts/check-docs.mjs origin/main`, `pnpm docs:index --check`, `pnpm check:content origin/main` | 문서 커밋 뒤 실행(결과는 최종 보고) |

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/detMath.ts`·`detMath.test.ts`(새), `src/index.ts` | 결정적 수학 함수와 시험 |
| `packages/shared/src/planetDefinition.ts`(새) | 행성 정의 어휘(콘텐츠·생성기 공용) |
| `packages/planet/src/projection.ts` | 결정적 투영 |
| `scripts/check-boundaries.mjs` | 투영 예외 삭제, `**` 검사, 시험 도우미 제외 |
| `packages/content/src/schema/planets.ts`(새), `categories.ts`, `index.ts`, `common.ts`, `validate/planets.test.ts`(새), `package.json` | `planets`·`biomes` 분류, 한국어 오류 문구, `@terra/shared` 의존 |
| `content/core/planets.json`·`biomes.json`(새), `manifest.json` | S2 시험 행성, 바이옴 표 1판, 팩 버전 2 |
| `packages/planet/src/generator/*`(새, 25개) | 생성기 1판과 시험 |
| `packages/planet/package.json` | 진입점 `./generator`, `@terra/shared` 의존, `bench`·`render` 명령, typecheck에 `bench/` |
| `packages/planet/bench/*`(새) | 벤치마크·그림 스크립트 |
| `pnpm-lock.yaml` | 작업공간 의존 2줄 |
| `THIRD_PARTY_NOTICES.md` | lowbias32 위치에 `generator/random.ts` 추가 |
| `docs/adr/2026-10-29-s2-planet-lod.md`, `docs/PROTECTED.md`, `AGENTS.md`, 이 기록, `docs/WORKLOG.md`(자동) | 결정·보호 규칙·명령·확인 사항 |

## 함께 바꿔야 하는 파일
- 생성 결과가 한 칸이라도 바뀌면: `generator/version.ts`의 `GENERATOR_VERSION`, `generate.test.ts` 골든 해시 3개, ADR 36 기록. `detMath.ts` 값이 바뀌어도 같다(PROTECTED).
- `PlanetFields` 모양(필드·비트·순서)을 바꾸면: `generator/types.ts`, `hash.ts`(바이트 순서), 골든 해시, 타일 굽기(`packages/planet/src/tiles/`, 다른 에이전트)와 `packages/protocol` 타일 형식, ADR 36.
- 프리셋 축·단계·세부 수치 이름·범위를 바꾸면: `packages/shared/src/planetDefinition.ts`, `generator/presets.ts`(`PLANET_PRESET_VALUES`), `packages/content/src/schema/planets.ts`, `content/core/planets.json`(팩 버전), 시험.
- `content/core/biomes.json`·`planets.json`을 바꾸면: 팩 `manifest.json` 버전, `generator/testFixtures.ts`의 `TEST_BIOMES`(같은지 시험이 본다). 바이옴 번호 = 행성 `biomes` 순서라 순서를 바꾸면 범례가 바뀐다.
- 서버 굽기(다른 에이전트): `planetInputFromDefinition(pack.entries.get("planets")의 항목, pack.entries.get("biomes") ?? [])` → `generatePlanet(input)`. 캐시 키는 (정의 해시, `GENERATOR_VERSION`)다. 강을 선으로 그리려면 `runPlanetGenerator(input).receiver`가 있다(`PlanetFields`에는 없다).
- 새로 쓰는 쪽이 `@terra/planet/generator`를 가져오려면 그 앱 `package.json`에 `@terra/planet`이 있어야 한다(서버는 이미 있다. Dockerfile도 `packages/planet/package.json`을 이미 복사한다).

## 건드리지 말 것
- `detMath.ts`의 상수·계수·식 순서. 한 비트라도 바뀌면 모든 생성 결과가 바뀐다(골든 비트 시험이 막는다).
- 생성기의 반복 순서(면 0~5, 행 j, 열 i), 난수 단계 번호(`random.ts` `STREAM_*`), 해시 바이트 순서, 동점 규칙(`MinHeap`은 (키, 칸 번호)).
- `content/core/planets.json`의 `s2_test_planet` 시드·바이옴 순서(다른 에이전트의 타일·렌더러 시험이 이 행성을 쓸 수 있다).
- `packages/planet/src/tiles/`는 타일·서버 에이전트 몫이다.

## 미검증·TODO·알려진 문제
- 브라우저 엔진에서 같은 해시가 나오는지 돌려 보지 않았다(Assumed: 명세상 같다). 편집기 미리보기를 만들 때 브라우저에서 골든 해시를 한 번 본다.
- F9 12.6초 중 판 구조가 8.9초다. 칸마다 독립이라 면별 워커 병렬화가 쉽다(Assumed, 미실행). F10은 55초·771MiB라 상한으로 뒀다.
- 기후는 침식 전 고도로 한 번만 계산한다(ADR 31 순서). 침식으로 낮아진 산의 기온은 다시 계산하지 않는다.
- 바다 위 강수는 위도 띠 + 바람길 습기라 띠가 뚜렷하다. 계절·해류가 없는 단순 모형이다(S2 범위).
- 강은 칸 하나 폭이라 강 칸 비율은 해상도마다 다르다(F7 2.7%, F9 0.5%). 같은 유량 문턱이라 큰 강은 같은 곳에 생긴다(Assumed, 그림으로만 봄).
- 강 주변 습도 가산 때문에 건조 지역 강을 따라 열대우림·숲 띠가 생긴다(일부러 둔 것: 강가 숲).
- `**` 검사는 줄 단위 정규식이다. 문자열 안의 `**`도 잡고, 줄을 넘겨 쓴 `a\n** b`는 놓친다.
- 로그·거듭제곱 결정적 함수는 아직 없다. sin·cos·tan의 인수 줄이기는 |x| ≤ 약 1e6까지만 정확하다.
- 프리셋 단계별 수치·바이옴 범위·고도 1:12는 임시값이다(기획 확인 전).

## 사용자 결정 대기
- 기획 세션에 물을 것(ADR 36 그대로): 바이옴 목록과 기온·습도 범위, 고도 축척 1:12, 프리셋 단계별 수치. 판 개수 축 단계 이름(적음·보통·많음)은 여기서 정했다.
- 메인 세션이 정할 것: 행성 면 레벨 상한 10(ADR 36은 4~14, 격자 계약은 그대로)을 PLAN 5.2에 적을지, 흐름 방향을 `PlanetFields`에 넣을지(타일 쪽과 함께).
