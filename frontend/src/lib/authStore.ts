import { create } from 'zustand'

type AuthUser = { id: string; email: string; phoneNumber: string | null }

type AuthState = {
  token: string | null
  user: AuthUser | null
  setAuth: (token: string, user: AuthUser) => void
  clearAuth: () => void
}

const stored = localStorage.getItem('auth')
const initial = stored ? (JSON.parse(stored) as { token: string; user: AuthUser }) : null

export const useAuthStore = create<AuthState>(set => ({
  token: initial?.token ?? null,
  user: initial?.user ?? null,
  setAuth: (token, user) => {
    localStorage.setItem('auth', JSON.stringify({ token, user }))
    set({ token, user })
  },
  clearAuth: () => {
    localStorage.removeItem('auth')
    set({ token: null, user: null })
  },
}))
