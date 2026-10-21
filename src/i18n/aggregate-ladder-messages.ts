export const aggregateLadderTranslations: Record<string, string> = {
  "Default match duration is locked after play starts. Review individual unfinished bookings instead.":
    "پس از شروع بازی، مدت پیش‌فرض دیدار قفل می‌شود. رزروهای ناتمام را جداگانه بررسی کنید.",
  "Only unplayed matches can change their saved booking.":
    "فقط دیدارهای بازی‌نشده می‌توانند رزرو ذخیره‌شده خود را تغییر دهند.",
  "Live aggregate scores must equal the saved leg totals.":
    "امتیاز زنده مجموع باید برابر جمع بازی‌های ذخیره‌شده باشد.",
  "The stored aggregate result must declare its calculated or ruled winner.":
    "نتیجه ذخیره‌شده مجموع باید برنده محاسبه‌شده یا تعیین‌شده طبق رأی را اعلام کند.",
  "Away-goal tiebreaks need highest-score rules and an even number of regulation legs.":
    "رفع تساوی با گل خارج از خانه به قانون بیشترین امتیاز و تعداد زوج بازی اصلی نیاز دارد.",
  "The configured away-goal result cannot be replaced by a manual tiebreak winner.":
    "نتیجه قاعده گل خارج از خانه نمی‌تواند با برنده دستی رفع تساوی جایگزین شود.",
  "The recorded winner does not match the regulation away-goal totals.":
    "برنده ثبت‌شده با مجموع گل خارج از خانه در بازی‌های اصلی سازگار نیست.",
  "Away-goal scoring requires nonnegative leg scores.":
    "امتیاز بازی‌ها در قاعده گل خارج از خانه باید صفر یا مثبت باشد.",
  "Full placement brackets require single or double elimination.":
    "جدول تعیین همه رتبه‌ها به قالب تک‌حذفی یا دوحذفی نیاز دارد.",
  "Aggregate legs require a single or double elimination stage.":
    "دیدارهای رفت و برگشت به مرحله تک‌حذفی یا دوحذفی نیاز دارند.",
  "Aggregate legs require highest-score or lowest-score rules.":
    "دیدارهای رفت و برگشت به قانون بیشترین یا کمترین امتیاز نیاز دارند.",
  "The aggregate leg policy is invalid.":
    "قاعده بازی‌های رفت و برگشت نامعتبر است.",
  "The aggregate score exceeds the supported range.":
    "امتیاز مجموع از محدوده پشتیبانی‌شده بیشتر است.",
  "Leg results require an aggregate stage policy.":
    "نتیجه بازی‌های رفت و برگشت به قاعده مجموع در مرحله نیاز دارد.",
  "Aggregate ties require exactly two entrants.":
    "دیدار رفت و برگشت باید دقیقاً دو شرکت‌کننده داشته باشد.",
  "Record an aggregate ruling without leg results or a tiebreak winner.":
    "رأی انصراف یا عدم حضور را بدون نتیجه بازی‌ها یا برنده رفع تساوی ثبت کنید.",
  "Enter every required regulation leg and only the permitted extra leg.":
    "همه بازی‌های اصلی لازم و فقط بازی اضافه مجاز را وارد کنید.",
  "An extra leg is allowed only when the regulation aggregate is tied.":
    "بازی اضافه تنها در صورت تساوی مجموع بازی‌های اصلی مجاز است.",
  "Play the configured extra leg before resolving this tied aggregate.":
    "پیش از تعیین برنده مجموع مساوی، بازی اضافه تعیین‌شده را انجام دهید.",
  "The recorded aggregate must equal the sum of all leg scores.":
    "مجموع ثبت‌شده باید برابر جمع امتیاز همه بازی‌ها باشد.",
  "Aggregate legs cannot also contain set or placement results.":
    "بازی‌های رفت و برگشت نمی‌توانند هم‌زمان نتیجه ست یا جایگاه داشته باشند.",
  "Select the winner of the agreed aggregate tiebreak ruling.":
    "برنده رأی توافق‌شده برای رفع تساوی مجموع را انتخاب کنید.",
  "The aggregate tiebreak winner must match the recorded winner.":
    "برنده رفع تساوی مجموع باید با برنده ثبت‌شده یکسان باشد.",
  "A tiebreak winner is allowed only for a tied aggregate.":
    "برنده رفع تساوی فقط برای مجموع مساوی مجاز است.",
  "Leg progress and schedules require an aggregate tie.":
    "پیشرفت و زمان‌بندی بازی‌های رفت و برگشت به دیدار با قاعده مجموع نیاز دارد.",
  "A leg exceeds the configured aggregate policy.":
    "شماره یا تعداد بازی از قاعده مجموع تعیین‌شده بیشتر است.",
  "A leg schedule references a missing resource.":
    "برنامه یکی از بازی‌ها به محل ناموجود اشاره دارد.",
  "Only an unresolved playable aggregate tie can save leg progress.":
    "پیشرفت بازی‌ها تنها برای دیدار رفت و برگشت آماده بازی و بدون نتیجه نهایی ذخیره می‌شود.",
  "Save between one leg and the configured aggregate limit.":
    "بین یک بازی و سقف تعیین‌شده برای مجموع ذخیره کنید.",
  "Only a resolved match can change its operating status.":
    "وضعیت اجرایی تنها برای دیدار با ورودی‌های مشخص قابل تغییر است.",
  "This match feeds progression and needs a decisive ruling instead of cancellation.":
    "این دیدار در صعود اثر دارد و به جای لغو، به رأی قطعی نیاز دارد.",
  "Challenge simulation needs two active entrants.":
    "شبیه‌سازی چالش به دو شرکت‌کننده فعال نیاز دارد.",
  "Reset the unplayed challenge stage before replacing its invitation history.":
    "پیش از جایگزینی تاریخچه دعوت‌ها، مرحله چالش بازی‌نشده را بازنشانی کنید.",
  "Ladder policies can only be used with a ladder stage.":
    "قواعد نردبانی فقط در مرحله نردبانی قابل استفاده‌اند.",
  "The ladder policy configuration is invalid.":
    "تنظیمات قاعده نردبانی نامعتبر است.",
  "The challenge closure flag must be a boolean.":
    "علامت پایان چالش باید مقدار درست یا نادرست داشته باشد.",
  "The stored challenge invitation list is invalid.":
    "فهرست ذخیره‌شده دعوت‌های چالش نامعتبر است.",
  "Challenge invitations require the invitation ladder policy.":
    "دعوت چالش به قاعده نردبانی مبتنی بر دعوت نیاز دارد.",
  "Challenge invitation identifiers must be unique.":
    "شناسه دعوت‌های چالش باید یکتا باشد.",
  "A challenge must reference two distinct entrants in its stage.":
    "چالش باید به دو شرکت‌کننده متفاوت در همان مرحله اشاره کند.",
  "A challenge invitation references a missing stage match.":
    "دعوت چالش به دیدار ناموجود در مرحله اشاره دارد.",
  "Select a ladder stage using the invitation policy.":
    "یک مرحله نردبانی با قاعده دعوت انتخاب کنید.",
  "Initialize an active ladder before managing challenges.":
    "پیش از مدیریت چالش‌ها، مرحله نردبانی فعال را آغاز کنید.",
  "A challenger must be lower ranked and within the configured rank gap.":
    "چالش‌دهنده باید رتبه پایین‌تر داشته باشد و در فاصله رتبه مجاز باشد.",
  "Both challenge entrants must be active.":
    "هر دو شرکت‌کننده چالش باید فعال باشند.",
  "This stage has reached its 1000-invitation limit. Archive it before starting another stage.":
    "این مرحله به سقف ۱۰۰۰ دعوت رسیده است. پیش از شروع مرحله دیگر، آن را بایگانی کنید.",
  "This pair already has an open challenge invitation.":
    "این دو شرکت‌کننده از قبل یک دعوت چالش باز دارند.",
  "This invitation no longer accepts a decision.":
    "این دعوت دیگر قابل تصمیم‌گیری نیست.",
  "This challenge is already approved.": "این چالش قبلاً تأیید شده است.",
  "Complete or cancel the active challenge before approving another.":
    "پیش از تأیید چالش بعدی، چالش فعال را کامل یا لغو کنید.",
  "This ladder has reached its configured challenge limit.":
    "این مرحله نردبانی به سقف چالش تعیین‌شده رسیده است.",
  "The document has reached its match limit.":
    "سند به سقف تعداد دیدار رسیده است.",
  "Cancel an approved challenge instead of declining it.":
    "چالش تأییدشده را به جای رد کردن، لغو کنید.",
  "A started challenge cannot be canceled. Use reviewed result correction instead.":
    "چالش شروع‌شده قابل لغو نیست. از اصلاح نتیجه با بررسی پیامدها استفاده کنید.",
  "Select an active invitation or King of the Hill ladder.":
    "یک مرحله نردبانی دعوتی یا پادشاه میدان فعال انتخاب کنید.",
  "Complete at least one challenge and finish active matches before closing the ladder.":
    "پیش از پایان مرحله نردبانی، دست‌کم یک چالش و همه دیدارهای فعال را کامل کنید.",
  "Decline or cancel pending invitations before closing the ladder.":
    "پیش از پایان مرحله نردبانی، دعوت‌های در انتظار را رد یا لغو کنید.",
  "King of the Hill needs two active entrants. Restore eligibility or close the stage.":
    "پادشاه میدان به دو شرکت‌کننده فعال نیاز دارد. صلاحیت را بازگردانید یا مرحله را ببندید.",
  "A placement dimension needs its ordered points table.":
    "معیار جایگاه به جدول مرتب امتیازها نیاز دارد.",
  "Finishing places must be whole numbers between 1 and the entrant count.":
    "جایگاه نهایی باید عدد صحیح بین ۱ و تعداد شرکت‌کنندگان باشد.",
  "Use competition ranks for finishing places, such as 1, 1, 3 for a tie.":
    "برای جایگاه نهایی از رتبه مسابقه استفاده کنید؛ برای نمونه ۱، ۱، ۳ هنگام تساوی.",
  "Recorded winners must agree with the weighted metric calculation.":
    "برندگان ثبت‌شده باید با محاسبه معیارهای وزنی سازگار باشند.",
  "Aggregate schedules need 2 to 8 legs and at most one extra leg.":
    "برنامه رفت و برگشت به ۲ تا ۸ بازی و حداکثر یک بازی اضافه نیاز دارد.",
  "The expanded schedule exceeds 20000 leg bookings.":
    "برنامه گسترش‌یافته از ۲۰۰۰۰ رزرو بازی بیشتر است.",
  "Choose an unfinished aggregate tie that is not live.":
    "یک دیدار رفت و برگشت ناتمام که در حال اجرا نیست انتخاب کنید.",
  "Book every regulation leg in order and only the permitted extra leg.":
    "همه بازی‌های اصلی را به ترتیب و فقط بازی اضافه مجاز را رزرو کنید.",
  "Choose a venue for every aggregate leg.":
    "برای هر بازی رفت و برگشت یک محل انتخاب کنید.",
  "A scored aggregate leg cannot be rescheduled.":
    "بازی رفت و برگشت دارای امتیاز ثبت‌شده قابل زمان‌بندی مجدد نیست.",
  "Select an individual aggregate leg on the timeline.":
    "یک بازی مشخص از دیدار رفت و برگشت را در خط زمان انتخاب کنید.",
  "Edit individual aggregate legs in the leg schedule editor.":
    "هر بازی رفت و برگشت را در ویرایشگر برنامه بازی‌ها ویرایش کنید.",
  "Provide exactly one movement rule for every division.":
    "برای هر دسته دقیقاً یک قاعده جابه‌جایی تعیین کنید.",
  "Choose a different destination division for every nonzero movement rule.":
    "برای هر قاعده جابه‌جایی غیرصفر، دسته مقصد متفاوتی انتخاب کنید.",
  "Each new league division needs between 2 and 128 entrants.":
    "هر دسته جدید لیگ به ۲ تا ۱۲۸ شرکت‌کننده نیاز دارد.",
  "Link a source competition in every division to supply its sport and rules.":
    "در هر دسته یک مسابقات مبدأ متصل کنید تا رشته و قوانین آن مشخص شود.",
};
