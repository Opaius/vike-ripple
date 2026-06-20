export function getTagAttributesString(attributes) {
  if (!attributes) return ''
  return Object.entries(attributes)
    .map(([key, value]) => {
      if (value === true) return ` ${key}`
      if (value === false || value === null || value === undefined) return ''
      return ` ${key}="${String(value).replace(/"/g, '&quot;')}"`
    })
    .join('')
}
