import type { ToastProps } from '@nuxt/ui'

type ToastKind = 'success' | 'error' | 'info' | 'warning'

const ICONS: Record<ToastKind, string> = {
  success: 'i-lucide-circle-check',
  error: 'i-lucide-circle-alert',
  info: 'i-lucide-info',
  warning: 'i-lucide-triangle-alert'
}

const COLORS: Record<ToastKind, NonNullable<ToastProps['color']>> = {
  success: 'success',
  error: 'error',
  info: 'info',
  warning: 'warning'
}

/**
 * `$toast` : façade de compatibilité au-dessus de `useToast()` (Nuxt UI).
 *
 * API conservée pour les pages historiques :
 * `$toast.success(title, message?, duration?)`, idem `error` / `info` /
 * `warning`, et `$toast.show(title, message?, type?, duration?)`.
 * Le nouveau code peut appeler `useToast().add(...)` directement.
 */
export default defineNuxtPlugin(() => {
  const toast = useToast()

  const show = (title: string, message = '', type: ToastKind = 'info', duration = 3000) => {
    toast.add({
      title,
      description: message || undefined,
      color: COLORS[type],
      icon: ICONS[type],
      duration
    })
  }

  const make = (type: ToastKind) => (title: string, message = '', duration = 3000) =>
    show(title, message, type, duration)

  return {
    provide: {
      toast: {
        show,
        success: make('success'),
        error: make('error'),
        info: make('info'),
        warning: make('warning')
      }
    }
  }
})
