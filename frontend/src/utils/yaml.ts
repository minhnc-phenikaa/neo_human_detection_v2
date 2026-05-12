// ─── YAML Generator + Syntax Highlighter ─────────────────────────────────────

type YamlValue = string | number | boolean | null | YamlObject | YamlArray
type YamlObject = { [key: string]: YamlValue }
type YamlArray = YamlValue[]

function formatYamlValue(v: YamlValue): string {
  if (typeof v === 'string') return v
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return String(v)
  if (v === null) return 'null'
  return String(v)
}

export function jsonToYaml(obj: YamlObject, indent = 0): string {
  const pad = '  '.repeat(indent)
  const lines: string[] = []

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      lines.push(`${pad}${key}: null`)
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${pad}${key}: []`)
      } else {
        lines.push(`${pad}${key}:`)
        value.forEach((item) => {
          if (Array.isArray(item)) {
            // Inline array for points: - [x, y]
            lines.push(`${pad}- [${(item as number[]).join(', ')}]`)
          } else if (typeof item === 'object' && item !== null) {
            const entries = Object.entries(item as YamlObject)
            entries.forEach(([k, v], i) => {
              const prefix = i === 0 ? `${pad}- ` : `${pad}  `
              if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
                lines.push(`${prefix}${k}:`)
                lines.push(jsonToYaml(v as YamlObject, indent + 2))
              } else if (Array.isArray(v)) {
                lines.push(`${prefix}${k}:`)
                v.forEach((pt) => {
                  if (Array.isArray(pt)) lines.push(`${pad}    - [${(pt as number[]).join(', ')}]`)
                  else lines.push(`${pad}    - ${pt}`)
                })
              } else {
                lines.push(`${prefix}${k}: ${formatYamlValue(v)}`)
              }
            })
          } else {
            lines.push(`${pad}- ${formatYamlValue(item)}`)
          }
        })
      }
    } else if (typeof value === 'object') {
      lines.push(`${pad}${key}:`)
      lines.push(jsonToYaml(value as YamlObject, indent + 1))
    } else {
      lines.push(`${pad}${key}: ${formatYamlValue(value)}`)
    }
  }

  return lines.join('\n')
}

export function syntaxHighlightYAML(str: string): string {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^(\s*)(- )?([\w_]+)(:)/gm, (_m, sp, dash, key, colon) => {
      return `${sp}${dash || ''}<span class="yaml-key">${key}</span><span class="yaml-colon">${colon}</span>`
    })
    .replace(/:\s+(true|false)$/gm, (_m, val) => `: <span class="yaml-bool">${val}</span>`)
    .replace(/:\s+(-?\d+\.?\d*)$/gm, (_m, val) => `: <span class="yaml-number">${val}</span>`)
    .replace(/- \[(.*?)\]/g, (_m, inner) => `- [<span class="yaml-number">${inner}</span>]`)
}
