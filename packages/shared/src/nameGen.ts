// 이름 만들기(시드 난수) — 시작 국가 설정 편집기(/dev/nations)의 [이름 만들기]가 쓴다. docs/adr/2026-11-10-nation-editor.md 3절.
// - 말씨(NAME_STYLES) 16개: 기획 30 §5.3의 문화 모티프 16개(D-078·D-086)에 하나씩. 이름은 가상이다(D-076: 실제 국가·지명·인물 이름을 쓰지 않는다).
// - 음절 표: 로마자 = 한글 짝. 음절을 이어 붙여 영어 이름과 한글 이름을 같이 만든다(끝말은 닿소리로 시작해 이어 읽기가 어긋나지 않는다).
// - 같은 (말씨, 종류, 시드)면 늘 같은 후보다(createRng, Math.random 없음). 판정에 쓰지 않는다(보이는 이름만).
// - 길이: 한글 2~8자·영문 3~16자(D-5046 출발값) 안의 후보만 낸다(지도자 이름은 "이름 성" 두 마디라 마디마다 본다).
// - 도시·사람 이름 조각은 번역하지 않는다(D-476): ko와 en에 같은 로마자를 준다.
import { createRng } from "./rng.ts";

export const NAME_STYLE_IDS = [
  "prairie",
  "jade",
  "isle",
  "haneul",
  "moor",
  "fjord",
  "vine",
  "monsoon",
  "selva",
  "oasis",
  "olive",
  "spice",
  "sunstone",
  "birch",
  "saffron",
  "reef",
] as const;
export type NameStyleId = (typeof NAME_STYLE_IDS)[number];

export function isNameStyleId(value: unknown): value is NameStyleId {
  return typeof value === "string" && (NAME_STYLE_IDS as readonly string[]).includes(value);
}

/** 만들 이름 종류: 국가·화폐·지도자(이름 성)·도시·사람 이름 조각(이름·성) */
export const NAME_KINDS = ["nation", "currency", "leader", "city", "given", "family"] as const;
export type NameKind = (typeof NAME_KINDS)[number];

export interface GeneratedName {
  readonly ko: string;
  readonly en: string;
}

/** 말씨 하나의 음절 표(빈칸으로 나눈 "로마자=한글" 목록) */
interface StyleTable {
  /** 뿌리 음절 */
  readonly syl: string;
  /** 국가 이름 끝말 */
  readonly nation: string;
  /** 도시 이름 끝말 */
  readonly city: string;
  /** 화폐 이름 끝말 */
  readonly currency: string;
  /** 사람 이름 끝말 */
  readonly given: string;
  /** 성 끝말 */
  readonly family: string;
}

