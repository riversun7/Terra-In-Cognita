# NAS 실행기 무한 재시작 수정, NAS 컨테이너 정리 안내

- 일시: 2026-10-28 15:35 (KST)
- 작업 도구: Claude Code (클라우드 세션)
- 관련: `ops/nas-setup.md`, ADR `2026-10-28-deploy-and-ops.md`, 이전 기록 `28-1450-m0-skeleton.md`

## 한 일
- 사용자가 NAS에 실행기(`tic-runner`)를 설치했더니 컨테이너가 무한 재시작했다. 원인을 실행기 이미지의 `entrypoint.sh`에서 확인하고 compose를 고쳤다.
  - 원인(Verified: myoung34/docker-github-actions-runner master의 `entrypoint.sh`): `CONFIGURED_ACTIONS_RUNNER_FILES_DIR`를 쓰면서 `DISABLE_AUTOMATIC_DEREGISTRATION`이 `true`가 아니면 경고를 찍고 `exit 1`한다. README는 "should be set"이라고만 써 있어 빠뜨렸다.
  - 저장 폴더(`tic-runner/config`)는 이미지가 만들지 않는다(같은 파일의 `cp` 줄). 설치 안내에 폴더 만들기를 추가했다.
  - 다시 등록할 때는 `config.sh --replace`라서 같은 이름(`nas`)이 남아 있어도 덮어쓴다(같은 파일).
- 사용자 요청: 기존 버전(AntiGravt01)은 운영 서버만 남기고 테스트 서버 삭제. 삭제 순서를 `ops/nas-setup.md` 7단계에 적고 PLAN 9.4를 고쳤다. 삭제 작업은 사용자가 NAS에서 한다(이 세션은 NAS에 접속할 수 없음).
- NAS 컨테이너 확인(사용자 제공 화면, 2026-10-28):
  | 컨테이너 | 무엇 | 처리 |
  |---|---|---|
  | `terra-server`, `terra-client`, `terra-postgres`, `terra-watchtower` | 기존 버전 운영(`antigravt01` 프로젝트) | 유지 |
  | `terra-test-server`, `terra_testDB` | 기존 버전 테스트 서버·DB | 삭제(사용자 결정) |
  | `sunplant-db` | 다른 프로젝트(저장소 `sunplant26`, 선플란트치과 웹사이트)의 DB | 유지(사용자 결정) |
  | `KS-FrontierDB` | 미확인 | 사용자 확인 대기 |
  | `synology_docviewer_1`, `_2` | Synology 문서 뷰어 패키지가 만든 것으로 보임(Assumed) | 패키지 사용 여부에 따라 |
  | `mac2-landing-1` | 꺼져 있음. 저장소 `Mac2-landing`의 랜딩 페이지로 보임(Assumed) | 사용자 판단 |
- `KS-FrontierDB` 조사: AntiGravt01 코드·커밋 이력에 이름 없음(Verified: `git log -S`, grep), 사용자 GitHub 저장소 25개 이름에 없음(Verified), `sunplant26`·`unity2605` 코드 검색 결과 없음(검색 색인이 불완전하다고 나와 Unknown). 프로젝트 소속 없이 `postgres:latest`로 만든 점이 `sunplant-db`·`terra_testDB`와 같아 손으로 만든 DB로 보인다(Assumed).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `ops/runner/compose.yml` | `DISABLE_AUTOMATIC_DEREGISTRATION: "true"` 추가(무한 재시작 원인) |
| `ops/nas-setup.md` | `tic-runner/config` 폴더 미리 만들기, 테스트 서버 삭제 순서, 문제 해결 항목 |
| `docs/PLAN.md` | 9.4: 기존 테스트 서버·DB는 사용자 결정으로 삭제 |

## 함께 바꿔야 하는 파일
- 실행기 설정을 바꾸면 `ops/runner/compose.yml`과 `ops/nas-setup.md`를 함께.

## 건드리지 말 것
- NAS의 `docker/antigravt01` 폴더(운영 서버가 씀), `sunplant-db`(다른 프로젝트).
- AntiGravt01 저장소 main: 고치면 기존 CI가 이미지를 만들고 watchtower가 운영 서버에 자동 반영한다. 테스트 서버 선택지 제거 같은 코드 수정은 하지 않았다.

## 미검증·TODO·알려진 문제
- 고친 설정으로 다시 만든 뒤 실행기가 정상 실행됨(사용자 확인 16:05경, Container Manager 초록불). 작업 수신은 `nas-facts` 실행으로 확인한다.
- 이후 추가: 실행기 이미지를 지문(digest)으로 고정(`ops/runner/compose.yml`). NAS에서 지금 도는 이미지와 같은 것(태그 갱신 2026-10-26, Assumed)이라 NAS 쪽은 다시 설치할 때만 바꾸면 된다. `nas-facts`에 컨테이너 공개 포트를 추가(4100 충돌 확인용).
- 실행기 이미지의 docker CLI와 NAS Docker 엔진의 API 버전이 맞는지 미확인. 첫 배포나 `nas-facts`에서 "client version ... is too new"가 나오면 실행기에 `DOCKER_API_VERSION`을 지정해야 한다.
- `KS-FrontierDB`, `synology_docviewer_*`, `mac2-landing-1` 처리는 사용자 확인 후.

## 사용자 결정 대기
- `KS-FrontierDB`가 무엇인지(컨테이너 상세 화면의 볼륨 경로·포트·DB 이름으로 판단).
- Synology 문서 뷰어 패키지를 계속 쓸지, `mac2-landing-1`을 지울지.
