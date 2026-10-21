import type { Locale, Scene, Tournament } from "../domain/types";
import type { AdvancedSceneType } from "../domain/display-options";
import { podiumPlaces } from "./Presentation";
import { matchNames } from "../components/Bracket";
import { publicProjection } from "../sharing";

export interface AdvancedScene extends Omit<Scene, "type"> {
  type: AdvancedSceneType;
  participantIds?: string[];
  matchId?: string;
}

export function introductionMatch(
  tournament: Tournament,
  type: "semifinal" | "final-intro",
  matchId?: string,
) {
  if (matchId) return tournament.matches.find((match) => match.id === matchId);
  const stage = tournament.stages
    .slice()
    .sort((a, b) => a.order - b.order)
    .at(-1);
  const matches = tournament.matches.filter(
    (match) =>
      match.stageId === stage?.id &&
      match.status !== "canceled" &&
      match.bracket !== "placement",
  );
  const priority = (status: string) =>
    ["live", "ready", "pending", "completed", "bye"].indexOf(status);
  if (type === "final-intro")
    return matches
      .filter((match) => match.metadata.championship)
      .sort((a, b) => priority(a.status) - priority(b.status))[0];
  const winners = matches.filter(
    (match) => !["losers", "reset", "final"].includes(match.bracket ?? ""),
  );
  const round = Math.max(0, ...winners.map((match) => match.round)) - 1;
  return winners
    .filter((match) => match.round === round && !match.metadata.championship)
    .sort(
      (a, b) => priority(a.status) - priority(b.status) || a.index - b.index,
    )[0];
}

export function TrophyArtwork() {
  return (
    <svg className="trophy-artwork" viewBox="0 0 320 320" aria-hidden="true">
      <defs>
        <linearGradient id="trophy-metal" x1="0" x2="1">
          <stop offset="0" stopColor="var(--theme-accent)" />
          <stop offset=".45" stopColor="var(--theme-fg)" />
          <stop offset="1" stopColor="var(--theme-accent)" />
        </linearGradient>
      </defs>
      <circle
        cx="160"
        cy="144"
        r="116"
        fill="none"
        stroke="currentColor"
        opacity=".18"
      />
      <circle
        cx="160"
        cy="144"
        r="94"
        fill="none"
        stroke="currentColor"
        strokeDasharray="2 12"
        opacity=".4"
      />
      <path
        d="M107 85H213L203 160Q195 194 174 201V236H207V255H113V236H146V201Q125 194 117 160Z"
        fill="url(#trophy-metal)"
      />
      <path
        d="M112 99H76V122Q76 169 124 173M208 99H244V122Q244 169 196 173"
        fill="none"
        stroke="var(--theme-accent)"
        strokeWidth="11"
      />
      <path
        d="M160 113L169 133L192 136L175 152L179 174L160 163L141 174L145 152L128 136L151 133Z"
        fill="var(--theme-bg)"
      />
      <g className="trophy-sparks" stroke="var(--theme-accent)" strokeWidth="3">
        <path d="M56 50V72M45 61H67" />
        <path d="M263 184V200M255 192H271" />
        <path d="M248 48V64M240 56H256" />
      </g>
    </svg>
  );
}

export function AdvancedSceneContent({
  tournament,
  scene,
  locale,
  elapsed,
}: {
  tournament: Tournament;
  scene: AdvancedScene;
  locale: Locale;
  elapsed: number;
}) {
  const safe = publicProjection(tournament);
  const t = (en: string, fa: string) => (locale === "fa" ? fa : en);
  if (scene.type === "trophy") {
    const place = podiumPlaces(safe).find((p) => p.rank === 1 && !p.tied);
    const champion = safe.participants.find(
      (p) => p.id === place?.participantId,
    );
    return (
      <div className="celebration-scene">
        <TrophyArtwork />
        <p className="presentation-kicker">
          {scene.title || t("THE CHAMPION", "قهرمان رقابت")}
        </p>
        <h1>
          <bdi>
            {champion?.name ??
              t("The champion is not decided yet", "قهرمان هنوز مشخص نشده است")}
          </bdi>
        </h1>
        <p>{scene.text}</p>
      </div>
    );
  }
  if (scene.type === "introduction") {
    const ids =
      scene.participantIds !== undefined
        ? new Set(scene.participantIds)
        : undefined;
    const entrants = safe.participants.filter(
      (p) => p.status === "active" && (!ids || ids.has(p.id)),
    );
    const step = Math.max(
      1,
      Math.floor(scene.duration / Math.max(1, entrants.length)),
    );
    const index = Math.floor(elapsed / step) % Math.max(1, entrants.length),
      participant = entrants[index];
    return (
      <div className="participant-introduction">
        {participant?.logo ? (
          <img src={participant.logo} alt="" />
        ) : (
          <div className="introduction-monogram" aria-hidden="true">
            {participant
              ? Array.from(participant.name).slice(0, 2).join("")
              : "?"}
          </div>
        )}
        <p className="presentation-kicker">
          {scene.title || t("MEET THE COMPETITORS", "آشنایی با رقبا")}
        </p>
        <h1>
          <bdi>
            {participant?.name ??
              t(
                "No active participants selected",
                "شرکت‌کننده فعالی انتخاب نشده است",
              )}
          </bdi>
        </h1>
        {participant?.organization && (
          <p>
            <bdi>{participant.organization}</bdi>
          </p>
        )}
        <p>{scene.text}</p>
        <small>
          {(participant ? index + 1 : 0).toLocaleString(locale)} /{" "}
          {entrants.length.toLocaleString(locale)}
        </small>
      </div>
    );
  }
  const match = introductionMatch(safe, scene.type, scene.matchId);
  return (
    <div className="match-introduction">
      <p className="presentation-kicker">
        {scene.title ||
          (scene.type === "semifinal"
            ? t("SEMIFINAL", "نیمه‌نهایی")
            : t("THE FINAL", "فینال"))}
      </p>
      <div className="match-introduction-entrants">
        {match ? (
          matchNames(safe, match, locale).map((name, i) => (
            <div key={i}>
              <span aria-hidden="true">{(i + 1).toLocaleString(locale)}</span>
              <h1>
                <bdi>{name}</bdi>
              </h1>
            </div>
          ))
        ) : (
          <h1>
            {t("The match is not available yet", "مسابقه هنوز آماده نشده است")}
          </h1>
        )}
      </div>
      <p>{scene.text}</p>
    </div>
  );
}
