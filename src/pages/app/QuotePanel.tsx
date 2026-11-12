/**
 * Quotes and the customer's request page, on the owner's request screen.
 * Compose a quote with a live preview in the business's design, send it, and share a private
 * link the customer opens without an account. Formangle sends nothing by itself: the owner
 * copies the link or opens WhatsApp with it.
 */
import { Copy, ExternalLink, FilePlus2, FileText, Link2, Link2Off, MessageCircle, Plus, Send, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { copyText, useToast } from '../../components/Toast';
import { Badge, Button, Card, cx, Input, Modal, Select, Textarea } from '../../components/ui';
import type { QuoteRecord, WorkflowRun } from '../../domain/schema';
import type { WorkflowTheme } from '../../domain/theme';
import { useRepo } from '../../data/store';
import { ValidationFailedError } from '../../data/repository';
import { blankItem, quoteFromRequest, QuoteContentSchema, quoteTotals, QUOTE_STATUS_LABELS, type QuoteAdjustment, type QuoteContent, type QuoteItem } from '../../engine/quote';
import { formatCurrency, formatDateTime } from '../../lib/format';
import { publicBaseUrl } from '../../lib/links';
import { QuoteCard } from '../../renderer/QuoteCard';
import { buildTheme } from '../../theme/presets';
import { ThemeScope } from '../../theme/ThemeScope';
import { confirmAction } from '../../components/Confirm';

const NEUTRAL = buildTheme('modern_minimal');

const TONE: Partial<Record<QuoteRecord['status'], 'teal' | 'amber' | 'blue'>> = { approved: 'teal', changes_requested: 'amber', sent: 'blue', draft: 'amber' };
const absolute = (path: string) => `${publicBaseUrl()}${path}`;
const errorText = (e: unknown) => (e instanceof ValidationFailedError ? Object.values(e.errors)[0] : e instanceof Error ? e.message : 'הפעולה נכשלה');

/** The private link to the customer's page: copy, WhatsApp, open, or cancel all links. */
/** `nudge` grows each time something new is ready for the customer, who is never notified automatically. */
export function CustomerLinkCard({ orgId, run, production, nudge = 0 }: { orgId: string; run: WorkflowRun; production: boolean; nudge?: number }) {
  const { repo } = useRepo();
  const toast = useToast();
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const [nudged, setNudged] = useState(false);
  useEffect(() => {
    if (!nudge) return;
    setNudged(true);
    card.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [nudge]);
  const create = async () => {
    setBusy('create');
    try {
      setLink(absolute(await repo.shareRequestLink(orgId, run.id)));
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setBusy(null);
    }
  };
  const phone = run.customerContact.replace(/\D/g, '').replace(/^0/, '972');
  const whatsapp = link && `https://wa.me/${/^972\d{8,9}$/.test(phone) ? phone : ''}?text=${encodeURIComponent(`שלום${run.customerName ? ` ${run.customerName}` : ''}, זה העמוד האישי של הבקשה שלך (${run.reference}). אפשר לראות בו עדכונים והצעות מחיר: ${link}`)}`;
  return (
    <div ref={card} className={cx('scroll-mt-6 rounded-2xl', nudged && 'ring-2 ring-amber-300 ring-offset-2')}>
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <Link2 className="h-4 w-4 text-orange-700" aria-hidden /> עמוד הבקשה של הלקוח
      </h2>
      {nudged && (
        <p role="status" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {link
            ? 'יש עדכון חדש בעמוד. הלקוח לא מקבל התראה אוטומטית: שלחו לו את הקישור כדי שידע.'
            : 'יש עדכון חדש בעמוד. הלקוח לא מקבל התראה אוטומטית: צרו קישור ושלחו לו אותו בוואטסאפ.'}
        </p>
      )}
      <p className="mt-1 text-xs text-ink-muted">
        {production
          ? 'קישור פרטי שנפתח בלי הרשמה: סטטוס, הצעות מחיר ושאלות שלכם. כל קישור חדש תקף ל-180 יום.'
          : 'בדמו העמוד נפתח רק בדפדפן הזה.'}
      </p>
      {!link ? (
        <Button size="sm" className="mt-3" icon={Link2} loading={busy === 'create'} onClick={create}>
          יצירת קישור ללקוח
        </Button>
      ) : (
        <div className="mt-3 space-y-2">
          <Input readOnly value={link} dir="ltr" aria-label="הקישור לעמוד הבקשה" onFocus={(e) => e.currentTarget.select()} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={Copy} onClick={async () => toast((await copyText(link)) ? 'הקישור הועתק' : 'לא ניתן להעתיק', 'success')}>
              העתקה
            </Button>
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" onClick={() => setNudged(false)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#1f8f4d] px-3 text-sm font-medium text-white hover:bg-[#187a41]">
                <MessageCircle className="h-4 w-4" aria-hidden /> שליחה בוואטסאפ
              </a>
            )}
            <a href={link} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-cloud-300 px-3 text-sm font-medium text-ink hover:bg-cloud">
              <ExternalLink className="h-4 w-4" aria-hidden /> פתיחה
            </a>
          </div>
        </div>
      )}
      {production && (
        <button
          type="button"
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-ink-muted underline-offset-2 hover:text-red-700 hover:underline disabled:opacity-50"
          disabled={busy === 'revoke'}
          onClick={async () => {
            if (!(await confirmAction({ title: 'לבטל את כל הקישורים ללקוח?', message: 'הקישורים שנשלחו יפסיקו לעבוד מיד. אפשר ליצור קישור חדש אחר כך.', confirmLabel: 'ביטול הקישורים', cancelLabel: 'השארה', destructive: true }))) return;
            setBusy('revoke');
            try {
              await repo.revokeRequestLinks(orgId, run.id);
              setLink(null);
              toast('כל הקישורים הקודמים בוטלו');
            } catch (e) {
              toast(errorText(e), 'error');
            } finally {
              setBusy(null);
            }
          }}
        >
          <Link2Off className="h-3.5 w-3.5" aria-hidden /> ביטול כל הקישורים שנשלחו
        </button>
      )}
    </Card>
    </div>
  );
}

