// 单元测试：数据库基础功能
// 说明：全部使用内存数据库（':memory:'），跑完自动消失，绝不碰真实账本
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDatabase } from '../../src/main/db'
import type { Db } from '../../src/main/db'

let db: Db

beforeEach(() => {
  db = createDatabase(':memory:')
})

afterEach(() => {
  db.close()
})

describe('数据库基础', () => {
  it('首次创建后自动写入内置分类', () => {
    const names = db.listCategories().map((c) => c.name)
    expect(names).toContain('餐饮')
    expect(names).toContain('交通')
    expect(names).toHaveLength(9)
  })

  it('新增一笔账后能按月份查到', () => {
    const food = db.listCategories().find((c) => c.name === '餐饮')!
    const lunch = food.subcategories.find((s) => s.name === '午餐')!

    const created = db.createExpense({
      amount: 1234, // 单位：分，即 12.34 元
      date: '2026-10-19',
      subcategoryId: lunch.id,
      note: '测试午餐'
    })

    const list = db.listExpenses({ month: '2026-10' })
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(created.id)
    expect(list[0].amount).toBe(1234)
    expect(list[0].categoryName).toBe('餐饮')
    expect(list[0].subcategoryName).toBe('午餐')

    // 其他月份的账单里不应该出现这笔
    expect(db.listExpenses({ month: '2026-09' })).toHaveLength(0)
  })

  it('金额为 0 或负数时应拒绝保存', () => {
    const food = db.listCategories().find((c) => c.name === '餐饮')!
    const lunch = food.subcategories.find((s) => s.name === '午餐')!

    expect(() =>
      db.createExpense({ amount: 0, date: '2026-10-19', subcategoryId: lunch.id, note: '' })
    ).toThrow('金额必须大于 0')
    expect(() =>
      db.createExpense({ amount: -100, date: '2026-10-19', subcategoryId: lunch.id, note: '' })
    ).toThrow('金额必须大于 0')
  })

  it('内置分类不能删除，自建分类可以删除', () => {
    const builtin = db.listCategories().find((c) => c.name === '餐饮')!
    expect(() => db.deleteCategory(builtin.id)).toThrow('内置分类不能删除')

    const custom = db.addCategory('测试自建分类')
    expect(db.listCategories().some((c) => c.id === custom.id)).toBe(true)

    db.deleteCategory(custom.id)
    expect(db.listCategories().some((c) => c.id === custom.id)).toBe(false)
  })
})
