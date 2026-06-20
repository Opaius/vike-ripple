export { Config }

import { useConfig } from '../../hooks/useConfig/useConfig-server.js'

function Config(props) {
  useConfig()(props)
  return null
}
