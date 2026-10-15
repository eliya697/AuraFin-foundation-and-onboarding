import { useRef } from 'react';

/**
 * Returns `value`, or the last non-null value if it is currently null/undefined.
 *
 * Exit animations keep a screen mounted for a moment after the state that fed it is gone (e.g.
 * the dashboard while "update data" clears its unlock). Rendering from the last good value keeps
 * those frames from throwing — this was the white-screen crash on "עדכון נתונים".
 */
export function useLastDefined(value) {
  const ref = useRef(value);
  if (value !== null && value !== undefined) ref.current = value;
  return ref.current;
}
