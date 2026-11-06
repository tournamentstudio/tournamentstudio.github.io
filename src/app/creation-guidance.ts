import type { FormatId } from "../domain/types";

export const configurableRounds = new Set<FormatId>([
  "swiss",
  "ladder",
  "free-for-all",
  "time-trial",
  "grand-prix",
]);

export const creationFormatHelp: Record<FormatId, [string, string]> = {
  "single-elimination": [
    "One loss ends a participant's run. Winners advance until the final.",
    "با یک شکست، شرکت‌کننده حذف می‌شود. برندگان تا فینال پیش می‌روند.",
  ],
  "double-elimination": [
    "A first loss sends a participant to the losers bracket. A second loss eliminates them.",
    "شکست اول، شرکت‌کننده را به جدول بازندگان می‌برد. با شکست دوم حذف می‌شود.",
  ],
  "triple-elimination": [
    "Participants stay in until their third loss. Generate each new round after the previous results are complete.",
    "شرکت‌کنندگان پس از سومین شکست حذف می‌شوند. هر دور جدید را پس از تکمیل نتایج دور قبل بسازید.",
  ],
  "round-robin": [
    "Every participant plays everyone else once. Results determine the standings.",
    "هر شرکت‌کننده یک بار با همه حریفان بازی می‌کند. نتایج، رده‌بندی را مشخص می‌کنند.",
  ],
  groups: [
    "Participants are split into balanced groups. Everyone plays each opponent in their group once.",
    "شرکت‌کنندگان بین گروه‌ها تقسیم می‌شوند. هر شرکت‌کننده یک بار با همه حریفان گروه خود بازی می‌کند.",
  ],
  swiss: [
    "Pair participants with similar points each round, avoiding repeat opponents when possible.",
    "در هر دور، شرکت‌کنندگان با امتیاز نزدیک روبه‌روی هم قرار می‌گیرند و تا حد امکان با حریف تکراری بازی نمی‌کنند.",
  ],
  gsl: [
    "Four participants per group play opening, winners, elimination and deciding matches.",
    "هر گروه چهار شرکت‌کننده دارد و دیدارهای آغازین، برندگان، حذف و تعیین صعود برگزار می‌کند.",
  ],
  "free-for-all": [
    "Several participants compete in each heat. Record their scores and finishing positions.",
    "چند شرکت‌کننده در هر دیدار رقابت می‌کنند. امتیازها و جایگاه پایانی آن‌ها را ثبت کنید.",
  ],
  gauntlet: [
    "The winner keeps playing. Higher seeds enter later in the sequence.",
    "برنده به دیدار بعد می‌رود. شرکت‌کنندگان با سید بهتر، دیرتر وارد رقابت می‌شوند.",
  ],
  ladder: [
    "Neighbors in the ranking play each other. A lower-ranked winner takes the higher position.",
    "شرکت‌کنندگان با رتبه‌های مجاور بازی می‌کنند. برنده با رتبه پایین‌تر، جای حریف بالاتر را می‌گیرد.",
  ],
  "time-trial": [
    "Record timed attempts across the rounds you choose.",
    "زمان تلاش‌ها را در تعداد دوری که انتخاب می‌کنید ثبت کنید.",
  ],
  "grand-prix": [
    "Participants compete across several rounds, with their results counted in the standings.",
    "شرکت‌کنندگان در چند دور رقابت می‌کنند و نتایج آن‌ها در رده‌بندی محاسبه می‌شود.",
  ],
};
