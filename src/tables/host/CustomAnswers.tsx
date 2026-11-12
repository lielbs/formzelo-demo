/** Guest answers to the venue's additional questions (team view; labels as they were asked). */
import { MessageSquareText } from 'lucide-react';
import { cx } from '../../components/ui';
import type { CustomAnswer } from '../domain/types';

export function CustomAnswers({ answers, compact }: { answers: CustomAnswer[] | null | undefined; compact?: boolean }) {
  if (!answers?.length) return null;
  return (
    <dl className={cx('grid gap-1 rounded-lg bg-cloud text-ink', compact ? 'mt-1 px-2 py-1 text-xs' : 'mt-2 px-3 py-2 text-sm')} aria-label="תשובות האורח לשאלות הנוספות">
      {answers.map((a) => (
        <div key={a.id} className="flex flex-wrap gap-x-1.5">
          <dt className="inline-flex items-center gap-1 font-medium">{!compact && <MessageSquareText className="h-3.5 w-3.5" aria-hidden />}{a.label}:</dt>
          <dd className="min-w-0 break-words">{a.value === true ? 'כן' : String(a.value)}</dd>
        </div>
      ))}
    </dl>
  );
}
