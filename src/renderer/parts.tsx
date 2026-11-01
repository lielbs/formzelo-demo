/** Presentational building blocks of the universal renderer. All styling comes from theme tokens. */
import { Check, ChevronDown, Clock, ListChecks, Lock, Pencil, Tag, X } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import type { RunAnswer, WorkflowConfig, WorkflowField, WorkflowStep } from '../domain/schema';
import type { WorkflowTheme } from '../domain/theme';
import type { Values } from '../engine/conditions';
import type { PriceResult } from '../engine/pricing';
import { displayValue } from '../engine/validation';
import { formatCurrency } from '../lib/format';
import { hasArt, HeroArt, inferArt, OptionArt } from '../theme/art';
import { bookingState, WEEKDAY_LABELS, weekdayOf } from '../engine/booking';
import { COMPLETION_LABELS, completionOf, NO_COLLECTION, paymentPlan, safeExternalUrl } from '../engine/completion';
import { formatDate } from '../lib/format';
import { resolveAppearance } from './appearance';
import { BusinessGallery, Photo, resolveMedia, type ResolvedMedia } from './media';

// ---------- brand & hero ----------

export function BrandRow({ name, logoUrl, showName, logoStyle = 'plain' }: { name: string; logoUrl?: string; showName: boolean; logoStyle?: ResolvedMedia['logoStyle'] }) {
  return (
    <div className="fz-brandrow" data-logo={logoStyle}>
      {logoUrl ? <img src={logoUrl} alt={showName ? '' : name} className="fz-logo-img" /> : <span className="fz-monogram" aria-hidden>{name.trim().slice(0, 1) || '•'}</span>}
      {(showName || !logoUrl) && <span className="truncate text-sm font-semibold">{name}</span>}
    </div>
  );
}

export interface HeroProps {
  theme: WorkflowTheme;
  config: WorkflowConfig;
  stepsCount: number;
  fieldsCount: number;
  logoUrl?: string;
  coverUrl?: string;
  caseAnswers: RunAnswer[];
  condensed: boolean;
  preview: boolean;
  /** The business's sticker on the opening (theme.extras.badge). */
  badge?: string;
  /** Workspace images (for the gallery placed in the opening). */
  assets?: Record<string, string>;
  /** Studio canvas: empty image slots show where the business's photos will sit. */
  studio?: boolean;
  children?: ReactNode;
}

