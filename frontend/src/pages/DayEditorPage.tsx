import { Navigate, useParams } from 'react-router-dom'
import { DayEditor } from '@/components/DayEditor'
import { Card } from '@/components/ui/card'

export function DayEditorPage() {
  const { date } = useParams<{ date: string }>()
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return <Navigate to="/" replace />
  return (
    <Card className="p-4">
      <DayEditor dateKey={date} />
    </Card>
  )
}
