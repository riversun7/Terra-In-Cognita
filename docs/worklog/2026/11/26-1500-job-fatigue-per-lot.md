# 직무(시설 일꾼)의 피로를 묶음 하나마다 10점 × 시설 배율로(설정 칸)

- 일시: 2026-11-26 15:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-11-26-job-fatigue-per-lot.md`(새로 씀), `2026-11-26-fatigue-stat-penalty.md`, 앞 작업 기록 `26-1330-fatigue-stat-penalty.md`·`26-1400-unit-life-rules.md`

## 한 일

사용자 지적("직무 10점이라도 말안했냐?", "네, 설정 칸으로")으로 직무 피로를 고쳤다. 앞 작업은 직접 채집만 10점으로 바꾸고 직무는 일 주기마다 1점으로 뒀다(잘못 읽음).

- 단위를 물었다: 묶음(수확) 하나마다 / 일 주기(1분)마다 / 시간 지정 → 답 "묶음(수확) 하나마다".
- 설정 칸 `gather_obj_job_fatigue`(출발값 10점)를 더했다.
- 채집 시설에서 일하는 유닛은 묶음 하나를 끝낼 때마다 10점 × 시설 피로 배율(레벨 1 = 900‰)이 쌓인다. 묶음을 못 끝낸 주기는 피로가 없다.
- 구현은 채집소의 정산 뒤 피로 맞추기다: 엔진이 일 주기마다 쌓은 1점을 모두 덜고 묶음 몫을 쌓는다.

## 바꾼 파일과 이유

| 파일 | 이유 |
|---|---|
| `packages/sim/src/society/gatherObjects.ts`, `packages/sim/src/tuningGather.ts` | 계수 `jobFatiguePerLot`와 설정 칸 |
| `content/core/tuning.json`, `manifest.json` | 설정 칸 `gather_obj_job_fatigue` = 10, 팩 판 160 |
| `apps/server/src/gather/station.ts` | 정산 뒤 피로 맞추기(부호 있는 값, 묶음 단위) |
| `apps/server/src/gather/station.test.ts`, `station.db.test.ts` | 새 규칙 시험·기대값 |
| `docs/adr/2026-11-26-job-fatigue-per-lot.md` | 새 결정 |

## 함께 바꿔야 하는 파일

- 팩 설정 칸과 기본 계수표는 같아야 한다(`world/combatCatalog.test.ts`가 본다): 칸 값을 바꾸면 `gatherObjects.ts` 기본값도 바꾼다.

## 건드리지 말 것

- `gather/station.ts` `fatigueRefundPm`의 "일한 주기 × 1000을 모두 던다": 빼면 엔진의 주기당 1점과 묶음 피로가 겹쳐 쌓인다.

## 미검증·TODO·알려진 문제

- 실제 화면에서 시설 일꾼의 피로가 묶음마다 오르는 것은 보지 않았다(미실행).
- 지금보다 훨씬 덜 쌓인다(레벨 1 시설: 묶음 10개 = 벌목장·광산 약 5시간, 농장 약 10시간에 90. 앞에는 90분).
- 정산 한 번 안에서는 엔진이 일 주기마다 1점으로 쉴 때를 본다. 정산 간격이 길면 묶음 단위보다 일찍 쉰 것으로 셈한다(평소는 1분마다 훑는다).
- 채집 시설이 아닌 직무(병원 의사·거래 직무)와 채집소 고리가 없는 세계는 일 주기마다 1점 그대로다.
- 기획 49 N22에 값을 정한 것이다. 기획 세션에 전달이 필요하다.

## 검증

- Verified(깨끗한 작업 복사본, `796f410f` + 이 변경): `pnpm check` 통과(시험 6,251개 통과·431개 건너뜀), `check:content` 호환 통과.
- Verified(로컬 PostgreSQL 15, `TEST_DATABASE_URL`): 서버 시험 전체 386파일 2,274개 통과(DB 시험 포함 — 농장 직무 80분에 묶음 하나 → 피로 9 `gather/station.db.test.ts`).
- 팩 판: 작업 트리에 다른 작업(크리쳐 초상화)이 판을 161로 올려 두어, 이 커밋은 160으로 올렸다(그 작업이 161을 쓴다).
