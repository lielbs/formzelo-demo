/**
 * "I want this for my business" — a truthful, zero-cost contact path: it opens
 * the visitor's mail app with a prepared message to the RockStack sales address
 * (src/lib/links.ts). Nothing is collected or stored by the demo.
 */
import { Copy, Mail } from 'lucide-react';
import { salesMailto } from '../lib/links';
import { copyText, useToast } from './Toast';
import { Button, cx } from './ui';

function message(business?: string, name?: string) {
  return [
    'שלום, ראיתי את הדמו של Formangle ואשמח לשמוע עוד.',
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
  const subject = 'מעוניין/ת ב-Formangle לעסק שלי';
  const href = salesMailto(subject, body);
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
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-orange-700 px-5 text-sm font-semibold text-white transition hover:bg-orange-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2"
        >
          <Mail className="h-4 w-4" aria-hidden />
          שליחת פנייה ל-RockStack
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
        הכפתור פותח את אפליקציית המייל שלכם עם נוסח מוכן אל צוות RockStack, שמקים ומלווה את Formangle. הדמו עצמו לא שומר ולא שולח פרטים.
      </p>
    </section>
  );
}
