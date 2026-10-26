// 单元测试：预算的设定、修改、查询与删除
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Db } from '../../src/main/db'
import { makeDb, catId } from './helpers'

let db: Db

beforeEach(() => {
  db = makeDb()
})

afterEach(() => {
  db.close()
})

describe('预算 - 设定与查询', () => {
  it('新月份没有预算', () => {
    expect(db.getBudgets('2026-10')).toEqual([])
  })

  it('可以设定总预算（不对应任何分类）', () => {
    const budget = db.setBudget({ month: '2026-10', categoryId: null, amount: 500000 })
    expect(budget.month).toBe('2026-10')
    expect(budget.categoryId).toBeNull()
    expect(budget.categoryName).toBeNull()
    expect(budget.amount).toBe(500000)

    const list = db.getBudgets('2026-10')
    expect(list).toHaveLength(1)
    expect(list[0].amount).toBe(500000)
  })

  it('可以给某个大类单独设预算，查询时带分类名', () => {
    const food = catId(db, '餐饮')
    db.setBudget({ month: '2026-10', categoryId: food, amount: 200000 })

    const list = db.getBudgets('2026-10')
    expect(list).toHaveLength(1)
    expect(list[0].categoryId).toBe(food)
    expect(list[0].categoryName).toBe('餐饮')
    expect(list[0].amount).toBe(200000)
  })

  it('总预算排在分类预算前面', () => {
    db.setBudget({ month: '2026-10', categoryId: catId(db, '餐饮'), amount: 200000 })
    db.setBudget({ month: '2026-10', categoryId: null, amount: 500000 })

    const list = db.getBudgets('2026-10')
    expect(list[0].categoryId).toBeNull()
    expect(list[1].categoryName).toBe('餐饮')
  })

  it('同一个月同一分类重复设定时只更新金额，不会出现两条', () => {
    const food = catId(db, '餐饮')
    db.setBudget({ month: '2026-10', categoryId: food, amount: 100000 })
    db.setBudget({ month: '2026-10', categoryId: food, amount: 300000 })

    const list = db.getBudgets('2026-10')
    expect(list).toHaveLength(1)
    expect(list[0].amount).toBe(300000)
  })

  it('同一个月总预算重复设定时也只更新金额', () => {
    db.setBudget({ month: '2026-10', categoryId: null, amount: 100000 })
    db.setBudget({ month: '2026-10', categoryId: null, amount: 800000 })

    const list = db.getBudgets('2026-10')
    expect(list).toHaveLength(1)
    expect(list[0].amount).toBe(800000)
  })

  it('不同月份、不同分类的预算互不影响', () => {
    const food = catId(db, '餐饮')
    const traffic = catId(db, '交通')
    db.setBudget({ month: '2026-10', categoryId: food, amount: 100000 })
    db.setBudget({ month: '2026-10', categoryId: traffic, amount: 50000 })
    db.setBudget({ month: '2026-11', categoryId: food, amount: 200000 })

    expect(db.getBudgets('2026-10')).toHaveLength(2)
    expect(db.getBudgets('2026-11')).toHaveLength(1)
    expect(db.getBudgets('2026-11')[0].amount).toBe(200000)
  })

  it('金额、月份、分类不合法时会报错', () => {
    expect(() => db.setBudget({ month: '2026-13', categoryId: null, amount: 100 })).toThrow('月份格式不正确')
    expect(() => db.setBudget({ month: '2026-10', categoryId: null, amount: 0 })).toThrow('预算金额必须大于 0')
    expect(() => db.setBudget({ month: '2026-10', categoryId: null, amount: -1 })).toThrow('预算金额必须大于 0')
    expect(() => db.setBudget({ month: '2026-10', categoryId: null, amount: 1.5 })).toThrow('预算金额必须大于 0')
    expect(() => db.setBudget({ month: '2026-10', categoryId: 999999, amount: 100 })).toThrow('分类不存在')
  })

  it('查询预算时月份格式不对会报错', () => {
    expect(() => db.getBudgets('2026-1')).toThrow('月份格式不正确')
  })
})

describe('预算 - 删除', () => {
  it('删除后查询不到', () => {
    const budget = db.setBudget({ month: '2026-10', categoryId: null, amount: 500000 })
    db.deleteBudget(budget.id)
    expect(db.getBudgets('2026-10')).toEqual([])
  })

  it('删除不存在的预算会报错', () => {
    expect(() => db.deleteBudget(999999)).toThrow('预算不存在')
  })
})
