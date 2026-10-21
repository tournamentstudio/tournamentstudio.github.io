import { useState } from "react";
import { Check, Search } from "lucide-react";
import type {
  KnockoutDrawConfig,
  KnockoutVenueTarget,
  Stage,
  Tournament,
} from "../../domain/types";
import { MAX_DISTANCE_KM } from "../../domain/geography";
import {
  getKnockoutVenueTargets,
  knockoutVenueTargetKey,
} from "../../engine/venue-distance";
import {
  automaticVenueIssueText,
  type AutomaticVenueRequest,
} from "../../engine/automatic-venues";
import { ErrorText, Field, Notice } from "../../components/ui";
import { useDrawPreview } from "../../workers/use-draw-preview";
import { useI18n } from "../../i18n";
import { KnockoutVenueTargets } from "./KnockoutVenueTargets";
import { AutomaticVenuePreview } from "./AutomaticVenuePreview";
import { AutomaticVenueSchedulePreview } from "./AutomaticVenueSchedulePreview";
import "./automatic-venues.css";

export function AutomaticVenueAssistant({
  tournament,
  stage,
  value,
  entrantCount,
  onChange,
}: {
  tournament: Tournament;
  stage: Stage;
  value: KnockoutDrawConfig;
  entrantCount: number;
  onChange: (value: KnockoutDrawConfig) => void;
}) {
  const { t, locale } = useI18n();
  const [resourceIds, setResourceIds] = useState<string[]>([]);
  const [targets, setTargets] = useState<KnockoutVenueTarget[]>([]);
  const [minKm, setMinKm] = useState<number>();
  const [maxKm, setMaxKm] = useState<number | undefined>(MAX_DISTANCE_KM);
  const [checkAvailability, setCheckAvailability] = useState(true);
  const [applied, setApplied] = useState<string>();
  const resources = tournament.schedule.resources;
  const catalog = getKnockoutVenueTargets(stage, entrantCount);
  const taken = new Set(
    (value.version === 6 ? value.venueRules : []).flatMap((rule) =>
      rule.targets.map(knockoutVenueTargetKey),
    ),
  );
  const request: AutomaticVenueRequest = {
    resourceIds,
    targets,
    ...(minKm === undefined ? {} : { minKm }),
    ...(maxKm === undefined ? {} : { maxKm }),
  };
  const key = JSON.stringify([
    tournament,
    stage.id,
    request,
    checkAvailability,
  ]);
  const computation = useDrawPreview(
    {
      kind: "automatic-venues",
      tournament,
      stageId: stage.id,
      request,
      checkAvailability,
    },
    key,
  );
  const current = computation.result;
  return (
    <details className="automatic-venue-assistant">
      <summary>
        {t("Automatic venue selection", "انتخاب خودکار محل بازی")}
      </summary>
      <p>
        {t(
          "Choose candidate venues and unassigned matches. The assistant looks for a valid draw and venue assignments while preserving your manual rules, seeds, pots, and distance limits.",
          "محل‌های پیشنهادی و دیدارهای بدون تخصیص را انتخاب کنید. دستیار با حفظ قوانین دستی، سیدها، گلدان‌ها و حدود فاصله شما، یک قرعه معتبر و تخصیص محل بازی پیدا می‌کند.",
        )}
      </p>
      <Notice>
        {t(
          "The search prefers a smaller farthest-base distance among the venues it checks. It does not optimize road routes or total travel. Suggestions become fixed venue rules only after you add them to the draft and save the draw rules.",
          "جست‌وجو در میان محل‌هایی که بررسی می‌کند، فاصله کمتر تا دورترین پایگاه را ترجیح می‌دهد. مسیر جاده‌ای یا مجموع سفر را بهینه نمی‌کند. پیشنهادها فقط پس از افزودن به پیش‌نویس و ذخیره قوانین قرعه، به قوانین ثابت محل بازی تبدیل می‌شوند.",
        )}
      </Notice>
      <fieldset className="automatic-venue-candidates">
        <legend>
          {t("Candidate venues", "محل‌های پیشنهادی")} (
          {resourceIds.length.toLocaleString(locale)}/
          {(16).toLocaleString(locale)})
        </legend>
        <p className="muted">
          {t(
            "Choose up to 16 venues with saved coordinates. A venue can host several matches at different times.",
            "حداکثر ۱۶ محل بازی دارای مختصات ذخیره‌شده انتخاب کنید. یک محل می‌تواند چند دیدار را در زمان‌های متفاوت میزبانی کند.",
          )}
        </p>
        <button
          type="button"
          className="text-button"
          disabled={!resources.some((resource) => resource.location)}
          onClick={() =>
            setResourceIds(
              resources
                .filter((resource) => resource.location)
                .slice(0, 16)
                .map((resource) => resource.id),
            )
          }
        >
          {t(
            "Select first 16 located venues",
            "انتخاب ۱۶ محل نخست دارای مختصات",
          )}
        </button>
        {!resources.length && (
          <p>
            {t(
              "Add venues and save their coordinates in Schedule first.",
              "ابتدا محل‌های بازی و مختصات آن‌ها را در بخش برنامه ذخیره کنید.",
            )}
          </p>
        )}
        <div className="automatic-venue-options">
          {resources.map((resource) => (
            <label className="check-row" key={resource.id}>
              <input
                type="checkbox"
                checked={resourceIds.includes(resource.id)}
                disabled={
                  !resourceIds.includes(resource.id) &&
                  (!resource.location || resourceIds.length >= 16)
                }
                onChange={(event) =>
                  setResourceIds(
                    event.target.checked
                      ? [...resourceIds, resource.id]
                      : resourceIds.filter((id) => id !== resource.id),
                  )
                }
              />
              <span>
                <bdi>{resource.name}</bdi>
                {!resource.location && (
                  <small>
                    {t(
                      "Add coordinates in Schedule",
                      "افزودن مختصات در بخش برنامه",
                    )}
                  </small>
                )}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="draw-distance-fields">
        <Field
          label={t(
            "Suggested minimum venue distance (km)",
            "حداقل فاصله پیشنهادی تا محل بازی (کیلومتر)",
          )}
          hint={t(
            "Leave blank for no minimum. Zero is valid.",
            "برای نبود حداقل، خالی بگذارید. صفر معتبر است.",
          )}
        >
          <input
            type="number"
            min={0}
            max={MAX_DISTANCE_KM}
            step="any"
            inputMode="decimal"
            value={minKm ?? ""}
            aria-label={t(
              "Suggested minimum venue distance (km)",
              "حداقل فاصله پیشنهادی تا محل بازی (کیلومتر)",
            )}
            onChange={(event) =>
              setMinKm(
                event.target.value === ""
                  ? undefined
                  : Number(event.target.value),
              )
            }
          />
        </Field>
        <Field
          label={t(
            "Suggested maximum venue distance (km)",
            "حداکثر فاصله پیشنهادی تا محل بازی (کیلومتر)",
          )}
          hint={t(
            "Leave blank for no maximum. Enter at least one limit.",
            "برای نبود حداکثر، خالی بگذارید. دست‌کم یک حد وارد کنید.",
          )}
        >
          <input
            type="number"
            min={0}
            max={MAX_DISTANCE_KM}
            step="any"
            inputMode="decimal"
            value={maxKm ?? ""}
            aria-label={t(
              "Suggested maximum venue distance (km)",
              "حداکثر فاصله پیشنهادی تا محل بازی (کیلومتر)",
            )}
            onChange={(event) =>
              setMaxKm(
                event.target.value === ""
                  ? undefined
                  : Number(event.target.value),
              )
            }
          />
        </Field>
      </div>
      <KnockoutVenueTargets
        targets={targets}
        catalog={catalog}
        taken={taken}
        onChange={setTargets}
      />
      <label className="check-row automatic-venue-availability">
        <input
          type="checkbox"
          aria-label={t("Check schedule availability", "بررسی امکان زمان‌بندی")}
          checked={checkAvailability}
          onChange={(event) => setCheckAvailability(event.target.checked)}
        />
        <span>
          {t("Check schedule availability", "بررسی امکان زمان‌بندی")}
          <small>
            {t(
              "Check a fresh schedule for all generated matches using current venue windows and rest periods. Existing saved times are not reserved. No times are saved by this preview. A failed check does not prove that every other schedule is impossible.",
              "یک برنامه تازه برای همه دیدارهای ساخته‌شده با بازه فعالیت محل‌ها و زمان استراحت فعلی بررسی می‌شود. زمان‌های ذخیره‌شده قبلی رزرو نمی‌شوند و این پیش‌نمایش هیچ زمانی را ذخیره نمی‌کند. شکست این بررسی، ناممکن بودن همه برنامه‌های دیگر را ثابت نمی‌کند.",
            )}
          </small>
        </span>
      </label>
      <div className="draw-actions">
        <button
          type="button"
          className="button secondary"
          disabled={computation.busy}
          onClick={() => void computation.run()}
        >
          <Search size={16} />
          {t("Find venue assignments", "یافتن محل بازی دیدارها")}
        </button>
        <button
          type="button"
          className="button primary"
          disabled={!current?.ready || !current.draw}
          onClick={() => {
            if (!current?.ready || !current.draw) return;
            onChange(current.draw);
            setApplied(JSON.stringify(current.draw));
            setTargets([]);
            computation.cancel();
          }}
        >
          <Check size={16} />
          {t(
            "Add suggestions to draw draft",
            "افزودن پیشنهادها به پیش‌نویس قرعه",
          )}
        </button>
      </div>
      {computation.busy && (
        <div className="button-row">
          <span role="status">
            {t("Finding venue assignments", "در حال یافتن محل بازی دیدارها")}
          </span>
          <button
            type="button"
            className="button secondary"
            onClick={computation.cancel}
          >
            {t("Cancel preview", "لغو پیش‌نمایش")}
          </button>
        </div>
      )}
      <ErrorText error={computation.error} />
      {computation.canRunLocally && (
        <button
          type="button"
          className="button secondary"
          onClick={() => void computation.run(true)}
        >
          {t(
            "Run bounded preview locally",
            "اجرای پیش‌نمایش با سقف محاسبه مشخص در این صفحه",
          )}
        </button>
      )}
      {applied === JSON.stringify(value) && (
        <Notice>
          {t(
            "Venue suggestions were added to the draft. Preview the knockout draw, then apply its rules before generating matches.",
            "پیشنهادهای محل بازی به پیش‌نویس افزوده شدند. پیش‌نمایش قرعه حذفی را بررسی کنید و پیش از ساخت دیدارها، قوانین آن را اعمال کنید.",
          )}
        </Notice>
      )}
      {computation.stale && (
        <p className="muted" role="status">
          {t(
            "Inputs changed. Find venue assignments again before adding suggestions.",
            "ورودی‌ها تغییر کرده‌اند. پیش از افزودن پیشنهادها، دوباره محل بازی دیدارها را پیدا کنید.",
          )}
        </p>
      )}
      {current && (
        <div aria-live="polite">
          {!current.ready && (
            <h5>
              {t(
                "Venue selection needs attention",
                "انتخاب محل بازی به بررسی نیاز دارد",
              )}
            </h5>
          )}
          {current.issueDetails.map((issue, index) => (
            <Notice danger key={index}>
              {automaticVenueIssueText(issue, locale)}
            </Notice>
          ))}
          {current.ready && (
            <>
              <AutomaticVenuePreview
                proposal={current}
                request={request}
                resources={resources}
                participants={tournament.participants}
              />
              {current.schedulePreview && (
                <AutomaticVenueSchedulePreview
                  preview={current.schedulePreview}
                  timezone={tournament.timezone}
                />
              )}
            </>
          )}
        </div>
      )}
    </details>
  );
}
