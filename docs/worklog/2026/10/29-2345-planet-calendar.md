# 공용 행성 달력 `@terra/shared/planetCalendar` — 정수·결정성 검사·화면 쪽 내림 입구 (1차맵 하늘 WP1)

- 일시: 2026-10-29 23:45 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-primary-map-sky.md`(제안) 2절, 기획 D-091·D-5030·D-118·D-142, 질문 `docs/questions/2026-10-29-game-calendar.md`, 앞 기록 `29-2340-primary-map-sky-docs.md`(WP0), 작업 가지 `work/planet-sky`

## 한 일
- 새 모듈 `packages/shared/src/planetCalendar.ts`(진입점 `@terra/shared/planetCalendar`, `index.ts`에는 넣지 않음). 서버 UTC 정수 ms → 행성 날짜. 기획 값: 하루 3,600,000ms(실제 1시간), 계절 7일, 한 해 4계절 28일(100,800,000ms). `[임시]` 기원 1,790,812,800,000(2026-10-01T00:00Z).
- 입구를 둘로 나눴다(검토 H1).
  - `planetCalendarAt`: 판정 쪽. 받는 시각이 아니면 `RangeError`. 받는 시각 = 안전 정수이고 기원을 뺀 ms도 안전 정수다(초안은 입력만 봤다. `Number.MIN_SAFE_INTEGER`는 기원을 빼면 범위를 넘는다).
  - `planetCalendarForDisplay`: 화면 쪽. 내림(`Math.floor`)한 뒤 받는 시각이면 날짜, 아니면 null(NaN·무한대·범위 밖). 던지지 않는다. 엔진은 이것만 부른다(WP2 `skyAt`).
- `PlanetCalendar`에 초안에 없던 `msSinceEpoch`(기원에서 잰 정수 ms)를 더했다. 달 위상과 구름 날씨 창 번호가 정수 나머지·몫으로 쓴다.
- `PlanetSeason`(0~3) 타입, `southernSeason`(+2 mod 4, D-142), `isPlanetCalendarTime`. 계절 번호 좁히기는 `as` 대신 비교로 한다(oxlint `no-unsafe-type-assertion` 피함).
- 결정성 검사에 넣었다: `scripts/check-boundaries.mjs` `DETERMINISTIC_SOURCE` 정규식과 그 위 주석의 모듈 목록. AGENTS.md 4장의 결정적 모듈 목록에도 더했다.
- `docs/PROTECTED.md`에 달력 행: 하루·계절·한 해(기획 값)와 기원. 바꾸려면 ADR + 달력 시험 + 판정 쪽 계절 보정 시험(생기면), 판정이 쓰면 `SIM_VERSION`. 기원은 출시 전에 질문 1 답으로 한 번 정하고 출시 뒤 바꾸지 않는다.
- 시험 14개(`planetCalendar.test.ts`, Verified: Vitest 5.0.5 통과): 기획 값, 기원·기원 1ms 전·하루·계절·한 해 경계, 두 해 동안 날마다 계절·날 차례, 2300년 값(손으로 센 2,395,272일·85,545년 12일째), BigInt로 따로 센 값과 2,005개 시각(±2^53 근처 포함) 비교, 소수·NaN·무한대·±2^53 던지기, 남반구 계절, 화면 쪽 입구(x.5ms 500개가 내린 값과 같음, 범위 밖 null).
- 시험이 틀린 코드를 잡는지 봤다: 나머지 식(음수에서 틀림), 남반구 +1, 내림 → 반올림, 기원 +1ms 넷 모두 시험이 실패했다(Verified). 결정성 검사도 `Math.sin`·`**`를 넣은 사본에서 실패했다(Verified).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/planetCalendar.ts`(새) | 공용 행성 달력(판정·화면 입구 둘) |
| `packages/shared/src/planetCalendar.test.ts`(새) | 위 시험 14개 |
| `packages/shared/package.json` | `exports`에 `./planetCalendar`(첫 화면 묶음 밖 진입점) |
| `scripts/check-boundaries.mjs` | 결정성 검사 대상에 `planetCalendar`, 주석의 모듈 목록 |
| `AGENTS.md` | 4장 결정적 모듈 목록에 `planetCalendar` |
| `docs/PROTECTED.md` | 달력 상수·기원 행 |

## 함께 바꿔야 하는 파일
- `AGENTS.md` 37행: `work/generator-variety`가 같은 줄 끝에 시험 도우미 문장을 더했다. 합칠 때 그 가지의 줄을 받고 목록에 `·planetCalendar`만 더한다(Verified: `git merge-file`로 충돌 1개 확인. 다른 곳은 충돌 없음).
- `scripts/check-boundaries.mjs`: generator-variety는 72행 주석과 반복문을 고친다. 이 가지는 70행 주석(두 줄로)과 74행 정규식만 고쳐 3방향 합치기에 충돌이 없다(Verified: `git merge-file`).
- 판정 코드(D-118 계절 보정, S2·S3)가 생기면 `planetCalendarAt`을 쓰고 PROTECTED 행대로 `SIM_VERSION`·계절 보정 시험을 함께 다룬다.
- 기획 답: 질문 1(기원) → 상수와 PROTECTED 행, 질문 2·3(계절 위상·자전축) → 엔진 `PLACEHOLDER_PLANET_SKY`, 질문 4(행성별 하루) → 이 모듈이 행성 값을 받아야 하는지 새 ADR.

## 건드리지 말 것
- `packages/shared/src/index.ts`: 달력을 내보내지 않는다(첫 화면 묶음에 들어가지 않게, AGENTS 6장 "sideEffects" 항목).
- 이 모듈에 `Math` 초월함수·`**`·현재 시각(`Date.now`·`new Date`)을 쓰지 않는다(결정성 검사가 막는다). 기원도 `Date.UTC` 대신 정수 글자로 둔다.

## 미검증·TODO·알려진 문제
- 앱 코드는 아직 이 모듈을 가져오지 않는다(Verified: grep). 첫 화면 묶음에 들어가지 않는지는 WP7 빌드에서 본다(Assumed: 진입점이 따로이고 `sideEffects: false`).
- 기원은 임시다. 출시 전에 꼭 정해야 한다.

## 사용자 결정 대기
- 없다. 기획 질문 1~4 답 대기.