const STYLES: Readonly<Record<NameStyleId, StyleTable>> = {
  prairie: {
    syl: "ca=캐 ro=로 li=리 den=덴 ver=버 mon=몬 ta=타 wes=웨스 har=하 lan=랜 me=메 sa=사 del=델 jo=조 ken=켄 wil=윌",
    nation: "dale=데일 land=랜드 mont=몬트 field=필드",
    city: "ton=턴 ville=빌 ford=퍼드 wood=우드 burg=버그 creek=크릭",
    currency: "der=더 rel=렐 bit=빗 ton=턴",
    given: "na=나 ry=리 son=슨 la=라",
    family: "well=웰 man=먼 ley=리 ford=퍼드 low=로",
  },
  jade: {
    syl: "lan=란 shu=슈 zhen=전 hua=화 jin=진 yun=윈 tao=타오 ming=밍 he=허 xia=샤 luo=뤄 fen=펀 qi=치 wu=우 bai=바이 ling=링",
    nation: "zhou=저우 tian=톈 shan=샨 hai=하이",
    city: "cheng=청 zhen=전 gang=강 shan=샨 men=먼 zhou=저우",
    currency: "bao=바오 qian=첸 bei=베이 lin=린",
    given: "wei=웨이 lin=린 yu=위 mei=메이",
    family: "shan=샨 lu=루 fang=팡 qin=친",
  },
  isle: {
    syl: "ha=하 ru=루 mi=미 na=나 to=토 ka=카 su=스 ki=키 yo=요 shi=시 ra=라 ne=네 ho=호 ta=타 ma=마 ko=코",
    nation: "shima=시마 hara=하라 no=노 kuni=쿠니",
    city: "saki=사키 gawa=가와 yama=야마 mura=무라 hama=하마 zaki=자키",
    currency: "ban=반 kin=킨 tama=타마 fuda=후다",
    given: "ko=코 ki=키 to=토 mi=미",
    family: "moto=모토 da=다 no=노 se=세",
  },
  haneul: {
    syl: "ha=하 neul=늘 ga=가 ram=람 so=소 ri=리 da=다 on=온 mi=미 ru=루 na=나 bit=빛 sae=새 byeol=별 ara=아라 seul=슬",
    nation: "nara=나라 gol=골 beol=벌 maru=마루",
    city: "gol=골 maeul=마을 naru=나루 beol=벌 jae=재 pyeong=평",
    currency: "nip=닢 al=알 bang=방 dal=달",
    given: "bin=빈 sol=솔 gyeol=결 ra=라",
    family: "nae=내 dam=담 saem=샘 moe=뫼",
  },
  moor: {
    syl: "wyn=윈 thorn=손 el=엘 mar=마 bry=브리 gra=그레 hol=홀 pen=펜 ash=애시 ro=로 ed=에드 al=앨 kes=케스 dun=던 fen=펜 hal=핼",
    nation: "shire=셔 mere=미어 wick=윅 land=랜드",
    city: "bury=베리 mouth=머스 wick=윅 stead=스테드 by=비 ham=햄",
    currency: "ling=링 dle=들 wen=웬 nock=녹",
    given: "ric=릭 wyn=윈 la=라 beth=베스",
    family: "worth=워스 ley=리 son=슨 well=웰",
  },
  fjord: {
    syl: "stein=슈타인 val=발 nor=노르 hel=헬 ga=가 si=시 thor=토르 ul=울 frey=프레이 gun=군 ei=에이 brand=브란트 kel=켈 lin=린 os=오스 rik=리크",
    nation: "heim=하임 mark=마르크 gard=가르드 land=란트",
    city: "burg=부르크 dorf=도르프 vik=비크 hafen=하펜 stad=스타드 holm=홀름",
    currency: "tal=탈 rik=리크 gel=겔 dun=둔",
    given: "rik=리크 hild=힐트 mar=마르 run=룬",
    family: "sen=센 mann=만 berg=베르크 dahl=달",
  },
  vine: {
    syl: "bel=벨 mon=몽 lu=뤼 cha=샤 vi=비 ro=로 san=상 de=데 mar=마르 au=오 clai=클레 fon=퐁 val=발 lys=리스 ber=베르 jo=조",
    nation: "rance=랑스 vais=베 logne=로뉴 tagne=타뉴",
    city: "ville=빌 mont=몽 bourg=부르 court=쿠르 champ=샹 fort=포르",
    currency: "son=송 lis=리스 ron=롱 mel=멜",
    given: "line=린 bert=베르 mie=미 lan=랑",
    family: "nier=니에 mont=몽 reau=로 lard=라르",
  },
  monsoon: {
    syl: "ra=라 vi=비 sha=샤 ka=카 de=데 na=나 pur=푸르 in=인 ma=마 su=수 ya=야 an=안 ha=하 ri=리 ja=자 ti=티",
    nation: "vana=바나 mara=마라 dhara=다라 rashi=라시",
    city: "pur=푸르 nagar=나가르 gram=그람 garh=가르 kot=코트 vati=바티",
    currency: "mudra=무드라 pana=파나 kash=카시 ratna=라트나",
    given: "ta=타 ni=니 dev=데브 ya=야",
    family: "ram=람 dar=다르 ni=니 var=바르",
  },
  selva: {
    syl: "ma=마 ra=라 lu=루 ca=카 ve=베 ri=리 so=소 pa=파 ta=타 bel=벨 ja=자 ni=니 ro=호 gua=과 ti=치 zu=주",
    nation: "zonia=조니아 randa=란다 vera=베라 tinga=칭가",
    city: "nhos=뉴스 tiba=치바 randa=란다 mirim=미림 luz=루스 vale=발리",
    currency: "dor=도르 tim=칭 leta=레타 mico=미쿠",
    given: "nho=뉴 la=라 na=나 dro=드루",
    family: "reira=헤이라 mos=무스 lva=우바 queira=케이라",
  },
  oasis: {
    syl: "ra=라 sa=사 ha=하 na=나 kha=카 li=리 za=자 mar=마르 fa=파 su=수 am=암 ba=바 ta=타 nu=누 ki=키 si=시",
    nation: "khet=케트 mira=미라 dun=둔 rab=라브",
    city: "dar=다르 qal=칼 tep=테프 nis=니스 rah=라 mun=문",
    currency: "sha=샤 qet=케트 rim=림 nub=누브",
    given: "im=임 ra=라 fer=페르 din=딘",
    family: "zar=자르 hadi=하디 mun=문 ris=리스",
  },
  olive: {
    syl: "the=테 ra=라 ky=키 lo=로 an=안 dro=드로 ne=네 po=포 li=리 mi=미 da=다 xe=크세 phi=피 ar=아르 te=테 so=소",
    nation: "nia=니아 los=로스 dia=디아 thea=테아",
    city: "polis=폴리스 nos=노스 ra=라 kia=키아 thos=토스 mene=메네",
    currency: "lon=론 kos=코스 ris=리스 mata=마타",
    given: "ros=로스 na=나 kles=클레스 dora=도라",
    family: "kis=키스 dis=디스 nou=누 tos=토스",
  },
  spice: {
    syl: "ba=바 li=리 su=수 ra=라 ja=자 ma=마 ta=타 ke=크 lu=루 nu=누 sa=사 wi=위 ga=가 pa=파 ti=티 ya=야",
    nation: "tara=타라 laya=라야 ngga=응가 wana=와나",
    city: "pura=푸라 karta=카르타 ngan=응안 baya=바야 wangi=왕이 lor=로르",
    currency: "ring=링 kep=켑 tala=탈라 wang=왕",
    given: "wan=완 ti=티 di=디 sari=사리",
    family: "wira=위라 tama=타마 nata=나타 putra=푸트라",
  },
  sunstone: {
    syl: "te=테 no=노 xi=시 co=코 tla=틀라 ma=마 za=사 que=케 chi=치 pa=파 hua=와 ya=야 mi=미 to=토 ca=카 le=레",
    nation: "tlan=틀란 pan=판 tepec=테펙 huac=와크",
    city: "tlan=틀란 tepec=테펙 pan=판 co=코 tzin=친 calli=칼리",
    currency: "quil=킬 xal=샬 cao=카오 zol=솔",
    given: "li=리 mo=모 na=나 huatl=와틀",
    family: "catl=카틀 zin=신 tec=텍 mal=말",
  },
  birch: {
    syl: "vo=보 lo=로 mi=미 ra=라 sla=슬라 do=도 bro=브로 ka=카 ze=제 no=노 sta=스타 ve=베 gor=고르 li=리 bo=보 ya=야",
    nation: "via=비아 lesia=레시아 gora=고라 vina=비나",
    city: "grad=그라드 vsk=프스크 nik=니크 pol=폴 gorod=고로드 nitsa=니차",
    currency: "vin=빈 zar=자르 dyn=딘 brik=브리크",
    given: "mir=미르 slav=슬라프 na=나 sha=샤",
    family: "vich=비치 ski=스키 nov=노프 lenko=렌코",
  },
  saffron: {
    syl: "sha=샤 ra=라 ze=제 mi=미 da=다 kar=카르 ba=바 su=수 la=라 ti=티 gul=귈 an=안 fi=피 yel=옐 or=오르 ha=하",
    nation: "zar=자르 shahr=샤르 van=반 kent=켄트",
    city: "kent=켄트 shahr=샤르 van=반 hisar=히사르 bazar=바자르 dere=데레",
    currency: "sim=심 zer=제르 nik=니크 mah=마",
    given: "han=한 naz=나즈 din=딘 ye=예",
    family: "zade=자데 can=잔 dar=다르 ban=반",
  },
  reef: {
    syl: "ka=카 lu=루 ma=마 na=나 wa=와 zi=지 mo=모 ta=타 ki=키 ba=바 nga=응가 le=레 so=소 tu=투 ha=하 po=포",
    nation: "nui=누이 landa=란다 mbe=음베 roa=로아",
    city: "kwe=퀘 ngo=응고 roa=로아 mbi=음비 puna=푸나 lele=렐레",
    currency: "kau=카우 zimbi=짐비 tapa=타파 lolo=롤로",
    given: "ni=니 ku=쿠 la=라 mea=메아",
    family: "tane=타네 mbo=음보 kele=켈레 wai=와이",
  },
};

