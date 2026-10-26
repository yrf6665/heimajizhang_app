// 单元测试：分类管理规则（内置分类与自建分类的增删改）
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Db } from '../../src/main/db'
import { makeDb, catId, subId } from './helpers'

let db: Db

beforeEach(() => {
  db = makeDb()
})

afterEach(() => {
  db.close()
})

describe('分类 - 内置分类', () => {
  it('首次建库后自动写入 9 个内置大类', () => {
    const cats = db.listCategories()
    expect(cats.map((c) => c.name)).toEqual([
      '餐饮',
      '交通',
      '购物',
      '居住',
      '娱乐',
      '医疗',
      '教育',
      '人情往来',
      '其他'
    ])
    expect(cats.every((c) => c.isSystem)).toBe(true)
  })

  it('每个内置大类都有内置小类（以餐饮为例）', () => {
    const food = db.listCategories().find((c) => c.name === '餐饮')!
    expect(food.subcategories.map((s) => s.name)).toEqual(['早餐', '午餐', '晚餐', '外卖', '零食饮料', '聚餐'])
    expect(food.subcategories.every((s) => s.isSystem)).toBe(true)
  })

  it('内置大类不能删除', () => {
    expect(() => db.deleteCategory(catId(db, '餐饮'))).toThrow('内置分类不能删除')
  })

  it('内置大类不能改名', () => {
    expect(() => db.renameCategory(catId(db, '餐饮'), '吃喝')).toThrow('内置分类不能改名')
  })

  it('内置小类不能删除、不能改名', () => {
    const lunch = subId(db, '餐饮', '午餐')
    expect(() => db.deleteSubcategory(lunch)).toThrow('内置小类不能删除')
    expect(() => db.renameSubcategory(lunch, '中午饭')).toThrow('内置小类不能改名')
  })
})

describe('分类 - 自建分类', () => {
  it('新增自建大类后能查到，且标记为非内置', () => {
    const created = db.addCategory('  宠物开销  ')
    expect(created.name).toBe('宠物开销') // 自动去掉首尾空格
    expect(created.isSystem).toBe(false)

    const found = db.listCategories().find((c) => c.id === created.id)!
    expect(found.name).toBe('宠物开销')
    expect(found.isSystem).toBe(false)
    expect(found.subcategories).toEqual([])
  })

  it('大类名称不能为空、不能重名（包括和内置重名）', () => {
    expect(() => db.addCategory('   ')).toThrow('分类名称不能为空')
    expect(() => db.addCategory('餐饮')).toThrow('该大类已存在')
    db.addCategory('测试分类')
    expect(() => db.addCategory('测试分类')).toThrow('该大类已存在')
  })

  it('自建大类可以改名', () => {
    const created = db.addCategory('旧名字')
    db.renameCategory(created.id, '新名字')
    expect(db.listCategories().find((c) => c.id === created.id)!.name).toBe('新名字')
  })

  it('改名不能改成空名，也不能改成已有名字', () => {
    const a = db.addCategory('分类A')
    db.addCategory('分类B')
    expect(() => db.renameCategory(a.id, '  ')).toThrow('分类名称不能为空')
    expect(() => db.renameCategory(a.id, '分类B')).toThrow('该大类已存在')
  })

  it('没有账单的自建大类可以删除（小类一起删掉）', () => {
    const created = db.addCategory('临时分类')
    db.addSubcategory(created.id, '临时小类')
    db.deleteCategory(created.id)
    expect(db.listCategories().some((c) => c.id === created.id)).toBe(false)
  })

  it('名下有账单的自建大类不能删除', () => {
    const created = db.addCategory('有账分类')
    const sub = db.addSubcategory(created.id, '有账小类')
    db.createExpense({ amount: 100, date: '2026-10-19', subcategoryId: sub.id, note: '' })

    expect(() => db.deleteCategory(created.id)).toThrow('该大类下已有账单，不能删除')
  })

  it('给自建大类新增小类后能查到，且标记为非内置', () => {
    const created = db.addCategory('自建大类')
    const sub = db.addSubcategory(created.id, '  自建小类  ')
    expect(sub.name).toBe('自建小类')
    expect(sub.isSystem).toBe(false)

    const found = db.listCategories().find((c) => c.id === created.id)!
    expect(found.subcategories.map((s) => s.name)).toContain('自建小类')
  })

  it('小类名称不能为空、同一大类下不能重名、大类必须存在', () => {
    const created = db.addCategory('自建大类')
    expect(() => db.addSubcategory(created.id, '  ')).toThrow('小类名称不能为空')
    expect(() => db.addSubcategory(999999, '小类')).toThrow('大类不存在')

    db.addSubcategory(created.id, '重复小类')
    expect(() => db.addSubcategory(created.id, '重复小类')).toThrow('该小类已存在')
  })

  it('不同大类下可以有同名小类', () => {
    const a = db.addCategory('大类A')
    const b = db.addCategory('大类B')
    db.addSubcategory(a.id, '同名小类')
    expect(() => db.addSubcategory(b.id, '同名小类')).not.toThrow()
  })

  it('自建小类可以改名、没有账单时可以删除', () => {
    const created = db.addCategory('大类')
    const sub = db.addSubcategory(created.id, '旧小类')
    db.renameSubcategory(sub.id, '新小类')

    const found = db.listCategories().find((c) => c.id === created.id)!
    expect(found.subcategories.map((s) => s.name)).toContain('新小类')

    db.deleteSubcategory(sub.id)
    expect(db.listCategories().find((c) => c.id === created.id)!.subcategories).toHaveLength(0)
  })

  it('小类名下有账单时不能删除', () => {
    const created = db.addCategory('大类')
    const sub = db.addSubcategory(created.id, '小类')
    db.createExpense({ amount: 100, date: '2026-10-19', subcategoryId: sub.id, note: '' })

    expect(() => db.deleteSubcategory(sub.id)).toThrow('该小类下已有账单，不能删除')
  })

  it('小类改名不能改成空名、不能在大类内重名', () => {
    const created = db.addCategory('大类')
    const a = db.addSubcategory(created.id, '小类A')
    db.addSubcategory(created.id, '小类B')

    expect(() => db.renameSubcategory(a.id, '  ')).toThrow('小类名称不能为空')
    expect(() => db.renameSubcategory(a.id, '小类B')).toThrow('该小类已存在')
  })

  it('操作不存在的分类编号时会报“不存在”，而不是崩溃', () => {
    expect(() => db.deleteCategory(999999)).toThrow('分类不存在')
    expect(() => db.renameCategory(999999, '新名字')).toThrow('分类不存在')
    expect(() => db.deleteSubcategory(999999)).toThrow('小类不存在')
    expect(() => db.renameSubcategory(999999, '新名字')).toThrow('小类不存在')
  })
})
