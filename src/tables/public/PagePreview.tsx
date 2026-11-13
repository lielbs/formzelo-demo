/**
 * Draft preview of the public booking / waitlist page, rendered inside the owner's design studio
 * (an iframe, so phone / tablet / desktop widths use the real responsive layout).
 *
 * It renders only what the studio on the same origin posts to it. It makes no requests, books
 * nothing and says so on screen: times are labelled samples and the submit button is inert.
 */
import { CheckCircle2, Eye } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { cx } from '../../components/ui';
import type { BrandKitLite, PageKind, PublicPagesConfig } from '../domain/publicPages';
import { GuestFields, type GuestValues } from './GuestFields';
import { tx, type Lang } from './i18n';
import { Stepper } from './BookingPage';
import { lookFor, pageOf } from './look';
import { accentButton, PublicShell, useDocumentLanguage } from './PublicShell';

export interface PreviewPayload {
  type: 'fz-pp-preview';
  kind: PageKind;
  lang: Lang;
  pages: PublicPagesConfig | null;
  brandKit: BrandKitLite | null;
  assetOwner: string;
  venue: {
    name: string; venueType?: string | null; address?: string; phone?: string; showWhatsapp?: boolean; intro?: string; terms: string;
    minParty: number; maxParty: number; brand: { displayName: string | null; palette: Record<string, string> | null };
  };
}

const isPayload = (d: unknown): d is PreviewPayload => !!d && typeof d === 'object' && (d as { type?: unknown }).type === 'fz-pp-preview';

export function PagePreview() {
  const [data, setData] = useState<PreviewPayload | null>(null);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== window.parent || !isPayload(e.data)) return;
      setData(e.data);
    };
    window.addEventListener('message', onMessage);
    if (window.parent !== window) window.parent.postMessage({ type: 'fz-pp-ready' }, window.location.origin);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  const lang = data?.lang ?? 'he';
  useDocumentLanguage(lang, tx(lang).previewBanner);
  const design = useMemo(() => (data ? lookFor({ pages: data.pages, brandKit: data.brandKit, assetOwner: data.assetOwner, venueType: data.venue.venueType }, data.kind) : null), [data]);
  if (!data) return <div aria-hidden className="fz-page min-h-screen bg-[#FAF9F7]" />;
  const s = tx(lang);
  const page = pageOf(design, data.kind);
  return (
    <div className="relative">
      <p role="note" className="sticky top-0 z-30 flex items-center justify-center gap-2 bg-midnight px-3 py-2 text-center text-xs font-medium text-white">
        <Eye className="h-4 w-4 shrink-0" aria-hidden />{s.previewBanner}
      </p>
      <PublicShell lang={lang} venue={data.venue} design={design}>
        {data.kind === 'booking' ? <BookingSample data={data} page={page} /> : <WaitlistSample data={data} page={page} />}
      </PublicShell>
    </div>
  );
}

function Chips({ count, start, selected }: { count: number; start: number; selected: number }) {
  return (
    <div className="pp-scroll -mx-5 flex gap-2 overflow-x-auto px-5 py-1 sm:-mx-7 sm:px-7">
      {Array.from({ length: count }, (_, i) => start + i).map((n) => (
        <span key={n} aria-hidden
          className={cx('pp-chip flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[17px] font-semibold tabular-nums', n === selected && 'pp-chip-on')}>{n}</span>
      ))}
    </div>
  );
}

