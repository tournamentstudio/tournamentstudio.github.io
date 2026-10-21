export const PAGE_SIZES = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export interface PageWindow {
  page: number;
  pages: number;
  start: number;
  end: number;
  total: number;
  size: PageSize;
}

/** Bounds render work while keeping stable row order and exact item counts. */
export function pageWindow(
  totalInput: number,
  pageInput: number,
  size: PageSize = 50,
): PageWindow {
  if (!PAGE_SIZES.includes(size)) throw new RangeError("Unsupported page size");
  if (!Number.isSafeInteger(totalInput) || totalInput < 0)
    throw new RangeError("Invalid item count");
  const pages = Math.max(1, Math.ceil(totalInput / size));
  const page = Number.isSafeInteger(pageInput)
    ? Math.max(0, Math.min(pageInput, pages - 1))
    : 0;
  const start = page * size;
  return {
    page,
    pages,
    start,
    end: Math.min(totalInput, start + size),
    total: totalInput,
    size,
  };
}
