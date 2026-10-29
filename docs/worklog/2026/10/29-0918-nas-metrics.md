# 운영 지표 보기 워크플로(nas-metrics) — S1의 NAS 쪽 지표를 재려고

- 일시: 2026-10-29 09:18 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-28-s1-second-map.md`(33, 제안) "S1 측정"의 남은 항목(NAS 서버 쪽 지표), 작업 기록 `2026/10/29-0832-s1-phone-measure.md`, PLAN 9.5(텔레메트리)

## 한 일
- 수동 실행 워크플로 `nas-metrics`를 더했다. NAS 실행기에서 읽기만 한다.
  - 앱 컨테이너 시작 시각·이미지, `docker stats`(앱·DB의 CPU·메모리·네트워크).
  - 서버 1분 지표 줄(`"metric":"server"`, S1 경로·전송 값 포함).
  - 기기 성능 표(`client_perf_samples`)와 기기 오류 표(`client_errors`)의 최근 줄.
- 입력(최근 몇 분)은 숫자만 받는다. SQL·명령에 넣기 전에 검사한다. 컨테이너 환경 변수(비밀값 있음)는 출력하지 않는다.
- `ops/nas-setup.md` 9장(관측)과 AGENTS.md 7장 명령 표에 적었다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `.github/workflows/nas-metrics.yml`(새) | 운영 지표를 한 번에 보기(S1 NAS 쪽 측정, 뒤에 S3 측정에도 씀) |
| `ops/nas-setup.md` | 9장 관측: 보는 법, 관련 파일 목록 |
| `AGENTS.md` | 7장 명령 표에 한 줄 |

## 함께 바꿔야 하는 파일
- 서버 지표 줄의 필드를 바꾸면(`apps/server/src/metrics.ts`, `src/world/worldStats.ts`) 이 워크플로의 grep 기준(`"metric":"server"`)이 맞는지 본다.
- 기기 표의 열을 바꾸면(`apps/server/src/db/schema.ts`) 워크플로의 SQL을 함께 고친다.

## 건드리지 말 것
- 컨테이너 환경 변수를 출력하는 명령(`docker inspect` 전체, `env`)을 넣지 않는다. DB 비밀번호·인증 비밀값이 들어 있다.

## 미검증·TODO·알려진 문제
- 아직 실행하지 않았다(미실행). 이 커밋은 문서 밖 파일이 바뀌어 배포가 한 번 돈다. 배포로 앱 컨테이너가 새로 만들어지면 그 전의 서버 지표 줄은 없어진다. 그래서 새 컨테이너로 1시간쯤 모은 뒤 실행한다.
- 잰 값은 ADR 33 "S1 측정"에 더한다.

## 사용자 결정 대기
- 없음.