interface Piece {
  readonly en: string;
  readonly ko: string;
}

function piecesOf(text: string): Piece[] {
  return text.split(" ").flatMap((pair) => {
    const [en, ko] = pair.split("=");
    return en && ko ? [{ en, ko }] : [];
  });
}

/** 영문 마디 첫 글자를 대문자로 */
const capitalize = (text: string): string => text.slice(0, 1).toUpperCase() + text.slice(1);

/** 이름 길이 규칙(D-5046 출발값): 한글 2~8자, 영문 3~16자 */
export const NAME_LENGTH = { koMin: 2, koMax: 8, enMin: 3, enMax: 16 } as const;

const fits = (word: Piece): boolean =>
  word.ko.length >= NAME_LENGTH.koMin &&
  word.ko.length <= NAME_LENGTH.koMax &&
  word.en.length >= NAME_LENGTH.enMin &&
  word.en.length <= NAME_LENGTH.enMax;

/** 뿌리 음절 n개 + 끝말 하나(같은 음절이 잇달아 오지 않게) */
function buildWord(
  rng: { nextInt(max: number): number },
  syllables: readonly Piece[],
  endings: readonly Piece[],
  roots: number,
): Piece {
  let en = "";
  let ko = "";
  let last = -1;
  for (let n = 0; n < roots; n++) {
    let index = rng.nextInt(syllables.length);
    if (index === last) index = (index + 1) % syllables.length;
    last = index;
    const piece = syllables[index];
    if (!piece) continue;
    en += piece.en;
    ko += piece.ko;
  }
  const ending = endings[rng.nextInt(endings.length)];
  if (ending) {
    en += ending.en;
    ko += ending.ko;
  }
  return { en: capitalize(en), ko };
}

