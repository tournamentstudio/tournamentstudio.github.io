export const diagnosticTemplates: Record<string, string> = {
  "Enter {0} between {1} and {2}.": "مقدار {0} را بین {1} و {2} وارد کنید.",
  "Enter {0} valid judge scores for {1}.": "برای {1} تعداد {0} امتیاز معتبر داور وارد کنید.",
  "Enter {0} for every entrant before calculating scores.": "پیش از محاسبه امتیاز، مقدار {0} را برای همه شرکت‌کنندگان وارد کنید.",
  "No available resource or participant time window can fit {0}.":
    "هیچ بازه دسترسی منبع و شرکت‌کنندگان برای {0} مناسب نیست.",
  "{0} must use the venue assigned by its draw rule ({1}).":
    "{0} باید در محل تعیین‌شده در قانون قرعه ({1}) برگزار شود.",
  "{0} has an invalid time or duration.": "زمان شروع یا مدت {0} نامعتبر است.",
  "{0} has no valid resource.": "{0} منبع معتبر ندارد.",
  "{0} is outside its resource availability.":
    "{0} خارج از بازه دسترسی منبع است.",
  "{0} is outside participant availability.":
    "{0} خارج از بازه دسترسی شرکت‌کننده است.",
  "{0} starts before its source match and rest period finish.":
    "{0} پیش از پایان بازی مبدأ و زمان استراحت شروع می‌شود.",
  "{0} starts before its qualifying stage and rest period finish.":
    "{0} پیش از پایان مرحله انتخابی و زمان استراحت شروع می‌شود.",
  "{0} and {1} overlap on one resource.":
    "{0} و {1} در یک منبع هم‌پوشانی زمانی دارند.",
  "{0} and {1} assign the same referee.": "{0} و {1} داور یکسان دارند.",
  "{0} and {1} may share an entrant without enough rest.":
    "{0} و {1} ممکن است شرکت‌کننده مشترک بدون استراحت کافی داشته باشند.",
  "This correction affects {0} played or live matches. Confirm invalidation to keep a recovery record and reopen them.":
    "این اصلاح روی {0} بازی انجام‌شده یا در حال برگزاری اثر می‌گذارد. نامعتبرکردن نتایج را تأیید کنید تا سابقه بازیابی حفظ و بازی‌ها دوباره باز شوند.",
  "This format supports {0} to {1} entrants.":
    "این قالب از {0} تا {1} شرکت‌کننده پشتیبانی می‌کند.",
  "{0} must be an integer from {1} to {2}.":
    "مقدار {0} باید عدد صحیحی از {1} تا {2} باشد.",
  "Duplicate {0} identifier.": "شناسه {0} تکراری است.",
  "A winner needs {0} completed sets.": "برنده به {0} ست کامل نیاز دارد.",
  "Expected a {0} code.": "کدی با قالب {0} لازم است.",
  "Complete the required field: {0}": "فیلد ضروری را کامل کنید: {0}",
  "Choose a valid option for {0}.": "برای {0} یک گزینه معتبر انتخاب کنید.",
  "Invalid value for {0}.": "مقدار {0} نامعتبر است.",
  "A participant named {0} is already registered. Review the duplicate before approving.":
    "شرکت‌کننده‌ای با نام {0} قبلاً ثبت‌نام کرده است. پیش از تأیید، مورد تکراری را بررسی کنید.",
  "Another tab changed this tournament (revision {0}). Reload the saved copy before editing. Your unsaved copy can be exported for recovery.":
    "برگه دیگری مسابقات را تغییر داده است (نسخه {0}). پیش از ویرایش، کپی ذخیره‌شده را دوباره بارگذاری کنید. برای بازیابی می‌توانید از کپی ذخیره‌نشده خروجی بگیرید.",
  "The source has no group named {0}.": "مبدأ گروهی با نام {0} ندارد.",
  "Finishing position {0} exceeds the size of group {1}.":
    "رتبه نهایی {0} از تعداد اعضای گروه {1} بیشتر است.",
  "Finishing position {0} is outside the source field.":
    "رتبه نهایی {0} خارج از محدوده شرکت‌کنندگان مبدأ است.",
  "Finishing position {0} is inside an unresolved tied rank.":
    "رتبه نهایی {0} در محدوده یک تساوی حل‌نشده قرار دارد.",
  "Complete {0} before advancing its entrants.":
    "پیش از صعود شرکت‌کنندگان، {0} را کامل کنید.",
  "Group {0} has no finishing position {1}.": "گروه {0} رتبه نهایی {1} ندارد.",
  "Group {0} has an unresolved tie at finishing position {1}.":
    "گروه {0} در رتبه نهایی {1} دارای تساوی حل‌نشده است.",
  "Group {0} is tied at the discard boundary.":
    "گروه {0} در مرز حذف رتبه‌های پایین دارای تساوی است.",
  "Group {0} has no retained matches for its candidate.":
    "گروه {0} برای نامزد خود بازی باقی‌مانده‌ای ندارد.",
  "Group {0} has no played matches for a wildcard comparison.":
    "گروه {0} برای مقایسه سهمیه آزاد بازی انجام‌شده‌ای ندارد.",
  "Compared using matches against the top {0} places in its group.":
    "مقایسه بر پایه بازی‌ها با {0} رتبه برتر گروه انجام می‌شود.",
  "Invalid entrants in {0}.": "شرکت‌کنندگان {0} نامعتبر هستند.",
  "Missing advancement source in {0}.": "مبدأ صعود در {0} وجود ندارد.",
  "Invalid qualification count in {0}.":
    "تعداد صعودکنندگان در {0} نامعتبر است.",
  "Broken source slot in {0}.": "جایگاه مبدأ در {0} نامعتبر است.",
  "Changing this result invalidates {0} played dependent match(es).":
    "تغییر این نتیجه، {0} بازی وابسته انجام‌شده را نامعتبر می‌کند.",
};