export function Hero({ theme, config, stepsCount, fieldsCount, logoUrl, coverUrl, caseAnswers, condensed, preview, badge, assets = {}, studio, children }: HeroProps) {
  const layout = theme.hero.layout;
  const minutes = Math.max(1, Math.round(fieldsCount * 0.35));
  const facts = [
    { icon: ListChecks, label: `${stepsCount} שלבים · כ-${minutes} דק׳` },
    config.pricing.enabled && { icon: Tag, label: 'המחיר מתעדכן תוך כדי' },
    config.mode === 'case' && { icon: Lock, label: 'קישור אישי' },
  ].filter(Boolean) as { icon: typeof Clock; label: string }[];
  const showSpecs = layout === 'banner' && caseAnswers.length > 0;
  const media = resolveMedia(theme);
  const cover = media.coverStyle;
  // Panel, frame and band put the business's photo inside the opening (a placeholder in the studio).
  const slot = layout !== 'none' && ['panel', 'frame', 'band'].includes(cover) && (Boolean(coverUrl) || Boolean(studio));
  const art = theme.decoration !== 'none' && !(coverUrl && cover !== 'page') && !slot;
  const seal = media.logoStyle === 'seal';

  return (
    <header
      className="fz-hero"
      data-layout={layout}
      data-cover={slot || (coverUrl && cover === 'backdrop') ? cover : undefined}
      data-tone={media.tone}
      data-condensed={condensed || undefined}
      data-mobile-compact={theme.mobile.compactHero || undefined}
      aria-label={config.title}
    >
      {coverUrl && cover === 'backdrop' && layout !== 'none' && (
        <>
          <img src={coverUrl} alt="" className="fz-hero-cover" />
          <span className="fz-hero-tint" aria-hidden />
          <span className="fz-hero-scrim" aria-hidden />
        </>
      )}
      {layout !== 'none' && <span className="fz-hero-glow" aria-hidden />}
      {art && layout !== 'none' && <HeroArt decoration={theme.decoration} className="fz-hero-art" />}
      {badge?.trim() && layout !== 'none' && (
        <span className="fz-sticker">
          {badge}
        </span>
      )}
      <div className="fz-hero-content fz-anim-hero">
        <div className="flex items-center justify-between gap-3">
          {theme.logo.placement !== 'hidden' ? (
            <div className={theme.logo.placement === 'center' || seal ? 'flex flex-1 justify-center' : undefined}>
              <BrandRow name={config.branding.logoText} logoUrl={logoUrl} showName={theme.logo.showName} logoStyle={media.logoStyle} />
            </div>
          ) : (
            <span />
          )}
          {preview && <span className="fz-fact shrink-0">תצוגה מקדימה</span>}
        </div>
        {theme.hero.eyebrow && !condensed && <p className="fz-hero-eyebrow mt-5">{theme.hero.eyebrow}</p>}
        {/* Long owner-written titles step down a size so they never run under the artwork. */}
        <h1 className="fz-display fz-hero-title" data-length={config.title.length > 56 ? 'xl' : config.title.length > 30 ? 'long' : undefined}>
          {config.title}
        </h1>
        {config.description && <p className="fz-hero-desc">{config.description}</p>}
        {slot && cover === 'band' && <Photo className="fz-hero-band" src={coverUrl} tone={media.tone} empty="תמונת העסק — רצועה רחבה" />}
        {layout !== 'none' && facts.length > 0 && !showSpecs && (
          <ul className="fz-hero-facts" aria-label="על התהליך">
            {facts.map(({ icon: Icon, label }) => (
              <li key={label} className="fz-fact">
                <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
              </li>
            ))}
          </ul>
        )}
        {showSpecs && (
          <dl className="fz-specs fz-hero-extra" aria-label="פרטי התיק">
            {caseAnswers.map((a) => (
              <div key={a.fieldId} className="fz-spec">
                <dt>{a.label}</dt>
                <dd>
                  <bdi>{a.displayValue}</bdi>
                </dd>
              </div>
            ))}
          </dl>
        )}
        {children && <div className="fz-hero-summary mt-8">{children}</div>}
        <BusinessGallery theme={theme} assets={assets} slot="hero" studio={studio} />
      </div>
      {slot && (cover === 'panel' || cover === 'frame') && (
        <Photo className="fz-hero-photo" src={coverUrl} tone={media.tone} shape={cover === 'frame' ? media.frame : undefined} empty="תמונת העסק" />
      )}
    </header>
  );
}

// ---------- stepper ----------

