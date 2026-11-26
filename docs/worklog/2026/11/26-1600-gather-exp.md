# 채집·직무 경험치(기본 10 + 티어당 10, 설정 칸) — 사이보그 본체

- 일시: 2026-11-26 16:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-11-26-gather-exp.md`(새로 씀), `2026-11-26-job-fatigue-per-lot.md`

## 한 일

사용자 물음("채집이나 직무에 따른 경험치 … 기본 10 어떤가? 채집티어에 따라 증가는?")에 값을 제안했고(기본 10, 티어마다 +10) "네, 구현"으로 만들었다.

- 서버에 경험치를 주는 코드가 없었다(레벨 표·칸만 있었다).
- 채집 한 번의 경험치 = 기본 10 + 10 × 나온 물건의 티어. 설정 칸 `gather_obj_exp`·`gather_obj_exp_tier`.
- 직접 채집: 한 번 캘 때마다 물건을 얻은 일꾼마다. 직무: 물건이 나온 묶음 하나마다.
- 일한 유닛이 사이보그 본체면 사이보그 경험치로 받는다. 구간을 넘으면 레벨이 오른다(경험치 표 = 팩 `exp_table`, 만렙 = 설정 칸).
- 휴먼·사이보그 유닛은 아직 받지 않는다(경험치를 둘 곳이 없고 레벨이 몸에 이어져 있지 않다).

## 바꾼 파일과 이유

| 파일 | 이유 |
|---|---|
| `packages/sim/src/society/gatherObjects.ts`, `labor.ts`, `labor.test.ts`, `packages/sim/src/tuningGather.ts` | 계수 `expPerGather`·`expPerTier`, 규칙 `gatherExp`, 설정 칸 |
| `content/core/tuning.json`, `manifest.json` | 설정 칸 둘(10·10), 팩 판 |
| `apps/server/src/labor/gatherWork.ts`, `gatherWork.test.ts` | 묶음 결과에 물건이 나온 묶음 수·티어 합 |
| `apps/server/src/labor/workBook.ts`, `service.ts` | 묶음 경험치 고리(`onLots` → `gainExp`) |
| `apps/server/src/gather/crewYield.ts`, `service.ts`, `serviceTypes.ts`, `world.ts`, `service.test.ts` | 직접 채집 경험치(일꾼마다) |
| `apps/server/src/cyborg/service.ts`, `state.ts`, `gateway.test.ts`, `cyborg.db.test.ts` | `addExp`(레벨 오르기), 레벨·경험치 칸을 바꿀 수 있게 |
| `apps/server/src/world/world.ts` | 유닛 → 사이보그 경험치 연결, 경험치 표 넘기기 |
| `docs/adr/2026-11-26-gather-exp.md` | 새 결정 |

## 함께 바꿔야 하는 파일

- `CyborgService`를 흉내 내는 시험은 `addExp`도 넣는다.
- 유닛(휴먼·사이보그 유닛) 경험치를 붙일 때: `world/world.ts` `gainUnitExp`와 `gather/world.ts` `gainExp`가 받는 쪽을 가르는 자리다.

## 건드리지 말 것

- 없음.

## 미검증·TODO·알려진 문제

- 실제 화면에서 본체로 캐서 경험치 막대·레벨이 오르는 것은 보지 않았다(미실행).
- 휴먼·사이보그 유닛은 경험치를 받지 않는다. 시설 일꾼이 대부분 휴먼이라 직무 경험치는 본체가 직접 일할 때만 든다.
- 경험치 표의 주석 가정(시간당 1,500)보다 훨씬 느리다(T0 기준 하루 약 720 ~ 1,440).
- 채집이 아닌 직무·전투는 경험치가 없다. 레벨 오름 알림도 없다.
- 팩 판: 작업 트리에 다른 작업(크리쳐 초상화)이 올려 둔 판과 겹친다. 그 작업은 커밋할 때 한 번 더 올려야 한다(호환 검사가 알린다).

## 검증

- Verified(깨끗한 작업 복사본, `50fee6ae` + 이 변경): `pnpm check` 통과(시험 6,252개 통과·432개 건너뜀), `check:content` 호환 통과(core@161).
- Verified(로컬 PostgreSQL 15, `TEST_DATABASE_URL`): 서버 시험 전체 386파일 2,275개 통과(DB 시험 포함 — 경험치로 레벨이 오르고 다시 켜도 남음 `cyborg/cyborg.db.test.ts`).
- 단위 시험: 경험치 규칙(`labor.test.ts`), 묶음의 티어 합(`gatherWork.test.ts`), 직접 채집 한 번에 10(`gather/service.test.ts`).
