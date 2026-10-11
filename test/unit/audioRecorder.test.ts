import { describe, expect, it } from 'vitest'
import {
  formatElapsed,
  pickRecorderMimeType,
  RECORDER_BITS_PER_SECOND,
  recorderErrorCode
} from '../../app/composables/useAudioRecorder'

describe('pickRecorderMimeType', () => {
  it('Chrome / Firefox : WebM Opus en premier', () => {
    expect(pickRecorderMimeType(() => true)).toBe('audio/webm;codecs=opus')
    expect(pickRecorderMimeType(type => type.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus')
  })

  it('Safari : audio/mp4 quand WebM n\'est pas disponible', () => {
    expect(pickRecorderMimeType(type => type === 'audio/mp4')).toBe('audio/mp4')
  })

  it('aucun format connu : laisse le navigateur choisir (undefined)', () => {
    expect(pickRecorderMimeType(() => false)).toBeUndefined()
  })
})

describe('recorderErrorCode', () => {
  it('distingue refus du micro, micro absent, navigateur incompatible et échec', () => {
    expect(recorderErrorCode({ name: 'NotAllowedError' })).toBe('denied')
    expect(recorderErrorCode({ name: 'SecurityError' })).toBe('denied')
    expect(recorderErrorCode({ name: 'NotFoundError' })).toBe('noDevice')
    expect(recorderErrorCode({ name: 'NotSupportedError' })).toBe('unsupported')
    expect(recorderErrorCode({ name: 'AbortError' })).toBe('failed')
    expect(recorderErrorCode(new Error('x'))).toBe('failed')
    expect(recorderErrorCode(null)).toBe('failed')
  })
})

describe('formatElapsed', () => {
  it('affiche m:ss', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(9.8)).toBe('0:09')
    expect(formatElapsed(75)).toBe('1:15')
    expect(formatElapsed(300)).toBe('5:00')
    expect(formatElapsed(-4)).toBe('0:00')
  })
})

describe('débit', () => {
  it('32 kbit/s : 5 minutes tiennent largement dans 4 Mo', () => {
    expect((RECORDER_BITS_PER_SECOND / 8) * 300).toBeLessThan(4 * 1024 * 1024)
  })
})