/** `rail`: the console experience's vertical list of steps (a row of chips on narrow screens). */
export function Stepper({ style, titles, index, onJump }: { style: WorkflowTheme['progress'] | 'rail'; titles: string[]; index: number; onJump: (i: number) => void }) {
  const total = titles.length;
  const current = Math.min(index, total - 1);
  const pct = Math.round(((current + 1) / total) * 100);
  const state = (i: number) => (i < current ? 'done' : i === current ? 'current' : 'todo');
  const heading = (
    <div className="fz-stepper-head">
      <h2 className="fz-stepper-title">{titles[current]}</h2>
      <span className="fz-stepper-count fz-num">
        שלב {current + 1} מתוך {total}
      </span>
    </div>
  );

  return (
    <nav className="fz-stepper" aria-label="שלבי התהליך">
      <p className="fz-sr" aria-live="polite">
        שלב {current + 1} מתוך {total}: {titles[current]}
      </p>
      {style === 'rail' ? (
        <>
          <ol className="fz-rail">
            {titles.map((t, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="fz-rail-btn"
                  data-state={state(i)}
                  aria-current={i === current ? 'step' : undefined}
                  disabled={i >= current}
                  onClick={() => onJump(i)}
                  aria-label={`${t}${i < current ? ' — הושלם, חזרה לשלב' : ''}`}
                >
                  <span className="fz-rail-num fz-num" aria-hidden>
                    {i < current ? <Check className="h-3 w-3" strokeWidth={3} /> : String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="fz-rail-label">{t}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="fz-rail-head">{heading}</div>
        </>
      ) : style === 'steps' ? (
        <>
          <ol className="fz-steps">
            {titles.map((t, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="fz-step-btn"
                  data-state={state(i)}
                  aria-current={i === current ? 'step' : undefined}
                  disabled={i >= current}
                  onClick={() => onJump(i)}
                  aria-label={`${t}${i < current ? ' — הושלם, חזרה לשלב' : ''}`}
                >
                  <span className="fz-step-num fz-num" aria-hidden>
                    {i < current ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="fz-step-label">{t}</span>
                </button>
              </li>
            ))}
          </ol>
          <h2 className="fz-stepper-title mt-5 !text-[calc(1.35rem*var(--fz-display-scale))]">{titles[current]}</h2>
        </>
      ) : style === 'numbered' ? (
        <>
          <div className="flex items-end justify-between gap-4">
            <p className="fz-bignum" aria-hidden>
              {String(current + 1).padStart(2, '0')}
              <small>/{String(total).padStart(2, '0')}</small>
            </p>
            <h2 className="fz-stepper-title text-end">{titles[current]}</h2>
          </div>
          <div className="fz-segs" aria-hidden>
            {titles.map((_, i) => (
              <span key={i} className="fz-seg" data-state={state(i)} />
            ))}
          </div>
        </>
      ) : style === 'dots' ? (
        <>
          {heading}
          <div className="fz-dots" aria-hidden>
            {titles.map((_, i) => (
              <span key={i} className="fz-dot" data-state={state(i)} />
            ))}
          </div>
        </>
      ) : (
        <>
          {heading}
          <div className="fz-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="התקדמות">
            <span style={{ width: `${pct}%` }} />
          </div>
        </>
      )}
    </nav>
  );
}

// ---------- decisions & pricing ----------

export function decisionFields(config: WorkflowConfig): WorkflowField[] {
  return config.steps.flatMap((s) => s.fields).filter((f) => f.type === 'decision');
}

export function DecisionTally({ fields, values }: { fields: WorkflowField[]; values: Values }) {
  if (!fields.length) return null;
  const approved = fields.filter((f) => values[f.key] === 'approved').length;
  const declined = fields.filter((f) => values[f.key] === 'declined').length;
  const pending = fields.length - approved - declined;
  return (
    <div className="flex flex-wrap gap-1.5" aria-live="polite">
      <span className="fz-badge" data-tone="success">
        {approved} אושרו
      </span>
      <span className="fz-badge">{declined} נדחו</span>
      {pending > 0 && (
        <span className="fz-badge" data-tone="recommended">
          {pending} ממתינים להחלטה
        </span>
      )}
    </div>
  );
}

function depositNote(config: WorkflowConfig, price: PriceResult) {
  const plan = paymentPlan(config, price);
  if (price.total <= 0) return null;
  if (plan.mode === 'deposit' && plan.dueAfterApproval > 0) {
    return (
      <p className="fz-help">
        מקדמה רק אחרי אישור העסק: <strong className="fz-num">{formatCurrency(plan.dueAfterApproval)}</strong> — סימולציה בלבד, ללא חיוב.
      </p>
    );
  }
  if (plan.mode === 'pay_after_approval') return <p className="fz-help">אין חיוב בשליחה. התשלום יתבקש רק אם העסק יאשר (סימולציה).</p>;
  if (plan.mode === 'quote') return <p className="fz-help">הערכה בלבד — העסק ישלח הצעת מחיר סופית.</p>;
  return null;
}

export function PriceCard({ config, price, values, title }: { config: WorkflowConfig; price: PriceResult; values: Values; title?: string }) {
  const decisions = decisionFields(config);
  return (
    <section className="fz-card fz-pad" aria-label={title ?? config.pricing.totalLabel}>
      <h2 className="fz-display text-lg">{title ?? (decisions.length ? 'סיכום ההחלטות' : 'הסיכום שלך')}</h2>
      {decisions.length > 0 && (
        <div className="mt-3">
          <DecisionTally fields={decisions} values={values} />
        </div>
      )}
      {price.lines.length > 0 ? (
        <ul className="fz-lines mt-4">
          {price.lines.map((l, i) => (
            <li key={i}>
              <span>{l.label}</span>
              <span className="fz-num">{formatCurrency(l.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="fz-help mt-3">{decisions.length ? 'אשרו תיקונים כדי לראות את הסכום.' : 'הבחירות שלכם יופיעו כאן.'}</p>
      )}
      <div className="fz-divider my-4" />
      <div className="fz-total">
        <span className="text-sm font-semibold">{config.pricing.totalLabel}</span>
        {!decisions.length && price.lines.every((l) => config.pricing.fees.some((f) => f.label === l.label)) ? (
          // Only fixed fees so far (or nothing): don't present "₪0" / "₪30" as the price.
          <span className="fz-muted text-sm" aria-live="polite">
            יתעדכן לפי הבחירות
          </span>
        ) : (
          <span className="fz-total-amount" aria-live="polite">
            {formatCurrency(price.total)}
          </span>
        )}
      </div>
      {depositNote(config, price)}
      <p className="fz-help">{NO_COLLECTION.includes(completionOf(config).mode) ? 'לא נגבה תשלום בתהליך זה.' : 'תשלומים בדמו הם סימולציה — לא מתבצע חיוב.'}</p>
    </section>
  );
}

export function PriceBar({ config, price, values, hasAside, staticBar }: { config: WorkflowConfig; price: PriceResult; values: Values; hasAside: boolean; staticBar?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const decisions = decisionFields(config);
  const approved = decisions.filter((f) => values[f.key] === 'approved').length;
  // Fixed fees alone (e.g. delivery) aren't a price yet — don't show "₪30" before anything is chosen.
  const nothingChosen = price.lines.every((l) => config.pricing.fees.some((f) => f.label === l.label));
  return (
    <div className="fz-bar" data-aside={hasAside || undefined} data-static={staticBar || undefined}>
      <div className="fz-bar-inner">
        {open && (
          <div id={id} className="fz-bar-lines">
            {price.lines.length ? (
              <ul className="fz-lines">
                {price.lines.map((l, i) => (
                  <li key={i}>
                    <span>{l.label}</span>
                    <span className="fz-num">{formatCurrency(l.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="fz-help">עדיין אין פריטים בחישוב.</p>
            )}
            {depositNote(config, price)}
          </div>
        )}
        <div className="fz-total">
          <button type="button" className="fz-link -ms-1.5" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
            <ChevronDown className="h-4 w-4 transition-transform" style={{ transform: open ? 'rotate(180deg)' : undefined }} aria-hidden />
            {config.pricing.totalLabel}
            {decisions.length > 0 && <span className="fz-muted font-normal"> · {approved}/{decisions.length} אושרו</span>}
          </button>
          {nothingChosen && decisions.length === 0 ? (
            <span className="fz-muted text-sm" aria-live="polite">
              המחיר יופיע אחרי הבחירה
            </span>
          ) : (
            <span className="fz-total-amount" aria-live="polite">
              {formatCurrency(price.total)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- review (summary step) ----------

const isBlank = (v: unknown) => v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && v.length === 0);

export function Review({
  config,
  steps,
  values,
  visible,
  onEdit,
  price,
  optionArt,
}: {
  config: WorkflowConfig;
  steps: WorkflowStep[];
  values: Values;
  visible: (s: WorkflowStep) => WorkflowField[];
  onEdit: (i: number) => void;
  price: PriceResult;
  optionArt: boolean;
}) {
  const decisions = steps.flatMap((s) => visible(s)).filter((f) => f.type === 'decision');
  return (
    <div className="fz-review">
      {decisions.length > 0 && (
        <section aria-label="ההחלטות שלכם">
          <h3 className="mb-2 font-bold">ההחלטות שלכם</h3>
          <ul className="fz-decision-summary">
            {decisions.map((f) => {
              const v = values[f.key];
              return (
                <li key={f.id} data-v={v === 'declined' ? 'declined' : 'approved'}>
                  {v === 'approved' ? <Check className="h-4 w-4 shrink-0 text-[color:var(--fz-success)]" aria-hidden /> : <X className="h-4 w-4 shrink-0" aria-hidden />}
                  <span className="min-w-0 flex-1">{f.label}</span>
                  <span className="fz-badge" data-tone={v === 'approved' ? 'success' : undefined}>
                    {v === 'approved' ? 'מאושר' : v === 'declined' ? 'נדחה' : 'ללא החלטה'}
                  </span>
                  <span className="fz-num font-semibold">{formatCurrency(f.price ?? 0)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {steps.map((s, i) => {
        // A checkout-style review: optional questions left blank are not listed.
        const fields = visible(s).filter((f) => f.type !== 'info' && f.type !== 'decision' && (f.required || !isBlank(values[f.key])));
        if (!fields.length) return null;
        return (
          <section key={s.id} className="fz-review-section" aria-label={s.title}>
            <div className="fz-review-head">
              <h3>{s.title}</h3>
              <button type="button" className="fz-link" onClick={() => onEdit(i)} aria-label={`עריכת ${s.title}`}>
                <Pencil className="h-3.5 w-3.5" aria-hidden /> עריכה
              </button>
            </div>
            <dl>
              {fields.map((f) => {
                const shown = displayValue(f, values[f.key]);
                const isCard = f.type === 'textarea' && resolveAppearance(f, false) === 'card_preview';
                if (isCard && String(values[f.key] ?? '').trim()) {
                  return (
                    <div key={f.id} className="fz-review-full">
                      <dt>{f.label}</dt>
                      <dd>
                        <span className="fz-cardpreview">
                          <span className="fz-cardpreview-text block">{String(values[f.key])}</span>
                        </span>
                      </dd>
                    </div>
                  );
                }
                const opts = f.options ?? [];
                const idx = opts.findIndex((o) => o.value === values[f.key]);
                const opt = idx >= 0 ? opts[idx] : undefined;
                const art = opt && resolveAppearance(f, optionArt) === 'tiles' ? (optionArt ? inferArt(f, opt, idx, opts.length) : opt.image) : undefined;
                return (
                  <div key={f.id}>
                    <dt>{f.label}</dt>
                    <dd className="fz-review-value">
                      {opt?.swatch && <span className="fz-swatch fz-swatch-sm" style={{ background: opt.swatch }} aria-hidden />}
                      {art && hasArt(art) && (
                        <span className="fz-review-thumb" aria-hidden>
                          <OptionArt name={art} />
                        </span>
                      )}
                      <bdi>{shown}</bdi>
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        );
      })}

      {config.pricing.enabled && (
        <section className="fz-panel fz-inline-price p-4" aria-label="פירוט מחיר">
          <ul className="fz-lines">
            {price.lines.map((l, i) => (
              <li key={i}>
                <span>{l.label}</span>
                <span className="fz-num">{formatCurrency(l.amount)}</span>
              </li>
            ))}
          </ul>
          <div className="fz-divider my-3" />
          <div className="fz-total">
            <span className="text-sm font-semibold">{config.pricing.totalLabel}</span>
            <span className="fz-total-amount">{formatCurrency(price.total)}</span>
          </div>
          {depositNote(config, price)}
        </section>
      )}
    </div>
  );
}

// ---------- booking & checkout ----------

/** Live summary of a booking request. Always says it is a request until approved. */
export function ReservationCard({ config, values }: { config: WorkflowConfig; values: Values }) {
  const b = config.booking;
  if (!b?.enabled) return null;
  const date = typeof values[b.dateKey] === 'string' ? (values[b.dateKey] as string) : '';
  const time = b.timeKey && typeof values[b.timeKey] === 'string' ? (values[b.timeKey] as string) : '';
  const guests = b.guestsKey ? Number(values[b.guestsKey]) || 0 : 0;
  const wd = date ? weekdayOf(date) : null;
  return (
    <section className="fz-card fz-pad fz-reservation" aria-label="פרטי ההזמנה">
      <p className="fz-hero-eyebrow !text-[color:var(--fz-muted)]">ההזמנה שלכם</p>
      <dl className="mt-3 space-y-2.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="fz-muted">יום</dt>
          <dd className="font-semibold">{date ? `${wd !== null ? `יום ${WEEKDAY_LABELS[wd]}, ` : ''}${formatDate(date)}` : '—'}</dd>
        </div>
        {b.timeKey && (
          <div className="flex justify-between gap-3">
            <dt className="fz-muted">שעה</dt>
            <dd className="fz-num font-semibold" dir="ltr">
              {time || '—'}
            </dd>
          </div>
        )}
        {b.guestsKey && (
          <div className="flex justify-between gap-3">
            <dt className="fz-muted">סועדים</dt>
            <dd className="fz-num font-semibold">{guests || '—'}</dd>
          </div>
        )}
      </dl>
      <div className="fz-divider my-4" />
      <p className="fz-badge" data-tone="recommended">
        {bookingState('submitted').label}
      </p>
      <p className="fz-help">ימי פעילות: {b.openWeekdays.map((d) => WEEKDAY_LABELS[d]).join(', ')}. הזמינות מחושבת מקומית ואינה שמירה של מקום.</p>
    </section>
  );
}

/** How the flow completes. Simulated payments never ask for card details. */
export function CheckoutPanel({ config, price, payNow, onPayNow }: { config: WorkflowConfig; price: PriceResult; payNow: boolean; onPayNow: (v: boolean) => void }) {
  const plan = paymentPlan(config, price);
  const c = completionOf(config);
  const meta = COMPLETION_LABELS[plan.mode];
  if (plan.mode === 'request') {
    return (
      <section className="fz-checkout" data-mode="request" aria-label="סיום">
        <p className="font-semibold">אין תשלום בתהליך הזה</p>
        <p className="fz-help !mt-1">הבקשה תגיע לעסק לבדיקה ואישור.</p>
      </section>
    );
  }
  if (plan.mode === 'external_link') {
    const url = safeExternalUrl(c.externalUrl);
    return (
      <section className="fz-checkout" data-mode="external" aria-label="תשלום">
        <p className="font-semibold">{meta.title}</p>
        <p className="fz-help !mt-1">
          אחרי השליחה יוצג קישור לעמוד התשלום של העסק{url ? ` (${new URL(url).hostname})` : ''}. Formangle אינו גובה ואינו רואה את פרטי התשלום.
        </p>
      </section>
    );
  }
  return (
    <section className="fz-checkout" data-mode={plan.mode} aria-label="תשלום">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{meta.title}</p>
          <p className="fz-help !mt-1">{plan.headline}</p>
        </div>
        <span className="fz-badge shrink-0" data-tone="recommended">
          סימולציה · ללא חיוב
        </span>
      </div>
      {plan.dueNow > 0 && (
        <>
          <div className="fz-total mt-4">
            <span className="text-sm font-semibold">לתשלום עכשיו</span>
            <span className="fz-total-amount">{formatCurrency(plan.dueNow)}</span>
          </div>
          {plan.choice && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="מועד תשלום">
              {[
                [true, 'תשלום מדומה עכשיו', 'לחיצה תסמן כשולם — לא יבוצע חיוב'],
                [false, 'תשלום מאוחר יותר', 'העסק יפנה אליכם להשלמה'],
              ].map(([v, label, desc]) => (
                <label key={String(v)} className="fz-option" data-kind="row">
                  <input type="radio" name="fz-pay-now" checked={payNow === v} onChange={() => onPayNow(v as boolean)} />
                  <span className="fz-indicator" aria-hidden />
                  <span className="fz-opt-body">
                    <span className="fz-opt-label">{label as string}</span>
                    <span className="fz-opt-desc">{desc as string}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
          <p className="fz-help">בדמו אין סליקה: לא מוזנים פרטי אשראי ולא עובר כסף. בגרסת ייצור התשלום יתבצע אצל ספק סליקה מורשה.</p>
        </>
      )}
      {plan.dueNow === 0 && plan.dueAfterApproval > 0 && (
        <div className="fz-total mt-4">
          <span className="text-sm font-semibold">יתבקש רק אחרי אישור</span>
          <span className="fz-total-amount">{formatCurrency(plan.dueAfterApproval)}</span>
        </div>
      )}
    </section>
  );
}
