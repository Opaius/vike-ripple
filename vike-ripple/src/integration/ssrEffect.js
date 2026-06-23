export { ssrEffect }

function ssrEffect({ configDefinedAt, configValue }) {
  if (typeof configValue !== 'boolean') throw new Error(`${configDefinedAt} should be a boolean`)
  return {
    meta: {
      Page: { env: { client: true, server: configValue !== false } },
      Layout: { env: { client: true, server: configValue !== false } },
      Wrapper: { env: { client: true, server: configValue !== false } },
    },
  }
}
