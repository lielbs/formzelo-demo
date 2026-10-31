/**
 * "I want this for my business" — a truthful, zero-cost contact path.
 * There is no lead backend: if VITE_CONTACT_EMAIL is set at build time the
 * button opens the visitor's mail app (mailto); otherwise it opens a public
 * GitHub issue form and says so. Nothing is collected or stored by the demo.
 */
import { Copy, Mail, MessageSquare } from 'lucide-react';
import { CONTACT_EMAIL, REPO_URL } from '../lib/links';
import { copyText, useToast } from './Toast';
import { Button, cx } from './ui';

function message(business?: string, name?: string) {
  return [
    'שלום, ראיתי את הדמו של Formzelo ואשמח לשמוע עוד.',
    business ? `סוג העסק: ${business}` : '',
    name ? `שם העסק: ${name}` : '',
    'מה הייתי רוצה שהתהליך יעשה:',
    '',
  ]
    .filter((l, i, a) => l || i === a.length - 1)
    .join('\n');
}

export function InterestCTA({ business, name, dark = false, className }: { business?: string; name?: string; dark?: boolean; className?: string }) {
  const toast = useToast();
  const body = message(business, name);
  const subject = 'מעוניין/ת ב-Formzelo לעסק שלי';
  const href = CONTACT_EMAIL
    ? `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : `${REPO_URL}/issues/new?title=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${body}\n\n(פנייה ציבורית — בלי טלפון או מידע אישי)`)}`;
  return (
    <section aria-labelledby="interest-title" className={cx('rounded-3xl p-6 sm:p-8', dark ? 'bg-midnight text-white' : 'border border-cloud-200 bg-white shadow-card', className)}>
      <h2 id="interest-title" className="text-2xl font-semibold tracking-tight">
        רוצים תהליך כזה לעסק שלכם?
      </h2>
      <p className={cx('mt-2 max-w-xl leading-relaxed', dark ? 'text-white/70' : 'text-ink-muted')}>
        ספרו לנו בכמה מילים מה הלקוחות שלכם צריכים לעשות — הזמנה, אישור, הרשמה או תור. נחזור עם הצעה ומחיר.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <a
          href={href}
          target={CONTACT_EMAIL ? undefined : '_blank'}
          rel={CONTACT_EMAIL ? undefined : 'noopener noreferrer'}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-orange px-5 text-sm font-semibold text-white transition hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2"
        >
          {CONTACT_EMAIL ? <Mail className="h-4 w-4" aria-hidden /> : <MessageSquare className="h-4 w-4" aria-hidden />}
          {CONTACT_EMAIL ? 'שליחת פנייה במייל' : 'השארת פנייה ב-GitHub'}
        </a>
        <Button
          variant={dark ? 'ghost' : 'secondary'}
          icon={Copy}
          className={dark ? '!text-white hover:!bg-white/10' : undefined}
          onClick={async () => toast((await copyText(body)) ? 'נוסח הפנייה הועתק' : 'ההעתקה נכשלה', 'info')}
        >
          העתקת נוסח הפנייה
        </Button>
      </div>
      <p className={cx('mt-3 text-xs leading-relaxed', dark ? 'text-white/50' : 'text-ink-soft')}>
        {CONTACT_EMAIL
          ? 'הכפתור פותח את אפליקציית המייל שלכם עם נוסח מוכן. הדמו עצמו לא שומר ולא שולח פרטים.'
          : 'הכפתור פותח טופס פנייה ציבורי ב-GitHub — אל תכתבו שם טלפון או מידע אישי. הדמו עצמו לא שומר ולא שולח פרטים.'}
      </p>
    </section>
  );
}
