import { useId, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usersApi } from '@/features/admin/api';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { toApiClientError } from '@/services/apiError';

const inputClass =
  'block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 focus:outline-none';

/** Donors only: permanently removes their personal details (anonymisation) and signs them out. */
export function DeleteAccountCard() {
  const { endDeletedAccount } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const ids = { password: useId(), confirm: useId() };

  const close = () => {
    setOpen(false);
    setPassword('');
    setConfirm('');
    setError(undefined);
  };

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await usersApi.deleteMe({ password, confirm: 'DELETE' });
      // The route guard then sends the (now anonymous) visitor to sign-in with a confirmation.
      endDeletedAccount();
    } catch (err) {
      setError(toApiClientError(err).message);
      setBusy(false);
    }
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title="Delete account"
        description="Remove your personal details from the platform permanently."
        actions={
          <Button
            variant="danger"
            icon={<Trash2 className="size-4" aria-hidden />}
            onClick={() => setOpen(true)}
          >
            Delete my account
          </Button>
        }
      />
      <Modal
        open={open}
        onClose={close}
        title="Delete your account?"
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Keep my account
            </Button>
            <Button
              variant="danger"
              onClick={() => void submit()}
              isLoading={busy}
              disabled={!password || confirm !== 'DELETE'}
            >
              Delete permanently
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <p>
            Your name, email, phone, location and preferences are removed and you will never be
            contacted again. Records of donations you made stay with the blood bank without your
            name, as the law requires for traceability. This cannot be undone.
          </p>
          <div className="space-y-1.5">
            <label htmlFor={ids.password} className="block text-sm font-medium text-slate-700">
              Your password
            </label>
            <input
              id={ids.password}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.confirm} className="block text-sm font-medium text-slate-700">
              Type <strong>DELETE</strong> to confirm
            </label>
            <input
              id={ids.confirm}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              className={inputClass}
            />
          </div>
        </div>
      </Modal>
    </Card>
  );
}
