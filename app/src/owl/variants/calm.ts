import type { OwlVariant } from '../types'

/**
 * The same owl, slower. A behaviour-only variant: blinks rarely, looks without chasing,
 * breathes its lantern at half speed, and shakes its head less far.
 */
export default {
  id: 'calm',
  label: 'Calm',
  note: 'Slower blink, shorter gaze, a lantern that breathes at half speed.',
  design: {
    motion: {
      blinkPeriod: 11,
      gazeTravel: 0.18,
      gazeEase: 320,
      searchPeriod: 2.2,
      searchLow: 0.5,
      glowFade: 900,
      shakeTime: 640,
      shakeReach: 2,
    },
  },
} satisfies OwlVariant
