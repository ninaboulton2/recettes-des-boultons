import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { formatClock } from '#shared/utils/duration'
import { createCookingAlarm, type CookingAlarm } from '~/utils/cookingAlarm'

/**
 * Minuteurs du mode cuisine : plusieurs en parallèle, chacun identifié par une
 * clé (étape + durée) pour ne jamais lancer de doublon.
 *
 * Chaque minuteur repose sur une date de fin ABSOLUE (`endsAt`, ms epoch) : le
 * décompte reste juste même si l'onglet est mis en arrière-plan (timers
 * navigateur ralentis) ou l'écran verrouillé ; au retour (`visibilitychange`) on
 * recalcule tout de suite. Une pause fige le temps restant, la reprise recalcule
 * une date de fin.
 *
 * États : `running` → `ringing` (alarme : son en boucle, vibration, annonce,
 * notification système si la permission est DÉJÀ accordée) → retiré par
 * `remove`. « +1 min » sur une alarme la relance pour une minute.
 */
export type CookingTimerStatus = 'running' | 'paused' | 'ringing'

export interface CookingTimerSpec {
  /** Clé unique (ex. `<idÉtape>:<secondes>`) : un seul minuteur par clé. */
  key: string
  /** Numéro de l'étape affiché dans le mode cuisine (1…n). */
  stepNumber: number
  /** Durée du minuteur en secondes. */
  seconds: number
  /** Libellé court de la durée : « 12 min », « 10–12 min »… */
  durationLabel: string
}

export interface CookingTimer extends CookingTimerSpec {
  id: string
  status: CookingTimerStatus
  /** Fin absolue (ms epoch) ; `null` en pause. */
  endsAt: number | null
  /** Temps restant figé en pause (ms). */
  pausedRemainingMs: number
}

export interface CookingTimerView extends CookingTimer {
  remainingMs: number
  /** Décompte lisible : « 08:42 ». */
  clock: string
}

export interface CookingTimerOptions {
  /** Horloge (ms epoch), `Date.now` par défaut. */
  now?: () => number
  alarm?: CookingAlarm
  /** Appelé quand un minuteur sonne (notification système, journalisation…). */
  onRing?: (timer: CookingTimer) => void
}

const TICK_MS = 250
const ADD_MS = 60_000

export function useCookingTimers(options: CookingTimerOptions = {}) {
  const clock = options.now ?? (() => Date.now())
  const alarm = options.alarm ?? createCookingAlarm()

  const timers = ref<CookingTimer[]>([])
  const now = ref(clock())
  /** Annonces pour lecteurs d'écran : `started` (poli) et `ended` (assertif). */
  const startedAnnouncement = shallowRef<{ stepNumber: number, durationLabel: string } | null>(null)
  const endedAnnouncement = shallowRef<{ stepNumber: number, durationLabel: string } | null>(null)

  let interval: ReturnType<typeof setInterval> | null = null
  let counter = 0

  const hasRunning = () => timers.value.some(timer => timer.status === 'running')

  const syncAlarm = () => {
    if (timers.value.some(timer => timer.status === 'ringing')) alarm.start()
    else alarm.stop()
  }

  const ring = (timer: CookingTimer) => {
    timer.status = 'ringing'
    timer.endsAt = null
    timer.pausedRemainingMs = 0
    endedAnnouncement.value = { stepNumber: timer.stepNumber, durationLabel: timer.durationLabel }
    alarm.start()
    options.onRing?.(timer)
  }

  /** Met à jour l'horloge et fait sonner les minuteurs arrivés à échéance. */
  const tick = () => {
    now.value = clock()
    for (const timer of timers.value) {
      if (timer.status === 'running' && timer.endsAt !== null && timer.endsAt <= now.value) ring(timer)
    }
    if (!hasRunning()) stopTicking()
  }

  const startTicking = () => {
    if (interval || typeof window === 'undefined') return
    interval = setInterval(tick, TICK_MS)
  }
  function stopTicking() {
    if (interval) clearInterval(interval)
    interval = null
  }

  const find = (id: string) => timers.value.find(timer => timer.id === id)

  /** Lance un minuteur ; renvoie l'existant (sans le relancer) si la clé est déjà prise. */
  const start = (spec: CookingTimerSpec): CookingTimer => {
    const existing = timers.value.find(timer => timer.key === spec.key)
    if (existing) return existing
    alarm.unlock()
    now.value = clock()
    counter += 1
    timers.value.push({
      ...spec,
      id: `cooking-timer-${counter}`,
      status: 'running',
      endsAt: now.value + spec.seconds * 1000,
      pausedRemainingMs: 0
    })
    const created = timers.value[timers.value.length - 1] as CookingTimer
    startedAnnouncement.value = { stepNumber: spec.stepNumber, durationLabel: spec.durationLabel }
    startTicking()
    return created
  }

  const pause = (id: string) => {
    const timer = find(id)
    if (!timer || timer.status !== 'running' || timer.endsAt === null) return
    now.value = clock()
    timer.pausedRemainingMs = Math.max(0, timer.endsAt - now.value)
    timer.endsAt = null
    timer.status = 'paused'
    if (!hasRunning()) stopTicking()
  }

  const resume = (id: string) => {
    const timer = find(id)
    if (!timer || timer.status !== 'paused') return
    alarm.unlock()
    now.value = clock()
    timer.endsAt = now.value + timer.pausedRemainingMs
    timer.pausedRemainingMs = 0
    timer.status = 'running'
    startTicking()
  }

  /** +1 min ; sur une alarme, la coupe et relance le minuteur pour une minute. */
  const addMinute = (id: string) => {
    const timer = find(id)
    if (!timer) return
    now.value = clock()
    if (timer.status === 'running' && timer.endsAt !== null) {
      timer.endsAt += ADD_MS
    } else if (timer.status === 'paused') {
      timer.pausedRemainingMs += ADD_MS
    } else {
      alarm.unlock()
      timer.status = 'running'
      timer.endsAt = now.value + ADD_MS
      startTicking()
      syncAlarm()
    }
  }

  /** Annule un minuteur (en cours ou en pause) ou ferme une alarme. */
  const remove = (id: string) => {
    timers.value = timers.value.filter(timer => timer.id !== id)
    if (!hasRunning()) stopTicking()
    syncAlarm()
  }

  const clearAll = () => {
    timers.value = []
    stopTicking()
    alarm.stop()
  }

  const isActive = (key: string) => timers.value.some(timer => timer.key === key)

  const views = computed<CookingTimerView[]>(() => timers.value.map((timer) => {
    const remainingMs = timer.status === 'running' && timer.endsAt !== null
      ? Math.max(0, timer.endsAt - now.value)
      : timer.pausedRemainingMs
    return { ...timer, remainingMs, clock: formatClock(remainingMs / 1000) }
  }))
  const hasTimers = computed(() => timers.value.length > 0)
  const ringingCount = computed(() => timers.value.filter(timer => timer.status === 'ringing').length)

  const onVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') tick()
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange)

  onScopeDispose(() => {
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange)
    clearAll()
  })

  return {
    timers: views,
    hasTimers,
    ringingCount,
    startedAnnouncement,
    endedAnnouncement,
    alarm,
    start,
    pause,
    resume,
    addMinute,
    remove,
    clearAll,
    isActive,
    tick
  }
}
