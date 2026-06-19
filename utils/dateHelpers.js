/**
 * getLocalDateString
 *
 * Returns the device's LOCAL calendar date as "YYYY-MM-DD" — never UTC.
 *
 * Why this exists:
 * `new Date().toISOString().split("T")[0]` always returns the UTC date.
 * For any user not in UTC+0, this silently shifts which calendar day a
 * check-in lands on near midnight, breaking daily-streak logic.
 *
 * This function builds the date string from the device's local
 * getFullYear/getMonth/getDate instead, so "today" always means
 * the same thing the user sees on their phone's clock.
 */
export function getLocalDateString(date = new Date()) {
  const year  = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day   = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}