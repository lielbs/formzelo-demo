import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from './Brand';
import { ButtonLink } from './ui';
import { appHref } from '../lib/links';

const LINKS = [
  { href: '/tour', label: 'סיור מודרך' },
  { href: '/#how', label: 'איך זה עובד' },
  { href: '/#examples', label: 'דוגמאות' },
  { href: '/themes', label: 'עיצובים' },
  { href: '/pricing', label: 'מחירים' },
  { href: '/#faq', label: 'שאלות' },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 border-b border-cloud-200/80 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav aria-label="ניווט אתר" className="hidden items-center gap-7 lg:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={appHref(l.href)} className="text-sm font-medium text-ink-muted transition hover:text-ink">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <ButtonLink to="/demo" variant="ghost">
            סביבות דמו
          </ButtonLink>
          <ButtonLink to="/app/workflows/new">יצירת תהליך</ButtonLink>
        </div>
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-cloud-300 lg:hidden"
          aria-label={open ? 'סגירת תפריט' : 'פתיחת תפריט'}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <nav aria-label="ניווט אתר" className="border-t border-cloud-200 bg-white px-4 pb-4 lg:hidden">
          {LINKS.map((l) => (
            <a key={l.href} href={appHref(l.href)} onClick={() => setOpen(false)} className="block border-b border-cloud-200 py-3 text-sm font-medium">
              {l.label}
            </a>
          ))}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <ButtonLink to="/demo" variant="secondary">
              סביבות דמו
            </ButtonLink>
            <ButtonLink to="/app/workflows/new">יצירת תהליך</ButtonLink>
          </div>
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="bg-midnight text-white/60">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[2fr_1fr_1fr]">
        <div>
          <Logo dark />
          <p className="mt-3 max-w-sm text-sm leading-relaxed">לכל עסק יש את הזווית שלו. תהליכים דיגיטליים ממותגים — מוקמים ומלווים על ידי RockStack.</p>
          <p className="mt-4 max-w-sm text-xs leading-relaxed text-white/40">
            זהו דמו מקומי: הנתונים נשמרים בדפדפן שלכם בלבד, היצירה מתבצעת במנוע מילות מפתח מקומי (לא AI), ואין תשלומים, הודעות או הזמנות אמיתיות.
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-white">מוצר</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link to="/app" className="hover:text-white">לוח בקרה</Link></li>
            <li><Link to="/app/workflows/new" className="hover:text-white">תהליך חדש</Link></li>
            <li><Link to="/pricing" className="hover:text-white">מחירים</Link></li>
            <li><Link to="/themes" className="hover:text-white">גלריית עיצובים</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-medium text-white">דמו</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link to="/tour" className="hover:text-white">סיור מודרך</Link></li>
            <li><Link to="/demo" className="hover:text-white">סביבות עבודה</Link></li>
            <li><Link to="/f/bloom-flowers" className="hover:text-white">הזמנת פרחים</Link></li>
            <li><Link to="/f/urban-table-events" className="hover:text-white">אירוע פרטי</Link></li>
            <li><Link to="/f/valley-run" className="hover:text-white">הרשמה למרוץ</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-white/40">© {new Date().getFullYear()} RockStack Digital Solutions · Formangle demo</div>
    </footer>
  );
}
