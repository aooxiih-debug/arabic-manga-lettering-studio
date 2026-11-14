/** Shown whenever Gemini answers 429: the user's own key has used up its quota. */
export const DAILY_LIMIT_MESSAGE = "Daily limit reached, try again tomorrow";

/** Turns a Gemini HTTP error into the status + message the pipeline and UI show. */
export function mapGeminiError(status: number, body: string): { status: number; message: string } {
  if (status === 429) return { status: 429, message: DAILY_LIMIT_MESSAGE };
  let message = "";
  try {
    message = JSON.parse(body)?.error?.message ?? "";
  } catch {
    // non-JSON body
  }
  if (status === 400 && /api key/i.test(message)) {
    return { status: 401, message: "مفتاح Gemini غير صالح. أدخل المفتاح الصحيح من جديد." };
  }
  if (status === 401 || status === 403) {
    return { status, message: message || "رفض Gemini الطلب. تحقّق من صلاحيات المفتاح." };
  }
  return { status, message: message || `تعذّر تحليل الصفحة (${status})` };
}
