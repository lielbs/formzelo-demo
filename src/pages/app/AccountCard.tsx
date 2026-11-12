/**
 * The signed-in person's own account: who is signed in, sign out, and delete the account.
 * Deleting ends access to every business at once; a business the person runs alone is closed too.
 */
import { LogOut, Trash2, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { confirmAction } from '../../components/Confirm';
import { Button, Card } from '../../components/ui';
import { deleteMyAccount } from '../../production/admin';

export function AccountCard() {
  const { state, signOut } = useAuth();
  const navigate = useNavigate();
  const email = state.kind === 'authenticated' ? state.email : null;
  const word = 'מחיקה';
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-semibold"><UserRound className="h-4 w-4" aria-hidden /> החשבון שלי</h2>
      {email && <p className="mt-1 break-all text-sm text-ink-muted"><span className="ltr">{email}</span></p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={LogOut} onClick={() => void signOut().then(() => navigate('/app'))}>יציאה</Button>
        <Button size="sm" variant="ghost" icon={Trash2} className="text-red-700 hover:bg-red-50 hover:text-red-800"
          onClick={() => void confirmAction({
            title: 'למחוק את החשבון?',
            message: (
              <>
                <p>הגישה שלכם לכל העסקים תיפסק מיד, והחשבון יימחק. עסק שאתם מנהלים לבד ייסגר, והקישורים הציבוריים שלו יפסיקו לעבוד.</p>
                <p className="mt-2">אי אפשר לבטל את המחיקה.</p>
              </>
            ),
            confirmLabel: 'מחיקת החשבון',
            destructive: true,
            typeToConfirm: word,
            action: deleteMyAccount,
          }).then(async (ok) => {
            if (!ok) return;
            await signOut().catch(() => undefined);
            navigate('/app', { replace: true });
          })}>
          מחיקת החשבון
        </Button>
      </div>
    </Card>
  );
}
