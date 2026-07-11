export interface Mood {
  id: string
  emoji: string
  label: string
}

export const MOODS: Mood[] = [
  { id: 'joy', emoji: '😄', label: '开心' },
  { id: 'calm', emoji: '😌', label: '平静' },
  { id: 'love', emoji: '🥰', label: '喜爱' },
  { id: 'think', emoji: '🤔', label: '思考' },
  { id: 'tired', emoji: '😴', label: '疲惫' },
  { id: 'sad', emoji: '😢', label: '难过' },
  { id: 'angry', emoji: '😠', label: '生气' },
  { id: 'plain', emoji: '😐', label: '平常' },
]

export function getMood(id: string | null | undefined): Mood | undefined {
  if (!id) return undefined
  return MOODS.find((m) => m.id === id)
}
