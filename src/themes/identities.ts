export type ThemeMotifId =
  | "constellation"
  | "football-field"
  | "futsal-court"
  | "basketball-key"
  | "volleyball-net"
  | "tennis-lines"
  | "tabletennis-paddle"
  | "badminton-shuttle"
  | "chess-knight"
  | "racing-circuit"
  | "board-hex"
  | "quiz-orbit"
  | "esports-reticle"
  | "gol-palms"
  | "gol-rosette"
  | "gol-arch"
  | "gol-knot";
export type ThemeMaterial =
  | "plain"
  | "paper"
  | "felt"
  | "wood"
  | "tile"
  | "court"
  | "carbon"
  | "glass"
  | "velvet"
  | "sand"
  | "circuit"
  | "ink";
export interface ThemeIdentity {
  sports: string[];
  motif: ThemeMotifId;
  material: ThemeMaterial;
  description: string;
  descriptionFa: string;
  collection: { id: string; name: string; fa: string };
}
export const gameCollections: Record<
  string,
  { name: string; fa: string; motif: ThemeMotifId }
> = {
  generic: {
    name: "Open competition",
    fa: "رقابت آزاد",
    motif: "constellation",
  },
  football: {
    name: "Football grounds",
    fa: "زمین‌های فوتبال",
    motif: "football-field",
  },
  futsal: {
    name: "Futsal courts",
    fa: "زمین‌های فوتسال",
    motif: "futsal-court",
  },
  basketball: {
    name: "Basketball culture",
    fa: "فرهنگ بسکتبال",
    motif: "basketball-key",
  },
  volleyball: {
    name: "Volleyball courts",
    fa: "زمین‌های والیبال",
    motif: "volleyball-net",
  },
  tennis: {
    name: "Tennis clubs",
    fa: "باشگاه‌های تنیس",
    motif: "tennis-lines",
  },
  "table-tennis": {
    name: "Table tennis",
    fa: "تنیس روی میز",
    motif: "tabletennis-paddle",
  },
  badminton: {
    name: "Badminton halls",
    fa: "سالن‌های بدمینتون",
    motif: "badminton-shuttle",
  },
  chess: { name: "Chess rooms", fa: "محفل‌های شطرنج", motif: "chess-knight" },
  esports: {
    name: "Gaming arenas",
    fa: "میدان‌های بازی",
    motif: "esports-reticle",
  },
  racing: {
    name: "Racing paddock",
    fa: "پیست مسابقه",
    motif: "racing-circuit",
  },
  "board-games": {
    name: "Around the table",
    fa: "دور میز بازی",
    motif: "board-hex",
  },
  quiz: { name: "Quiz societies", fa: "محفل‌های دانش", motif: "quiz-orbit" },
  "gol-ya-pooch": { name: "Gol Ya Pooch", fa: "گل یا پوچ", motif: "gol-palms" },
};
type IdentitySpec = [
  sport: string,
  material: ThemeMaterial,
  description: string,
  descriptionFa: string,
  motif?: ThemeMotifId,
];
const identities: Record<string, IdentitySpec> = {
  "minimal-light": [
    "generic",
    "plain",
    "Room for every competition.",
    "جایی برای هر رقابت.",
  ],
  "minimal-dark": [
    "generic",
    "plain",
    "Quiet cards for an evening event.",
    "کارت‌های آرام برای رویداد شبانه.",
  ],
  "modern-glass": [
    "generic",
    "glass",
    "Layered glass and soft reflected light.",
    "شیشه چندلایه و بازتاب نرم نور.",
  ],
  editorial: [
    "generic",
    "paper",
    "A printed tournament journal.",
    "دفتر چاپی مسابقات.",
  ],
  corporate: [
    "generic",
    "plain",
    "A precise club noticeboard.",
    "تابلوی منظم باشگاه.",
  ],
  "championship-gold": [
    "generic",
    "velvet",
    "Gold engraving on a dark trophy case.",
    "نقش طلایی بر ویترین تیره جام‌ها.",
  ],
  university: [
    "quiz",
    "paper",
    "College colors and an academic seal.",
    "رنگ دانشگاه و نشان علمی.",
  ],
  festival: [
    "generic",
    "paper",
    "Playful tickets and printed confetti.",
    "بلیت‌های رنگی و نقش‌های جشن.",
  ],
  football: [
    "football",
    "felt",
    "Floodlights over a deep green pitch.",
    "نورافکن بر چمن سبز زمین.",
  ],
  "football-chalk": [
    "football",
    "ink",
    "A coach's chalkboard and pitch markings.",
    "تخته مربی و خط‌های زمین.",
  ],
  "futsal-night": [
    "futsal",
    "court",
    "An indoor blue court under evening lights.",
    "زمین آبی سالن زیر نور شب.",
  ],
  "futsal-parquet": [
    "futsal",
    "wood",
    "Warm parquet with crisp court boundaries.",
    "پارکت گرم و مرزهای روشن زمین.",
  ],
  basketball: [
    "basketball",
    "court",
    "Arena hardwood and painted key lines.",
    "کف سالن و خط‌های منطقه پرتاب.",
  ],
  "basketball-street": [
    "basketball",
    "carbon",
    "Asphalt, tall lettering and a street-court arc.",
    "آسفالت، نوشته‌های بلند و قوس زمین خیابانی.",
  ],
  volleyball: [
    "volleyball",
    "court",
    "A bright court divided by the net.",
    "زمین روشن با خطوط تور.",
  ],
  "volleyball-coast": [
    "volleyball",
    "sand",
    "Beach sand, net mesh and sea-blue cards.",
    "شن ساحل، بافت تور و کارت‌های آبی دریا.",
  ],
  tennis: [
    "tennis",
    "felt",
    "Club green, white lines and a formal serif.",
    "سبز باشگاه، خط سفید و قلم رسمی.",
  ],
  "tennis-clay": [
    "tennis",
    "sand",
    "Terracotta courts with engraved score cards.",
    "زمین خاکی و کارت‌های امتیاز حک‌شده.",
  ],
  "tabletennis-spin": [
    "table-tennis",
    "court",
    "A blue table, paddle arcs and compact scores.",
    "میز آبی، قوس راکت و امتیازهای فشرده.",
  ],
  "tabletennis-club": [
    "table-tennis",
    "wood",
    "A local club scorebook with rubber-red details.",
    "دفتر امتیاز باشگاه با جزئیات قرمز راکت.",
  ],
  "badminton-feather": [
    "badminton",
    "paper",
    "Feather geometry on a light court.",
    "هندسه پر توپ بر زمینی روشن.",
  ],
  "badminton-midnight": [
    "badminton",
    "court",
    "A night hall with a precise shuttle silhouette.",
    "سالن شبانه با نقش دقیق توپ پردار.",
  ],
  racing: [
    "racing",
    "carbon",
    "Timing sheets and a track circuit.",
    "برگه زمان‌گیری و مسیر پیست.",
  ],
  "racing-pitlane": [
    "racing",
    "ink",
    "Pit-lane blueprints with technical grid lines.",
    "نقشه پیت‌لین با شبکه فنی.",
  ],
  "racing-rally": [
    "racing",
    "sand",
    "Desert stages and a winding rally route.",
    "مرحله‌های کویری و مسیر پیچان رالی.",
  ],
  boxing: [
    "generic",
    "velvet",
    "A dark ring with bold corner cards.",
    "رینگ تیره و کارت‌های درشت گوشه‌ها.",
  ],
  broadcast: [
    "generic",
    "glass",
    "A television score bar with clean columns.",
    "نوار امتیاز تلویزیونی با ستون‌های روشن.",
  ],
  "esports-neon": [
    "esports",
    "circuit",
    "A lit circuit board and angular match cards.",
    "مدار نورانی و کارت‌های زاویه‌دار دیدار.",
  ],
  "retro-arcade": [
    "esports",
    "carbon",
    "Pixel-cabinet geometry and raised panels.",
    "هندسه دستگاه آرکید و پنل‌های برجسته.",
  ],
  "cyber-arena": [
    "esports",
    "circuit",
    "Radar rings on a cool technical surface.",
    "حلقه‌های رادار بر سطح فنی خنک.",
  ],
  "esports-console": [
    "esports",
    "glass",
    "Pearl console plastic and a controller emblem.",
    "پلاستیک مرواریدی کنسول و نشان کنترلر.",
  ],
  "esports-terminal": [
    "esports",
    "ink",
    "A tournament command board in phosphor green.",
    "تابلوی فرمان مسابقات با سبز فسفری.",
  ],
  fantasy: [
    "board-games",
    "paper",
    "A parchment map and a hexagonal guild seal.",
    "نقشه کاغذی و نشان شش‌ضلعی انجمن.",
  ],
  chess: [
    "chess",
    "wood",
    "Walnut squares and carved-piece outlines.",
    "خانه‌های گردویی و طرح مهره تراشیده.",
  ],
  "chess-manuscript": [
    "chess",
    "paper",
    "An annotated scorebook with a knight seal.",
    "دفتر حرکت‌ها با نشان اسب شطرنج.",
  ],
  "board-game": [
    "board-games",
    "felt",
    "Felt table, wooden tokens and soft edges.",
    "میز نمدی، مهره‌های چوبی و لبه‌های نرم.",
  ],
  "board-mahogany": [
    "board-games",
    "wood",
    "Mahogany trays and brass game tokens.",
    "سینی ماهونی و مهره‌های برنجی بازی.",
  ],
  "board-hexatlas": [
    "board-games",
    "paper",
    "A map of hex tiles and stamped player cards.",
    "نقشه کاشی‌های شش‌ضلعی و کارت‌های مهرشده.",
  ],
  "quiz-academy": [
    "quiz",
    "paper",
    "Library paper, book corners and a society seal.",
    "کاغذ کتابخانه، گوشه کتاب و نشان انجمن.",
  ],
  "quiz-laboratory": [
    "quiz",
    "glass",
    "A research glassboard and orbital diagrams.",
    "تخته شیشه‌ای پژوهش و طرح‌های مداری.",
  ],
  "persian-heritage": [
    "gol-ya-pooch",
    "tile",
    "Turquoise geometry around the playing table.",
    "هندسه فیروزه‌ای پیرامون میز بازی.",
    "gol-rosette",
  ],
  "gol-traditional": [
    "gol-ya-pooch",
    "felt",
    "An embroidered table with two equal closed hands.",
    "میز نقش‌دوزی‌شده با دو دست بسته برابر.",
    "gol-palms",
  ],
  "gol-modern": [
    "gol-ya-pooch",
    "plain",
    "Sculpted ivory cards and a balanced hand emblem.",
    "کارت‌های عاجی و نشان متعادل دست‌ها.",
    "gol-palms",
  ],
  "gol-night": [
    "gol-ya-pooch",
    "velvet",
    "Gold linework on a midnight championship table.",
    "خطوط طلایی بر میز شب قهرمانی.",
    "gol-arch",
  ],
  "gol-saffron": [
    "gol-ya-pooch",
    "paper",
    "Saffron paper, woven borders and a flower seal.",
    "کاغذ زعفرانی، حاشیه بافته و نشان گل.",
    "gol-rosette",
  ],
  "gol-turquoise": [
    "gol-ya-pooch",
    "tile",
    "Glazed turquoise tiles and a courtyard arch.",
    "کاشی فیروزه‌ای لعاب‌دار و طاق حیاط.",
    "gol-arch",
  ],
  "gol-velvet": [
    "gol-ya-pooch",
    "velvet",
    "Burgundy velvet with a restrained copper knot.",
    "مخمل زرشکی با گره مسی ساده.",
    "gol-knot",
  ],
  "gol-ink": [
    "gol-ya-pooch",
    "ink",
    "Ink on cream, sharp rules and paired hand outlines.",
    "مرکب بر کاغذ کرم، خطوط دقیق و طرح دو دست.",
    "gol-palms",
  ],
  winter: [
    "generic",
    "glass",
    "Frosted cards with a quiet constellation.",
    "کارت‌های یخی با صورت فلکی آرام.",
  ],
  summer: [
    "generic",
    "sand",
    "Sunlit paper and an open circular emblem.",
    "کاغذ آفتابی و نشان دایره‌ای باز.",
  ],
};
export function identityFor(id: string): ThemeIdentity {
  const [sport, material, description, descriptionFa, motif] =
    identities[id] ?? identities["minimal-light"];
  const collection = gameCollections[sport];
  return {
    sports: [sport],
    material,
    description,
    descriptionFa,
    motif: motif ?? collection.motif,
    collection: { id: sport, name: collection.name, fa: collection.fa },
  };
}
