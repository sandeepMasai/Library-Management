/**
 * replaceVariables
 *
 * Replaces supported variables in a template message.
 *
 * Supported:
 * - {student_name}
 * - {amount}
 * - {due_date}
 * - {library_name}
 */
export function replaceVariables(
  template: string,
  data: Partial<{ student_name: string; amount: string | number; due_date: string; library_name: string }>
) {
  const safe = (v: any) => (v === null || v === undefined ? '' : String(v));
  return String(template || '')
    .replaceAll('{student_name}', safe(data.student_name))
    .replaceAll('{amount}', safe(data.amount))
    .replaceAll('{due_date}', safe(data.due_date))
    .replaceAll('{library_name}', safe(data.library_name));
}

