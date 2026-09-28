import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  changePasswordSchema,
  PASSWORD_RULES_TEXT,
  ROLE_LABELS,
  type ChangePasswordInput,
} from '@bbms/shared';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { authApi } from '@/features/auth/api';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { DetailList, PageHeader } from '@/components/ui/PageHeader';
import { PasswordField } from '@/components/ui/fields';
import { applyServerErrors } from '@/utils/formErrors';
import { toApiClientError } from '@/services/apiError';

function ChangePasswordCard() {
  const { applySession } = useAuth();
  const [success, setSuccess] = useState(false);
  const [formError, setFormError] = useState<string>();
  const form = useForm({ resolver: zodResolver(changePasswordSchema) });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = async (values: ChangePasswordInput) => {
    setFormError(undefined);
    setSuccess(false);
    try {
      applySession(await authApi.changePassword(values));
      form.reset();
      setSuccess(true);
    } catch (err) {
      setFormError(applyServerErrors(err, form.setError, ['currentPassword', 'newPassword']));
    }
  };

  return (
    <Card>
      <CardHeader title="Change password" description="Other devices will be signed out." />
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4 p-5">
        {success && <Alert tone="success">Password changed. Other devices were signed out.</Alert>}
        {formError && <Alert tone="error">{formError}</Alert>}
        <PasswordField
          label="Current password"
          autoComplete="current-password"
          required
          registration={form.register('currentPassword')}
          error={errors.currentPassword?.message}
        />
        <PasswordField
          label="New password"
          autoComplete="new-password"
          required
          registration={form.register('newPassword')}
          error={errors.newPassword?.message}
          hint={PASSWORD_RULES_TEXT}
        />
        <Button type="submit" isLoading={isSubmitting}>
          Update password
        </Button>
      </form>
    </Card>
  );
}

export function AccountPage() {
  const { user, logoutAll } = useAuth();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (!user) return null;

  const signOutEverywhere = async () => {
    setBusy(true);
    try {
      await logoutAll();
      navigate('/login', { replace: true });
    } catch (err) {
      setError(toApiClientError(err).message);
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
      <PageHeader title="Account" description="Your sign-in details and security settings." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Profile" />
          <DetailList
            items={[
              { label: 'Name', value: user.name },
              {
                label: 'Email',
                value: (
                  <span className="inline-flex items-center gap-2">
                    {user.email}
                    <Badge tone={user.emailVerified ? 'success' : 'warning'}>
                      {user.emailVerified ? 'Verified' : 'Unverified'}
                    </Badge>
                  </span>
                ),
              },
              { label: 'Phone', value: user.phone },
              { label: 'Role', value: ROLE_LABELS[user.role] },
              { label: 'Member since', value: new Date(user.createdAt).toLocaleDateString() },
            ]}
          />
        </Card>
        <ChangePasswordCard />
        <Card className="lg:col-span-2">
          <CardHeader
            title="Sessions"
            description="Signed in on a shared or lost device? Sign out everywhere."
            actions={
              <Button
                variant="secondary"
                icon={<LogOut className="size-4" aria-hidden />}
                onClick={() => setConfirmOpen(true)}
              >
                Sign out of all devices
              </Button>
            }
          />
          {error && (
            <Alert tone="error" className="m-5">
              {error}
            </Alert>
          )}
        </Card>
      </div>
      <ConfirmationDialog
        open={confirmOpen}
        title="Sign out of all devices?"
        description="Every session, including this one, will be ended immediately."
        confirmLabel="Sign out everywhere"
        tone="danger"
        isLoading={busy}
        onConfirm={signOutEverywhere}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
