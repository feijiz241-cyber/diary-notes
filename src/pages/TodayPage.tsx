import { DayEditor } from '@/components/DayEditor'
import { Card } from '@/components/ui/card'
import { toDateKey } from '@/lib/utils'

export function TodayPage() {
  const today = toDateKey()
  return (
    <Card className="p-4">
      <DayEditor dateKey={today} />
    </Card>
  )
}
