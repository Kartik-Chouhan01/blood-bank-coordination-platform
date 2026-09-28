import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { inviteStaffSchema, type InviteStaffInput, type UserSummary } from '@bbms/shared';
import { useApiQuery } from '@/hooks/useApiQuery';
import { Alert } from '@/components/ui/Alert';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SelectField, TextField } from '@/components/ui/fields';
import { applyServerErrors } from '@/utils/formErrors';
import { bloodBanksApi, staffApi } from '@/features/organisations/api';

const FIELDS = ['name', 'email', 'phone', 'role', 'bloodBankId'];

function InviteForm({
  onInvited,
  onCancel,
}: {
  onInvited: (user: UserSummary) => void;
  onCancel: () => void;
}) {
  const [formError, setFormError] = useState<string>();
  const banks = useApiQuery(() => bloodBanksApi.list({ active: 'true', limit: 100 }));
  const form = useForm({
    resolver: zodResolver(inviteStaffSchema),
    defaultValues: { role: 'BLOOD_BANK_STAFF' },
  });
  const { errors, isSubmitting } = form.formState;
  const role = useWatch({ control: form.control, name: 'role' });

  const onSubmit = async (values: InviteStaffInput) => {
    setFormError(undefined);
    try {
      onInvited(await staffApi.invite(values));
    } catch (err) {
      setFormError(applyServerErrors(err, form.setError, FIELDS));
    }
  };

  const noBanks = banks.data && banks.data.items.length === 0;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
      <p className="text-slate-600">
        They&apos;ll receive an email to choose their own password. The account stays inactive until
        they do.
      </p>
      {formError && <Alert tone="error">{formError}</Alert>}
      <TextField
        label="Full name"
        required
        registration={form.register('name')}
        error={errors.name?.message}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Work email"
          type="email"
          required
          registration={form.register('email')}
          error={errors.email?.message}
        />
        <TextField
          label="Phone"
          type="tel"
          required
          registration={form.register('phone')}
          error={errors.phone?.message}
        />
      </div>
      <SelectField
        label="Role"
        required
        options={[
          { value: 'BLOOD_BANK_STAFF', label: 'Blood bank staff' },
          { value: 'ADMIN', label: 'Administrator' },
        ]}
        registration={form.register('role')}
      />
      {noBanks && role === 'BLOOD_BANK_STAFF' ? (
        <Alert
          tone="warning"
          action={
            <ButtonLink to="/admin/blood-banks" size="sm" variant="secondary">
              Add one
            </ButtonLink>
          }
        >
          Staff must belong to an active blood bank, and none exist yet.
        </Alert>
      ) : (
        <SelectField
          label={role === 'ADMIN' ? 'Blood bank (optional)' : 'Blood bank'}
          required={role === 'BLOOD_BANK_STAFF'}
          placeholder={banks.isLoading ? 'Loading…' : 'Select…'}
          options={(banks.data?.items ?? []).map((bank) => ({
            value: bank.id,
            label: `${bank.name} (${bank.code})`,
          }))}
          registration={form.register('bloodBankId', { setValueAs: (v: string) => v || undefined })}
          error={errors.bloodBankId?.message}
        />
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isSubmitting}>
          Send invitation
        </Button>
      </div>
    </form>
  );
}

export function InviteStaffDialog({
  open,
  onClose,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  onInvited: (user: UserSummary) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Invite staff member">
      {open && <InviteForm onCancel={onClose} onInvited={onInvited} />}
    </Modal>
  );
}
