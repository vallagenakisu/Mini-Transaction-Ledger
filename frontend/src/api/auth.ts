import { post } from '@/api/client'
import type { LoginRequest, LoginResponse, RegisterRequest, User } from '@/types/api'

export function login(body: LoginRequest) {
  return post<LoginResponse>('/auth/login', body)
}

export function register(body: RegisterRequest) {
  return post<User>('/auth/register', body)
}
