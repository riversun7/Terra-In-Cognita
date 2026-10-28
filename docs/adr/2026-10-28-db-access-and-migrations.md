# DB 접근과 마이그레이션

- 상태: 확정
- 날짜: 2026-10-28
- 관련: docs/PLAN.md 3장·9.1·9.4, `2026-10-28-stack-baseline.md`, `2026-10-28-deploy-and-ops.md`, `2026-10-28-state-persistence.md`

## 배경
Drizzle ORM(1.0 RC)은 계획에 있지만, 정하지 않은 것이 세 가지 있었다.
- DB 연결 라이브러리
- 마이그레이션을 언제·어떻게 적용할지
- 되돌림과의 관계: 배포 스크립트에는 마이그레이션 자리만 있었고, 되돌림(직전 이미지로 복귀)은 DB 구조를 되돌리지 않는다.

## 선택지
- 연결 라이브러리: **pg(node-postgres) 8.23.1** / postgres.js 3.4.9
- 적용 시점: 서버가 켜질 때마다 자동 적용 / **배포 스크립트가 앱 교체 전에 한 번**
- 되돌림과의 관계: 되돌리는 마이그레이션(down) 작성 / **직전 버전 앱과 호환되는 마이그레이션만 + 배포 전 백업**

## 결정
- 연결 라이브러리는 pg를 쓴다(사용자 결정 2026-10-28). 연결 풀 최대 10개, 연결 대기 5초.
- 표 정의는 `apps/server/src/db/schema.ts`에 둔다. 마이그레이션은 drizzle-kit이 만든 SQL을 `apps/server/drizzle/<시각>_<이름>/migration.sql`로 커밋한다.
- 배포: `ops/deploy.sh`가 4단계에서 배포 전 백업을 하고, 5단계에서 새 이미지로 `node dist/migrate.js`를 한 번 실행한 뒤 6단계에서 앱을 바꾼다.
- 마이그레이션은 **직전 버전 앱이 그대로 돌 수 있게** 만든다. 표·열 추가는 바로 한다. 삭제·이름 변경·형식 변경은 세 단계로 나눈다: 추가 → 코드 전환 → 다음 배포에서 정리.
- 이미 올라간 마이그레이션은 고치지 않는다. `docs/PROTECTED.md`에 적고, `scripts/check-docs.mjs`가 검사한다.
- 헬스체크(`/health`)는 DB 응답을 확인한다. 2초 안에 답이 없으면 503을 돌려준다. DB 주소가 없으면 `db: "off"`로 뜬다(이미지 동작 확인용).
- 테스트:
  - DB 통합 테스트는 `TEST_DATABASE_URL`이 있을 때만 돈다.
  - CI는 운영과 같은 `postgres:18.6-trixie` 서비스 컨테이너를 쓴다.
  - 표 정의만 바꾸고 마이그레이션을 빠뜨리면 CI가 실패한다.

## 이유
- **pg**:
  - 가장 널리 쓰인다.
  - Better Auth가 선택적 peer 의존성으로 올려 두었다(Verified: npm `better-auth@1.7.14` peerDependencies). postgres.js는 그 목록에 없다.
  - Drizzle에 공식 드라이버가 있다(Verified: `drizzle-orm/node-postgres`).
- **한 트랜잭션으로 적용**: Drizzle 1.0 RC는 밀린 마이그레이션을 트랜잭션 하나로 적용한다(Verified: `drizzle-orm@1.0.0-rc.5`의 `pg-core/async/session.js`). PostgreSQL은 DDL도 트랜잭션으로 되돌리므로, 실패하면 DB가 그대로 남는다.
- **서버 시작 때 적용하지 않는 이유**:
  - 되돌림으로 옛 앱을 띄울 때도 적용 코드가 돈다.
  - 프로세스가 늘면 여러 곳에서 동시에 적용할 수 있다.
  - 배포 스크립트 한 곳에서 하면 순서가 분명하다(백업 → 적용 → 교체).
- **down 마이그레이션을 쓰지 않는 이유**: 데이터를 잃을 수 있고 시험하기 어렵다. 직전 버전 호환과 백업이 더 안전하다.
- **고치기 금지를 도구로 막는 이유**: Drizzle은 적용된 마이그레이션을 이름으로만 건너뛴다(Verified: `migrator.utils.js`의 `getMigrationsToRun`). 내용을 고쳐도 운영 DB에는 반영되지 않고 조용히 어긋난다.
- **Drizzle 1.0 RC에서 확인한 차이**(Verified: 패키지 타입 정의):
  - 연결 설정에 `casing`·`schema` 옵션이 없다 → 열 이름을 직접 쓴다.
  - `db.execute` 결과가 여러 문장용 배열일 수도 있는 타입이다 → 단순 조회는 `db.$client.query`로 한다.
- **로컬 확인**(Verified: PostgreSQL 16.15, 작업 기록 `docs/worklog/2026/10/28-1810-db-layer.md`): 빌드한 `dist/migrate.js`의 1회차 적용·2회차 무변화를 확인했다. 서버에서는 DB를 끄면 503, 다시 켜면 자동 재연결, 종료 신호에 정상 종료하는 것을 확인했다.

## 결과
- 배포가 마이그레이션 한 단계(1회용 컨테이너 실행)만큼 길어진다.
- 열 삭제·이름 변경에는 배포가 두 번 필요하다.
- 마이그레이션이 실패하면 배포가 멈추고, 앱은 직전 버전 그대로다.
- 로컬에서 DB 테스트를 돌리려면 PostgreSQL을 띄우고 `TEST_DATABASE_URL`을 준다. 접속 계정에 CREATEDB 권한이 필요하다.
- 연결 풀 크기(10)는 추정값이다(Assumed). S3(서버 규모) 단계에서 측정해 다시 정한다.
