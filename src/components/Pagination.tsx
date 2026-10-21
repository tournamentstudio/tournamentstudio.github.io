import { useMemo, useState } from "react";
import { useI18n } from "../i18n";
import {
  PAGE_SIZES,
  pageWindow,
  type PageSize,
  type PageWindow,
} from "./list-pages";
import "./pagination.css";

export interface PaginationState extends PageWindow {
  setPage: (page: number) => void;
  setSize: (size: PageSize) => void;
}

/** A changed query starts on page one without a stale-page render. */
export function usePagination<T>(items: readonly T[], scope = "") {
  const [state, setState] = useState({ page: 0, size: 50 as PageSize, scope });
  if (state.scope !== scope) setState({ ...state, scope, page: 0 });
  const window = pageWindow(
    items.length,
    state.scope === scope ? state.page : 0,
    state.size,
  );
  const visible = useMemo(
    () => items.slice(window.start, window.end),
    [items, window.start, window.end],
  );
  const pagination: PaginationState = {
    ...window,
    setPage: (page) =>
      setState({
        scope,
        size: state.size,
        page: pageWindow(items.length, page, state.size).page,
      }),
    setSize: (size) =>
      setState({
        scope,
        size,
        page: pageWindow(items.length, Math.floor(window.start / size), size)
          .page,
      }),
  };
  return { visible, pagination };
}

export function Pagination({
  pagination,
  label,
}: {
  pagination: PaginationState;
  label: string;
}) {
  const { t, number } = useI18n();
  const { page, pages, size, total, start, end, setPage, setSize } = pagination;
  return (
    <nav className="pagination" aria-label={label}>
      <p
        className="pagination-count"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {total
          ? t(
              `${number(start + 1)} to ${number(end)} of ${number(total)}`,
              `${number(start + 1)} تا ${number(end)} از ${number(total)}`,
            )
          : t("No matching items", "موردی پیدا نشد")}
      </p>
      {total > 25 && (
        <div className="pagination-controls">
          <label>
            <span>{t("Items per page", "تعداد در هر صفحه")}</span>
            <select
              aria-label={t("Items per page", "تعداد در هر صفحه")}
              value={size}
              onChange={(event) =>
                setSize(Number(event.target.value) as PageSize)
              }
            >
              {PAGE_SIZES.map((value) => (
                <option key={value} value={value}>
                  {number(value)}
                </option>
              ))}
            </select>
          </label>
          <div className="pagination-buttons">
            <button
              type="button"
              className="button secondary"
              disabled={page === 0}
              onClick={() => setPage(0)}
            >
              {t("First", "اول")}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              {t("Previous", "قبلی")}
            </button>
            <span className="pagination-page">
              {t(
                `Page ${number(page + 1)} of ${number(pages)}`,
                `صفحه ${number(page + 1)} از ${number(pages)}`,
              )}
            </span>
            <button
              type="button"
              className="button secondary"
              disabled={page === pages - 1}
              onClick={() => setPage(page + 1)}
            >
              {t("Next", "بعدی")}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={page === pages - 1}
              onClick={() => setPage(pages - 1)}
            >
              {t("Last", "آخر")}
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