function ItemEditor({ item, onChange, onRemove, canRemove }: { item: QuoteItem; onChange: (i: QuoteItem) => void; onRemove: () => void; canRemove: boolean }) {
  const set = (patch: Partial<QuoteItem>) => onChange({ ...item, ...patch });
  return (
    <li className="rounded-xl border border-cloud-200 p-3">
      <div className="grid grid-cols-[1fr_6.5rem] gap-2 sm:grid-cols-[1fr_7rem_5rem_auto]">
        <Input aria-label="שם הפריט" placeholder="לדוגמה: זר כלה בגווני שמנת" maxLength={120} value={item.label} onChange={(e) => set({ label: e.target.value })} />
        <Input aria-label="מחיר ליחידה" type="number" inputMode="decimal" min={0} step="0.01" value={Number.isFinite(item.unitPrice) ? item.unitPrice : ''} onChange={(e) => set({ unitPrice: e.target.value === '' ? 0 : Math.round(Number(e.target.value) * 100) / 100 })} />
        <Input aria-label="כמות" type="number" inputMode="numeric" min={1} max={999} value={item.quantity} onChange={(e) => set({ quantity: Math.max(1, Math.min(999, Math.round(Number(e.target.value) || 1))), maxQuantity: item.maxQuantity && item.maxQuantity < Number(e.target.value) ? undefined : item.maxQuantity })} />
        <Button size="sm" variant="ghost" icon={Trash2} disabled={!canRemove} onClick={onRemove} aria-label={`הסרת ${item.label || 'פריט'}`} className="justify-self-end" />
      </div>
      <Input className="mt-2" aria-label="תיאור קצר" placeholder="תיאור קצר (לא חובה)" maxLength={500} value={item.description ?? ''} onChange={(e) => set({ description: e.target.value || undefined })} />
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" className="h-4 w-4 accent-orange-600" checked={item.optional} onChange={(e) => set({ optional: e.target.checked, included: e.target.checked ? false : true })} />
          תוספת שהלקוח בוחר
        </label>
        {item.optional && (
          <label className="inline-flex items-center gap-1.5">
            <input type="checkbox" className="h-4 w-4 accent-orange-600" checked={item.included} onChange={(e) => set({ included: e.target.checked })} />
            מסומנת מראש
          </label>
        )}
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" className="h-4 w-4 accent-orange-600" checked={item.adjustable} onChange={(e) => set({ adjustable: e.target.checked, maxQuantity: e.target.checked ? Math.max(item.quantity, 5) : undefined })} />
          הלקוח יכול לשנות כמות
        </label>
        {item.adjustable && (
          <label className="inline-flex items-center gap-1.5">
            עד
            <Input className="!h-8 w-16" type="number" min={item.quantity} max={999} aria-label="כמות מקסימלית" value={item.maxQuantity ?? item.quantity} onChange={(e) => set({ maxQuantity: Math.max(item.quantity, Math.min(999, Math.round(Number(e.target.value) || item.quantity))) })} />
          </label>
        )}
      </div>
    </li>
  );
}

