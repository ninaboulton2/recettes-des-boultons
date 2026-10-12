/**
 * Alarme sonore du minuteur : bips générés par Web Audio (aucun fichier audio),
 * répétés tant qu'on ne l'arrête pas, avec vibration là où elle existe.
 *
 * Les navigateurs (iOS Safari surtout) n'autorisent le son qu'après un geste de
 * l'utilisateur : `unlock()` crée et réveille le contexte audio, il est appelé
 * depuis les clics / touches qui lancent un minuteur ou naviguent dans le mode
 * cuisine. Sans ce geste préalable, l'alarme reste silencieuse (vibration,
 * surbrillance et notification prennent le relais).
 */
export interface CookingAlarm {
  /** À appeler dans un geste utilisateur (clic, touche). */
  unlock: () => void
  /** Démarre la boucle de bips (sans effet si déjà en cours). */
  start: () => void
  /** Arrête les bips et la vibration. */
  stop: () => void
  readonly playing: boolean
}

type AudioContextCtor = typeof AudioContext

const BEEP_FREQUENCY = 880
const BEEP_SECONDS = 0.16
const BEEP_GAP_SECONDS = 0.1
const BEEPS_PER_BURST = 3
const BURST_INTERVAL_MS = 1800
const VIBRATION_PATTERN = [250, 120, 250, 120, 250]

export function createCookingAlarm(): CookingAlarm {
  let context: AudioContext | null = null
  let timer: ReturnType<typeof setInterval> | null = null

  const contextClass = (): AudioContextCtor | undefined => {
    if (typeof window === 'undefined') return undefined
    return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext
  }

  const unlock = () => {
    try {
      const Ctor = contextClass()
      if (!Ctor) return
      context ??= new Ctor()
      if (context.state === 'suspended') void context.resume().catch(() => {})
    } catch {
      // Audio indisponible : l'alarme reste visuelle.
    }
  }

  const burst = () => {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(VIBRATION_PATTERN)
    } catch {
      // Vibration refusée (pas de geste préalable, appareil sans moteur…).
    }
    const audio = context
    if (!audio || audio.state !== 'running') return
    const start = audio.currentTime + 0.02
    for (let index = 0; index < BEEPS_PER_BURST; index++) {
      const at = start + index * (BEEP_SECONDS + BEEP_GAP_SECONDS)
      const oscillator = audio.createOscillator()
      const gain = audio.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = BEEP_FREQUENCY
      // Enveloppe courte : évite le « clic » de début et de fin.
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(0.35, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + BEEP_SECONDS)
      oscillator.connect(gain)
      gain.connect(audio.destination)
      oscillator.start(at)
      oscillator.stop(at + BEEP_SECONDS + 0.02)
    }
  }

  const start = () => {
    if (timer) return
    unlock()
    burst()
    timer = setInterval(burst, BURST_INTERVAL_MS)
  }

  const stop = () => {
    if (timer) clearInterval(timer)
    timer = null
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(0)
    } catch {
      // Rien à annuler.
    }
  }

  return {
    unlock,
    start,
    stop,
    get playing() {
      return timer !== null
    }
  }
}

/**
 * Notification système de fin de minuteur, UNIQUEMENT si la permission est déjà
 * accordée (on ne la demande jamais) et si l'application n'est pas au premier
 * plan (sinon l'alerte à l'écran suffit). Passe par le service worker quand il
 * existe (seule voie qui marche sur Android Chrome), sinon `new Notification`.
 */
export async function showTimerNotification(title: string, body: string, tag: string): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  if (typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus()) return
  try {
    const registration = await navigator.serviceWorker?.getRegistration?.()
    if (registration) {
      await registration.showNotification(title, { body, tag, icon: '/pwa-192x192.png', requireInteraction: true })
      return
    }
    new Notification(title, { body, tag })
  } catch {
    // Notification refusée par le navigateur : l'alerte à l'écran reste.
  }
}
