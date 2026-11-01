// 只在源码真的变了才 build。
//
// 为什么需要它：start-diary-fast.bat 每次启动都 build，虽然能保证「打开的一定是最新代码」，
// 但每天开机都要白等 3 秒多。这里用 mtime 判断：dist 比所有输入文件都新就直接跳过。
// 判据保守 —— 任何拿不准的情况（dist 缺文件、读文件出错）都当作「需要构建」，
// 宁可多花 3 秒，也不出现「改了代码打开旧包」。

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST_DIR = path.join(ROOT, 'frontend', 'dist')
const DIST_INDEX = path.join(DIST_DIR, 'index.html')
const VITE_BIN = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
const VITE_CONFIG = path.join(ROOT, 'frontend', 'vite.config.ts')

/** 这些文件变了必须重新构建 */
const INPUT_FILES = [
  path.join(ROOT, 'frontend', 'index.html'),
  path.join(ROOT, 'frontend', 'vite.config.ts'),
  path.join(ROOT, 'frontend', 'tsconfig.json'),
  path.join(ROOT, 'package.json'),
  path.join(ROOT, 'package-lock.json'),
]

/** 这些目录递归看 */
const INPUT_DIRS = [path.join(ROOT, 'frontend', 'src')]

/** dist 里必须存在的东西，缺任何一个都当作没构建过 */
const REQUIRED_OUTPUTS = [DIST_INDEX, path.join(DIST_DIR, 'assets')]

/** @returns {Promise<number>} 目录里最新的 mtime（毫秒），空目录返回 0 */
async function newestIn(dir) {
  let newest = 0
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      newest = Math.max(newest, await newestIn(full))
    } else if (entry.isFile()) {
      newest = Math.max(newest, (await stat(full)).mtimeMs)
    }
  }
  return newest
}

/** @returns {Promise<number>} 所有输入文件里最新的 mtime（毫秒），读不到就抛 */
async function newestInput() {
  let newest = 0
  for (const file of INPUT_FILES) {
    // package-lock.json 可能不存在，跳过即可
    if (!existsSync(file)) continue
    newest = Math.max(newest, (await stat(file)).mtimeMs)
  }
  for (const dir of INPUT_DIRS) {
    if (!existsSync(dir)) continue
    newest = Math.max(newest, await newestIn(dir))
  }
  return newest
}

function build() {
  const result = spawnSync(process.execPath, [VITE_BIN, 'build', '--config', VITE_CONFIG], {
    cwd: ROOT,
    stdio: 'inherit',
  })
  if (result.error) {
    console.error(`[build] 启动构建失败：${result.error.message}`)
    return 1
  }
  return result.status ?? 1
}

async function main() {
  const missing = REQUIRED_OUTPUTS.filter((p) => !existsSync(p))
  if (missing.length > 0) {
    console.log(`[build] dist 不完整（缺 ${missing.map((p) => path.relative(ROOT, p)).join('、')}），开始构建…`)
    return build()
  }

  let distTime
  let inputTime
  try {
    // 用 assets 目录 + index.html 里较早的那个时间当「构建时间」：两者一起被重写
    distTime = Math.min((await stat(DIST_INDEX)).mtimeMs, (await stat(path.join(DIST_DIR, 'assets'))).mtimeMs)
    inputTime = await newestInput()
  } catch (err) {
    console.log(`[build] 读不到文件时间（${err.message}），保险起见重新构建…`)
    return build()
  }

  if (inputTime <= distTime) {
    const minutes = Math.max(0, Math.round((Date.now() - distTime) / 60000))
    console.log(`[build] 源码没有改动，直接用上次构建的结果（${minutes} 分钟前构建），跳过构建。`)
    return 0
  }

  const changedSeconds = Math.max(1, Math.round((inputTime - distTime) / 1000))
  console.log(`[build] 检测到源码改动（比上次构建新约 ${changedSeconds} 秒），开始构建…`)
  return build()
}

main().then((code) => process.exit(code), (err) => {
  console.error(`[build] 意外错误：${err?.message ?? err}`)
  process.exit(1)
})
