export { getHeadSetting }

function getHeadSetting(key, pageContext) {
  const value = pageContext.config[key]
  if (value !== undefined && value !== null) return value
  return pageContext._configViaHook?.[key] ?? null
}
