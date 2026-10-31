# 행성 생성기 다양성 고침: 검토 지적 고침·마무리(출력 판 3)

- 일시: 2026-10-31 09:10 (KST)
- 작업 도구: Claude Code
- 가지: `work/generator-variety`(작업 트리 `.claude/worktrees/generator-variety`, 서브에이전트, 푸시·합치기 하지 않음). 앞 기록 `29-2330-generator-variety-stage3.md`
- 관련: ADR `2026-10-29-generator-variety.md`(제안. 앞 이름 `2026-10-29-planet-generator-variety.md`를 고쳐 쓰고 이름을 바꿨다), ADR `2026-10-29-s2-planet-lod.md`(36, 버전 절 한 줄), PLAN 5.3. 커밋 `d79bbc4`·`cb268f9`·`a4884b0`·`d4ec9d3`·`2e45707`·`d0cd47a`·`fa41057`·`413ce03`, 이 기록의 커밋(문서)

## 한 일
검토 지적 24개를 다시 확인하고 고쳤다. 커밋마다 골든·서버 고정값을 고쳐 모든 커밋에서 시험이 통과한다(`GENERATOR_VERSION`은 3 그대로).

| 지적 | 처리 |
|---|---|
| (major) 해안 흔들기가 엉뚱한 바다로 이어짐을 봐서 새 만의 13~32%가 땅 속 웅덩이 | 고침 `a4884b0`: 진짜 바다 기준, 다시 판정·되돌리기. F7 시드 6개 위반 160~408 → 0 |
| (major) 3단계가 큰 강을 끊고 마른 분지 최대 ×3 | 고침 `d4ec9d3`: 큰 강이 드는 마른 분지 뚫기. F9 가장 긴 강 1,521~2,074 → 2,997~6,461km, 마른 분지 3.5~13.4 → 1.6~3.5% |
| (major) 얼음에 구멍(빙상 기후 호수 두 배) | 고침 `d4ec9d3`: −11°C 이하 웅덩이는 얼음 평지. F9 빙상 기후 호수 9.1~12.8 → 0.4~2.6% |
| (major) 막는 지표가 F7 직접 출력만 보고 기기가 보는 L5·L6은 안 봄 | 일부: 측정 스크립트에 모은 맵 레벨 지표(`413ce03`). 치우침 자체는 모으기 동점 규칙(타일 형식 1판) 문제라 이 가지에서 안 고침(타일 형식 2판 필요, ADR "결과") |
| (major) "전부 사막"이 안 고쳐짐 | 일부: 가장 큰 사막 덩어리 편집 행성 시드 11.7 → 8.9%, 사막 몫 20.6 → 18.9%(판 2 16.0). 나머지는 바이옴 표·팔레트 결정이 필요해 기획 질문으로 남김(ADR "결과"). 생성기로 더 줄이면 띠 식과 싸운다 |
| (minor) 습도 계단 막는 지표가 그 결함을 못 잡고, 기후 변이 반으로도 위도 띠 4개 통과 | 고침 `d0cd47a`·`413ce03`: 습도 계단은 보고로, 지표 단계 시험 새로(결함을 되살리면 실패 확인). 위도 띠 문턱을 문서 4.3 2단계 목표로 |
| (minor) 격자점 막는 지표가 생성기가 안 쓰는 설정을 잼 | 고침 `2e45707`: `NoiseSetup` 목록을 잰다, 흔들기 0.8을 모든 설정에(0.48~0.84 → 0.865 이상) |
| (minor) 극 기온 시험이 칸 하나도 묶지 않음 | 고침 `cb268f9`: 칸마다 ±10°C·극 설정 + 10°C |
| (minor) F9 예산 여유는 노이즈 펼치기 덕 | 받아들이고 ADR에 적음: 최종 ÷ 판 2 = 1.02, ÷ (판 2 + 같은 펼치기) = 1.41 |
| (minor) 차례로 굽는 워커마다 RSS가 늚(판 2부터), NAS 다시 굽기 | 이 가지 밖(판 2가 같거나 더 나쁨, 검토 측정). ADR "다음 확인"과 통합 담당 메모로 |
| (minor) `pnpm --filter @terra/server test`가 아무것도 안 돌림 | 고침 `cb268f9`: 두 패키지에 test 명령 |
| (minor) main 합칠 때 문서 충돌·main 쪽 두 곳(AGENTS.md 캐시 줄, `memoryEstimate.ts`) | 통합 담당 몫(main 파일). 이 가지의 AGENTS.md 캐시 줄은 출력 판 3으로 고침 |
| (minor) F7에서 잔 변이가 소금·후추 점박이 | 고침 `d0cd47a`: 파장 칸 3개 이상 옥타브만. F7 5칸 미만 덩어리 땅 5.4~7.2 → 3.1~4.5% |
| (minor) 단조로움이 얼음으로 옮겨 감 | 고침 `fa41057`: 극 쪽 고원·구릉 50° → 70°에서 0까지. F7 빙상 12.5~28.3 → 11.5~26.4%. 시드 1은 여전히 빙상이 가장 큰 덩어리(ADR) |
| (minor) 막지 않는 지표가 맞출 때 안 본 시드에서도 넘음 | ADR에 그대로 적고 기준값에 시드 2718281828을 더함(`413ce03`) |
| (nit) 1판 노이즈 "비트까지 같음"은 정수 격자점의 0 부호가 다름 | 고침 `2e45707`: 주석 |
| (nit) AGENTS.md 줄이 출력 판 2 | 고침(이 커밋) |
| (nit) 출력을 바꾸는 커밋 셋이 판 하나를 같이 씀(PROTECTED 16행 예외) | ADR에 예외와 까닭을 적음. 판은 3 그대로(지시) |
| (nit) 기후 단계가 바다까지 거리·강수를 두 배 뛰기 내내 들고 있음 | 고침 `d79bbc4`: 순서 바꿈, 최대 RSS 증가 87~105 → 74~75MiB, 출력 같음 |
| (nit) ADR·기록 수치가 조금 틀림(레벨별 타일 증가, 최대 RSS, 워커 최대) | 새 ADR에서 범위로 다시 잼 |
| (nit) F7 ≤ 2초는 부하가 보통일 때만 | ADR에 적음(부하 9~10에서 벽시계 0.99~1.16초) |
| (nit) 열점 간격 변동 계수가 모든 사슬을 한데 모음 | 고침 `413ce03`: 사슬마다 평균을 막고 모은 값은 보고 |
| (nit) render.ts 그림 색이 255를 넘으면 돌아감 | 고침 `cb268f9` |
| (nit) 결정성 검사가 이름 없는 시험 도우미 import를 못 잡음 | 고침 `cb268f9`(+ `globalThis` 막기) |

