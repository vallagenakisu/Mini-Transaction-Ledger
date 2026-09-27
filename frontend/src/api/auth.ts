import { post } from '@/api/client'
import type { LoginRequest, LoginResponse } from '@/types/api'

export function login(body: LoginRequest) {
  return post<LoginResponse>('/auth/login', body)
}
