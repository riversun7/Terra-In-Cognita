# S2 행성 생성기 리뷰 고침: 해상도와 무관한 강가 가산, 결정성 검사 범위, 콘텐츠 검사, 면 레벨 상한, 호수 수면

- 일시: 2026-10-29 14:15 (KST)
- 작업 도구: Claude Code
- 가지: `worktree-wf_855dd1b7-352-1`(작업 트리, 생성기 가지 `f59a8a7` 위, 서브에이전트)
- 관련: ADR `2026-10-29-s2-planet-lod.md`(36, 제안 — "구현하며 정한 것 (생성기)"를 고쳤다), 앞 작업 기록 `29-1020-s2-generator.md`. 커밋 `eeaa979` `263877e` `052b598` `4155fd6` `e3fd509` `1d99321` `6105264` `c08f84f` `375938c`와 이 기록의 문서 커밋
- 검토 결과(주요 1개, 작은 것 7개)를 확인하고 모두 고쳤다. 받아들이지 않은 것은 없다. `apps/**`, `packages/protocol`·`engine`·`sim`, `packages/planet/src/tiles/`는 건드리지 않았다.

## 한 일
1. 강가·호숫가 습도 가산을 면 레벨과 무관하게(주요, `eeaa979`)
   - 확인(Verified): 가산이 강 칸과 그 8이웃 칸 전체에 붙어서 가산을 받는 땅 면적이 칸 크기를 따라갔다. S2 시험 행성 육지 중 강 칸이 F6 29.0%, F7 9.3%, F8 3.8%, F9 1.9%였다. 열대우림은 11.3%·9.0%·5.9%·4.3%, 사바나는 10.0%·12.9%·16.1%·17.9%였다.
   - 고침: `riparian.ts`(새). 물가에서 실제 환산 12km 띠 안의 땅이 가산을 받는다. 강은 강 칸 가운데를 지나는 선에서, 호수는 호숫가에서 잰다.
     - 칸이 띠보다 크면 칸 폭 중 띠의 몫만 더한다. 거리는 `distanceField`(8이웃 길, 바다로는 넘지 않음)로 구한다.
     - 강 머리 칸은 칸 안에서 강이 차지하는 길이 몫(`Rivers.length` = (유량 − 문턱) ÷ 그 칸 자신의 유출)도 곱한다. 이것이 없으면 F6은 칸 하나의 유출로 문턱을 넘는 강 머리가 많아 가산 면적이 F9의 약 2배였다.
   - 결과: 아래 "잰 수치". 시험 3개(`riparian.test.ts`: 칸 줄의 몫 × 칸 폭 합 = 띠 폭, 칸이 띠의 0.1~24배일 때 모두)와 F6·F8 면적 시험 1개.
   - 골든 해시 3개를 새 값으로 바꿨다.
   - `GENERATOR_VERSION`은 2로 올렸다(`375938c`). 검토는 1판을 내보내기 전이니 1로 두자고 했지만, 작업 중 1판이 origin/main(`523f373`, S2 통합)에 올라갔다. 서버 캐시 키·타일 주소 판이 이 값을 쓰므로 1로 두면 이미 구운 캐시와 기기 타일 캐시가 옛 출력을 낸다.
2. 호수 수면 높이 `GeneratorDetails.lakeSurfaceM`(`263877e`): 호수 칸만 값(넘치는 높이, 게임 m)이 있고 그 밖은 0이다. `PlanetFields`·해시는 그대로다. 시험: 바닥 이상, 물길을 따라 같은 호수는 같은 값, 넘치는 곳의 저장 고도와 같다.
3. 결정성 검사 범위(`052b598`): `scripts/determinism-scan.mjs`(새)로 옮겼다.
   - 대상에 `@terra/shared`의 `detMath`·`rng`·`planetDefinition`·`planetPresets`를 더했다.
   - 주석·문자열·템플릿 글자를 지운 뒤 본다(템플릿 `${…}`는 코드). `performance.now`·`crypto` 난수, `Math["sin"]`·`= Math`도 막는다.
   - 시험 8개. 일부러 `detMath.ts`에 `Math.sin`, `rng.ts`에 `**`를 넣어 `node scripts/check-boundaries.mjs`가 실패하는 것을 보고 되돌렸다(Verified).
4. 골든 시험이 det 함수 바꿈을 잡게(`4155fd6`)
   - `detMath.test.ts` 골든 비트에 함수마다 Node 24.22.1(V8) `Math`와 마지막 비트가 다른 점 두 개를 더했다. 1~999 범위를 훑어 찾았다(sin 165/999점, atan 74/999점이 다르다).
   - `generate.test.ts` "실수 지문": 격자 칸 중심·면적의 64비트 FNV, 골든 세 경우의 해수면 64비트, 판 구조 고도·기온·강수의 Float32 FNV.
