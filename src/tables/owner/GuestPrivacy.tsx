/** Owner-only privacy requests: find a guest by phone, download their data, or anonymize them. */
import { Download, ShieldCheck, UserX } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useToast } from '../../components/Toast';
import { Button, Card, FieldLabel, Input } from '../../components/ui';
import { rpc } from '../data/client';
import type { TablesError } from '../domain/errors';

type Found = { id: string; name: string; reservations: number } | null;

export function GuestPrivacy({ organizationId }: { organizationId: string }) {
  const toast = useToast();
  const [phone, setPhone] = useState('');
  const [found, setFound] = useState<Found | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  async function find(e: FormEvent) {
    e.preventDefault();
    setBusy('find');
    setConfirm(false);
    try { setFound(await rpc<Found>('tables_find_guest', { p_organization_id: organizationId, p_phone: phone })); }
    catch (err) { toast((err as TablesError).message, 'error'); }
    finally { setBusy(null); }
  }
  async function download() {
    if (!found) return;
    setBusy('export');
    try {
      const data = await rpc<unknown>('tables_export_guest', { p_organization_id: organizationId, p_guest_id: found.id });
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `guest-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) { toast((err as TablesError).message, 'error'); }
    finally { setBusy(null); }
  }
  async function anonymize() {
    if (!found) return;
    setBusy('anon');
    try {
      await rpc('tables_anonymize_guest', { p_organization_id: organizationId, p_guest_id: found.id });
      toast('הפרטים האישיים של האורח נמחקו', 'success');
      setFound(null);
      setConfirm(false);
    } catch (err) {
      const te = err as TablesError;
      toast(te.code === 'guest_has_active_reservation' ? 'לאורח יש הזמנה פעילה. אפשר למחוק את הפרטים אחרי שההזמנה מסתיימת או מבוטלת.' : te.message, 'error');
    } finally { setBusy(null); }
  }

  return (
    <Card as="section" className="mt-6 p-5">
      <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5" aria-hidden /> בקשות פרטיות של אורחים</h2>
      <p className="mt-1 text-sm text-ink-muted">אורח ביקש לראות את המידע שנשמר עליו או למחוק אותו? חפשו לפי מספר הטלפון שלו. הפעולות נרשמות ביומן.</p>
      <form onSubmit={find} className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1 sm:max-w-xs">
          <FieldLabel htmlFor="pv-phone">טלפון של האורח</FieldLabel>
          <Input id="pv-phone" type="tel" dir="ltr" value={phone} maxLength={24} onChange={(e) => setPhone(e.target.value)} placeholder="050-1234567" />
        </div>
        <Button type="submit" variant="secondary" loading={busy === 'find'} disabled={!phone.trim()} className="h-11">חיפוש</Button>
      </form>
      {found === null && <p role="status" className="mt-3 text-sm text-ink-muted">לא נמצא אורח עם המספר הזה.</p>}
      {found && (
        <div className="mt-4 rounded-xl border border-cloud-200 p-3">
          <p className="font-medium">{found.name} · {found.reservations} הזמנות</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={Download} loading={busy === 'export'} onClick={download} className="h-10">הורדת המידע (קובץ)</Button>
            <Button size="sm" variant="danger" icon={UserX} onClick={() => setConfirm(true)} className="h-10">מחיקת הפרטים האישיים</Button>
          </div>
          {confirm && (
            <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              <p>השם, הטלפון, האימייל והבקשות של האורח יימחקו מכל ההזמנות שלו, והקישורים שלו יבוטלו. לא ניתן לשחזר. נתונים מספריים (תאריכים, גודל קבוצה) נשארים לסטטיסטיקה. הערות צוות נשמרות לפי מדיניות השמירה.</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="danger" loading={busy === 'anon'} onClick={anonymize} className="h-10">כן, למחוק</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(false)} className="h-10">ביטול</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
