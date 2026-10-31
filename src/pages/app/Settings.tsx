import { Database, Download, RotateCcw, Save, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../components/Toast';
import { Badge, Button, Card, FieldLabel, Input, Modal, PageHeader, Spinner } from '../../components/ui';
import { useActiveOrg, useRepo, useRepoQuery } from '../../data/store';
import { formatDate, formatNumber } from '../../lib/format';

interface FormValues {
  name: string;
  tagline: string;
  contactEmail: string;
  primaryColor: string;
}

export function Settings() {
  const org = useActiveOrg();
  const { repo } = useRepo();
  const toast = useToast();
  const navigate = useNavigate();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const info = useRepoQuery(async (r) => ({ report: await r.storageReport(), members: await r.listMemberships(org.id) }), [org.id]);

  const { register, handleSubmit, reset, watch, setValue, formState } = useForm<FormValues>({
    defaultValues: { name: org.name, tagline: org.tagline, contactEmail: org.contactEmail, primaryColor: org.brand.primaryColor },
  });
  useEffect(() => {
    reset({ name: org.name, tagline: org.tagline, contactEmail: org.contactEmail, primaryColor: org.brand.primaryColor });
  }, [org, reset]);
  const color = watch('primaryColor');

  const onSave = async (v: FormValues) => {
    try {
      await repo.updateOrganization(org.id, {
        name: v.name.trim(),
        tagline: v.tagline.trim(),
        contactEmail: v.contactEmail.trim(),
        brand: { primaryColor: v.primaryColor, logoText: v.name.trim() },
      });
      toast('ההגדרות נשמרו');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'השמירה נכשלה', 'error');
    }
  };

  const exportJson = async () => {
    const data = await repo.exportWorkspace(org.id);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `formzelo-${org.slug}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('קובץ הגיבוי נוצר');
  };

  const err = formState.errors;
  const report = info.data?.report;
  const usedPct = report ? Math.min(100, (report.bytes / report.approxQuotaBytes) * 100) : 0;

  return (
    <>
      <PageHeader title="הגדרות" description={`סביבת העבודה ${org.name}`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="font-semibold">מותג וסביבת עבודה</h2>
          <form onSubmit={handleSubmit(onSave)} noValidate className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="s-name" required>
                  שם העסק
                </FieldLabel>
                <Input id="s-name" invalid={Boolean(err.name)} {...register('name', { required: 'שדה חובה', maxLength: { value: 40, message: 'עד 40 תווים' } })} />
                {err.name && <p role="alert" className="mt-1 text-xs text-red-600">{err.name.message}</p>}
              </div>
              <div>
                <FieldLabel htmlFor="s-email">אימייל להתראות (מדומה)</FieldLabel>
                <Input
                  id="s-email"
                  type="email"
                  dir="ltr"
                  className="text-right"
                  invalid={Boolean(err.contactEmail)}
                  {...register('contactEmail', { pattern: { value: /^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'אימייל לא תקין' } })}
                />
                {err.contactEmail && <p role="alert" className="mt-1 text-xs text-red-600">{err.contactEmail.message}</p>}
              </div>
            </div>
            <div>
              <FieldLabel htmlFor="s-tag">שורת תיאור</FieldLabel>
              <Input id="s-tag" {...register('tagline', { maxLength: { value: 80, message: 'עד 80 תווים' } })} />
            </div>
            <div>
              <FieldLabel htmlFor="s-color">צבע מותג</FieldLabel>
              <div className="flex items-center gap-2">
                <input
                  id="s-color"
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#E96B3D'}
                  onChange={(e) => setValue('primaryColor', e.target.value, { shouldDirty: true })}
                  className="h-11 w-14 cursor-pointer rounded-xl border border-cloud-300 bg-white p-1"
                />
                <Input aria-label="קוד צבע" dir="ltr" className="max-w-[140px]" invalid={Boolean(err.primaryColor)} {...register('primaryColor', { pattern: { value: /^#[0-9a-fA-F]{6}$/, message: 'פורמט #RRGGBB' } })} />
                <span className="text-xs text-ink-muted">משמש לתהליכים חדשים ולסביבת העבודה.</span>
              </div>
              {err.primaryColor && <p role="alert" className="mt-1 text-xs text-red-600">{err.primaryColor.message}</p>}
            </div>
            <Button type="submit" icon={Save} loading={formState.isSubmitting} disabled={!formState.isDirty}>
              שמירה
            </Button>
          </form>
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <Users className="h-4 w-4" aria-hidden /> חברי צוות
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted">מדומה — אין התחברות אמיתית בדמו.</p>
            {info.loading ? (
              <Spinner />
            ) : (
              <ul className="mt-3 space-y-2">
                {info.data?.members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between rounded-xl bg-cloud px-3 py-2 text-sm">
                    <span>{m.userName}</span>
                    <Badge tone={m.role === 'owner' ? 'dark' : 'neutral'}>{m.role === 'owner' ? 'בעלים' : 'צוות'}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <Database className="h-4 w-4" aria-hidden /> אחסון מקומי
            </h2>
            {report && (
              <>
                <div className="mt-3 h-2 rounded-full bg-cloud-200" role="meter" aria-valuenow={Math.round(usedPct)} aria-valuemin={0} aria-valuemax={100} aria-label="ניצול אחסון">
                  <div className="h-full rounded-full bg-teal" style={{ width: `${Math.max(2, usedPct)}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-ink-muted">
                  {formatNumber(Math.round(report.bytes / 1024))} KB מתוך כ-5 MB · {formatNumber(report.keys)} מפתחות
                </p>
                {report.warnings.map((w) => (
                  <p key={w} className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
                    {w}
                  </p>
                ))}
              </>
            )}
            <ul className="mt-3 list-inside list-disc space-y-1 text-xs leading-relaxed text-ink-muted">
              <li>הנתונים נשמרים ב-localStorage של הדפדפן הזה בלבד.</li>
              <li>אין סנכרון בין מכשירים, דפדפנים או חלון גלישה בסתר.</li>
              <li>ניקוי נתוני האתר בדפדפן מוחק את כל הנתונים.</li>
              <li>נוצר {org.createdAt ? formatDate(org.createdAt) : ''} · נתוני הדמו בדיוניים.</li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={Download} onClick={exportJson}>
                ייצוא JSON
              </Button>
              <Button size="sm" variant="danger" icon={RotateCcw} onClick={() => setConfirmReset(true)}>
                איפוס נתוני הדמו
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="איפוס כל נתוני הדמו?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              ביטול
            </Button>
            <Button
              variant="danger"
              loading={resetting}
              onClick={async () => {
                setResetting(true);
                await repo.resetDemoData();
                setResetting(false);
                setConfirmReset(false);
                toast('נתוני הדמו אופסו');
                navigate('/demo');
              }}
            >
              איפוס
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">כל התהליכים, הבקשות וההגדרות בשלוש סביבות הדמו יימחקו מהדפדפן וייטענו מחדש לנתוני ההתחלה. מומלץ לייצא JSON לפני כן.</p>
      </Modal>
    </>
  );
}
