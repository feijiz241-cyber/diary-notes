// 轮询等后端起来。比 bat 里「node -e fetch + timeout /t 1」强在两点：
// 一个进程反复试（省掉每次几百毫秒的 node 启动），以及 100ms 一轮（不是整秒）。
//
// 用法：node scripts/wait-for-server.mjs http://127.0.0.1:5189 15000
// 退出码：0 = 等到了；1 = 超时。

const url = process.argv[2] ?? 'http://127.0.0.1:5189/'
const timeoutMs = Number(process.argv[3] ?? 15000)
const intervalMs = 100
const deadline = Date.now() + timeoutMs

let lastError = ''
while (Date.now() < deadline) {
  try {
    const res = await fetch(url, { redirect: 'manual' })
    if (res.ok) process.exit(0)
    lastError = `HTTP ${res.status}`
  } catch (err) {
    lastError = err?.cause?.code ?? err?.message ?? String(err)
  }
  await new Promise((resolve) => setTimeout(resolve, intervalMs))
}

console.error(`[wait] ${url} 在 ${timeoutMs}ms 内没有响应（最后一次：${lastError || '未知'}）`)
process.exit(1)
