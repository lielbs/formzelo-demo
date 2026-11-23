/**
 * Tables features that are built but not switched on in the live product yet.
 *
 * Guest reminders (the staff WhatsApp list and Web Push for guests) need their own database
 * migrations, an Edge Function and a cron job, which are not on the live project. Until the owner
 * says go, the live build hides them; the "add to calendar" buttons need no server and stay.
 * The local stack used by the browser tests turns them on with VITE_TABLES_REMINDERS=true.
 */
export const REMINDERS_LIVE = import.meta.env.VITE_TABLES_REMINDERS === 'true';
