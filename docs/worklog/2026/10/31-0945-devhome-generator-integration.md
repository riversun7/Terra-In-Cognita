# 개발자 홈(WP-H)·생성기 다양성 고침(출력 판 3) 합치기

- 일시: 2026-10-31 09:45 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-planet-editor-stage1.md`(38) 1절·"구현하며 정한 것 (WP-H)", ADR `2026-10-29-generator-variety.md`(제안), 작업 기록 `30-0220-editor-devhome.md`·`31-0910-generator-variety.md`, 머지 `27c5259`(WP-H)·`abe2072`(생성기)

## 한 일
- `work/editor-devhome`(WP-H: 개발자 홈 `/dev`, 셰이더 측정판을 관리자 화면에서 `/dev/gpu-bench`로, 미리 캐시 규칙 `DEV_ONLY_CHUNK`)를 main에 합쳤다. 그 가지가 main `acd651d`를 이미 합쳐 두어 충돌은 `docs/WORKLOG.md`뿐이었다.
  - WP-H가 정한 것 셋을 그대로 받았다: 측정판 화면은 다시 내보내기 파일(`editor/gpuBench/gpuBenchScreen.ts`)로 불러 조각 이름이 미리 캐시 제외 규칙에 걸리게 한다(ADR 정규식 그대로), 개발자 홈 조각(약 1.8KB gzip)은 미리 캐시에 남긴다, 화면 시험에는 dev 계정이 없어 admin으로만 봤다(역할 판정은 단위 시험).
- `work/generator-variety`(생성기 출력 판 3, `GENERATOR_VERSION` 3)를 합쳤다. 충돌은 `AGENTS.md` 두 줄과 목차였다.
  - 결정성 검사 줄: main의 `planetCalendar`와 가지의 "시험 도우미는 검사 밖" 문장을 둘 다 남겼다.
  - `PLANET_CACHE_DIR` 줄: main 문구(두 행성)에 출력 판 3과 굽기 시간(행성마다 약 11~14초, 가지 측정)을 넣었다.
- 합친 뒤 첫 검사에서 린트가 새 메시지 키를 못 찾았다(만든 메시지 파일이 낡음). `pnpm --filter @terra/game typecheck`로 다시 만든 뒤 다시 돌렸다.

## 확인
| 확인 | 결과 |
|---|---|
| `TEST_DATABASE_URL=… pnpm check`(DB 시험 포함, 합친 main `abe2072`) | 통과: 시험 파일 196개, 시험 1,886개 모두 통과(건너뜀 0) |
| 첫 화면 JS | WP-H 가지 126,754B(main `acd651d` 위). 합친 main은 푸시 뒤 CI가 잰다 |
| 화면 시험 | 받은 편지 화면 시험(`work/inbox-e2e`)까지 합친 main `248851e`에서 49개 모두 통과(2.0분: 앱 뼈대 17, 개발자 영역 12, 처리할 일·복귀 요약 20) |

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `AGENTS.md` | 충돌 풀기(두 줄) |
| `docs/worklog/2026/10/31-0945-devhome-generator-integration.md` | 이 기록 |

## 함께 바꿔야 하는 파일
- 생성기 출력이 바뀌면 서버 F5 확인 해시 고정값·골든 값·`variety-baseline.json`을 함께 고친다(생성기 ADR).

## 건드리지 말 것
- `DEV_ONLY_CHUNK` 정규식과 개발자 도구 진입 파일 이름 앞머리(`gpuBench`·`planetEditor`)는 함께 바뀌어야 한다(ADR 38 1절).

## 미검증·TODO·알려진 문제
- NAS: 출력 판 3이라 배포 뒤 두 행성(`s2_test_planet`·`s2_editor_planet`)을 처음부터 다시 굽는다(캐시 이름 `-g3-`, 타일 주소 판 바뀜). 배포 뒤 `nas-metrics`로 굽기 시간·메모리·오류를 본다. 여러 번 구우면 RSS가 느는 것(glibc arena)은 이 가지 전부터다(`MALLOC_ARENA_MAX`는 따로 할 일).
- 편집기 메모리 추정표(`apps/game/src/editor/planet/memoryEstimate.ts`)는 출력 판 3에서 다시 재야 한다(검토가 F9 워커 최대 170.0 → 174.9MiB를 쟀다).
- 생성기 다음 할 일(ADR): 타일 모으기 동률 규칙(타일 형식 v2), 사막·사바나 몫(바이옴 표·색 결정, 기획), 호수 몫(5.0 → 6.2%), D-262 현실감 고침(소금 호수·열곡·협곡)은 아직이다.
- 휴대폰에서 새 지형을 본 적은 없다.

## 사용자 결정 대기
- 없음.
