import { useState } from 'react';
import { MailPlus, Search, UserPlus } from 'lucide-react';
import {
  ACCOUNT_STATUSES,
  ROLE_LABELS,
  ROLES,
  type AccountStatus,
  type Role,
  type UserSummary,
} from '@bbms/shared';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useAuth } from '@/hooks/useAuth';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Alert } from '@/components/ui/Alert';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { Input } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/fields';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { toApiClientError } from '@/services/apiError';
import { usersApi } from '../api';
import { InviteStaffDialog } from '../components/InviteStaffDialog';
import { staffApi } from '@/features/organisations/api';

const STATUS_TONE: Record<AccountStatus, BadgeTone> = {
  ACTIVE: 'success',
  PENDING: 'warning',
  SUSPENDED: 'critical',
  DEACTIVATED: 'muted',
};

const STATUS_LABEL: Record<AccountStatus, string> = {
  ACTIVE: 'Active',
  PENDING: 'Invitation pending',
  SUSPENDED: 'Suspended',
  DEACTIVATED: 'Deactivated',
};

interface PendingChange {
  user: UserSummary;
  status: 'ACTIVE' | 'SUSPENDED';
}

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const [page, setPage] = useState(1);
  const [role, setRole] = useState<Role | ''>('');
  const [status, setStatus] = useState<AccountStatus | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput.trim());
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string }>();
  const [inviteOpen, setInviteOpen] = useState(false);

  const query = {
    page,
    limit: 20,
    ...(role && { role }),
    ...(status && { status }),
    ...(search && { search }),
  };
  const { data, error, isLoading, refetch } = useApiQuery(() => usersApi.list(query), [query]);

  const changeFilter =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(1);
    };

  const applyChange = async (reason?: string) => {
    if (!pending || !reason) return;
    setSaving(true);
    try {
      await usersApi.updateStatus(pending.user.id, { status: pending.status, reason });
      setNotice({
        tone: 'success',
        text: `${pending.user.name} is now ${pending.status === 'ACTIVE' ? 'active' : 'suspended'}.`,
      });
      refetch();
    } catch (err) {
      setNotice({ tone: 'error', text: toApiClientError(err).message });
    } finally {
      setSaving(false);
      setPending(null);
    }
  };

  const resend = async (user: UserSummary) => {
    try {
      await staffApi.resendInvite(user.id);
      setNotice({ tone: 'success', text: `A new invitation was sent to ${user.email}.` });
    } catch (err) {
      setNotice({ tone: 'error', text: toApiClientError(err).message });
    }
  };

  return (
    <>
      <PageHeader
        title="Users"
        description="All accounts on the platform. Status changes are audited."
        actions={
          <Button
            icon={<UserPlus className="size-4" aria-hidden />}
            onClick={() => setInviteOpen(true)}
          >
            Invite staff
          </Button>
        }
      />

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              type="search"
              placeholder="Search name or email"
              aria-label="Search users"
              className="pl-9"
              value={searchInput}
              onChange={(e) => changeFilter(setSearchInput)(e.target.value)}
            />
          </div>
          <Select
            aria-label="Filter by role"
            value={role}
            onChange={(e) => changeFilter(setRole)(e.target.value as Role | '')}
          >
            <option value="">All roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => changeFilter(setStatus)(e.target.value as AccountStatus | '')}
          >
            <option value="">All statuses</option>
            {ACCOUNT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>

        {isLoading && <LoadingState label="Loading users…" />}
        {error && <ErrorState error={error} onRetry={refetch} />}
        {data && data.items.length === 0 && (
          <EmptyState title="No users found" description="Try a different search or filter." />
        )}
        {data && data.items.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Name
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Role
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Status
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Last sign-in
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((u) => (
                    <tr key={u.id}>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900">{u.name}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {ROLE_LABELS[u.role]}
                        {u.bloodBank && (
                          <p className="text-xs text-slate-500">{u.bloodBank.name}</p>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={STATUS_TONE[u.accountStatus]}>
                          {STATUS_LABEL[u.accountStatus]}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {u.id !== currentUser?.id &&
                          (u.accountStatus === 'PENDING' ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              icon={<MailPlus className="size-4" aria-hidden />}
                              onClick={() => void resend(u)}
                            >
                              Resend invite
                            </Button>
                          ) : u.accountStatus === 'ACTIVE' ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setPending({ user: u, status: 'SUSPENDED' })}
                            >
                              Suspend
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setPending({ user: u, status: 'ACTIVE' })}
                            >
                              Reactivate
                            </Button>
                          ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination meta={data.meta} onPageChange={setPage} />
          </>
        )}
      </Card>

      <InviteStaffDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={(user) => {
          setInviteOpen(false);
          setNotice({ tone: 'success', text: `Invitation sent to ${user.email}.` });
          refetch();
        }}
      />

      <ConfirmationDialog
        open={!!pending}
        title={pending?.status === 'SUSPENDED' ? 'Suspend account' : 'Reactivate account'}
        description={
          pending?.status === 'SUSPENDED'
            ? `${pending.user.name} will be signed out everywhere immediately and cannot sign in until reactivated.`
            : `${pending?.user.name} will be able to sign in again.`
        }
        confirmLabel={pending?.status === 'SUSPENDED' ? 'Suspend' : 'Reactivate'}
        tone={pending?.status === 'SUSPENDED' ? 'danger' : 'primary'}
        requireReason
        isLoading={saving}
        onConfirm={applyChange}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