## 잰 값
ADR "이유"에 모았다(F9 시드 4개 표, 물, 해안, 바이옴 몫, 모은 맵 레벨, 시간·메모리·타일). 주요 값(Verified):
- F9 문턱 실패 81개 중 13개(판 2는 문서 표 34개 모두). 막는 지표 11개는 F9 시드 4개·F7 시드 3개에서 통과.
- F9 CPU 최종 10.69~11.55초, 판 2 10.49~11.10초(번갈아 3번, 부하 10~12). 굽기 워커 힙 + 외부 최대 199.0~199.9MB. 타일 덩어리 4,020,978바이트(판 2의 +36.4%, 첫 화면 L5 + L6 +16.1%).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/planet/src/generator/seaLevel.ts` | `cornerSeaMask`·`oceanComponents`를 나눠 해안 흔들기와 바다 판정이 같은 규칙을 씀 |
| `packages/planet/src/generator/landforms.ts` | 해안 다시 판정, `NoiseSetup`, 극 쪽 고원·구릉 줄이기 |
| `packages/planet/src/generator/tectonics.ts` | `tectonicRelief` 나눔, 순서(봉우리 → 해안 → 바다 판정), `NoiseSetup` |
| `packages/planet/src/generator/hydrology.ts`·`generate.ts` | 빙상 웅덩이, `breachDryBasins`, 마른 분지 깊이 0 칸 |
| `packages/planet/src/generator/climate.ts`·`climateWind.ts`·`noise.ts` | 순서 바꿈(메모리), 잔 변이 칸 3개, `NoiseSetup`·`NOISE_JITTER` |
| `packages/planet/src/generator/testVariety*.ts`·`variety.test.ts`·`bench/variety.ts`·`bench/variety-baseline.json` | 물·모은 맵 레벨·사슬 지표, 문턱, 기준값 시드 4개 |
| 시험 `hydrology.test.ts`(새)·`landforms.test.ts`·`climate.test.ts`·`climateVariation.test.ts`·`generate.test.ts`, `apps/server/src/planet/bake.test.ts` | 새 동작 시험, 골든·고정값, 워커 시험 30초 상한 |
| `scripts/determinism-scan.mjs`(+시험) | 이름 없는 시험 도우미 import, `globalThis` |
| `packages/planet/package.json`·`apps/server/package.json` | test 명령 |
| `packages/planet/bench/render.ts` | 색 자르기 |
| `version.ts`·`random.ts` 주석, ADR 36 한 줄, PLAN 5.3, AGENTS.md 두 줄, 앞 작업 기록 셋 | 새 ADR 이름·출력 판 3 |

## 함께 바꿔야 하는 파일
- main에 합칠 때: main의 AGENTS.md `PLANET_CACHE_DIR` 줄(두 행성, 출력 판 2라고 적힘)을 출력 판 3과 잰 시간으로, `docs/WORKLOG.md`는 다시 만든다(`pnpm docs:index`), main `apps/game/src/editor/planet/memoryEstimate.ts`는 다시 잰다.
- 생성기 출력을 또 바꾸면 골든(`generate.test.ts`)·서버 F5 고정값·`bench/variety-baseline.json`을 같은 커밋에서.

## 건드리지 말 것
- 모으기 규칙(`src/tiles/aggregate.ts`): 타일 형식 1판의 일부. 바꾸려면 타일 형식 판을 올린다.
- `GENERATOR_VERSION` 3: 이 가지 안에서는 그대로.

## 미검증·TODO·알려진 문제
- NAS에서 두 행성 처음부터 굽기(캐시 `-g3-`), 휴대폰 첫 화면 보기: 미실행.
- 다른 엔진(브라우저) 해시 일치: 미실행(Assumed).
- 사막 몫·사바나·사막 팔레트, 모으기 동점 치우침, 판 2보다 많은 호수: ADR "결과".
- 측정 스크립트(스크래치, 저장소 밖)로 잰 값이 있다: 해안 위반 수, 기후 단계 RSS, 번갈아 잰 CPU.

## 사용자 결정 대기
- 바이옴 표(사막 습도 문턱)·팔레트로 "전부 사막·갈색"을 더 줄일지(기획·디자인).
