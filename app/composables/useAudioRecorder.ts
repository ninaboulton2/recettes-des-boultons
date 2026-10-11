import { AUDIO_MAX_SECONDS } from '#shared/schemas/media'

/**
 * Dictaphone du navigateur (MediaRecorder) pour dicter une recette.
 *
 * - Chrome / Firefox / Android produisent de l'audio/webm (Opus), Safari et iOS
 *   de l'audio/mp4 : le format est choisi parmi `RECORDER_MIME_CANDIDATES` ;
 *   le serveur accepte les deux (`sniffAudioType`).
 * - Débit limité à 32 kbit/s (suffisant pour la voix) : 5 minutes ≈ 1,2 Mo,
 *   très en dessous des 4 Mo d'une requête.
 * - Arrêt automatique à `AUDIO_MAX_SECONDS` (5 min) ; le micro est toujours
 *   relâché à l'arrêt, à l'annulation et au démontage.
 * - Les erreurs sont des codes (`RecorderErrorCode`) traduits par le composant.
 *
 * `supported` est vrai tant que le montage n'a pas eu lieu (rendu serveur,
 * pas de mismatch d'hydratation) puis reflète le navigateur.
 */

export type RecorderErrorCode = 'unsupported' | 'denied' | 'noDevice' | 'failed' | 'tooShort'
export type RecorderStatus = 'idle' | 'requesting' | 'recording'

export interface RecordedAudio {
  blob: Blob
  durationSeconds: number
}

export const RECORDER_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
export const RECORDER_BITS_PER_SECOND = 32_000
/** En dessous, l'enregistrement est écarté (déclenchement involontaire). */
export const RECORDER_MIN_SECONDS = 1

/** Premier format enregistrable par le navigateur, `undefined` pour laisser le navigateur choisir. */
export function pickRecorderMimeType(isTypeSupported: (mimeType: string) => boolean): string | undefined {
  return RECORDER_MIME_CANDIDATES.find(candidate => isTypeSupported(candidate))
}

/** Erreur de `getUserMedia` / `MediaRecorder` → code d'erreur affichable. */
export function recorderErrorCode(error: unknown): RecorderErrorCode {
  const name = typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
    case 'PermissionDeniedError':
      return 'denied'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'noDevice'
    case 'NotSupportedError':
      return 'unsupported'
    default:
      return 'failed'
  }
}

/** `75` → `1:15`. */
export function formatElapsed(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

export function isRecordingSupported(): boolean {
  return typeof window !== 'undefined'
    && typeof window.MediaRecorder !== 'undefined'
    && typeof navigator !== 'undefined'
    && typeof navigator.mediaDevices?.getUserMedia === 'function'
}

export function useAudioRecorder(onRecorded: (audio: RecordedAudio) => void, maxSeconds: number = AUDIO_MAX_SECONDS) {
  const supported = ref(true)
  const status = ref<RecorderStatus>('idle')
  const elapsed = ref(0)
  const errorCode = ref<RecorderErrorCode | null>(null)
  /** Vrai quand l'arrêt vient de la durée maximale (et non d'un clic). */
  const reachedLimit = ref(false)

  let recorder: MediaRecorder | null = null
  let stream: MediaStream | null = null
  let chunks: Blob[] = []
  let startedAt = 0
  let timer: ReturnType<typeof setInterval> | undefined
  let discard = false
  let disposed = false

  function releaseMicrophone(): void {
    stream?.getTracks().forEach(track => track.stop())
    stream = null
    if (timer !== undefined) clearInterval(timer)
    timer = undefined
  }

  function handleStop(mimeType: string): void {
    const durationSeconds = Math.round((Date.now() - startedAt) / 100) / 10
    const wasDiscarded = discard
    releaseMicrophone()
    recorder = null
    status.value = 'idle'
    const blob = new Blob(chunks, { type: mimeType })
    chunks = []
    if (wasDiscarded) return
    if (durationSeconds < RECORDER_MIN_SECONDS || blob.size === 0) {
      errorCode.value = 'tooShort'
      return
    }
    onRecorded({ blob, durationSeconds })
  }

  async function start(): Promise<void> {
    if (status.value !== 'idle') return
    errorCode.value = null
    reachedLimit.value = false
    if (!isRecordingSupported()) {
      supported.value = false
      errorCode.value = 'unsupported'
      return
    }
    status.value = 'requesting'
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (disposed) {
        // Le composant a disparu pendant la demande d'autorisation : on relâche le micro.
        releaseMicrophone()
        return
      }
      const mimeType = pickRecorderMimeType(type => MediaRecorder.isTypeSupported(type))
      try {
        recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: RECORDER_BITS_PER_SECOND })
      } catch {
        recorder = new MediaRecorder(stream)
      }
      const active = recorder
      chunks = []
      discard = false
      active.addEventListener('dataavailable', (event: BlobEvent) => {
        if (event.data.size > 0) chunks.push(event.data)
      })
      active.addEventListener('stop', () => handleStop(active.mimeType || mimeType || 'audio/webm'))
      active.addEventListener('error', () => {
        errorCode.value = 'failed'
        discard = true
        if (active.state !== 'inactive') active.stop()
      })
      startedAt = Date.now()
      elapsed.value = 0
      active.start()
      status.value = 'recording'
      timer = setInterval(() => {
        elapsed.value = (Date.now() - startedAt) / 1000
        if (elapsed.value >= maxSeconds) {
          reachedLimit.value = true
          stop()
        }
      }, 250)
    } catch (error: unknown) {
      releaseMicrophone()
      recorder = null
      status.value = 'idle'
      errorCode.value = recorderErrorCode(error)
    }
  }

  /** Arrête l'enregistrement et remet l'audio à `onRecorded`. */
  function stop(): void {
    if (recorder && recorder.state !== 'inactive') recorder.stop()
  }

  /** Arrête et jette l'enregistrement. */
  function cancel(): void {
    discard = true
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    else releaseMicrophone()
  }

  onMounted(() => {
    supported.value = isRecordingSupported()
  })
  onBeforeUnmount(() => {
    disposed = true
    cancel()
  })

  return { supported, status, elapsed, errorCode, reachedLimit, maxSeconds, start, stop, cancel }
}
