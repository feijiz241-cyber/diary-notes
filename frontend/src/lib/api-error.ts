/**
 * 把底层错误翻译成用户能看懂的一句话。
 *
 * 背景：本项目是「双击 bat + 本地 Node 服务」的用法，最常见的故障不是代码 bug，
 * 而是**后端进程没起来**——那时 fetch 抛的是 `TypeError: Failed to fetch`，
 * 直接把这句话丢给用户（或者更糟，什么都不显示）没有任何帮助。
 */
export function describeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err ?? '')

  // 网络层失败：后端没起 / 端口被占 / 命令行窗口被关掉
  if (
    err instanceof TypeError ||
    /failed to fetch|networkerror|load failed|fetch failed|err_connection/i.test(message)
  ) {
    return '没连上本地服务。请看一眼那个黑色命令行窗口还在不在；如果关掉了，重新双击 start-diary.bat，再刷新本页。'
  }

  const statusMatch = message.match(/API (\d{3})\b/)
  if (statusMatch) {
    const status = Number(statusMatch[1])
    if (status === 404) return '本地服务里没有这条数据（可能已经删掉了）。'
    if (status === 413) return '内容太大，被本地服务拒收（单次请求上限 32MB）。'
    if (status >= 500) return `本地服务出错了（HTTP ${status}），命令行窗口里应该有一行报错。`
    return `请求失败（HTTP ${status}）。`
  }

  return message || '出了点问题，重试一下。'
}
