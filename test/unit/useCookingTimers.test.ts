import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { useCookingTimers, type CookingTimerOptions, type CookingTimerSpec } from '../../app/composables/useCookingTimers'
import { createCookingAlarm, showTimerNotification, type CookingAlarm } from '../../app/utils/cookingAlarm'

/** Alarme factice : on vérifie quand elle sonne, pas le son. */
function fakeAlarm() {
  const alarm = { playing: false, unlock: vi.fn(), start: vi.fn(), stop: vi.fn() }
  alarm.start.mockImplementation(() => { alarm.playing = true })
  alarm.stop.mockImplementation(() => { alarm.playing = false })
  return alarm satisfies CookingAlarm
}

const spec = (overrides: Partial<CookingTimerSpec> = {}): CookingTimerSpec => ({
  key: 'step-3:600',
  stepNumber: 3,
  seconds: 600,
  durationLabel: '10 min',
  ...overrides
})

describe('useCookingTimers', () => {
  let scope: ReturnType<typeof effectScope>
  let alarm: ReturnType<typeof fakeAlarm>

  const setup = (options: CookingTimerOptions = {}) => {
    alarm = fakeAlarm()
    return scope.run(() => useCookingTimers({ alarm, ...options }))!
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'))
    scope = effectScope()
  })

  afterEach(() => {
    scope.stop()
    vi.useRealTimers()
  })

  it('lance un minuteur et décompte à partir d’une date de fin absolue', () => {
    const api = setup()
    const timer = api.start(spec())
    expect(timer.status).toBe('running')
    expect(timer.endsAt).toBe(Date.now() + 600_000)
    expect(api.timers.value[0]?.clock).toBe('10:00')

    vi.advanceTimersByTime(65_000)
    expect(api.timers.value[0]?.clock).toBe('08:55')
    expect(api.timers.value[0]?.status).toBe('running')
    expect(alarm.start).not.toHaveBeenCalled()
  })

  it('ne crée pas de doublon pour une même clé', () => {
    const api = setup()
    const first = api.start(spec())
    vi.advanceTimersByTime(30_000)
    const second = api.start(spec())
    expect(second).toBe(first)
    expect(api.timers.value).toHaveLength(1)
    expect(api.timers.value[0]?.clock).toBe('09:30')
    expect(api.isActive('step-3:600')).toBe(true)
    expect(api.isActive('autre')).toBe(false)
  })

  it('gère plusieurs minuteurs en parallèle', () => {
    const api = setup()
    api.start(spec())
    api.start(spec({ key: 'step-5:300', stepNumber: 5, seconds: 300, durationLabel: '5 min' }))
    expect(api.timers.value.map(timer => timer.stepNumber)).toEqual([3, 5])
    vi.advanceTimersByTime(300_000)
    expect(api.timers.value.map(timer => timer.status)).toEqual(['running', 'ringing'])
    expect(api.ringingCount.value).toBe(1)
  })

  it('sonne à l’échéance, une seule fois, et prévient onRing', () => {
    const onRing = vi.fn()
    const api = setup({ onRing })
    api.start(spec({ seconds: 5 }))
    vi.advanceTimersByTime(4_000)
    expect(onRing).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1_500)
    expect(onRing).toHaveBeenCalledTimes(1)
    expect(alarm.start).toHaveBeenCalledTimes(1)
    expect(api.timers.value[0]).toMatchObject({ status: 'ringing', remainingMs: 0, clock: '00:00' })
    expect(api.endedAnnouncement.value).toEqual({ stepNumber: 3, durationLabel: '10 min' })

    vi.advanceTimersByTime(10_000)
    expect(onRing).toHaveBeenCalledTimes(1)
  })

  it('annonce le lancement', () => {
    const api = setup()
    expect(api.startedAnnouncement.value).toBeNull()
    api.start(spec())
    expect(api.startedAnnouncement.value).toEqual({ stepNumber: 3, durationLabel: '10 min' })
  })

  it('reste juste après un onglet en arrière-plan (horloge gelée puis rattrapée)', () => {
    const api = setup()
    api.start(spec({ seconds: 60 }))
    // Les timers du navigateur sont suspendus : seule l'horloge avance.
    vi.setSystemTime(Date.now() + 90_000)
    expect(api.timers.value[0]?.status).toBe('running')

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(api.timers.value[0]?.status).toBe('ringing')
    expect(alarm.start).toHaveBeenCalled()
  })

  it('pause puis reprise : le temps restant est figé', () => {
    const api = setup()
    const timer = api.start(spec({ seconds: 120 }))
    vi.advanceTimersByTime(30_000)
    api.pause(timer.id)
    expect(api.timers.value[0]).toMatchObject({ status: 'paused', clock: '01:30' })

    vi.advanceTimersByTime(600_000)
    expect(api.timers.value[0]).toMatchObject({ status: 'paused', clock: '01:30' })
    expect(alarm.start).not.toHaveBeenCalled()

    api.resume(timer.id)
    vi.advanceTimersByTime(60_000)
    expect(api.timers.value[0]).toMatchObject({ status: 'running', clock: '00:30' })
    vi.advanceTimersByTime(31_000)
    expect(api.timers.value[0]?.status).toBe('ringing')
  })

  it('+1 min : en cours, en pause et sur une alarme', () => {
    const api = setup()
    const running = api.start(spec({ seconds: 60 }))
    api.addMinute(running.id)
    expect(api.timers.value[0]?.clock).toBe('02:00')

    api.pause(running.id)
    api.addMinute(running.id)
    expect(api.timers.value[0]?.clock).toBe('03:00')
    api.resume(running.id)

    vi.advanceTimersByTime(181_000)
    expect(api.timers.value[0]?.status).toBe('ringing')
    expect(alarm.playing).toBe(true)

    api.addMinute(running.id)
    expect(api.timers.value[0]).toMatchObject({ status: 'running', clock: '01:00' })
    expect(alarm.stop).toHaveBeenCalled()
    expect(alarm.playing).toBe(false)

    vi.advanceTimersByTime(61_000)
    expect(api.timers.value[0]?.status).toBe('ringing')
  })

  it('annuler retire le minuteur sans faire sonner ; fermer une alarme coupe le son', () => {
    const api = setup()
    const cancelled = api.start(spec({ seconds: 600 }))
    const ringing = api.start(spec({ key: 'b', stepNumber: 4, seconds: 5 }))
    api.remove(cancelled.id)
    expect(api.timers.value.map(timer => timer.id)).toEqual([ringing.id])

    vi.advanceTimersByTime(6_000)
    expect(alarm.playing).toBe(true)
    api.remove(ringing.id)
    expect(api.timers.value).toHaveLength(0)
    expect(alarm.playing).toBe(false)
    expect(api.hasTimers.value).toBe(false)
    // La clé est de nouveau libre.
    expect(api.isActive('b')).toBe(false)
  })

  it('l’alarme continue tant qu’une autre sonne encore', () => {
    const api = setup()
    const a = api.start(spec({ key: 'a', seconds: 5 }))
    const b = api.start(spec({ key: 'b', seconds: 5 }))
    vi.advanceTimersByTime(6_000)
    expect(api.ringingCount.value).toBe(2)
    api.remove(a.id)
    expect(alarm.playing).toBe(true)
    api.remove(b.id)
    expect(alarm.playing).toBe(false)
  })

  it('clearAll arrête tout, y compris l’alarme', () => {
    const api = setup()
    api.start(spec({ seconds: 5 }))
    api.start(spec({ key: 'b', seconds: 500 }))
    vi.advanceTimersByTime(6_000)
    api.clearAll()
    expect(api.timers.value).toHaveLength(0)
    expect(alarm.stop).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('n’entretient aucun intervalle quand plus rien ne tourne', () => {
    const api = setup()
    const timer = api.start(spec())
    expect(vi.getTimerCount()).toBe(1)
    api.pause(timer.id)
    expect(vi.getTimerCount()).toBe(0)
    api.resume(timer.id)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('libère tout à la destruction du scope', () => {
    const api = setup()
    api.start(spec({ seconds: 5 }))
    vi.advanceTimersByTime(6_000)
    scope.stop()
    expect(alarm.stop).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('débloque l’audio au lancement (geste utilisateur)', () => {
    const api = setup()
    api.start(spec())
    expect(alarm.unlock).toHaveBeenCalled()
  })
})

describe('createCookingAlarm', () => {
  const oscillators: { start: ReturnType<typeof vi.fn> }[] = []
  let vibrate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    oscillators.length = 0
    class FakeAudioContext {
      state = 'suspended'
      currentTime = 0
      destination = {}
      resume = vi.fn(() => { this.state = 'running'; return Promise.resolve() })
      createGain() {
        return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() }
      }

      createOscillator() {
        const oscillator = { type: '', frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() }
        oscillators.push(oscillator)
        return oscillator
      }
    }
    vi.stubGlobal('AudioContext', FakeAudioContext)
    // `window.AudioContext` : même objet global dans happy-dom.
    ;(window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext
    vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('bipe en boucle jusqu’à l’arrêt, avec vibration', async () => {
    const alarm = createCookingAlarm()
    alarm.unlock()
    await Promise.resolve()
    alarm.start()
    expect(alarm.playing).toBe(true)
    expect(oscillators).toHaveLength(3)
    expect(vibrate).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1800 * 2)
    expect(oscillators).toHaveLength(9)

    alarm.start()
    expect(oscillators).toHaveLength(9)

    alarm.stop()
    expect(alarm.playing).toBe(false)
    expect(vibrate).toHaveBeenLastCalledWith(0)
    vi.advanceTimersByTime(10_000)
    expect(oscillators).toHaveLength(9)
  })

  it('reste silencieuse (sans erreur) quand l’audio n’est pas débloqué', () => {
    ;(window as unknown as { AudioContext: unknown }).AudioContext = undefined
    const alarm = createCookingAlarm()
    expect(() => {
      alarm.start()
      alarm.stop()
    }).not.toThrow()
  })
})

describe('showTimerNotification', () => {
  const stubNotification = (permission: string) => {
    const notification = Object.assign(vi.fn(), { permission, requestPermission: vi.fn() })
    vi.stubGlobal('Notification', notification)
    return notification
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('ne fait rien sans permission déjà accordée (et ne la demande jamais)', async () => {
    const notification = stubNotification('default')
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    await showTimerNotification('Titre', 'Corps', 'tag')
    expect(notification).not.toHaveBeenCalled()
    expect(notification.requestPermission).not.toHaveBeenCalled()
  })

  it('notifie quand la permission est accordée et l’app en arrière-plan', async () => {
    const notification = stubNotification('granted')
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    await showTimerNotification('Titre', 'Corps', 'tag')
    expect(notification).toHaveBeenCalledWith('Titre', { body: 'Corps', tag: 'tag' })
  })

  it('reste muette quand l’app est au premier plan', async () => {
    const notification = stubNotification('granted')
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    await showTimerNotification('Titre', 'Corps', 'tag')
    expect(notification).not.toHaveBeenCalled()
  })
})
