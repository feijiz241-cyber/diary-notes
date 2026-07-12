/** 把一段原始输入规范成标签数组：按空白/逗号/顿号切分、去空格、去重。 */
export function normalizeTags(raw: string): string[] {
  const set = new Set<string>()
  for (const part of raw.split(/[\s,，、]+/)) {
    const t = part.trim()
    if (t) set.add(t)
  }
  return Array.from(set)
}

/** 切换某个标签的选中状态（已存在则移除，否则加入）。空串忽略。 */
export function toggleTag(tags: string[], tag: string): string[] {
  const t = tag.trim()
  if (!t) return tags
  return tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]
}
