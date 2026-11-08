# 기술 성향 스탯을 DEX·AGI로

- 일시: 2026-11-08 10:25 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-01-first-login-cyborg.md` "바뀜 (기술 성향 스탯, 2026-11-08)", 기획 D-445 168

## 한 일
- 사용자가 사이보그 만들기 화면에서 기술(INT·DEX)과 교역(INT·WIS)이 INT를 겹쳐 쓰고 AGI는 어느 성향에도 없는 것을 짚었다.
- 기술 성향의 치우침 스탯을 DEX·AGI로 바꿨다. 이제 전투 STR·VIT, 기술 DEX·AGI, 교역 INT·WIS로 여섯 스탯이 겹치지 않는다.
- 시험: `packages/sim/src/society/`·`tuning.test.ts`·`apps/server/src/cyborg/` 17파일 131개 통과(DB 시험 2파일은 DB 없이 건너뜀. 성향 목록을 보지 않는 시험이다).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/society/coefficients.ts` | `tech` 성향 `favored`를 `["dex", "agi"]`로 |
| `packages/sim/src/society/cyborgStats.test.ts` | 성향 목록 시험 값과 이름 |
| `docs/adr/2026-11-01-first-login-cyborg.md` | 바뀜 절 |

## 함께 바꿔야 하는 파일
- 성향 목록을 바꾸면 화면은 서버 `cyborg.get` 응답(`apps/server/src/cyborg/service.ts` `temperaments`)을 그대로 쓰므로 따로 고칠 것이 없다. 성향 ID를 바꾸면 메시지 키 `start_temperament_<id>`(ko·en)를 함께 바꾼다.

## 건드리지 말 것
- 성향 ID(`balanced`·`combat`·`tech`·`trade`)는 DB `cyborgs.temperament`에 저장된다. ID는 바꾸지 않는다.

## 미검증·TODO·알려진 문제
- `SIM_VERSION`은 올리지 않았다. 시뮬레이터는 성향 굴림을 쓰지 않는다(`temperamentOf`는 생성·환생에서만 쓴다).
- 화면 시험은 돌리지 않았다(화면 코드는 바뀌지 않음).

## 사용자 결정 대기
- 없음. 기획 기록(D-445 168 바뀜)은 기획 세션에 넘긴다.
