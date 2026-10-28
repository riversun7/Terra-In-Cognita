# 행성 격자 계약 구현: `@terra/planet` 셀 키·힐베르트 순서·면 경계·이웃·꼭짓점·탄젠트 투영

- 일시: 2026-10-29 00:05 (KST)
- 작업 도구: Claude Code (서브에이전트, 작업 트리)
- 관련: ADR `2026-10-28-planet-grid-contract.md`(확정), PLAN 5.2, ADR `2026-10-28-planet-generation-and-versioning.md`·`2026-10-28-planet-generation-order.md`(생성기는 아직 없음), DECISION_LOG Round 4·5·7·9, 커밋 `244f0e2`
- 10월 28일에 시작해 29일 0시를 넘겨 끝났다. 그래서 파일 이름 날짜가 29일이다.

## 한 일
- 새 패키지 `packages/planet`(`@terra/planet`)을 만들었다. 의존성이 없다(외부·내부 모두).
  - `@terra/planet`: 정수 연산만 쓴다. 셀 키, 계층, 이웃, 면 경계 변환표, 꼭짓점, 레벨 상수.
  - `@terra/planet/projection`: 실수 투영이다. 표시·생성 전용이다(`Math.tan`·`Math.atan`). 판정 코드에서 쓰지 않는다. 진입점을 나눠서 판정 쪽이 실수로 들여오지 않게 했다.
- 셀 키 비트 배치(52비트, 위 → 아래): `[면 3비트][힐베르트 위치 44비트][레벨 5비트]`
  - 키 = 면 × 2^49 + 힐베르트 번호 × 2^(49 − 2·레벨) + 레벨.
  - 최대 레벨은 22다. 가장 큰 키는 6 × 2^49 − 10 = 3,377,699,720,527,862(2^52 미만)다. 레벨 23은 54비트가 필요해서 안 들어간다.
  - 레벨을 맨 아래에 둔 이유: 칸 하나와 그 모든 하위 칸(어느 레벨이든)이 연속한 키 구간 하나에 들어간다(`cellKeyRange`). 레벨이 섞인 표에서도 지역 하나를 `BETWEEN min AND max` 한 번으로 고른다. 같은 레벨 안에서는 키 순서가 면 순서 다음 힐베르트 순서다.
  - ADR의 세 부분(면 3비트, 레벨 5비트, 힐베르트 순서)은 그대로 있다. 놓는 순서만 정했다.
  - 행성 ID는 키에 넣지 않았다. 전체 ID = (행성 ID, 셀 키) 쌍이다. 키가 52비트를 다 써서 행성 ID를 넣을 자리가 없다.
  - 키는 2^52 미만이라 DB `int8` 열을 JS 숫자로 읽어도 정확하다.
- 면 배치와 힐베르트 방향은 S2와 같다(S2 라이브러리는 쓰지 않았다).
  - 면 0 = +x, 1 = +y, 2 = +z, 3 = −x, 4 = −y, 5 = −z. 면 위 점은 차례로 (1, u, v), (−u, 1, v), (−u, −v, 1), (−1, −v, −u), (v, −1, −u), (v, u, −1)이다.
  - 짝수 면은 기본 방향, 홀수 면은 i·j 축을 바꿔 시작한다. 그래서 곡선이 면 0 → 1 → … → 5 → 0으로 끊기지 않는다(시험으로 확인). 면마다 곡선은 (0, 0)에서 시작한다. 짝수 면은 (n−1, 0), 홀수 면은 (0, n−1)에서 끝난다.
- 면 경계 좌표 변환표 `FACE_EDGE_LINKS`(모서리 12개 × 양쪽 = 24칸)를 면 식에서 손으로 풀어 적었다. `wrapFaceIJ`가 이 표로 면 밖 좌표를 이웃 면 좌표로 옮긴다(가장자리 너머 한 면 폭까지).
- 이웃: `neighbors4`(순서 i−1, i+1, j−1, j+1), `neighbors8`, `stepCell`. 꼭짓점에 닿은 칸은 꼭짓점 쪽 대각선 칸이 없어서 8이웃이 7칸이다. 레벨 0은 4칸이다.
- 꼭짓점 8곳: `CUBE_CORNERS`(번호 = 축 부호 비트, 만나는 면 3개와 면별 위치), `cubeCornerCells`(레벨별 꼭짓점 칸 3개), `cubeCornersOfCell`. 행성 회전과 바다 처리는 생성기 일이라 하지 않았다.
- 레벨: 지구 면 레벨 9, 1차맵 5단계(레벨 5~9, 면당 32~512칸), 지형 레벨 16(최소 칸 하나 = 128×128), 배치 레벨 17(256×256). 면 레벨은 4~14만 받는다. `planetLevels(면 레벨)`, 2차맵 칸 좌표는 `descendantAt`·`offsetInAncestor`.
- 투영: `stToUV`·`uvToST`(탄젠트), `faceUVToXYZ`·`xyzToFaceUV`, `cellCenter`·`cellCorners`(밖에서 볼 때 반시계)·`xyzToCell`, 칸 면적(입체각 식), `cellSizeMeters`, `averageCellEdgeMeters`, `planetRadiusMeters`(지구 반지름 ÷ 12 × 2^(면 레벨 − 9)).
- 시험은 `tdd` 스킬로 면 경계·꼭짓점부터 썼다. 7개 파일, 57개다.
  - 독립 기준 `src/testOracle.ts`: S2 면 식을 정수 격자점으로 옮겨, 칸 꼭짓점이 3D에서 같은 점인지로 이웃을 판정한다. 구현의 변환표를 쓰지 않는다.
  - 다룬 것: 레벨 0~5(일부 0~6) 모든 면 전수 — 키 왕복, 힐베르트 일대일·이어지는 번호는 변 공유·면 사이 연속, 4·8이웃 = 기하 기준, 이웃 대칭, 꼭짓점 칸(7이웃), 부모·자식, 키 구간(지역 레벨 0~3 × 키 레벨 0~5). 레벨 22 경계·꼭짓점 표본, 가장 큰 키 ≤ `Number.MAX_SAFE_INTEGER`, 비트 배치 골든 값.
  - 투영 시험: S2 면 식, 왕복, 칸 중심이 그 칸에 들어감, 면을 넘는 이웃도 3D에서 꼭짓점 공유, 이웃 중심 거리 ≈ 칸 크기, 면적 합 = 4π, 면적 비, 지구 수치.
  - 시험이 틀린 코드를 잡는지 세 번 바꿔 봤다(변환표 뒤집힘 하나, 힐베르트 방향표, 면 시작 방향). 매번 시험 2개가 실패했고, 코드는 되돌렸다.
