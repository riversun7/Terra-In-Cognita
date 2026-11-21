# 거래소 물건 보증금 불일치("market escrow differs after restore") 원인과 부팅 손질 (escrow-fix)

- 일시: 2026-11-22 05:20 (KST)
- 작업 도구: Claude Code
- 관련: 원인 커밋 `5cf0d2d89a`(ADR `docs/adr/2026-11-21-ore-grams-and-cleanup.md` — 광석 묶음 10kg), 질문 `docs/questions/2026-11-22-escrow-fix.md` 2591~2594,
  배포 기록 `22-0110-batch-1117a-merge.md`·`22-0255-batch-1117b-merge.md`("원인 Unknown")

## 한 일
- 증상: 운영 서버가 켤 때마다 `npc/economy.ts`가 "market escrow differs after restore"(물건만, 돈은 없음)를 남긴다. 16:52 UTC(main 2527367) 시장 8곳,
  19:18 UTC(main 3c6fbcd) 시장 9곳, 겹치는 곳은 440 하나.
- 원인 1(**Verified**: 코드·DB 시험): 메모리 검사(`goodsMarket.checkEscrow`)는 걸린 팔 주문의 남은 묶음 × **지금** 묶음 크기를 보증금 잔고와 견준다. 커밋
  `5cf0d2d89a`(core@137)가 광석 10종의 묶음 크기를 1,000(금속 광석)·1(잡석·석재)에서 10,000으로 바꿨는데, 걸려 있던 옛 주문은 옛 묶음 크기로 묶은 채
  새 묶음 크기로 되살아났다. 그래서 그 판을 처음 켠 16:52 재시작에서 경고가 났다(보증금은 줄의 `locked` 합과 같아 DB 검사 M1은 맞고 메모리 검사만 어긋난다).
  고치기 전 코드로 같은 상황을 만든 DB 시험이 바로 이 경고로 실패한다(아래 검사).
- 원인 1의 뒤탈(**Assumed**: 코드 셈): 되살린 옛 주문은 돌려주기·체결 때 묶은 양의 10배(잡석·석재는 1만 배)를 옮긴다. 보증금은 음수로 가고 그 차이는
  계속 남으며, 받은 쪽에 물건이 생긴다(질문 2593).
- 19:18 재시작의 새 시장들(**Unknown**): 그 사이(2527367 → 3c6fbcd) 팩에 묶음 크기 바뀜이 없다(`git diff` — tuning·id-changes·manifest만). 메모리 쪽은
  보증금을 바꾸는 길이 모두 `goodsMarket` 안이고 묶음 크기가 거래소마다 고정이라 어긋날 수 없다(Verified: 코드 — 보증금 계정 `escrow:goods:<ID>`을 쓰는
  곳은 `goodsMarket.ts`뿐, 원장 계정을 훑어 옮기는 곳은 모두 주체 계정만 본다). DB 쓰기는 한 번의 동기 처리가 한 묶음이라 주문 줄과 원장이 함께 커밋된다
  (Verified: `world/persist/writer.ts`). 남는 설명(Assumed, 운영 DB를 봐야 가린다):
  - (가) 운영 세계의 아이템 편집기 덮어쓰기(`content_overrides`)가 그 사이 바뀌어 어떤 물건의 묶음 크기·켬이 달라졌다(같은 원인 1 — 이번 손질이 다룬다).
  - (나) 원인 1의 뒤탈이 남은 거래소가 16:52 때는 걸린 주문·8일 안 체결이 없어 검사에서 빠졌다가 그 뒤 거래가 생겨 보였다. 검사는 되살린 거래소만 본다
    (`registry.check`는 걸린 주문이나 8일 안 체결이 있는 거래소만 만든다). 16:52 목록의 254·274 등이 19:18에 빠진 것도 같은 까닭으로 본다.
  - (다) 체결 알림·이용료 고리가 던지면 원장 거래는 남고 주문 줄을 쓰지 않는 길(`books.ts` place). 운영 기록에서 확인하지 못했다 — 막아 두었다(아래).
  - 그래서 "지금도 새로 생기는가"는 Unknown이다. 이 판부터 켤 때 손질한 거래소마다 잔고·기대값·묶음 크기를 기록에 남기므로 다음 재시작 기록으로 가린다.