/** 종류마다 뿌리 음절 수(작은 수, 큰 수) */
const ROOTS: Readonly<Record<Exclude<NameKind, "leader">, readonly [number, number]>> = {
  nation: [1, 2],
  currency: [1, 1],
  city: [1, 2],
  given: [1, 2],
  family: [1, 2],
};

function single(
  rng: { nextInt(max: number): number },
  table: StyleTable,
  kind: Exclude<NameKind, "leader">,
): Piece {
  const [low, high] = ROOTS[kind];
  const roots = low + rng.nextInt(high - low + 1);
  return buildWord(rng, piecesOf(table.syl), piecesOf(table[kind]), roots);
}

/** 한글 이름에 들면 버리는 글(욕설처럼 들리는 조합) */
const BLOCKED_KO = ["시발", "씨발", "자지", "보지", "병신", "섹스", "좆", "개새", "닥쳐", "죽어"] as const;
/**
 * 버리는 영어 이름(음절 표가 우연히 만드는 실제 지명·인물·상표 — 다 막지는 못한다. 후보는 사람이 고르고, 고를 때 실제 이름과 겹치는지
 * 본다, D-076)
 */
const BLOCKED_EN: ReadonlySet<string> = new Set([
  "lanzhou",
  "wilson",
  "harry",
  "macao",
  "jacaranda",
  "hashima",
  "ravana",
  "montagne",
  "steinheim",
  "holwick",
  "sasha",
  "nara",
  "lina",
  "rama",
  "amazonia",
  "kimi",
  "yoko",
  "nike",
  "kia",
]);

