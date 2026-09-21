import type { MainConfig } from './types.js'

export function parseMainConfig(text: string): MainConfig {
  return JSON.parse(text) as MainConfig
}