- 원인에서 고침(`market/books.ts`): 켤 때 팔 주문 줄의 `locked`(그때 묶은 기본 단위 양)가 남은 묶음 × 지금 묶음 크기와 다르면 그 주문은 되살리지 않고
  `locked` 그대로 주인 물건 자리로 돌려준 뒤 취소로 끝낸다(질문 2592 [임시]). 앞으로 팩·편집기로 묶음 크기를 바꿔도 물건이 생기거나 사라지지 않는다.
- 부팅 손질(`market/escrowRepair.ts`, 질문 2591 [임시]): 그 뒤에도 물건 보증금 ≠ 걸린 팔 주문 합이면 차이를 시스템 계정 `reconcile:escrow:<물건>`과
  맞바꾼다(거래 종류 `escrow_reconcile`). 걸린 주문이 없어 되살리지 않은 거래소의 남은 보증금도 0으로. 맞춘 뒤 다시 켜면 아무것도 하지 않는다(DB 시험).
  돈 보증금은 손대지 않는다(경고만 그대로).
- 막아 둠(`market/books.ts` place): 체결 알림·이용료 고리가 던져도 주문 줄 쓰기(sync·끝난 주문)는 `finally`에서 한다(원인 후보 다).
- 로컬 재현 시도: 빌드한 서버 + 새 DB + `NPC_SOCIETY=1 NPC_DAY_MS=60000`로 15일 돌렸으나 NPC 거래가 거의 없어(걸린 살 주문 2개, 체결 0) 재시작 경고를
  재현하지 못했다. 원인 1은 단위·DB 시험으로 재현했다.

### 운영 세계에 켜면 하는 일 (Assumed — 운영 DB는 보지 않았다)
- 옛 묶음 크기로 아직 걸려 있는 팔 주문: 묶은 양 그대로 주인에게 돌려주고 취소(유저 주문은 끝난 주문 목록에 "취소"로 남고 NPC 주문 줄은 지운다).
- 보증금 차이가 남은 거래소(시장 440 등): 차이만큼 `reconcile:escrow:<물건>`과 맞바꾼다. 음수 보증금(옛 주문을 10배로 돌려준 몫)은 그 계정에서 채운다 —
  이미 생긴 물건은 받은 쪽에 그대로 남는다(질문 2593).
- 서버 기록 경고 "market escrow repaired after restore" 한 줄(돌려준 주문 수·물건 합·맞춘 거래소 수, 각 50개까지 자세히). 그 뒤 "market escrow differs after
  restore"는 돈 보증금 차이가 있을 때만 남는다. 두 번째 재시작부터는 둘 다 없어야 한다.
- 원장 거래가 늘 뿐(추가만) 표·열은 바뀌지 않는다. 마이그레이션 없음.

### 운영 DB에서 원인을 가리는 읽기 질의 (돌리지 않았다)
```sql
-- 시장마다 물건 보증금·걸린 팔 주문 locked 합·남은 묶음 합. 보증금 = locked 합이면 묶음 크기 바뀜(원인 1), 다르면 뒤탈(나)이나 줄 어긋남(다)
select b.id, b.city_id, b.item, coalesce(a.balance, 0) as escrow,
       coalesce(sum(o.locked) filter (where o.side = 'sell'), 0) as locked_sum,
       coalesce(sum(o.remaining) filter (where o.side = 'sell'), 0) as remaining_lots,
       count(o.id) filter (where o.side = 'sell') as sells
from market_books b
left join ledger_accounts a on a.system_code = 'escrow:goods:' || b.id
left join market_orders o on o.market_id = b.id and o.state = 'open'
where b.id in (242, 254, 274, 276, 279, 419, 434, 440, 442, 445, 447, 452, 453, 454, 464, 466)
group by b.id, b.city_id, b.item, a.balance order by b.id;
```
- 그다음 `content_overrides`의 아이템 줄(그 물건들)이 16:52~19:18 사이에 바뀌었는지 본다(원인 가).

