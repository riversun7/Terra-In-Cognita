# 전투 규칙(D-457~D-459) main 합치기, 질문 226

- 일시: 2026-11-01 16:20 (KST)
- 작업 도구: Claude Code
- 관련: main 380ff2a(가지 `work/combat-d459`), ADR `2026-10-31-combat-core.md` "바뀜 (2026-11-01, D-457~D-459)", 질문 `docs/questions/2026-11-01-combat-d463-followup.md`

## 한 일
- `work/combat-d459`를 main에 빨리감기로 합쳤다(380ff2a). 푸시 전 훅 `pnpm check`(DB 시험 포함)·문서 규칙·콘텐츠 검사(core@17)·목차 통과.
- 남은 해석 하나(속성 무기를 든 유닛의 물리 기반 스킬)를 질문 226으로 만들어 기획에 보냈다. PLAN 14장 상태 줄에 226과 밸런스 화면 가지를 적었다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `docs/questions/2026-11-01-combat-d463-followup.md` | 질문 226(기술 추천 가가 지금 코드) |
| `docs/PLAN.md` | 14장 상태 줄: 226, `work/balance`, 새 질문 번호 227부터 |

## 함께 바꿔야 하는 파일
- 226 답이 가가 아니면 `packages/sim/src/combat/unitSpec.ts` `specFromStats`의 `skillAttack.physical`과 그 시험.

## 건드리지 말 것
- 없음(문서만).

## 미검증·TODO·알려진 문제
- 배포 확인(CI·NAS 지표)은 다음 점검에서 한다.
- 전투 작업이 남긴 것: 같은 유닛끼리 대결이 7:23으로 한쪽에 치우침(원인 미확인, 밸런스 화면 작업이 진단), 낮은 스탯 유닛(STA 점수 16)은 공격마다 스태미나 5배를 내서 공격이 드묾(출발값).

## 사용자 결정 대기
- 없음.
