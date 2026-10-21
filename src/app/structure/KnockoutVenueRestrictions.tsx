import { MapPinned, Plus } from "lucide-react";
import type { KnockoutDrawConfig, Resource, Stage } from "../../domain/types";
import { MAX_DISTANCE_KM } from "../../domain/geography";
import {
  getKnockoutVenueTargets,
  knockoutVenueTargetKey,
} from "../../engine/venue-distance";
import { Notice } from "../../components/ui";
import { useI18n } from "../../i18n";
import { withVenueRules } from "./knockout-config";
import { KnockoutVenueRuleEditor } from "./KnockoutVenueRuleEditor";
export function KnockoutVenueRestrictions({
  value,
  stage,
  entrantCount,
  resources,
  onChange,
}: {
  value: KnockoutDrawConfig;
  stage: Stage;
  entrantCount: number;
  resources: Resource[];
  onChange: (value: KnockoutDrawConfig) => void;
}) {
  const { t } = useI18n();
  const rules = value.version === 6 ? value.venueRules : [];
  const catalog = getKnockoutVenueTargets(stage, entrantCount);
  const occupied = new Set(
    rules.flatMap((rule) => rule.targets.map(knockoutVenueTargetKey)),
  );
  const nextTarget = catalog.find(
    (target) => !occupied.has(knockoutVenueTargetKey(target)),
  );
  return (
    <section
      className="draw-venue-restrictions"
      aria-label={t("Venue distance", "فاصله تا محل بازی")}
    >
      <h4>
        <MapPinned size={18} aria-hidden="true" />
        {t("Venue distance", "فاصله تا محل بازی")}
      </h4>
      <p className="muted">
        {t(
          "Assign selected matches to a venue and limit the distance from each possible entrant's base. Add venue coordinates in Schedule and base coordinates in Participants. The draw keeps every possible entrant within the range, including automatic advances and later result paths.",
          "دیدارهای انتخاب‌شده را به یک محل بازی اختصاص دهید و فاصله پایگاه هر شرکت‌کننده ممکن تا آن را محدود کنید. مختصات محل بازی را در بخش برنامه و مختصات پایگاه را در بخش شرکت‌کنندگان وارد کنید. قرعه فاصله همه شرکت‌کنندگان ممکن، از جمله صعودهای خودکار و مسیرهای نتایج بعدی را در بازه مجاز نگه می‌دارد.",
        )}
      </p>
      <Notice>
        {t(
          "These are straight great-circle distances, not road routes or travel times. Each match can have one venue rule. Generated matches retain that venue assignment when scheduling.",
          "این فاصله‌ها کمان مستقیم روی کره زمین هستند، نه مسیر جاده‌ای یا زمان سفر. هر دیدار می‌تواند یک قانون محل بازی داشته باشد. محل اختصاص‌یافته هنگام زمان‌بندی دیدارهای ساخته‌شده حفظ می‌شود.",
        )}
      </Notice>
      {!resources.length && (
        <Notice>
          {t(
            "Add a court, table, or room in Schedule and save it before adding a venue rule.",
            "پیش از افزودن قانون محل بازی، یک زمین، میز یا اتاق در بخش برنامه اضافه و ذخیره کنید.",
          )}
        </Notice>
      )}
      <div className="draw-venue-rules">
        {rules.map((rule, index) => (
          <KnockoutVenueRuleEditor
            key={index}
            rule={rule}
            index={index}
            resources={resources}
            catalog={catalog}
            taken={
              new Set(
                rules.flatMap((other, otherIndex) =>
                  otherIndex === index
                    ? []
                    : other.targets.map(knockoutVenueTargetKey),
                ),
              )
            }
            onChange={(next) =>
              onChange(
                withVenueRules(
                  value,
                  rules.map((item, itemIndex) =>
                    itemIndex === index ? next : item,
                  ),
                ),
              )
            }
            onRemove={() =>
              onChange(
                withVenueRules(
                  value,
                  rules.filter((_, itemIndex) => index !== itemIndex),
                ),
              )
            }
          />
        ))}
      </div>
      <button
        type="button"
        className="button secondary"
        disabled={!resources.length || !nextTarget || rules.length >= 64}
        onClick={() => {
          if (nextTarget && resources[0])
            onChange(
              withVenueRules(value, [
                ...rules,
                {
                  resourceId: resources[0].id,
                  maxKm: MAX_DISTANCE_KM,
                  targets: [nextTarget],
                },
              ]),
            );
        }}
      >
        <Plus size={16} />
        {t("Add venue restriction", "افزودن محدودیت محل بازی")}
      </button>
      <p className="draw-separation-help">
        {t(
          "Preview before applying. A venue for a final usually needs to be reachable by every entrant. Moving seeds cannot fix a venue range that excludes a required finalist. Public copies keep venue assignments and rules but omit coordinates; private backups preserve coordinates for a new draw.",
          "پیش از اعمال قوانین، پیش‌نمایش را بررسی کنید. محل فینال معمولاً باید در محدوده مجاز همه شرکت‌کنندگان باشد. جابه‌جایی سیدها نمی‌تواند محدودیت محل بازی را برای فینالیست الزامی برطرف کند. نسخه عمومی تخصیص محل بازی و قوانین را نگه می‌دارد اما مختصات را ندارد؛ پشتیبان خصوصی مختصات را برای قرعه تازه حفظ می‌کند.",
        )}
      </p>
    </section>
  );
}
