export interface Mood {
  id: string
  emoji: string
  label: string
  /** 叶子配色（浅/深色下均可用，偏自然色系） */
  color: string
}

export const MOODS: Mood[] = [
  { id: 'joy', emoji: '😄', label: '开心', color: '#6FBF4B' },
  { id: 'calm', emoji: '😌', label: '平静', color: '#4FA88C' },
  { id: 'love', emoji: '🥰', label: '喜爱', color: '#E0729A' },
  { id: 'think', emoji: '🤔', label: '思考', color: '#6E8FD0' },
  { id: 'tired', emoji: '😴', label: '疲惫', color: '#C2A878' },
  { id: 'sad', emoji: '😢', label: '难过', color: '#7FA8CF' },
  { id: 'angry', emoji: '😠', label: '生气', color: '#D9634A' },
  { id: 'plain', emoji: '😐', label: '平常', color: '#9CB86A' },
]

export function getMood(id: string | null | undefined): Mood | undefined {
  if (!id) return undefined
  return MOODS.find((m) => m.id === id)
}
