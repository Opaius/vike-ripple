import { useConfig } from '../hooks/useConfig.js'

export function Head({ children }) {
  const config = useConfig()
  config({ Head: children })
  return null
}
