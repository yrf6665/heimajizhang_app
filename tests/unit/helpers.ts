// 测试用的小工具：统一创建内存数据库、按名字取分类编号
import { createDatabase } from '../../src/main/db'
import type { Db } from '../../src/main/db'

/** 创建一个只在内存里存在的测试数据库，绝不碰真实账本 */
export function makeDb(): Db {
  return createDatabase(':memory:')
}

/** 按大类名字查编号 */
export function catId(db: Db, name: string): number {
  const cat = db.listCategories().find((c) => c.name === name)
  if (!cat) throw new Error(`测试数据错误：找不到大类「${name}」`)
  return cat.id
}

/** 按「大类名 + 小类名」查小类编号 */
export function subId(db: Db, cat: string, sub: string): number {
  const category = db.listCategories().find((c) => c.name === cat)
  if (!category) throw new Error(`测试数据错误：找不到大类「${cat}」`)
  const found = category.subcategories.find((s) => s.name === sub)
  if (!found) throw new Error(`测试数据错误：找不到小类「${sub}」`)
  return found.id
}

/** 取本机时区的今天日期 YYYY-MM-DD（和软件内部算法一致） */
export function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
