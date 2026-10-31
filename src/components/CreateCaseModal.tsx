import { Copy, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Workflow, WorkflowField, WorkflowRun } from '../domain/schema';
import { useRepo } from '../data/store';
import { ValidationFailedError } from '../data/repository';
import type { Values } from '../engine/conditions';
import { validateFields, type FieldErrors } from '../engine/validation';
import { publicBaseUrl, publicFlowUrl } from '../lib/links';
import { FieldInput } from '../renderer/FieldInput';
import { copyText, useToast } from './Toast';
import { Button, Modal } from './ui';

/** Owner opens a case (e.g. a car at the garage) and gets a personal customer link. */
export function CreateCaseModal({ open, onClose, orgId, workflow, caseFields }: { open: boolean; onClose: () => void; orgId: string; workflow: Workflow; caseFields: WorkflowField[] }) {
  const { repo } = useRepo();
  const toast = useToast();
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<WorkflowRun | null>(null);

  const close = () => {
    setValues({});
    setErrors({});
    setCreated(null);
    onClose();
  };

  const submit = async () => {
    const errs = validateFields(caseFields, values);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      setCreated(await repo.createCase(orgId, workflow.id, values, publicBaseUrl()));
      toast('התיק נפתח והקישור האישי מוכן');
    } catch (e) {
      if (e instanceof ValidationFailedError) setErrors(e.errors);
      else toast(e instanceof Error ? e.message : 'פתיחת התיק נכשלה', 'error');
    } finally {
      setBusy(false);
    }
  };

  const link = created ? publicFlowUrl(workflow.slug, created.id) : '';

  return (
    <Modal
      open={open}
      onClose={close}
      title={created ? `תיק ${created.reference} נפתח` : `תיק חדש · ${workflow.draft.title}`}
      footer={
        created ? (
          <Button variant="secondary" onClick={close}>
            סגירה
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              ביטול
            </Button>
            <Button onClick={submit} loading={busy}>
              פתיחת תיק ויצירת קישור
            </Button>
          </>
        )
      }
    >
      {created ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">שלחו ללקוח את הקישור האישי. בדמו, ההודעה רק מוצגת כתצוגה מקדימה ואינה נשלחת.</p>
          <div className="flex gap-2">
            <input readOnly value={link} dir="ltr" aria-label="קישור אישי" className="fz-input min-w-0 flex-1 rounded-xl border border-cloud-300 bg-cloud px-3 py-2 text-sm" onFocus={(e) => e.target.select()} />
            <Button
              variant="secondary"
              icon={Copy}
              onClick={async () => {
                const ok = await copyText(link);
                toast(ok ? 'הקישור הועתק' : 'סמנו והעתיקו ידנית', ok ? 'success' : 'error');
              }}
            >
              העתקה
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={link} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl bg-orange px-4 text-sm font-medium text-white hover:bg-orange-600">
              <ExternalLink className="h-4 w-4" aria-hidden /> פתיחה כלקוח
            </a>
            <Link to={`/app/requests/${created.id}`} onClick={close} className="inline-flex h-10 items-center rounded-xl border border-cloud-300 px-4 text-sm font-medium hover:bg-cloud">
              לפרטי התיק
            </Link>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {caseFields.map((f) => (
            <FieldInput
              key={f.id}
              field={f}
              value={values[f.key]}
              error={errors[f.key]}
              onChange={(v) => {
                setValues((s) => ({ ...s, [f.key]: v }));
                setErrors((s) => ({ ...s, [f.key]: '' }));
              }}
            />
          ))}
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      )}
    </Modal>
  );
}
