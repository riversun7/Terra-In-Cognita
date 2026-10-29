# 단위 시험 제한 시간 30초(공유 개발 컨테이너 부하)

- 일시: 2026-10-29 21:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-28-m0-toolchain.md`(17, 검사 도구), 머지 `b1e3b4d`(기획 반영, 문서만)

## 한 일
- 기획 반영 가지를 main에 합친 뒤 푸시 전 검사(`pnpm check`)가 세 번 실패했다. 모두 시험 제한 시간(기본 5초) 초과였다(Verified).
  - 첫 두 번: `apps/server/src/planet/bake.test.ts` "워커에서 구운 결과가 같은 스레드에서 구운 것과 같다" 5,071ms.
  - 셋째: `packages/planet/src/neighbors.test.ts` 이웃 대칭 5,211ms, `bake.test.ts` 타일 덩어리 5,835ms, `packages/sim/src/path/astar.test.ts` 결정성 8,515ms, `apps/game/src/admin/gpuBench/gpuBenchWorkload.test.ts` 색 범위 6,128ms.
  - 그때 기계 부하 평균은 약 9~12였다(4 vCPU, 다른 작업 6개가 함께 돎). `bake.test.ts`만 따로 돌리면 11개 모두 통과했다(Verified: 부하 약 10에서 8.6초·5.7초).
- 시험 하나씩 고치면 끝이 없어서 루트 `vitest.config.ts`의 `testTimeout`·`hookTimeout`을 30초로 올렸다. 시험은 끄거나 빼지 않았다.
  - CI는 따로인 실행기라 이 값의 영향이 없을 것으로 본다(Assumed).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `vitest.config.ts` | 시험·준비 단계 제한 시간 30초 |
| `docs/worklog/2026/10/29-2100-bake-test-timeout.md` | 이 기록 |

## 함께 바꿔야 하는 파일
- 없음.

## 건드리지 말 것
- 성능 확인은 벤치(`pnpm --filter @terra/planet bench` 등)가 한다. 시험 제한 시간으로 느려짐을 잡으려 하지 않는다.

## 미검증·TODO·알려진 문제
- 정말 멈춘 시험은 이제 30초 뒤에 실패한다(전에는 5초).
- 이 커밋은 문서 밖 파일을 바꿔 배포가 돈다. 생성기·정의가 그대로라 NAS는 캐시로 켤 것이다(Assumed). 배포 뒤 `nas-metrics`에서 `planetCacheHits` 1·굽기 0을 본다(작업 기록 `29-1910` TODO).

## 사용자 결정 대기
- 없음.
