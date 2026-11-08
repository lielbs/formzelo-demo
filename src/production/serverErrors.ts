/** What a person sees when the server could not be reached or failed unexpectedly. */
export const NETWORK_MESSAGE = 'אין חיבור לשרת. בדקו את החיבור לאינטרנט ונסו שוב; אם זה חוזר, ייתכן שיש תקלה זמנית אצלנו.';

/** The request never got an answer: offline, blocked, or refused by the browser (e.g. CORS). */
export function isNetworkFailure(error: { name?: string; message?: string } | null | undefined) {
  return error?.name === 'FunctionsFetchError' || /failed to fetch|networkerror|load failed|network request failed/i.test(error?.message ?? '');
}

/** An unexpected server failure: a Hebrew message for the screen, the technical context kept for debugging. */
export class UnexpectedServerError extends Error {
  constructor(readonly context: string, network = false) {
    super(network ? NETWORK_MESSAGE : 'הפעולה לא הושלמה בגלל תקלה בשרת. נסו שוב בעוד רגע.');
    this.name = 'UnexpectedServerError';
  }
}
