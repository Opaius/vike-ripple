export function getTagAttributesString(attrs) {
	if (!attrs) return '';
	return Object.entries(attrs)
		.map(([k, v]) => {
			if (v === true) return ` ${k}`;
			if (!v) return '';
			return ` ${k}="${String(v).replace(/"/g, '&quot;')}"`;
		})
		.join('');
}