function QuoteComposer({
  open, onClose, orgId, run, design, draft, onSaved,
}: { open: boolean; onClose: () => void; orgId: string; run: WorkflowRun; design?: WorkflowTheme; draft?: QuoteRecord; onSaved: (sent: boolean) => void }) {
  const { repo } = useRepo();
  const toast = useToast();
  const initial = (): QuoteContent => {
    const parsed = draft && QuoteContentSchema.safeParse(draft.content);
    return parsed && parsed.success ? parsed.data : quoteFromRequest(`הצעת מחיר${run.customerName ? ` ל${run.customerName}` : ''}`, run.priceLines);
  };
  const [content, setContent] = useState<QuoteContent>(initial);
  const [busy, setBusy] = useState<'save' | 'send' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(open);
  if (open !== opened) {
    setOpened(open);
    if (open) {
      setContent(initial());
      setError(null);
    }
  }
  const set = (patch: Partial<QuoteContent>) => setContent((c) => ({ ...c, ...patch }));
  const valid = QuoteContentSchema.safeParse(content);
  const totals = valid.success ? quoteTotals(valid.data) : null;

  const persist = async (andSend: boolean) => {
    if (!valid.success) return setError(valid.error.issues[0]?.message ?? 'בדקו את פרטי ההצעה');
    setBusy(andSend ? 'send' : 'save');
    setError(null);
    try {
      const saved = await repo.saveQuoteDraft(orgId, run.id, { quoteId: draft?.id, content: valid.data });
      if (andSend) await repo.sendQuote(orgId, saved.id);
      toast(andSend ? 'ההצעה מוכנה בעמוד הבקשה של הלקוח. שלחו לו את הקישור.' : 'הטיוטה נשמרה');
      onSaved(andSend);
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const adj = content.adjustments ?? [];
  const setAdj = (i: number, patch: Partial<QuoteAdjustment>) => set({ adjustments: adj.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={draft ? 'עריכת הצעת מחיר' : 'הצעת מחיר חדשה'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>ביטול</Button>
          <Button variant="secondary" loading={busy === 'save'} disabled={Boolean(busy)} onClick={() => persist(false)}>שמירת טיוטה</Button>
          <Button icon={Send} loading={busy === 'send'} disabled={Boolean(busy)} onClick={() => persist(true)}>שליחה ללקוח</Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="space-y-4">
          <div>
            <label htmlFor="quote-title" className="mb-1 block text-sm font-medium">כותרת</label>
            <Input id="quote-title" maxLength={120} value={content.title} onChange={(e) => set({ title: e.target.value })} />
          </div>
          <div>
            <label htmlFor="quote-intro" className="mb-1 block text-sm font-medium">משפט פתיחה <span className="font-normal text-ink-muted">(לא חובה)</span></label>
            <Textarea id="quote-intro" rows={2} maxLength={2000} value={content.intro ?? ''} onChange={(e) => set({ intro: e.target.value || undefined })} placeholder="תודה על הפנייה! הנה ההצעה שהכנו בשבילך." />
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium">פריטים</p>
            <ul className="space-y-2">
              {content.items.map((item, i) => (
                <ItemEditor
                  key={item.id}
                  item={item}
                  canRemove={content.items.length > 1}
                  onChange={(next) => set({ items: content.items.map((x, j) => (j === i ? next : x)) })}
                  onRemove={() => set({ items: content.items.filter((_, j) => j !== i) })}
                />
              ))}
            </ul>
            <Button size="sm" variant="secondary" icon={Plus} className="mt-2" disabled={content.items.length >= 50} onClick={() => set({ items: [...content.items, blankItem('')] })}>
              פריט נוסף
            </Button>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium">הנחות ותוספות</p>
            {adj.map((a, i) => (
              <div key={i} className="mb-2 grid grid-cols-[1fr_5.5rem_5rem_auto] gap-2">
                <Input aria-label="תיאור" placeholder={a.kind === 'discount' ? 'הנחת לקוח חוזר' : 'משלוח'} maxLength={80} value={a.label} onChange={(e) => setAdj(i, { label: e.target.value })} />
                <Select aria-label="סוג" value={`${a.kind}:${a.mode}`} onChange={(e) => { const [kind, mode] = e.target.value.split(':') as [QuoteAdjustment['kind'], QuoteAdjustment['mode']]; setAdj(i, { kind, mode }); }}>
                  <option value="discount:percent">הנחה %</option>
                  <option value="discount:amount">הנחה ₪</option>
                  <option value="fee:amount">תוספת ₪</option>
                  <option value="fee:percent">תוספת %</option>
                </Select>
                <Input aria-label="ערך" type="number" min={0} step="0.01" value={a.value} onChange={(e) => setAdj(i, { value: Math.max(0, Number(e.target.value) || 0) })} />
                <Button size="sm" variant="ghost" icon={Trash2} aria-label="הסרה" onClick={() => set({ adjustments: adj.filter((_, j) => j !== i) })} />
              </div>
            ))}
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" icon={Plus} disabled={adj.length >= 10} onClick={() => set({ adjustments: [...adj, { label: 'הנחה', kind: 'discount', mode: 'percent', value: 10 }] })}>הנחה</Button>
              <Button size="sm" variant="ghost" icon={Plus} disabled={adj.length >= 10} onClick={() => set({ adjustments: [...adj, { label: 'משלוח', kind: 'fee', mode: 'amount', value: 30 }] })}>תוספת</Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="quote-vat" className="mb-1 block text-sm font-medium">מע״מ</label>
              <Select id="quote-vat" value={content.vat.mode} onChange={(e) => set({ vat: { mode: e.target.value as QuoteContent['vat']['mode'], rate: e.target.value === 'exempt' ? 0 : content.vat.rate || 18 } })}>
                <option value="included">המחירים כוללים מע״מ</option>
                <option value="excluded">להוסיף מע״מ למחירים</option>
                <option value="exempt">עוסק פטור</option>
              </Select>
            </div>
            <div>
              <label htmlFor="quote-valid" className="mb-1 block text-sm font-medium">בתוקף עד <span className="font-normal text-ink-muted">(לא חובה)</span></label>
              <Input id="quote-valid" type="date" value={content.validUntil ?? ''} onChange={(e) => set({ validUntil: e.target.value || undefined })} />
            </div>
          </div>
          <div>
            <label htmlFor="quote-terms" className="mb-1 block text-sm font-medium">תנאים <span className="font-normal text-ink-muted">(לא חובה)</span></label>
            <Textarea id="quote-terms" rows={2} maxLength={2000} value={content.terms ?? ''} onChange={(e) => set({ terms: e.target.value || undefined })} placeholder="לדוגמה: מקדמה של 30% בעת האישור. ביטול עד 48 שעות מראש." />
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
        <div className="lg:sticky lg:top-0 lg:self-start">
          <p className="mb-2 text-xs font-medium text-ink-muted">כך הלקוח יראה את ההצעה{totals ? ` · ${formatCurrency(totals.total)}` : ''}</p>
          {valid.success ? (
            <ThemeScope theme={design ?? NEUTRAL} className="rounded-2xl bg-[var(--fz-bg)] p-3">
              <QuoteCard preview quote={{ id: 'preview', revision: (draft?.revision ?? 1), status: 'sent', content: valid.data }} />
            </ThemeScope>
          ) : (
            <p className="rounded-xl bg-cloud p-4 text-sm text-ink-muted">{valid.error.issues[0]?.message}</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** The quotes of one request: the open draft, what was sent, and what the customer decided. */
export function QuotePanel({ orgId, run, design, quotes, canAct, onChanged, onSent }: { orgId: string; run: WorkflowRun; design?: WorkflowTheme; quotes: QuoteRecord[]; canAct: boolean; onChanged: () => void; onSent?: () => void }) {
  const { repo } = useRepo();
  const toast = useToast();
  const [composing, setComposing] = useState<'new' | QuoteRecord | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const draft = quotes.find((q) => q.status === 'draft');
  const act = async (id: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(id);
    try {
      await fn();
      toast(done);
      onChanged();
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">הצעות מחיר</h2>
          <p className="mt-0.5 text-xs text-ink-muted">הצעה ממותגת שהלקוח מאשר בעצמו, עם תוספות לבחירה וסכום שמתעדכן.</p>
        </div>
        {canAct && !draft && (
          <Button size="sm" icon={FilePlus2} onClick={() => setComposing('new')}>
            {quotes.some((q) => q.status === 'sent' || q.status === 'changes_requested') ? 'גרסה חדשה' : 'הצעת מחיר חדשה'}
          </Button>
        )}
      </div>
      {quotes.length === 0 ? (
        <p className="mt-3 rounded-xl bg-cloud p-4 text-sm text-ink-muted">
          במקום לשלוח מחיר בהודעה: בנו הצעה עם פריטים ותוספות, והלקוח יאשר, יבקש שינויים או ידחה — והכול יירשם כאן.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-cloud-200">
          {quotes.map((q) => {
            const title = typeof q.content.title === 'string' ? q.content.title : 'הצעת מחיר';
            return (
              <li key={q.id} className="flex flex-wrap items-start gap-3 py-3">
                <FileText className="mt-0.5 h-4 w-4 text-ink-muted" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {title} <span className="font-normal text-ink-muted">· גרסה {q.revision}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    <span className="tabular-nums">{formatCurrency(q.decision?.decision === 'approved' ? q.decision.total : q.total)}</span>
                    {q.sentAt ? ` · נשלחה ${formatDateTime(q.sentAt)}` : ` · נשמרה ${formatDateTime(q.updatedAt)}`}
                    {q.viewedAt ? ' · הלקוח צפה' : ''}
                  </p>
                  {q.decision?.comment && <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-sm text-amber-900">״{q.decision.comment}״</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={TONE[q.status]}>{QUOTE_STATUS_LABELS[q.status]}</Badge>
                  {q.status === 'draft' && canAct && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => setComposing(q)}>עריכה</Button>
                      <Button size="sm" icon={Send} loading={busy === q.id} onClick={() => act(q.id, async () => { await repo.sendQuote(orgId, q.id); onSent?.(); }, 'ההצעה מוכנה בעמוד הבקשה של הלקוח')}>שליחה</Button>
                    </>
                  )}
                  {(q.status === 'draft' || q.status === 'sent' || q.status === 'changes_requested') && canAct && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className={cx(busy === `w${q.id}` && 'opacity-60')}
                      onClick={async () => (await confirmAction(q.status === 'draft' ? { title: 'למחוק את הטיוטה?', confirmLabel: 'מחיקה', destructive: true } : { title: 'לבטל את ההצעה?', message: 'הלקוח יראה שהיא בוטלה.', confirmLabel: 'ביטול ההצעה', cancelLabel: 'השארה', destructive: true })) && act(`w${q.id}`, () => repo.withdrawQuote(orgId, q.id), q.status === 'draft' ? 'הטיוטה נמחקה' : 'ההצעה בוטלה')}
                    >
                      {q.status === 'draft' ? 'מחיקה' : 'ביטול'}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <QuoteComposer
        open={Boolean(composing)}
        onClose={() => setComposing(null)}
        orgId={orgId}
        run={run}
        design={design}
        draft={composing && composing !== 'new' ? composing : undefined}
        onSaved={(sent) => {
          onChanged();
          if (sent) onSent?.();
        }}
      />
    </Card>
  );
}
