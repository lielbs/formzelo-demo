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
import { resolveAppearance } from './appearance';

// ---------- brand & hero ----------

export function BrandRow({ name, logoUrl, showName }: { name: string; logoUrl?: string; showName: boolean }) {
  return (
    <div className="fz-brandrow">
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
  children?: ReactNode;
}

export function Hero({ theme, config, stepsCount, fieldsCount, logoUrl, coverUrl, caseAnswers, condensed, preview, children }: HeroProps) {
  const layout = theme.hero.layout;
  const minutes = Math.max(1, Math.round(fieldsCount * 0.35));
  const facts = [
    { icon: ListChecks, label: `${stepsCount} שלבים · כ-${minutes} דק׳` },
    config.pricing.enabled && { icon: Tag, label: 'המחיר מתעדכן תוך כדי' },
    config.mode === 'case' && { icon: Lock, label: 'קישור אישי' },
  ].filter(Boolean) as { icon: typeof Clock; label: string }[];
  const showSpecs = layout === 'banner' && caseAnswers.length > 0;
  const art = theme.decoration !== 'none' && !coverUrl;

  return (
    <header className="fz-hero" data-layout={layout} data-condensed={condensed || undefined} data-mobile-compact={theme.mobile.compactHero || undefined} aria-label={config.title}>
      {coverUrl && layout !== 'none' && (
        <>
          <img src={coverUrl} alt="" className="fz-hero-cover" />
          <span className="fz-hero-scrim" aria-hidden />
        </>
      )}
      {art && layout !== 'none' && <HeroArt decoration={theme.decoration} className="fz-hero-art" />}
      <div className="fz-hero-content fz-anim-hero">
        <div className="flex items-center justify-between gap-3">
          <BrandRow name={config.branding.logoText} logoUrl={logoUrl} showName={theme.logo.showName} />
          {preview && <span className="fz-fact shrink-0">תצוגה מקדימה</span>}
        </div>
        {theme.hero.eyebrow && !condensed && <p className="fz-hero-eyebrow mt-5">{theme.hero.eyebrow}</p>}
        <h1 className="fz-display fz-hero-title">{config.title}</h1>
        {config.description && <p className="fz-hero-desc">{config.description}</p>}
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
      </div>
    </header>
  );
}

// ---------- stepper ----------

export function Stepper({ style, titles, index, onJump }: { style: WorkflowTheme['progress']; titles: string[]; index: number; onJump: (i: number) => void }) {
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
      {style === 'steps' ? (
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
  if (!(config.pricing.depositPercent > 0 && price.total > 0)) return null;
  return (
    <p className="fz-help">
      מקדמה לאחר אישור העסק: <strong className="fz-num">{formatCurrency(price.deposit)}</strong> ({config.pricing.depositPercent}%) — סימולציה בלבד, ללא חיוב.
    </p>
  );
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
        <span className="fz-total-amount" aria-live="polite">
          {formatCurrency(price.total)}
        </span>
      </div>
      {depositNote(config, price)}
      <p className="fz-help">המחיר הוא הערכה. לא מתבצע תשלום בדמו.</p>
    </section>
  );
}

export function PriceBar({ config, price, values, hasAside, staticBar }: { config: WorkflowConfig; price: PriceResult; values: Values; hasAside: boolean; staticBar?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const decisions = decisionFields(config);
  const approved = decisions.filter((f) => values[f.key] === 'approved').length;
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
          <span className="fz-total-amount" aria-live="polite">
            {formatCurrency(price.total)}
          </span>
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
