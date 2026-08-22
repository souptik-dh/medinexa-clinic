import { useMemo, useState } from "react";

const DEFAULT_PAGE_SIZE = 10;

export function usePagination<T>(
  items: T[],
  opts?: { pageSize?: number; resetKey?: unknown }
) {
  const pageSize = opts?.pageSize ?? DEFAULT_PAGE_SIZE;
  const resetKey = opts?.resetKey;
  const [page, setPage] = useState(1);
  const [prevResetKey, setPrevResetKey] = useState(resetKey);

  // Reset to page 1 when resetKey changes (e.g. a filter or selected branch),
  // adjusting state during render instead of in an effect.
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const pageItems = useMemo(
    () => items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [items, currentPage, pageSize]
  );

  return { page: currentPage, setPage, totalPages, pageItems };
}
