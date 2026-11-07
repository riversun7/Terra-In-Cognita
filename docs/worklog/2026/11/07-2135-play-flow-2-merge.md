# 플레이 흐름 2 묶음 합치기 (WP5~WP8 + 폐허 2)

- 일시: 2026-11-07 21:35 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-play-flow.md`(WP5~WP8), `docs/adr/2026-11-07-ruins-restoration.md`, 기획 D-518(질문 500~538 답)

## 한 일
- 다섯 줄기를 통합 가지(`merge/integration`)에 차례로 합쳤다: `work/play-jobs`(WP8) → `work/play-fog`(WP7) → `work/play-market`(WP6) → `work/play-nations`(WP5) → `work/ruins-2`.
- 판을 하나로 묶었다(main은 아직 배포 전 14·core@48·SIM 16):
  - 프로토콜 15(최소 14) = 직무 위치(`wrong_map`) + 환전(`fx_place`·`fx_cancel` → `fx_result`) + 폐허 2(`not_built`·`expired`). `version.ts` 설명을 하나로 합쳤다.
  - 팩 core@49 하나(세 줄기가 모두 48 → 49로 올려 같은 값).
  - `SIM_VERSION` 17 = 직무 없는 유닛의 쉼 + 도시 매입 호가 + 폐허 2.
  - 판을 세는 프로토콜 시험은 줄기들이 쓴 느슨한 꼴(지금 판·직전 판)로 맞췄다.
- 손으로 푼 코드 충돌:
  - `apps/server/src/npc/economy.ts`: 거래소 줄기의 나라 화폐·환전(`currency.ts`·`fx.ts`)과 나라 성격 줄기의 시뮬 매입 호가(`placeCityBids`)·나라 성격(`personalityOfFaction`)·폐허 줄기의 창고 물건 옮기기(`goodsHome`)를 합쳤다. 서버 쪽 `placeBids`는 지웠다(시뮬 함수가 `economy.currencyOf`로 나라 화폐를 쓴다).
  - `apps/server/src/world/world.ts`: 경제 입력(`config.npc.presets`)과 폐허 입력(`npcRuinsInputOf`)을 둘 다 넘긴다.
- 마이그레이션 갈래: `20261107105609_fx_currency`(거래소)·`20261107110236_ruins_deadline`(폐허)·`20261107110833_city_names`(나라)를 다시 만들지 않고 그대로 합쳤다. `db:generate` = "No schema changes".
- 묶음 검사에서 고친 것:
  - 첫 실행 린트가 화면 문구 키 54개를 "없음"으로 막았다. 원본(ko·en)에는 있고, 이 작업 트리의 생성 파일(`apps/game/src/paraglide/`)이 옛 것이었다(`pnpm check`는 린트를 타입 검사보다 먼저 돌려서, 타입 검사가 문구를 다시 만들기 전에 옛 파일을 본다). `paraglide-js compile`로 다시 만들고 다시 돌렸다. 코드는 바꾸지 않았다.
  - 둘째 실행에서 `apps/server/src/ruins/ruins.db.test.ts` 하나가 실패했다(3,738개 가운데 1개). 폐허 모금 화폐는 들어갈 나라의 화폐(시뮬 `treasuryAsset`)이고, 거래소 줄기 뒤로 이 값이 시험 화폐에서 나라 화폐가 됐는데, 시험은 유저에게 시험 화폐만 줬다. 시험이 모금 화폐를 유저에게 바로 주게 고쳤다(규칙은 그대로).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/protocol/src/version.ts`, `packages/sim/src/version.ts` | 세 줄기의 판 설명을 판 하나(15·17)로 합침 |
| `packages/protocol/src/{cyborg,facilities,market,ruins}.test.ts` | 판 숫자 대신 지금 판·직전 판으로 보는 꼴 |
| `apps/server/src/npc/economy.ts` | 나라 화폐·환전 + 시뮬 매입 호가·나라 성격 + 폐허 창고 물건 옮기기 |
| `apps/server/src/world/world.ts` | 경제 입력에 국가 프리셋, 폐허 입력 |
| `apps/server/src/ruins/ruins.db.test.ts` | 모금 화폐가 나라 화폐가 된 뒤에도 시험이 그 화폐를 준다 |
| `docs/adr/2026-11-07-play-flow.md`, `docs/PLAN.md`, 질문 문서 | 줄기들의 절·줄을 모두 남김 |

## 함께 바꿔야 하는 파일
- 판을 다시 올리면 `packages/protocol/src/version.ts`와 판을 보는 시험, 게임 앱 hello(`PROTOCOL_VERSION`을 가져다 쓴다)를 함께 본다.
- `packages/sim/src/index.ts`는 991줄, `apps/server/src/world/world.ts`는 972줄, `apps/server/src/db/schema.ts`는 946줄이다(1,000줄 넘으면 CI 실패). 더하기 전에 나눈다.

## 건드리지 말 것
- 올라간 마이그레이션(위 셋 포함)은 고치지 않는다. 갈래는 그대로 둔다.

## 미검증·TODO·알려진 문제
- 폐허 모금은 들어갈 나라의 화폐로만 받는다. 유저 지갑(정착 지원금·임금)은 기준 통화(시험 화폐)라서, 유저가 모금하려면 먼저 환전해야 한다. 폐허 화면은 모금 화폐 이름을 보이지만 [환전하러 가기]는 없다 — 질문 546.
- 폐허 줄기 끝에서 econ16 시드 1의 D-391 기술 조건이 실패했다(기술 끝 평균 2,821 < 3,000, main 3,103). 여러 시드로 다시 재는 것은 밸런싱 단계에서 한다(D-515). 이 묶음(나라 성격의 시뮬 매입 호가가 더해짐)에서는 다시 재지 않았다.
- NAS(봇 1,000·나라 4)에서 환전·시장 조성 양, 나라 국고 흐름, 자원 맞춤 시설은 배포 뒤 본다.
- 2차맵 사이 이동 명령(D-197)이 없어 1차맵 [정찰 보내기]의 [확정]은 막혀 있다(질문 571). 직무 줄기의 "맵을 떠나면 배치 풂"도 이동이 생겨야 실제로 돈다.

## 사용자 결정 대기
- 없음.