- 병합(메인 세션, 2026-10-29): main(2e6cc3b, sim 병합 뒤) 위로 다시 쌓았다. 충돌은 목차뿐이라 다시 만들었고, 잠금 파일은 저절로 합쳐졌다.
  - 키 배치를 ADR 34(`docs/adr/2026-10-29-cell-key-layout.md`)로 남겼다. PLAN 5.2(ID 행·잰 값)와 13장 표, PROTECTED(격자 계약), AGENTS 4장(정수·투영 진입점)을 고쳤다.
  - `scripts/check-boundaries.mjs`의 결정성 검사를 `packages/planet/src`까지 넓혔다(`projection.ts`와 시험 파일은 뺀다). 일부러 `Math.sin`을 넣어 검사가 실패하는 것을 보고 되돌렸다(Verified).

## 잰 수치와 ADR (Verified: 패키지 코드와 따로 쓴 계산이 같은 값)
| 항목 | ADR·PLAN | 잰 값 |
|---|---|---|
| 같은 레벨 칸 면적 최대/최소 (탄젠트) | 약 1.4배 | 레벨 5: 1.380, 레벨 6: 1.397, 레벨 9: 1.412 (극한 √2 ≈ 1.414) |
| 같은 값, 기본 이차 투영(참고) | 약 2.1배 | 레벨 9: 2.087 |
| 지구 반지름 | 약 531km | 530.917km (6,371.0088km ÷ 12) |
| 1차맵 최소 칸(레벨 9) 평균 | 약 1.5km | 1,500.7m, 위치별 1,370.7~1,628.8m |
| 지형 칸(레벨 16) 평균 | 약 11.7m | 11.72m, 위치별 약 10.7~12.7m |
| 배치 칸(레벨 17) 평균 | 약 5.9m | 5.86m, 위치별 약 5.35~6.36m |
| 칸 크기(√면적)의 위치 차 | 약 ±10% [A] | 평균의 0.913~1.085배 |
| 칸 모양 | — | 면 가장자리 가운데 칸은 약 1.4 : 1 직사각형(레벨 6에서 1.397), 꼭짓점 가까이는 마름모꼴 |
| 4이웃 중심 거리 ÷ 평균 칸 변 (레벨 6) | — | 면 안 0.777~1.085, 면 경계 0.890~1.085 |