const allowed = (name: Piece): boolean =>
  !BLOCKED_KO.some((bad) => name.ko.includes(bad)) &&
  !name.en
    .toLowerCase()
    .split(" ")
    .some((part) => BLOCKED_EN.has(part));

/** 후보를 고를 때 한 번에 굴리는 횟수 상한(길이 규칙에 걸리거나 겹친 후보는 버린다) */
const ATTEMPTS = 200;

/**
 * 이름 후보를 count개 만든다(겹치지 않게, 순수 함수). 같은 (말씨, 종류, 시드)면 같은 차례의 같은 후보다.
 * 도시·사람 이름 조각(city·given·family)은 번역하지 않으므로 ko = en(로마자)이다
 */
export function generateNames(style: NameStyleId, kind: NameKind, seed: number, count = 5): GeneratedName[] {
  const table = STYLES[style];
  // 종류마다 다른 수열(같은 시드로 국가·화폐를 만들어도 같은 음절 차례가 되지 않게)
  const rng = createRng(
    (Math.imul(seed | 0, 0x9e37_79b1) ^ Math.imul(NAME_KINDS.indexOf(kind) + 1, 0x85eb_ca6b)) >>> 0,
  );
  const untranslated = kind === "city" || kind === "given" || kind === "family";
  const out: GeneratedName[] = [];
  const seen = new Set<string>();
  const want = Math.max(1, Math.min(32, Math.trunc(count)));
  for (let attempt = 0; attempt < ATTEMPTS && out.length < want; attempt++) {
    let name: Piece;
    if (kind === "leader") {
      const given = single(rng, table, "given");
      const family = single(rng, table, "family");
      if (!fits(given) || !fits(family)) continue;
      name = { en: `${given.en} ${family.en}`, ko: `${given.ko} ${family.ko}` };
    } else {
      name = single(rng, table, kind);
      if (!fits(name)) continue;
    }
    if (seen.has(name.en) || !allowed(name)) continue;
    seen.add(name.en);
    out.push(untranslated ? { ko: name.en, en: name.en } : { ko: name.ko, en: name.en });
  }
  return out;
}

/**
 * 영어 이름에서 겹치지 않는 3글자 약어 후보(화폐 약어·세력 약어): 첫 글자 + 뒤 닿소리들 → 첫 세 글자 → 첫 글자 + 차례 글자.
 * taken은 대문자로 견준다. 모두 겹치면 빈 목록
 */
export function tickerCandidates(english: string, taken: ReadonlySet<string>, count = 5): string[] {
  const letters = english.toUpperCase().replaceAll(/[^A-Z]/g, "");
  const first = letters.slice(0, 1);
  if (first === "") return [];
  const consonants = letters.slice(1).replaceAll(/[AEIOU]/g, "");
  const rest = letters.slice(1);
  const out: string[] = [];
  const push = (candidate: string): void => {
    if (/^[A-Z]{3}$/.test(candidate) && !taken.has(candidate) && !out.includes(candidate))
      out.push(candidate);
  };
  push(first + consonants.slice(0, 2));
  push(letters.slice(0, 3));
  for (let a = 0; a < consonants.length; a++)
    for (let b = a + 1; b < consonants.length; b++) push(first + consonants.charAt(a) + consonants.charAt(b));
  for (let a = 0; a < rest.length; a++)
    for (let b = a + 1; b < rest.length; b++) push(first + rest.charAt(a) + rest.charAt(b));
  return out.slice(0, Math.max(1, count));
}
