# S3 WP-E: kill -9 복구 하네스, 규모 계단 시험 작업(NAS), 개발 컨테이너 계단

- 일시: 2026-10-31 21:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-31-s3-server-stage.md` 6·7절·"구현하며 정한 것 (WP-E)", 앞 작업 기록 `2026/10/31-1930-s3-wp-b-vision.md`

## 한 일
- `ops/s3-crash.mjs`: 빌드한 서버를 띄우고 무작위 시각에 SIGKILL → 다시 켜서 준비까지 시간·`worldIssues`·`check-world`를 N번 본다.
- GitHub Actions `s3-ramp`(수동) + `ops/s3-ramp.sh` + `ops/s3-ramp-summary.mjs`: NAS에서 운영 컨테이너를 건드리지 않고 봇 수를 1천 → 10만까지 올리며 처음 무너지는 계단에서 멈춘다. 계단마다 SIGKILL 복구도 잰다. 요약 표에 CPU 모델과 1천 개당 비용(CPU ms/초, 늘어난 MB, DB 행/초)을 적는다.
- 개발 컨테이너에서 같은 계단을 짧게 돌려 요약 스크립트를 확인하고 참고 값을 얻었다(NAS 값이 아니다).

## 검사·측정
- kill -9 5회(Verified: `DATABASE_URL=… node ops/s3-crash.mjs`, 개발 컨테이너, 빌드한 서버, 봇 1,000개, PostgreSQL 16.15): 복구 1,755~2,238ms(부팅 복구 216~326ms), `worldIssues` 0, `check-world` 위반 0. 통과 기준(< 60초, 위반 0) 안.
- 개발 컨테이너 계단(Verified: 저장소 밖 스크립트 `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/s3-ramp-local.sh`, Intel Xeon 2.1GHz 4 vCPU 공유, 메모리 상한 없음, 계단마다 130초, 결과 폴더 `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/s3-ramp-local/`): 봇 1천·5천·2만·5만 모두 버팀. 루프 p99 최대 2.4·16.6·2.1·3.3ms, RSS 202·247·307·707MB, CPU(코어 하나) 2.2·7.0·19.4·37.4%, DB 행/초 45·253·946·2,322, SIGKILL 복구 1.1~2.7초, 위반 0. 표는 ADR "구현하며 정한 것 (WP-E)".
- 읽은 것(Assumed): 메모리 1천 개당 약 10MB → NAS 컨테이너 1GiB에서는 약 7만 개 근처에서 메모리가 먼저 닿을 것(NAS 탓). NAS 값은 `s3-ramp`가 잰다.
- `bash -n ops/s3-ramp.sh` 통과. 요약 스크립트는 위 개발 컨테이너 결과로 돌려 표를 만들었다.
- `TEST_DATABASE_URL=postgres://terra@127.0.0.1:55432/postgres pnpm check` 통과(아래 커밋 전에 다시 돌림).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `ops/s3-crash.mjs`(새) | kill -9 복구 시험 |
| `ops/s3-ramp.sh`(새), `ops/s3-ramp-summary.mjs`(새), `.github/workflows/s3-ramp.yml`(새) | NAS 규모 계단 시험 |
| `AGENTS.md` 7장 | 두 명령 |
| `docs/adr/2026-10-31-s3-server-stage.md` | 6절(NAS 값은 아래쪽 한계), 구현하며 정한 것 (WP-E) |

## 함께 바꿔야 하는 파일
- 서버 1분 지표 줄의 이름(`eventLoopP99Ms`·`rssMb`·`cpuPercent`·`dbRows`·`dbCommitMsMax`·`dbPending`·`s1Units`)을 바꾸면 `ops/s3-ramp.sh`(멈춤 판정)와 `ops/s3-ramp-summary.mjs`를 같이 고친다.

## 건드리지 말 것
- `s3-ramp`는 운영 컨테이너(`tic-app`·`tic-db`)와 다른 프로젝트 DB(`sunplant-db`, ks-frontier)를 쓰지 않는다. 스크립트가 그 이름을 거절한다.

## 미검증·TODO·알려진 문제
- `s3-ramp` 작업은 아직 NAS에서 돌리지 않았다(개발 환경에 Docker 데몬이 없어 `bash -n`만 했다). 처음 돌릴 때 확인할 것: 시험 DB 컨테이너 이름(`terra_testDB`), 그 안의 관리자 계정(`POSTGRES_USER`, 없으면 `postgres`)으로 소켓 접속이 되는지, 시험 DB 네트워크에 붙인 컨테이너가 DB 주소로 닿는지.
- 돌리려면 S3 코드(`S1_TEST_MAPS`)가 든 이미지가 NAS에 배포돼 있어야 한다(입력 `tag`를 비우면 배포된 태그). 실행기는 main 작업만 돌린다.

## 사용자 결정 대기
- 없음.
