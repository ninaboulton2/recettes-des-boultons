import { describe, expect, it } from 'vitest'
import { fitWithin, IMAGE_MAX_EDGE, jpegName } from '../../app/utils/image'

describe('fitWithin', () => {
  it('réduit en gardant les proportions', () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 })
    expect(fitWithin(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 })
  })

  it('n\'agrandit jamais une petite image', () => {
    expect(fitWithin(800, 600, IMAGE_MAX_EDGE)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(2000, 1000, 2000)).toEqual({ width: 2000, height: 1000 })
  })

  it('garde au moins 1 pixel par côté', () => {
    expect(fitWithin(100000, 10, 2000)).toEqual({ width: 2000, height: 1 })
  })
})

describe('jpegName', () => {
  it('remplace l\'extension par .jpg', () => {
    expect(jpegName('IMG_0012.HEIC')).toBe('IMG_0012.jpg')
    expect(jpegName('page.livre.png')).toBe('page.livre.jpg')
    expect(jpegName('photo')).toBe('photo.jpg')
  })
})
