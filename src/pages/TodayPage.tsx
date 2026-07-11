import { DayEditor } from '@/components/DayEditor'
import { toDateKey } from '@/lib/utils'

export function TodayPage() {
  const today = toDateKey()
  return <DayEditor dateKey={today} />
}
