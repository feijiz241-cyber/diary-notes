export interface Mood {
  id: string
  emoji: string
  label: string
  /** 叶子配色（清新马卡龙调，浅/深色下均清晰） */
  color: string
}

export const MOODS: Mood[] = [
  { id: 'joy', emoji: '😄', label: '开心', color: '#FDE68A' },
  { id: 'calm', emoji: '😌', label: '平静', color: '#BAE6FD' },
  { id: 'love', emoji: '🥰', label: '喜爱', color: '#FBCFE8' },
  { id: 'think', emoji: '🤔', label: '思考', color: '#D8B4FE' },
  { id: 'tired', emoji: '😴', label: '疲惫', color: '#CBD5E1' },
  { id: 'sad', emoji: '😢', label: '难过', color: '#99F6E4' },
  { id: 'angry', emoji: '😠', label: '生气', color: '#FCA5A5' },
  { id: 'plain', emoji: '😐', label: '平常', color: '#BBF7D0' },
]

export function getMood(id: string | null | undefined): Mood | undefined {
  if (!id) return undefined
  return MOODS.find((m) => m.id === id)
}
