import { describe, it, expect } from 'vitest'
import { computeLayout, daysInMonth, type Entry } from './tree-layout'
import { getMood } from './mood'
import { PIXEL, insideCrown } from './tree-pixels'

function entry(date: string, mood: string | null = 'joy'): Entry {
  return {
    id: date,
    date,
    title: '',
    content: { type: 'doc', content: [] },
    mood,
    tags: [],
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('daysInMonth', () => {
  it('正确返回各月天数', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2024, 2)).toBe(29) // 闰年
    expect(daysInMonth(2026, 7)).toBe(31)
    expect(daysInMonth(2026, 6)).toBe(30)
  })
})

describe('computeLayout (像素树：叶子横向按日期，纵向落在树冠内)', () => {
  it('叶子 x 随日期单调递增（day1 在左，day31 在右）', () => {
    const layout = computeLayout(
      [entry('2026-07-01'), entry('2026-07-15'), entry('2026-07-31')],
      2026,
      7,
    )
    const [a, b, c] = layout.leaves
    expect(a.x).toBeLessThan(b.x)
    expect(b.x).toBeLessThan(c.x)
  })

  it('每片叶子都落在树冠填充区内（不是浮在天空或地面）', () => {
    const dates = Array.from({ length: 31 }, (_, i) => {
      const d = String(i + 1).padStart(2, '0')
      return entry(`2026-07-${d}`)
    })
    const layout = computeLayout(dates, 2026, 7)
    expect(layout.leaves).toHaveLength(31)
    for (const leaf of layout.leaves) {
      expect(insideCrown(layout.crown, leaf.x, leaf.y)).toBe(true)
    }
  })

  it('叶子坐标都吸附到像素格中心（对齐方块树）', () => {
    const layout = computeLayout([entry('2026-07-03'), entry('2026-07-19')], 2026, 7)
    for (const leaf of layout.leaves) {
      // snapCellCenter 的结果必然是 PIXEL 的整数倍 + PIXEL/2
      expect(leaf.x % PIXEL).toBe(PIXEL / 2)
      expect(leaf.y % PIXEL).toBe(PIXEL / 2)
    }
  })

  it('同日期多次调用结果一致（确定性）', () => {
    const data = [entry('2026-07-03'), entry('2026-07-09'), entry('2026-07-22')]
    expect(computeLayout(data, 2026, 7)).toEqual(computeLayout(data, 2026, 7))
  })

  it('相邻两篇之间生成间隔段，标注空天数与日期范围', () => {
    const layout = computeLayout([entry('2026-07-03'), entry('2026-07-09')], 2026, 7)
    expect(layout.gaps).toHaveLength(1)
    const g = layout.gaps[0]
    expect(g.emptyDays).toBe(5)
    expect(g.label).toContain('空 5 天')
    expect(g.label).toContain('7月4–8日')
    expect(typeof g.midX).toBe('number')
    expect(typeof g.midY).toBe('number')
  })

  it('空月：无叶子、无间隔段，但树本身仍然完整', () => {
    const layout = computeLayout([], 2026, 7)
    expect(layout.leaves).toHaveLength(0)
    expect(layout.gaps).toHaveLength(0)
    // 树冠仍然要画出来（空月也有树）
    expect(layout.crown.rows.length).toBeGreaterThan(20)
    expect(layout.trunkTopY).toBeLessThan(layout.groundY)
  })

  it('当月只有一篇：无间隔段', () => {
    const layout = computeLayout([entry('2026-07-03')], 2026, 7)
    expect(layout.leaves).toHaveLength(1)
    expect(layout.gaps).toHaveLength(0)
  })

  it('叶子带心情颜色，无心情回退默认色', () => {
    const layout = computeLayout(
      [entry('2026-07-03', 'sad'), entry('2026-07-09', null)],
      2026,
      7,
    )
    expect(layout.leaves[0].color).toBe(getMood('sad')!.color)
    expect(layout.leaves[1].color).toBe('#9CB86A')
  })

  it('整块叶子（含外描边）完整落在树冠内，不会在树冠边缘啃出缺口', () => {
    // 回归用例：用户报过「这树怎么有缺块」。
    // 原因之一是叶子中心虽在树冠内，但方块连外圈有 size/2 + 4 的半径，
    // 靠边的叶子四个角会探到轮廓之外，近黑的树冠上就出现一个个方口子。
    // 这里覆盖稀疏（1 篇）、常见（8 篇）、中等（15 篇）、满月（31 篇）四种密度。
    const cases = [
      [1],
      [1, 4, 6, 9, 15, 19, 22, 28],
      Array.from({ length: 15 }, (_, i) => i * 2 + 1),
      Array.from({ length: 31 }, (_, i) => i + 1),
    ]
    for (const days of cases) {
      const dates = days.map((d) => entry(`2026-07-${String(d).padStart(2, '0')}`))
      const layout = computeLayout(dates, 2026, 7)
      const half = layout.leafSize / 2 + 4 // 4 = LeafBlock 的外圈溢出量
      for (const leaf of layout.leaves) {
        for (const dx of [-half, 0, half]) {
          for (const dy of [-half, 0, half]) {
            expect(
              insideCrown(layout.crown, leaf.x + dx, leaf.y + dy),
              `${leaf.date} 的叶子外沿 (${dx},${dy}) 探出了树冠`,
            ).toBe(true)
          }
        }
      }
    }
  })

  it('叶子边长随日记数量收缩，且始终在可读范围内（10~22）', () => {
    const one = computeLayout([entry('2026-07-03')], 2026, 7)
    const many = computeLayout(
      Array.from({ length: 31 }, (_, i) =>
        entry(`2026-07-${String(i + 1).padStart(2, '0')}`),
      ),
      2026,
      7,
    )
    // 太少：封顶 22（用户要求「光点做小一点」，原来 32 太大）
    expect(one.leafSize).toBeLessThanOrEqual(22)
    // 太多：收缩，但不能小到和夜空星点分不开
    expect(many.leafSize).toBeLessThan(one.leafSize)
    expect(many.leafSize).toBeGreaterThanOrEqual(10)
    // 偶数，保证和像素网格对齐
    expect(one.leafSize % 2).toBe(0)
    expect(many.leafSize % 2).toBe(0)
  })

  it('树干顶端必须插进树冠内部，否则树冠和树干之间会露缝', () => {
    // 真 bug：原来是 trunkTopY = groundY - TRUNK_VISIBLE_H（从地面往上量），
    // 算出 458，而树冠底边在 crownCY + crownRY = 415 —— 中间空 43px，
    // 山脊从缝里露出来，屏幕上就是「树干这里还是有断层」。
    // 现在改成从树冠底边往上量 TRUNK_TOP_INSET，任何篇数下都必须有重叠。
    for (const n of [0, 1, 8, 31]) {
      const dates = Array.from({ length: n }, (_, i) =>
        entry(`2026-07-${String(i + 1).padStart(2, '0')}`),
      )
      const layout = computeLayout(dates, 2026, 7)
      const crownBottom = layout.crownCY + layout.crownRY
      expect(
        layout.trunkTopY,
        `${n} 篇时树干顶端(${layout.trunkTopY}) 没有插进树冠底边(${crownBottom})`,
      ).toBeLessThan(crownBottom)
      // 插进去至少 20px，避免「刚好碰到」被像素量化吃掉
      expect(crownBottom - layout.trunkTopY).toBeGreaterThan(20)
      // 树干也不能一路穿到树冠顶部
      expect(layout.trunkTopY).toBeGreaterThan(layout.crownCY)
      // 而且树干要能到地面
      expect(layout.groundY).toBeGreaterThan(layout.trunkTopY)
    }
  })

  it('一个月写满 31 篇时，不可能有两片叶子连同光晕压在一起', () => {
    // 起因：用户 2026-11-01 问「日记多起来，这光点显示会不会出问题」，
    // 随后贴截图指出「这里不是有点挤在一起了吗」。
    //
    // 判据按外接正方形：叶子从中心到光晕外沿是 `leafSize/2 + LEAF_RING(4)`，
    // 两片不压住需要中心距 ≥ `leafSize + 2*LEAF_RING`。
    // ⚠️ 第一版这里写成 `leafSize/2 + LEAF_RING`（少算一半），
    // 于是代码自认为不重叠、屏幕上照样糊成一颗 —— 别再把半宽当间距。
    const RING = 4
    for (const n of [8, 12, 16, 20, 25, 28, 30, 31]) {
      const dates = Array.from({ length: n }, (_, i) =>
        entry(`2026-07-${String(i + 1).padStart(2, '0')}`),
      )
      const layout = computeLayout(dates, 2026, 7)
      const need = layout.leafSize + RING * 2
      for (let i = 0; i < layout.leaves.length; i++) {
        for (let j = i + 1; j < layout.leaves.length; j++) {
          const a = layout.leaves[i]
          const b = layout.leaves[j]
          const clash = Math.abs(a.x - b.x) < need && Math.abs(a.y - b.y) < need
          expect(
            clash,
            `${n} 篇：${a.date}(${a.x},${a.y}) 与 ${b.date}(${b.x},${b.y}) 光晕重叠（need=${need}）`,
          ).toBe(false)
        }
      }
    }
  })
})