function BookingSample({ data, page }: { data: PreviewPayload; page: PublicPagesConfig['booking'] | null }) {
  const s = tx(data.lang);
  const [values, setValues] = useState<GuestValues>({});
  const min = Math.max(1, data.venue.minParty);
  const count = Math.max(1, Math.min(12, data.venue.maxParty - min + 1));
  const [service, setService] = useState<'lunch' | 'dinner'>('dinner');
  const sample = service === 'dinner' ? ['18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30'] : ['12:00', '12:30', '13:00', '13:30', '14:00', '14:30'];
  return (
    <div className="grid gap-7">
      <div>
        <Stepper lang={data.lang} step={0} />
        <h1 className="text-2xl font-semibold sm:text-3xl">{page?.copy.title || s.bookTitle}</h1>
        {page?.copy.description && <p className="mt-1.5 whitespace-pre-line text-ink-muted">{page.copy.description}</p>}
      </div>
      <div>
        <p className="mb-2 text-base font-semibold">{s.party}</p>
        <Chips count={count} start={min} selected={Math.min(Math.max(2, min), min + count - 1)} />
      </div>
      <div>
        <p className="mb-2 text-base font-semibold">{s.time}</p>
        <div role="tablist" className="pp-seg mb-3 flex gap-1 rounded-full p-1">
          {(['lunch', 'dinner'] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={service === k} onClick={() => setService(k)}
              className="pp-seg-btn flex min-h-[40px] min-w-0 flex-1 items-center justify-center rounded-full px-2 text-sm font-semibold sm:px-3">
              {k === 'lunch' ? (data.lang === 'en' ? 'Lunch' : 'צהריים') : (data.lang === 'en' ? 'Dinner' : 'ערב')}
            </button>
          ))}
        </div>
        <div className="pp-slots grid grid-cols-3 gap-2 min-[380px]:grid-cols-4 sm:grid-cols-5">
          {sample.map((t) => (
            <span key={t} aria-hidden className="pp-chip flex h-12 items-center justify-center rounded-full text-[15px] font-semibold tabular-nums"><span dir="ltr">{t}</span></span>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-muted">{s.previewTimes}</p>
      </div>
      <hr className="border-cloud-200" />
      <form className="grid gap-5" onSubmit={(e) => e.preventDefault()}>
        <h2 className="text-2xl font-semibold">{s.details}</h2>
        <GuestFields kind="booking" page={page} lang={data.lang} values={values} errors={{}} prefix="pv"
          onChange={(k, v) => setValues((cur) => ({ ...cur, [k]: v }))} />
        <section className="pp-card rounded-xl border border-cloud-200 bg-white p-4">
          <h2 className="font-semibold">{s.terms}</h2>
          <p className="mt-1 whitespace-pre-line text-sm text-ink-muted">{data.venue.terms}</p>
          <label className="mt-3 flex min-h-[44px] items-center gap-3 text-sm">
            <input type="checkbox" className="h-6 w-6 shrink-0 accent-[var(--fz-accent)]" />{s.agree}
          </label>
        </section>
        <button type="button" aria-disabled="true" className={accentButton} onClick={(e) => e.preventDefault()}>{page?.copy.submitLabel || s.confirm}</button>
        {page?.copy.successNote && (
          <div className="pp-card rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm">
            <p className="flex items-center gap-1.5 font-semibold"><CheckCircle2 className="h-4 w-4" aria-hidden />{s.confirmedTitle}</p>
            <p className="mt-1 whitespace-pre-line">{page.copy.successNote}</p>
          </div>
        )}
      </form>
    </div>
  );
}

function WaitlistSample({ data, page }: { data: PreviewPayload; page: PublicPagesConfig['waitlist'] | null }) {
  const s = tx(data.lang);
  const [values, setValues] = useState<GuestValues>({});
  return (
    <form className="grid gap-4" onSubmit={(e) => e.preventDefault()}>
      <h1 className="text-2xl font-semibold">{page?.copy.title || s.waitlistTitle}</h1>
      <p className="whitespace-pre-line text-ink-muted">{page?.copy.description || s.waitlistIntro}</p>
      <div>
        <p className="mb-2 font-semibold">{s.party}</p>
        <Chips count={Math.max(1, Math.min(10, data.venue.maxParty))} start={1} selected={2} />
      </div>
      <GuestFields kind="waitlist" page={page} lang={data.lang} values={values} errors={{}} prefix="pw"
        onChange={(k, v) => setValues((cur) => ({ ...cur, [k]: v }))} />
      <label className="flex min-h-[44px] items-center gap-3 text-sm">
        <input type="checkbox" className="h-6 w-6 shrink-0 accent-[var(--fz-accent)]" />{s.waitlistConsent}
      </label>
      <button type="button" aria-disabled="true" className={accentButton} onClick={(e) => e.preventDefault()}>{page?.copy.submitLabel || s.join}</button>
    </form>
  );
}
