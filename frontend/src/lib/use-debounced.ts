import { useEffect, useState } from 'react'

/**
 * 把快速变化的值压成「停下来 delay 毫秒后的那一个」。
 *
 * 用途：搜索框这类「每敲一个字就触发一次全库扫描」的输入。防抖只减少次数，
 * 不解决乱序 —— 过期响应仍要靠调用方用序号/active 标记丢弃。
 */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