## 세계 새로 시작
- **필요 없음**(사용자 선택은 가능): 이 판을 켜면 보증금은 손질로 맞고, 앞으로의 묶음 크기 바뀜도 막힌다. 남는 것은 16:52 뒤 옛 주문을 10배로 돌려준
  몫(이미 생긴 광석·석재·잡석)으로, 시험 세계라 그대로 두는 것을 추천한다(질문 2593 가). 깨끗한 경제 수치가 필요하면 `world-reset`(2593 다).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/market/books.ts` | 묶음 크기가 바뀐 옛 팔 주문을 locked 그대로 돌려주고 취소(`relotted()`), place의 주문 줄 쓰기를 `finally`로, 머리 주석 |
| `apps/server/src/market/escrowRepair.ts` | 새 파일: 물건 보증금 맞추기(`reconcileGoodsEscrow`)·기록(`logEscrowRepair`)·켤 때 거래소 마무리(`settleMarketsAtBoot`, economy.ts에서 옮김) |
| `apps/server/src/market/load.ts` | 걸린 주문의 `locked`도 읽는다 |
| `apps/server/src/npc/economy.ts` | 켤 때 거래소 마무리(없는 도시 닫기·도시 표·손질·경고)를 `settleMarketsAtBoot` 한 줄로(997 → 993줄) |
| `packages/sim/src/economy/goodsMarket.ts`, `packages/sim/src/index.ts` | 보증금 계정 코드 `goodsEscrowCode` 내보내기(값·판정 그대로 — SIM_VERSION 그대로) |
| `apps/server/src/market/escrowRepair.test.ts` | 단위 시험 4개(묶음 크기 바뀜·그대로, 맞추기·한 번만, 알림이 던져도 줄 쓰기) |
| `apps/server/src/market/market.db.test.ts` | DB 시험 1개(옛 묶음 크기 주문·남은 보증금 → 켜면 손질·M1 맞음 → 다시 켜면 아무것도 안 함), boot에 기록 받기 |
| `docs/questions/2026-11-22-escrow-fix.md` | 질문 2591~2594 |

## 함께 바꿔야 하는 파일
- 거래소 줄 쓰기(`books.ts` writeOpen)의 `locked` 셈을 바꾸면 묶음 크기 바뀜 찾기(`create`의 stale)도 같이.
- 보증금 계정 코드를 바꾸면 `goodsEscrowCode`·`escrowRepair.ts`의 `goodsEscrowIdOf` 정규식·`world/invariants.ts` M1도 같이.

## 건드리지 말 것
- `npc/economy.ts`는 993줄이다(상한 1,000). 다른 줄기와 합칠 때 줄 수를 본다.

## 미검증·TODO·알려진 문제
- 19:18 재시작의 새 시장들의 원인은 Unknown(위 가·나·다). 다음 재시작 기록의 "market escrow repaired after restore" 자세한 칸과 위 질의로 가린다.
- 운영 세계에서 손질이 몇 거래소·몇 g을 맞출지는 미실행(운영 DB를 보지 않았다).
- 돈 보증금 차이는 손질하지 않는다(관측되지 않음).
- 로컬 서버 재현은 NPC 거래가 적어 하지 못했다(위).

## 검사 (Verified)
- 새 단위 시험 `escrowRepair.test.ts` 4/4, 새 DB 시험(market.db.test.ts "부팅 손질") 통과. 고치기 전 코드(books.ts·economy.ts·load.ts 되돌림)로는 단위 4개가 모두
  실패하고, DB 시험은 운영과 같은 경고 "market escrow differs after restore"로 실패했다.
- 전체 `pnpm check`(TEST_DATABASE_URL, 잠금 안) 한 번: 포맷·린트·타입·모듈 경계·파일 크기·다국어·디자인 값·콘텐츠(core@141) 통과, 시험 **6,270/6,277**
  (파일 874/877). 실패 7개는 `cyborg.db.test.ts`·`facilities.db.test.ts`·`nationTiers.db.test.ts`의 훅 시간 초과·DB 연결 끊김(부하)이었고, 그 셋과
  `market.db.test.ts`를 따로 다시 돌려 **28/28** 통과했다(이 줄기와 무관한 흔들림으로 본다 — Assumed).

## 버전
- 프로토콜·팩·SIM_VERSION·마이그레이션 바뀜 없음(서버 부팅 동작만).

## 사용자 결정 대기
- 질문 2591~2594(`docs/questions/2026-11-22-escrow-fix.md`).
