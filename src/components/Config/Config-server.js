import { useConfig } from '../hooks/useConfig.js'

export function Config(values) {
  useConfig()(values)
  return null
}