5. `packages/shared/tsconfig.json`에 `erasableSyntaxOnly`(`e3fd509`). enum 시험 파일로 TS1294가 나는 것을 보고 지웠다(Verified).
6. 콘텐츠 검사가 생성기가 받지 않는 정의를 막는다(`1d99321`, `6105264`)
   - 프리셋 수치표·풀기를 `@terra/shared` `planetPresets.ts`로 옮겼다(값 그대로, 골든 해시 같음). 생성기 진입점도 같은 이름을 다시 내보낸다. 수치표 고정 시험을 더했다.
   - 스키마: 극 기온 ≤ 적도 기온을 풀어 쓴 값으로 본다. 한쪽만 덮어써도 다른 쪽 프리셋 값과 비교한다. 범위 밖 값이면 건너뛴다(범위 문구만 나온다).
   - 2단계 뒤 `validate/planets.ts`: 참조한 바이옴에 바다·호수·육지 규칙이 하나씩 있는지 본다.
   - 생성기 시험: 팩의 모든 행성이 면 레벨 4로 생성된다.
   - `planetPresets.ts`의 "콘텐츠 팩 검사가 먼저 막지만" 주석은 이제 사실이라 같은 뜻으로 다시 적었다.
7. 면 레벨 상한 10 → 9(`c08f84f`): F10 생성 하나가 최대 RSS 약 770MiB인데 NAS 앱 컨테이너 상한이 1GiB다. 콘텐츠 스키마·생성기 입력 검사(서버 시작 검사도 같은 상수)가 9까지만 받는다.
8. 문서: ADR 36 생성기 절(골든 비트 문구, 해상도 무관 문장, 면 레벨, 프리셋 위치, 습도 규칙, 호수 수면, 성능, 버전·시험, 남은 것), PROTECTED(detMath 행 문구, 프리셋 수치표 행), AGENTS 4장(경계 검사 범위, shared erasableSyntaxOnly)·6장(Zod 4.6.7 superRefine, det → Math 실험), 이 기록, 목차.

## 잰 수치

### 육지 바이옴 면적 비율 (Verified: S2 시험 행성 정의, 면적 가중, 바다·호수 제외)
| | F6 | F7 | F8 | F9 |
|---|---|---|---|---|
| 강 칸(그대로) | 29.0% | 9.3% | 3.8% | 1.9% |
| 열대우림: 고치기 전 / 가산 끔 / 고친 뒤 | 11.3 / 3.4 / 3.9% | 9.0 / 3.0 / 3.4% | 5.9 / 2.7 / 3.1% | 4.3 / 2.6 / 3.1% |
| 사바나: 고치기 전 / 가산 끔 / 고친 뒤 | 10.0 / 17.3 / 16.8% | 12.9 / 18.8 / 18.4% | 16.1 / 19.2 / 18.8% | 17.9 / 19.6 / 19.1% |
| 습지: 고치기 전 / 고친 뒤 | 1.9 / 0.1% | 0.9 / 0.1% | 0.6 / 0.1% | 0.3 / 0.2% |
- F6과 F8(시험과 같은 입력): 고치기 전 바이옴 차이 최대 6.13%p(사바나), 평균 습도 147.2 대 136.8, 평균 숲 75.2 대 62.6. 고친 뒤 최대 1.93%p(사바나), 습도 135.2 대 133.6(1.2%), 숲 59.0 대 57.0(3.5%). 시드 1은 최대 0.78%p다.
- 가산 효과 자체는 해상도마다 거의 같다: 열대우림 +0.5·+0.4·+0.5%p, 사바나 −0.5·−0.4·−0.5%p(F6·F8·F9, 가산 끈 판과 비교).
- 남은 사바나 차이(F6·F8 1.9%p)는 가산을 꺼도 있다. 습기 흐림 횟수를 km로 맞춘 실험 판에서도 2.0%p라 흐림 때문은 아니다(원인 Unknown).
- 그림(저장소 밖): `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/s2-gen/fix-f7/`, `…/fix-f9/`. 고치기 전 F9는 `…/final-f9/`. 건조한 땅의 강을 따라 3칸 폭 열대우림 띠가 보이던 것이 칸 하나 폭의 옅은 띠가 됐다. F7과 F9의 바이옴 배치가 같다(Assumed: 눈으로 봄).

### 생성 시간·메모리 (Verified: 이 컨테이너 4코어 공유, Node 24.22.1, `pnpm --filter @terra/planet bench 6 7 9`)
| | F6 | F7 | F9 |
|---|---|---|---|
| 합계 | 0.40초 | 1.16초 | 12.37초 |
| 지표 단계(surface) | 22ms | 77ms | 480ms(앞 389ms) |
| 최대 RSS | 101MiB | 123MiB | 297MiB |
| 결과 해시 | `215d9b32` | `5664ca15` | `ac761e56` |
- 다른 에이전트가 같은 기계를 함께 써서 값이 흔들린다(부하 평균 0.8~3.9).

