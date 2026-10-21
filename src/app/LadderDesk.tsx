import { useState } from "react";
import type { Tournament } from "../domain/types";
import { ladderPolicy, readInvitations } from "../domain/ladder";
import { activeHillQueue, ladderOrder } from "../engine/ladder-state";
import {
  closeLadder,
  decideChallenge,
  requestChallenge,
} from "../engine/challenges";
import { advanceStage, generateStage } from "../engine";
import { Confirm, ErrorText, Field, Notice } from "../components/ui";
import { Pagination, usePagination } from "../components/Pagination";
import { useI18n } from "../i18n";

export function LadderDesk({
  tournament,
  stageId,
  onChange,
}: {
  tournament: Tournament;
  stageId: string;
  onChange: (value: Tournament, action: string) => void;
}) {
  const { t } = useI18n();
  const [challenger, setChallenger] = useState(""),
    [opponent, setOpponent] = useState(""),
    [note, setNote] = useState("");
  const [error, setError] = useState<unknown>(),
    [closing, setClosing] = useState(false);
  const stage = tournament.stages.find((entry) => entry.id === stageId)!;
  const policy = ladderPolicy(stage);
  const entries = readInvitations(stage);
  const page = usePagination([...entries].reverse(), stage.id);
  const name = (id: string) =>
    tournament.participants.find((participant) => participant.id === id)
      ?.name ?? id;
  const order =
    policy.mode === "king-of-hill"
      ? activeHillQueue(tournament, stage)
      : ladderOrder(tournament, stage);
  function run(action: () => Tournament, description: string) {
    try {
      setError(undefined);
      onChange(action(), description);
    } catch (failure) {
      setError(failure);
    }
  }
  const decisionLabel = (decision: "approve" | "decline" | "cancel") =>
    decision === "approve"
      ? t("Approve challenge", "تأیید چالش")
      : decision === "decline"
        ? t("Decline challenge", "رد چالش")
        : t("Cancel challenge", "لغو چالش");
  const statusLabel = (status: string) =>
    ({
      pending: t("Pending review", "در انتظار بررسی"),
      approved: t("Approved", "تأییدشده"),
      declined: t("Declined", "ردشده"),
      canceled: t("Canceled", "لغوشده"),
      resolved: t("Result recorded", "نتیجه ثبت‌شده"),
      invalidated: t(
        "Review again after correction",
        "بررسی دوباره پس از اصلاح",
      ),
    })[status] ?? status;
  if (policy.mode === "adjacent") return null;
  return (
    <section className="panel">
      <h3>
        {policy.mode === "king-of-hill"
          ? t("King of the Hill queue", "صف پادشاه میدان")
          : t("Challenge invitations", "دعوت‌های چالش")}
      </h3>
      <ErrorText error={error} />
      <Notice>
        {t(
          "These decisions belong to the local organizer. They do not send messages or prove a participant's consent or identity.",
          "این تصمیم‌ها متعلق به برگزارکننده محلی است. پیامی ارسال نمی‌شود و رضایت یا هویت شرکت‌کننده را ثابت نمی‌کند.",
        )}
      </Notice>
      <details open={policy.mode === "king-of-hill"}>
        <summary>
          {policy.mode === "king-of-hill"
            ? t("Incumbent and waiting order", "مدافع و ترتیب انتظار")
            : t("Current ladder ranks", "رتبه‌های فعلی نردبان")}
        </summary>
        <ol>
          {order.map((id, index) => (
            <li key={id}>
              <bdi>{name(id)}</bdi>
              {policy.mode === "king-of-hill" && index === 0
                ? ` (${t("Incumbent", "مدافع")})`
                : ""}
            </li>
          ))}
        </ol>
      </details>
      {stage.status === "draft" ? (
        <button
          className="button primary"
          onClick={() =>
            run(
              () => generateStage(tournament, stage.id),
              t("Initialize challenge stage", "آماده‌سازی مرحله چالش"),
            )
          }
        >
          {t("Initialize challenge stage", "آماده‌سازی مرحله چالش")}
        </button>
      ) : stage.status === "completed" ? (
        <Notice>
          {t(
            "This challenge stage is completed. Results and invitations remain available in saved history.",
            "این مرحله چالش پایان یافته است. نتایج و دعوت‌ها در تاریخچه ذخیره‌شده نگهداری می‌شوند.",
          )}
        </Notice>
      ) : (
        <>
          {policy.mode === "invitations" ? (
            <>
              <div className="two-columns">
                <Field label={t("Challenger", "چالش‌دهنده")}>
                  <select
                    value={challenger}
                    onChange={(event) => setChallenger(event.target.value)}
                  >
                    <option value="">
                      {t("Choose entrant", "انتخاب شرکت‌کننده")}
                    </option>
                    {order.map((id) => (
                      <option key={id} value={id}>
                        {name(id)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("Challenged entrant", "شرکت‌کننده مورد چالش")}>
                  <select
                    value={opponent}
                    onChange={(event) => setOpponent(event.target.value)}
                  >
                    <option value="">
                      {t("Choose entrant", "انتخاب شرکت‌کننده")}
                    </option>
                    {order.map((id) => (
                      <option key={id} value={id}>
                        {name(id)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label={t("Private challenge note", "یادداشت خصوصی چالش")}>
                <input
                  maxLength={1000}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </Field>
              <button
                className="button secondary"
                disabled={!challenger || !opponent}
                onClick={() =>
                  run(
                    () =>
                      requestChallenge(
                        tournament,
                        stage.id,
                        challenger,
                        opponent,
                        note,
                      ),
                    t("Create challenge invitation", "ساخت دعوت چالش"),
                  )
                }
              >
                {t("Create challenge invitation", "ساخت دعوت چالش")}
              </button>
            </>
          ) : (
            <button
              className="button secondary"
              disabled={tournament.matches.some(
                (match) =>
                  match.stageId === stage.id &&
                  !["completed", "bye", "canceled"].includes(match.status),
              )}
              onClick={() =>
                run(
                  () => advanceStage(tournament, stage.id),
                  t("Advance King of the Hill queue", "پیشروی صف پادشاه میدان"),
                )
              }
            >
              {t("Start next queue challenge", "شروع چالش بعدی صف")}
            </button>
          )}
          <button className="text-button" onClick={() => setClosing(true)}>
            {t("Close challenge stage", "پایان مرحله چالش")}
          </button>
        </>
      )}
      {!!entries.length && (
        <>
          <div className="table-scroll">
            <table className="data-table challenge-invitations">
              <thead>
                <tr>
                  <th>{t("Challenger", "چالش‌دهنده")}</th>
                  <th>{t("Challenged entrant", "شرکت‌کننده مورد چالش")}</th>
                  <th>{t("Status", "وضعیت")}</th>
                  <th>{t("Actions", "عملیات")}</th>
                </tr>
              </thead>
              <tbody>
                {page.visible.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <bdi>{name(entry.challengerId)}</bdi>
                    </td>
                    <td>
                      <bdi>{name(entry.opponentId)}</bdi>
                      {entry.note && (
                        <details>
                          <summary>
                            {t("Private note", "یادداشت خصوصی")}
                          </summary>
                          <p>{entry.note}</p>
                        </details>
                      )}
                    </td>
                    <td>{statusLabel(entry.status)}</td>
                    <td>
                      <div className="button-row">
                        {stage.status === "active" &&
                          (entry.status === "pending" ||
                          entry.status === "invalidated"
                            ? (["approve", "decline", "cancel"] as const)
                            : entry.status === "approved"
                              ? (["cancel"] as const)
                              : []
                          ).map((decision) => (
                            <button
                              key={decision}
                              className="button secondary"
                              onClick={() =>
                                run(
                                  () =>
                                    decideChallenge(
                                      tournament,
                                      stage.id,
                                      entry.id,
                                      decision,
                                    ),
                                  decisionLabel(decision),
                                )
                              }
                            >
                              {decisionLabel(decision)}
                            </button>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            {...page}
            label={t("Challenge invitations", "دعوت‌های چالش")}
          />
        </>
      )}
      {closing && (
        <Confirm
          title={t("Close challenge stage", "پایان مرحله چالش")}
          message={t(
            "Declare the current top entrant as the stage champion? Complete active matches and resolve pending invitations first. This decision creates a recoverable revision.",
            "شرکت‌کننده نخست، قهرمان مرحله اعلام شود؟ ابتدا دیدارهای فعال و دعوت‌های در انتظار را تعیین تکلیف کنید. این تصمیم نسخه قابل بازیابی می‌سازد.",
          )}
          onClose={() => setClosing(false)}
          onConfirm={() =>
            run(
              () => closeLadder(tournament, stage.id),
              t("Close challenge stage", "پایان مرحله چالش"),
            )
          }
        />
      )}
    </section>
  );
}
