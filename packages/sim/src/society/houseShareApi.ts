// 가문 지분 계정 내보내기(shares.ts 머리 주석 — 서버만, D-338·D-582, 줄기 governance-2). index.ts 줄 수 상한 때문에 따로 묶는다
export {
  HOUSE_MONEY_PREFIX,
  HOUSE_SHARE_PREFIX,
  type HouseHolding,
  houseHoldingsOf,
  houseMoneyCode,
  houseShareCode,
  moveSharesToHouse,
} from "./shares.ts";
