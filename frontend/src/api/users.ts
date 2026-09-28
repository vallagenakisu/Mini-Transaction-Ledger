import { get, patch } from '@/api/client'
import type { ManagedUser, UpdateUserRequest } from '@/types/api'

export function listUsers() {
  return get<ManagedUser[]>('/users')
}

export function updateUser(id: number, body: UpdateUserRequest) {
  return patch<ManagedUser>(`/users/${id}`, body)
}
