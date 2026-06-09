// One place for the `err?.response?.data?.detail || 'fallback'` pattern
// every form in the codebase has been pasting inline. Consolidate so a
// future API contract change (e.g. errors-as-structured-objects) lands
// in a single place.
//
// `getErrorMessage(err, fallback)` — pull a human-friendly message off
// an axios error. Handles the common shapes (string detail, structured
// pydantic ValidationError list, plain Error).
//
// `getErrorByStatus(err, byStatus)` — same idea but lets the caller map
// specific HTTP statuses to custom messages, falling back to the
// generic path when no entry matches.

export const getErrorMessage = (err, fallback = 'Something went wrong.') => {
  if (!err) return fallback;
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    // FastAPI validation errors arrive as [{ loc, msg, type }, ...].
    const first = detail[0];
    if (first?.msg) return first.msg;
  }
  if (typeof err.message === 'string' && err.message) return err.message;
  return fallback;
};

export const getErrorByStatus = (err, byStatus = {}, fallback = undefined) => {
  const status = err?.response?.status;
  if (status && byStatus[status]) return byStatus[status];
  return getErrorMessage(err, fallback ?? 'Something went wrong.');
};
