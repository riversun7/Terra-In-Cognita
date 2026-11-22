// NPC 도시 증축 내보내기(질문 1101 나) — index.ts가 1,000줄 상한에 가까워 묶음 파일로 내보낸다
export * from "../npc/build.ts";
export * from "./npcBuild.ts";
// NPC 투자 판단 틀(서버 NPC 층 올리기가 같은 함수를 쓴다 — 기획 검토 2762, fixes-1117k)
export * from "../npc/invest.ts";
