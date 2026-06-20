export { getHeadSetting }

function getHeadSetting(key, pageContext) {
  const v = pageContext.config[key]
  if (v !== undefined && v !== null) return v
  return pageContext._configViaHook?.[key] ?? null
}
