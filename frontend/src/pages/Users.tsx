import { useState } from 'react'
import { toast } from 'sonner'

import { ApiError } from '@/api/client'
import { listUsers, updateUser } from '@/api/users'
import { useAuth } from '@/auth/useAuth'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SkeletonRows } from '@/components/ui/skeleton'
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table'
import { useApi } from '@/hooks/useApi'
import type { ManagedUser, UpdateUserRequest, UserRole } from '@/types/api'

export default function Users() {
  const { user: me } = useAuth()
  const users = useApi(() => listUsers(), [])
  const [busyId, setBusyId] = useState<number | null>(null)

  async function change(target: ManagedUser, body: UpdateUserRequest, done: string) {
    setBusyId(target.id)
    try {
      await updateUser(target.id, body)
      toast.success(done)
      users.reload()
    } catch (caught: unknown) {
      toast.error(caught instanceof ApiError ? caught.message : 'Update failed.')
    } finally {
      setBusyId(null)
    }
  }

  const list = users.data ?? []
  const waiting = list.filter((u) => !u.isActive).length

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin"
        title="Users"
        actions={waiting > 0 ? <Badge tone="credit">{waiting} not active</Badge> : null}
      />

      <Panel>
        {users.error ? (
          <ErrorState error={users.error} onRetry={users.reload} />
        ) : users.loading && !users.data ? (
          <SkeletonRows rows={4} cols={4} />
        ) : list.length === 0 ? (
          <EmptyState title="No users" />
        ) : (
          <div className="overflow-x-auto px-2 py-3">
            <Table>
              <THead>
                <tr>
                  <TH>Name</TH>
                  <TH>Email</TH>
                  <TH className="w-40">Role</TH>
                  <TH className="w-28">Status</TH>
                  <TH align="right" className="w-32" />
                </tr>
              </THead>
              <TBody>
                {list.map((u) => {
                  const self = u.id === me?.id
                  const busy = busyId === u.id

                  return (
                    <TR key={u.id}>
                      <TD className="font-medium text-ink">
                        {u.fullName}
                        {self ? <span className="ml-2 eyebrow">You</span> : null}
                      </TD>
                      <TD className="num text-[0.8125rem] text-muted">{u.email}</TD>
                      <TD>
                        {self ? (
                          <span className="text-[0.875rem]">{u.role}</span>
                        ) : (
                          <Select
                            value={u.role}
                            disabled={busy}
                            onValueChange={(role) =>
                              change(u, { role: role as UserRole }, `${u.fullName} is now ${role}`)
                            }
                          >
                            <SelectTrigger className="h-8 w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Accountant">Accountant</SelectItem>
                              <SelectItem value="Admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </TD>
                      <TD>
                        {u.isActive ? (
                          <Badge tone="balanced">Active</Badge>
                        ) : (
                          <Badge tone="outline">Not active</Badge>
                        )}
                      </TD>
                      <TD align="right">
                        {self ? null : u.isActive ? (
                          <Button
                            variant="quiet"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              change(u, { isActive: false }, `Deactivated ${u.fullName}`)
                            }
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => change(u, { isActive: true }, `Approved ${u.fullName}`)}
                          >
                            Approve
                          </Button>
                        )}
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </div>
        )}
      </Panel>
    </div>
  )
}