## 확인 (Verified: 이 컨테이너, Node 24.22.1, pnpm 11.28.9)
| 명령 | 결과 |
|---|---|
| `pnpm install` | 통과. 잠금 파일에 `packages/planet: {}` 항목만 늘었다 |
| `pnpm --filter @terra/game typecheck` | 통과 |
| `pnpm check` | 통과. 시험 315개 통과, 25개 건너뜀(DB 시험). 행성 시험은 57개 |
| `TEST_DATABASE_URL=… pnpm test` | 340개 모두 통과 |
| `node scripts/check-docs.mjs origin/main` | 통과(`✓ 변경 규칙 통과 — 작업 기록·ADR·마이그레이션`) |
| `node scripts/check-content.mjs origin/main`, `pnpm docs:index --check` | 둘 다 통과 |
| origin/main(`a3837f2`)과 합친 상태(임시 가지에서 확인 뒤 지움) | 충돌은 `docs/WORKLOG.md`(자동 생성)뿐이고 `pnpm docs:index`로 풀린다. 잠금 파일은 저절로 합쳐진다. `pnpm install` + `pnpm check` 통과(시험 368개 통과, 34개 건너뜀) |
| Docker 설치 단계 흉내(기존 `package.json` 5개만 복사 + `pnpm install --frozen-lockfile --ignore-scripts`) | 통과. 잠금 파일의 `packages/planet` 항목은 무시된다 |
| 키로 부르는 `neighbors8`, 레벨 9 전체 157만 칸 | 1.56초(칸당 약 1µs) |

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/planet/package.json`, `tsconfig.json`(새) | 패키지 골격. 진입점 `.`(정수)·`./projection`(실수), `erasableSyntaxOnly` |
| `packages/planet/src/levels.ts`(새) | 레벨·행성 크기 상수, `planetLevels` |
| `packages/planet/src/faces.ts`(새) | 면 배치, 면 경계 변환표, `wrapFaceIJ` |
| `packages/planet/src/hilbert.ts`(새) | 면 안 힐베르트 곡선(정수) |
| `packages/planet/src/cellKey.ts`(새) | 셀 키 만들기·풀기·검사 |
| `packages/planet/src/hierarchy.ts`(새) | 부모·자식·조상, 키 구간, 하위 칸 좌표 |
| `packages/planet/src/neighbors.ts`(새) | 4·8이웃 |
| `packages/planet/src/corners.ts`(새) | 꼭짓점 8곳과 꼭짓점 칸 |
| `packages/planet/src/projection.ts`(새) | 탄젠트 투영, 칸 면적·크기(표시·생성 전용) |
| `packages/planet/src/index.ts`(새) | 정수 API 진입점 |
| `packages/planet/src/*.test.ts`, `testOracle.ts`(새) | 시험과 독립 기준 |
| `pnpm-lock.yaml` | 새 작업공간 패키지 항목(메인 세션이 합칠 때 다시 만든다) |
| `scripts/check-boundaries.mjs` | 병합 때: 결정성 검사 대상에 행성 정수 모듈 추가 |
| `docs/adr/2026-10-29-cell-key-layout.md`(새), `docs/PLAN.md`, `docs/PROTECTED.md`, `AGENTS.md` | 병합 때: 키 배치 ADR, 계획서·보호 목록·규칙 |

## 함께 바꿔야 하는 파일
- 서버나 게임 앱이 `@terra/planet`을 쓰게 되면: 그 앱 `package.json`에 `"@terra/planet": "workspace:*"`. 서버라면 `Dockerfile` 설치 단계에 `COPY packages/planet/package.json packages/planet/`도. 지금은 아무도 쓰지 않아 넣지 않았다.
- 판정 코드(`packages/sim`)가 격자를 쓰게 되면: `scripts/check-boundaries.mjs`의 `ALLOWED`(지금 `@terra/sim`은 `@terra/planet`을 가져올 수 없다).
- 면 레벨 범위나 맵 단계 수를 바꾸면: `levels.ts`, `levels.test.ts`, PLAN 5.2.

## 건드리지 말 것
- 셀 키 비트 배치, 면 배치, 면별 힐베르트 방향. 바꾸면 DB·캐시·전송에 들어간 키가 모두 다른 칸을 가리킨다. 골든 값 시험(`cellKey.test.ts`)이 막는다.
- `FACE_EDGE_LINKS`·`CUBE_CORNERS`는 손으로 푼 표다. 고치면 전수 시험이 기하 기준과 다시 맞는지 본다.
- 정수 진입점(`src/index.ts`)에 `projection.ts`를 섞지 않는다.
- `testOracle.ts`가 구현 코드를 쓰게 바꾸지 않는다(독립 기준이 아니게 된다).

## 미검증·TODO·알려진 문제
- 투영은 `Math.tan`·`Math.atan`을 쓴다. 브라우저·Node 버전마다 마지막 자리가 다를 수 있다(Unknown). 생성기의 고정 시드 결과 해시(PLAN 5.5)가 투영 값에 기대게 되면, 생성기를 만들 때 처리 방법을 정해야 한다.
- (풀림, 병합 때) 정수 모듈의 초월함수·현재 시각·`Math.random`은 이제 `check-boundaries.mjs`가 막는다.
- 키로 부르는 이웃은 칸당 약 1µs다. 생성기가 157만 칸을 여러 번 돌면 면별 배열 + `wrapFaceIJ`가 더 빠를 것이다(Assumed, 미측정).
- 칸 면적 식은 깊은 레벨에서 자리가 줄어든다. 잰 상대 오차: 레벨 17까지 약 1e-6 이하, 레벨 20 약 7e-5, 레벨 22 약 2e-3. 표시용이라 그대로 뒀다.
- 지구 꼭짓점 8곳을 모두 바다에 두는 회전이 있는지는 아직 모른다(ADR, Unknown). 생성기 일이다.
- 행성 ID의 타입·형식은 정하지 않았다.
- 2차맵 칸 좌표 (x, y)의 축은 면의 i·j 축이라 면마다 방향이 다르다. 면 경계 너머 2차맵을 붙일 때는 `wrapFaceIJ`를 쓴다.

## 사용자 결정 대기
- 없음. 메인 세션이 정했다: 키 배치는 새 ADR 34, PLAN 5.2에 요약, PROTECTED에 격자 계약.
