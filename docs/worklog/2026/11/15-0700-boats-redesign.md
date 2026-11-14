# 배 재료 돌려주지 않음(D-545 1405) + 배 체계 개편 설계안(조선소·정박장, 질문 1481~1500)

- 일시: 2026-11-15 06:55 ~ 07:40 (KST)
- 작업 도구: Claude Code
- 관련: 가지 `work/boats-redesign`(71d47558bc 위 — main + 미러 D-545), 기획 D-545, ADR `docs/adr/2026-11-13-boats.md` "바뀜 (2026-11-15)", 새 ADR
  `docs/adr/2026-11-15-shipyard-harbor.md`(제안), 질문 `docs/questions/2026-11-15-boats-redesign.md`(1481~1500), 앞 줄기 `14-1630-boats-b3.md`

## 한 일
1. **1405 "돌려주지 않음"(D-545, 구현)**: 만드는 중에 부두가 없어지면 작업을 버리고 재료도 잃는다(뺀 재료는 시스템 소비 계정에 남음). B3가 넣은 돌려주기 길을 지웠다:
   `facilities/materials.ts`의 `spendGoodsTaken`·`refundGoods`·`TakenMaterial`(배 말고 쓰는 곳이 없었다 — Verified: grep), 배 서비스의 돌려줄 자리 고르기(`refundPlace`),
   거래 종류 `boat_refund`. `spendGoods`는 B2 모양으로 되돌렸다(파일이 0acb630dbb 판과 같다). 작업 줄 jsonb는 다시 `[{item, qty}]`만 적고(뺀 자리를 저장하지 않음 — 쓰는 곳이
   없다), B3 판이 적은 줄의 `location`은 읽을 때 버린다(열·마이그레이션 그대로).
2. **배 체계 개편 설계(설계만, 코드 없음)**: 사용자 원문(D-545)을 조선소(건조·수리, 선대 수 = 레벨) + 정박장(지금 `dock`, 이름만 바꿈 — 정박 자리 = 유닛 주거, 임시 자리 =
   교역용 짧은 묵음, 더 많음) + 배의 집 저장(`boat_berths`)·바깥 묘박(노숙 틀) + 외부 배 받기 권한·정박료(숙소 요금 틀) + 선체 내구도·조선소 수리(건물 수리 식)로 짰다.
   지금 세계는 리셋 없이 옮긴다(더하기 → 바꾸기 → 정리). 작업 순서 WP1~WP7. 질문 20개(1481~1500, 모두 추천안 있음).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/facilities/materials.ts` | 돌려주기 함수·자리 기록 지움(B2 판으로) |
| `apps/server/src/boats/service.ts` | 부두를 잃으면 재료를 잃음(기록 문구), 재료 빼기는 `spendGoods` |
| `apps/server/src/boats/store.ts` | 작업 줄 재료 = 아이템·양만, 옛 B3 줄의 자리는 버림 |
| `apps/server/src/boats/b3.test.ts` | 돌려주기 시험 → "돌아오지 않음"(창고 6 그대로·소비 계정 14·배 안 뜸)·jsonb 읽기 시험 |
| `docs/adr/2026-11-13-boats.md` | "바뀜 (2026-11-15, D-545 1405)" |
| `docs/adr/2026-11-15-shipyard-harbor.md`(새) | 조선소·정박장 설계안(제안) |
| `docs/questions/2026-11-15-boats-redesign.md`(새) | 질문 1481~1500 |

## 함께 바꿔야 하는 파일
- 없음. 팩·프로토콜·SIM_VERSION·마이그레이션은 바꾸지 않았다(배정된 core@93·프로토콜 30은 쓰지 않았다).

## 건드리지 말 것
- `battle-report-2` 줄기 파일(전투 보고서). 이 줄기는 배·재료 파일과 문서만 고쳤다.
- 질문 1481~1500 답이 오기 전에는 설계안을 코드로 옮기지 않는다(D-545 "설계안을 질문 파일로 먼저").

## 리셋 필요 여부
- **필요 없음.** 1405는 배가 뜰 시각의 처리만 바꿨다(표·열 그대로, 옛 줄도 읽는다). 설계안도 리셋 없이 옮기는 길(ADR 9절)을 추천한다.

## 검사 (Verified: 실행)
- `apps/server` 배 시험(`src/boats`): 4 파일 18 시험 통과. 서버 `typecheck`·oxlint(바꾼 파일)·biome 통과.
- `pnpm check`(TEST_DATABASE_URL 포함, 9d5f783 위): 704 파일 5,274 시험 모두 통과(건너뜀 0). 첫 실행은 시험 DB가 꺼져 있어 DB 시험이 실패했고, DB를 켜고 다시 돌렸다.
- 화면 시험: 돌리지 않았다 — `e2e/boats.spec.ts`는 돌려주기를 보지 않고(Verified: 파일 읽기, 8행 "돌려주고"는 `readyAtMs` 이야기), 화면 흐름이 바뀌지 않았다. 앱(`apps/game`)을
  고치지 않아 빌드·`check-pwa`·`check:bundle`도 돌리지 않았다.

## 미검증·TODO·알려진 문제
- NAS 세계의 배·부두·`boat_jobs` 수는 Unknown(운영 DB를 읽지 않았다). 설계안의 옮기기(9절)는 그 수와 상관없이 잃는 것이 없게 짰다(Assumed: 부두 Lv1 정박 2 자리로 대개 모자라지 않음).
- B3 판이 적은 작업 줄 jsonb의 `location` 칸은 그대로 남는다(읽지 않음). 줄은 배가 뜨면 지워지므로 따로 정리하지 않는다.
- 부두가 다른 세력에게 넘어간 경우(부서지지 않고 주인이 바뀜) 만드는 중인 배는 옛 주인에게 뜬다 — 지금 코드 그대로(이 줄기 범위 밖, 설계안 WP2에서 조선소 주인 확인을 더함).

## 사용자 결정 대기
- 질문 1481~1500(`docs/questions/2026-11-15-boats-redesign.md`).
