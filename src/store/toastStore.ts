import { create } from 'zustand'
import type { ToastTone, ToastItem } from '../components/ui/Toast'

interface ToastStore {
  toasts: ToastItem[]
  show: (tone: ToastTone, message: string, durationMs?: number) => void
  dismiss: (id: string) => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  show: (tone, message, durationMs = 3000) => {
    const id = crypto.randomUUID()
    const item: ToastItem = { id, tone, message }
    set((s) => ({ toasts: [...s.toasts, item] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, durationMs)
  },

  dismiss: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))
