import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, Plus } from 'lucide-react';
import { z } from 'zod';
import { createBloodBankSchema, type BloodBankView } from '@bbms/shared';
import { useApiQuery } from '@/hooks/useApiQuery';
import { usePermission } from '@/hooks/useAuth';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { CheckboxField, TextField } from '@/components/ui/fields';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { applyServerErrors } from '@/utils/formErrors';
import { bloodBanksApi } from '@/features/organisations/api';

const FIELDS = [
  'name',
  'code',
  'contactPhone',
  'contactEmail',
  'address.line1',
  'address.city',
  'address.state',
  'address.postalCode',
];
// The "active" checkbox only appears when editing an existing blood bank.
const formSchema = createBloodBankSchema.extend({ isActive: z.boolean().optional() });
type FormValues = z.infer<typeof formSchema>;

function BloodBankForm({
  bank,
  onSaved,
  onCancel,
}: {
  bank: BloodBankView | null;
  onSaved: (bank: BloodBankView) => void;
  onCancel: () => void;
}) {
  const [formError, setFormError] = useState<string>();
  const form = useForm<z.input<typeof formSchema>, unknown, FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: bank
      ? {
          name: bank.name,
          code: bank.code,
          address: bank.address,
          contactPhone: bank.contactPhone,
          contactEmail: bank.contactEmail,
          isActive: bank.isActive,
        }
      : { address: { line1: '', city: '', state: '', postalCode: '' } },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(undefined);
    try {
      const { isActive, ...details } = values;
      const saved = bank
        ? await bloodBanksApi.update(bank.id, {
            ...details,
            ...(isActive !== undefined && { isActive }),
          })
        : await bloodBanksApi.create(details);
      onSaved(saved);
    } catch (err) {
      setFormError(applyServerErrors(err, form.setError, FIELDS));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {formError && <Alert tone="error">{formError}</Alert>}
      <TextField
        label="Name"
        required
        registration={form.register('name')}
        error={errors.name?.message}
      />
      <TextField
        label="Code"
        required
        registration={form.register('code')}
        error={errors.code?.message}
        hint="Short unique identifier, e.g. PUN-CENTRAL."
      />
      <TextField
        label="Address"
        required
        registration={form.register('address.line1')}
        error={errors.address?.line1?.message}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label="City"
          required
          registration={form.register('address.city')}
          error={errors.address?.city?.message}
        />
        <TextField
          label="State"
          required
          registration={form.register('address.state')}
          error={errors.address?.state?.message}
        />
        <TextField
          label="Postal code"
          required
          registration={form.register('address.postalCode')}
          error={errors.address?.postalCode?.message}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Contact phone"
          type="tel"
          required
          registration={form.register('contactPhone')}
          error={errors.contactPhone?.message}
        />
        <TextField
          label="Contact email"
          type="email"
          required
          registration={form.register('contactEmail')}
          error={errors.contactEmail?.message}
        />
      </div>
      {bank && (
        <CheckboxField registration={form.register('isActive')}>
          Active — inactive blood banks cannot receive new staff
        </CheckboxField>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isSubmitting}>
          {bank ? 'Save changes' : 'Create blood bank'}
        </Button>
      </div>
    </form>
  );
}

export function BloodBanksPage() {
  const canManage = usePermission('bloodBanks:manage');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<BloodBankView | 'new' | null>(null);
  const [notice, setNotice] = useState<string>();
  const { data, error, isLoading, refetch } = useApiQuery(
    () => bloodBanksApi.list({ page, limit: 20 }),
    [page],
  );

  return (
    <>
      <PageHeader
        title="Blood banks"
        description="Participating blood banks. Staff accounts and inventory belong to one."
        actions={
          canManage && (
            <Button
              icon={<Plus className="size-4" aria-hidden />}
              onClick={() => setEditing('new')}
            >
              Add blood bank
            </Button>
          )
        }
      />
      {notice && <Alert tone="success">{notice}</Alert>}
      <Card>
        {isLoading && <LoadingState />}
        {error && <ErrorState error={error} onRetry={refetch} />}
        {data && data.items.length === 0 && (
          <EmptyState
            icon={<Building2 className="size-6" aria-hidden />}
            title="No blood banks yet"
            description="Add your blood bank before inviting staff."
            action={canManage && <Button onClick={() => setEditing('new')}>Add blood bank</Button>}
          />
        )}
        {data && data.items.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Blood bank
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      City
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Contact
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Staff
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Status
                    </th>
                    {canManage && (
                      <th scope="col" className="px-5 py-3">
                        <span className="sr-only">Actions</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((bank) => (
                    <tr key={bank.id}>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900">{bank.name}</p>
                        <p className="text-xs text-slate-500">{bank.code}</p>
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {bank.address.city}, {bank.address.state}
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {bank.contactPhone}
                        <p className="text-xs text-slate-500">{bank.contactEmail}</p>
                      </td>
                      <td className="px-5 py-3 text-slate-700">{bank.staffCount}</td>
                      <td className="px-5 py-3">
                        <Badge tone={bank.isActive ? 'success' : 'muted'}>
                          {bank.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      {canManage && (
                        <td className="px-5 py-3 text-right">
                          <Button size="sm" variant="secondary" onClick={() => setEditing(bank)}>
                            Edit
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination meta={data.meta} onPageChange={setPage} />
          </>
        )}
      </Card>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add blood bank' : 'Edit blood bank'}
      >
        {editing !== null && (
          <BloodBankForm
            bank={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={(bank) => {
              setNotice(`${bank.name} saved.`);
              setEditing(null);
              refetch();
            }}
          />
        )}
      </Modal>
    </>
  );
}