export const advancementTranslations: Record<string, string> = {
  "Stage dependencies contain a cycle.": "وابستگی مراحل دارای چرخه است.",
  "Match dependencies contain a cycle.": "وابستگی بازی‌ها دارای چرخه است.",
  "Participant identifiers must be unique.":
    "شناسه شرکت‌کنندگان باید یکتا باشد.",
  "Stage identifiers must be unique.": "شناسه مراحل باید یکتا باشد.",
  "Match identifiers must be unique.": "شناسه بازی‌ها باید یکتا باشد.",
  "An advancement source stage does not exist.":
    "یکی از مراحل مبدأ صعود وجود ندارد.",
  "Advancement counts must be integers from 1 to 512.":
    "تعداد صعودکنندگان باید عدد صحیحی از ۱ تا ۵۱۲ باشد.",
  "Explicit positions and wildcard rules cannot also select top entrants per group.":
    "انتخاب رتبه‌های مشخص و سهمیه آزاد نمی‌تواند هم‌زمان با انتخاب نفرات برتر هر گروه باشد.",
  "Per-group advancement requires a grouped source stage.":
    "صعود از هر گروه به مرحله مبدأ گروهی نیاز دارد.",
  "The position count must match the number of exact picks.":
    "تعداد جایگاه‌ها باید با تعداد انتخاب‌های دقیق برابر باشد.",
  "Finishing positions must be integers from 1 to 512.":
    "رتبه‌های نهایی باید عدد صحیحی از ۱ تا ۵۱۲ باشند.",
  "A finishing position exceeds the source field size.":
    "یک رتبه نهایی از تعداد شرکت‌کنندگان مبدأ بیشتر است.",
  "An advancement position is assigned more than once.":
    "یک جایگاه صعود بیش از یک بار تخصیص داده شده است.",
  "Wildcard comparisons require a round-robin groups stage.":
    "مقایسه سهمیه آزاد به مرحله گروهی دوره‌ای نیاز دارد.",
  "A wildcard rule references an undefined group.":
    "قانون سهمیه آزاد به گروه تعریف‌نشده اشاره دارد.",
  "A wildcard rule repeats a group.":
    "یک گروه در قانون سهمیه آزاد تکرار شده است.",
  "The wildcard count exceeds the number of candidate groups.":
    "تعداد سهمیه‌های آزاد از تعداد گروه‌های نامزد بیشتر است.",
  "The wildcard finishing position exceeds a selected group size.":
    "رتبه نهایی سهمیه آزاد از تعداد اعضای یکی از گروه‌های انتخاب‌شده بیشتر است.",
  "The wildcard finishing position must be an integer from 1 to 512.":
    "رتبه نهایی سهمیه آزاد باید عدد صحیحی از ۱ تا ۵۱۲ باشد.",
  "The wildcard comparison policy is not supported.":
    "روش مقایسه سهمیه آزاد پشتیبانی نمی‌شود.",
  "Choose distinct supported wildcard tie-breakers.":
    "معیارهای رفع تساوی سهمیه آزاد باید پشتیبانی‌شده و غیرتکراری باشند.",
  "A wildcard candidate pool is assigned more than once.":
    "مجموعه نامزدهای سهمیه آزاد بیش از یک بار تخصیص داده شده است.",
  "Physical bracket slots are supported for single and double elimination.":
    "جایگاه‌های فیزیکی جدول برای تک‌حذفی و دوحذفی پشتیبانی می‌شوند.",
  "Provide one bracket slot for each qualifier from the source.":
    "برای هر صعودکننده از مبدأ یک جایگاه جدول تعیین کنید.",
  "Bracket slots must be integers from 1 to 512.":
    "جایگاه‌های جدول باید عدد صحیحی از ۱ تا ۵۱۲ باشند.",
  "A physical bracket slot is assigned more than once.":
    "یک جایگاه فیزیکی جدول بیش از یک بار تخصیص داده شده است.",
  "The destination cannot qualify more than 512 entrants.":
    "مرحله مقصد نمی‌تواند بیش از ۵۱۲ صعودکننده داشته باشد.",
  "A physical bracket slot exceeds the destination draw size.":
    "یک جایگاه فیزیکی از اندازه جدول مقصد بیشتر است.",
  "Outside the selected positions.": "خارج از رتبه‌های انتخاب‌شده است.",
  "The qualification count exceeds the eligible candidate count.":
    "تعداد سهمیه‌ها از تعداد نامزدهای واجد شرایط بیشتر است.",
  "Qualification is tied at the cutoff. Resolve the source tie or select valid manual qualifiers.":
    "در مرز صعود تساوی وجود دارد. تساوی مبدأ را حل کنید یا صعودکنندگان معتبر را دستی انتخاب کنید.",
  "Unresolved tie at the qualification cutoff.":
    "تساوی حل‌نشده در مرز صعود وجود دارد.",
  "Chosen from the tied cutoff by a manual decision.":
    "با تصمیم دستی از میان افراد مساوی در مرز صعود انتخاب شده است.",
  "Qualifies through this connection.": "از طریق این اتصال صعود می‌کند.",
  "The requested position is inside an unresolved tied rank.":
    "رتبه درخواستی در محدوده یک تساوی حل‌نشده قرار دارد.",
  "Resolve source ranking ties before assigning their physical bracket slots.":
    "پیش از تخصیص جایگاه‌های فیزیکی جدول، تساوی رتبه‌های مبدأ را حل کنید.",
  "The source finishing position is tied.": "رتبه نهایی مبدأ دارای تساوی است.",
  "Already qualified through another connection.":
    "قبلاً از طریق اتصال دیگری صعود کرده است.",
  "The participant is not active.": "شرکت‌کننده فعال نیست.",
  "The wildcard position falls below the retained group size.":
    "رتبه سهمیه آزاد پایین‌تر از تعداد اعضای نگه‌داشته‌شده گروه است.",
  "Compared using values per played match.":
    "مقایسه بر پایه مقادیر به‌ازای هر بازی انجام‌شده است.",
  "Compared using total values.": "مقایسه بر پایه مجموع مقادیر است.",
  "Manual qualifiers must be a list of distinct participant identifiers.":
    "صعودکنندگان دستی باید فهرستی از شناسه‌های غیرتکراری شرکت‌کنندگان باشند.",
  "An entrant qualifies more than once. Adjust the connections.":
    "یک شرکت‌کننده بیش از یک بار صعود می‌کند. اتصال‌ها را اصلاح کنید.",
  "A selected qualifier is not active.":
    "یکی از صعودکنندگان انتخاب‌شده فعال نیست.",
  "Manual qualifiers must retain every clear qualifier and only resolve ties within eligible positions.":
    "انتخاب دستی باید همه صعودکنندگان قطعی را حفظ کند و فقط تساوی رتبه‌های واجد شرایط را حل کند.",
};