### det 함수를 엔진 Math로 바꾼 실험 (Verified: 함수 본문 맨 앞에 `return Math.…`를 넣고 시험을 돌린 뒤 되돌림)
| 바꾼 함수 | 실패한 시험 |
|---|---|
| detSin·detCos·detAtan2·detAsin·detExp | `detMath.test.ts` 골든 비트 |
| detTan·detAtan | 골든 비트 + `generate.test.ts` 실수 지문(격자·해수면) |
- 생성기 정수 골든 해시와 Float32 지문(판 구조·기후)은 어느 바꿈에도 그대로였다. 바꾼 줄은 경계 검사가 잡는다(따로 확인).

### 콘텐츠 검사 재현 (Verified: content/core를 메모리에서 고쳐 `validatePack`)
- 극 기온만 30°C로 덮어씀, 호수 바이옴 뺌, 바다 바이옴 뺌, 빙상·툰드라·사막만: 모두 거부된다(고치기 전에는 모두 통과하고 생성기가 RangeError).

## 확인 (Verified: 이 작업 트리, Node 24.22.1, pnpm 11.28.9)
| 명령 | 결과 |
|---|---|
| `pnpm --filter @terra/game typecheck` → `pnpm check`(코드 커밋 `c08f84f` 뒤) | 통과. 시험 파일 83개 통과·5개 건너뜀, 시험 702개 통과·39개 건너뜀(DB 시험). 콘텐츠 `core@2 (14495d30db2e)` |
| `pnpm check:content origin/main` | 통과(1·2·4a·4b, 기준 `523f373`) |
| `node scripts/check-docs.mjs origin/main`, `pnpm docs:index --check` | 문서 커밋 뒤 실행(결과는 최종 보고) |
| `pnpm test`(전체, 중간에 2번) | 모두 통과(그때 699개·39개 건너뜀) |
| `TEST_DATABASE_URL=postgres://…@127.0.0.1:55432/… pnpm test`(일회용 로컬 DB, 문서 커밋 뒤) | 741개 모두 통과 |
| origin/main(`523f373`)과 합친 결과(merge-tree, 위 충돌 2개를 풀어 저장소 밖 복사본에서 오프라인 설치) | 포맷·린트·타입(게임 앱 포함)·경계·크기·다국어·디자인 값·콘텐츠 통과. 시험 915개 통과·3개 실패·40개 건너뜀: 실패는 모두 `apps/server`(bake.test.ts F5 해시, cache.test.ts 버전 1 가정 2개, 아래 "함께 바꿔야 하는 파일") |
| `pnpm vitest run packages/planet packages/shared`(12번) | 맨 처음 1번에서 시험 1개 실패, 그 뒤 11번 모두 통과. 실패 내용을 남기지 못했다(아래 알려진 문제) |

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/planet/src/generator/riparian.ts`·`riparian.test.ts`(새), `surface.ts`, `hydrology.ts`, `generate.ts` | 해상도와 무관한 강가·호숫가 가산, 강 길이 몫, 호수 수면(`lakeSurfaceHeights`, `GeneratorDetails.lakeSurfaceM`) |
| `packages/planet/src/generator/generate.test.ts` | 골든 해시 새 값, F6·F8 면적 시험, 호수 수면, 실수 지문, 팩의 모든 행성 생성, 면 레벨 10 거부 |
| `scripts/determinism-scan.mjs`·`determinism-scan.test.mjs`(새), `scripts/check-boundaries.mjs` | 결정성 검사 범위·주석 제외 |
| `packages/shared/src/detMath.test.ts` | 엔진 Math와 다른 점의 골든 비트 |
| `packages/shared/tsconfig.json` | `erasableSyntaxOnly` |
| `packages/shared/src/planetPresets.ts`·`planetPresets.test.ts`(옮김), `src/index.ts`, `planetDefinition.ts`, `packages/planet/src/generator/{index,definition,version,types}.ts` | 프리셋 수치표 위치, 면 레벨 상한, 주석 |
| `packages/content/src/schema/planets.ts`, `validate/planets.ts`(새), `validate/pack.ts`, `validate/planets.test.ts` | 풀어 쓴 극·적도 기온, 바이옴 표 종류 |
| `docs/adr/2026-10-29-s2-planet-lod.md`, `docs/PROTECTED.md`, `AGENTS.md`, 이 기록, `docs/WORKLOG.md`(자동) | 결정·보호 규칙·확인 사항 |

## 함께 바꿔야 하는 파일
- 이 가지를 main(S2 통합 `523f373`, origin에도 있음)에 합칠 때
  - `apps/server/src/planet/bake.test.ts`가 F5 골든 해시 `3321d859`를 본다 → `5c984c77`로(같은 입력: 팩 S2 시험 행성, 면 레벨 5).
  - main의 ADR 36 통합 절이 옛 값을 적는다: "면 레벨 4~10"(→ 4~9), `3321d859`(→ `5c984c77`), F9 굽기 해시 `07cb630b`(→ `ac761e56`, 다시 재면).
  - `apps/server/src/planet/cache.test.ts`가 지금 버전을 1로 가정한다(합친 결과에서 실패, Verified):
    - 57줄 `test_planet-g1-t1-…` → `` `test_planet-g${GENERATOR_VERSION}-t1-…` ``(또는 `-g2-`). 키의 버전은 `source.generatorVersion`이다.
    - 83줄 "다른 생성기 버전의 목록"이 `generatorVersion: 2`로 고친다 → 지금 버전과 같아져 invalid가 아니다. `index.generatorVersion + 1`로.
  - 프로토콜·엔진·게임 앱 시험의 `generatorVersion: 1`은 스스로 만든 고정 자료라 그대로 둬도 된다(합친 결과에서 통과).
  - `GENERATOR_VERSION`이 2라 서버는 캐시 키가 바뀌어 다시 굽고, 기기는 새 타일 주소로 받는다. 지울 것은 없다(같은 행성의 옛 판 캐시는 서버가 하나만 남긴다).
  - 충돌 2개(`git merge-tree --write-tree origin/main HEAD`): `docs/PROTECTED.md`는 main의 생성기 행 + 이 가지의 detMath 행·프리셋 수치표 행을 둔다. `docs/WORKLOG.md`는 `pnpm docs:index`로 다시 만든다. 코드 파일은 모두 저절로 합쳐진다.
- 생성 결과가 한 칸이라도 바뀌면: `GENERATOR_VERSION`, 골든 해시 3개, 실수 지문(`generate.test.ts`), ADR 36. `detMath.ts` 값이나 `planetPresets.ts` 수치표가 바뀌어도 같다(PROTECTED).
- 강가 가산 상수(`riparian.ts`)를 바꾸면 F6·F8 면적 시험의 잰 값 주석도 다시 잰다.
- 호수 수면을 타일에 실으려면 타일 형식·렌더러와 함께 정한다(ADR 36 남은 것).

## 건드리지 말 것
- 앞 기록의 "건드리지 말 것" 그대로(det 상수·식 순서, 반복 순서, 난수 단계, 해시 바이트 순서, 동점 규칙).
- `riparian.ts`의 띠 몫 식: 칸 줄의 몫 × 칸 폭 합이 띠 폭이 되는 성질을 시험이 본다. 칸 크기와 무관하게 하는 핵심이다.

## 미검증·TODO·알려진 문제
- 맨 처음 `pnpm vitest run packages/planet packages/shared`에서 시험 1개가 실패했다. 출력을 걸러 내 무엇이 실패했는지 남기지 못했다. 그 뒤 같은 명령 11번(변환 캐시를 지우고 3번 포함)과 전체 시험 2번은 모두 통과했다. 같은 기계에서 다른 에이전트가 함께 돌아 CPU가 몰린 순간에 5초 기본 제한을 넘은 것으로 본다(Assumed). 느린 시험은 F6·F8 면적 시험(약 4.6초, 제한 60초)뿐이고 나머지는 1초 아래다.
- F6과 F8의 사바나 차이 1.9%p(가산과 무관)의 원인은 모른다(Unknown). 노이즈 옥타브가 해상도를 따라 늘어 지형 기울기·비그늘이 달라지는 것으로 추정한다(Assumed, 실험하지 않음).
- 강 칸 비율(F6 29%)과 해안 비트는 여전히 칸 크기를 따른다(칸 단위 표시). 편집기 미리보기에서 강을 그리면 F6은 강이 굵어 보인다.
- 결정성 검사는 정규식 리터럴을 알아보지 않는다(검사 대상에 없다). 생기면 그 안의 `//`·따옴표 뒤를 덜 본다.
- 다른 엔진(브라우저)에서 골든 해시·실수 지문이 같은지는 여전히 돌려 보지 않았다(Assumed: 명세상 같다).

## 사용자 결정 대기
- 메인 세션: 위 "함께 바꿔야 하는 파일"의 main 쪽 고침, 호수 수면을 타일에 실을지(타일·렌더러), 면 레벨 상한 9를 PLAN 5.2에 적을지(NAS 측정 뒤 다시 볼지).
