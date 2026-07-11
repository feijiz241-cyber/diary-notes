import { Navigate, useParams } from 'react-router-dom'
import { DayEditor } from '@/components/DayEditor'

export function DayEditorPage() {
  const { date } = useParams<{ date: string }>()
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return <Navigate to="/" replace />
  return <DayEditor dateKey={date} />
}
