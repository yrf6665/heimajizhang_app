// 单元测试：首页统计、月度统计、年度统计
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Db } from '../../src/main/db'
import { makeDb, subId, todayStr } from './helpers'

let db: Db

beforeEach(() => {
  db = makeDb()
})

afterEach(() => {
  db.close()
})

function add(amount: number, date: string, cat = '餐饮', sub = '午餐') {
  return db.createExpense({ amount, date, subcategoryId: subId(db, cat, sub), note: '' })
}

describe('首页概览', () => {
  it('空账本时全部为 0', () => {
    expect(db.getHomeStats('2026-10')).toEqual({ monthTotal: 0, monthCount: 0, todayTotal: 0 })
  })

  it('统计本月总支出、笔数、今日支出', () => {
    const today = todayStr()
    const month = today.slice(0, 7)

    add(1000, today)
    add(500, today)
    add(300, `${month}-01`)

    const stats = db.getHomeStats(month)
    expect(stats.monthTotal).toBe(1800)
    expect(stats.monthCount).toBe(3)
    expect(stats.todayTotal).toBe(1500)
  })

  it('其他月份的账不会算进本月', () => {
    add(1000, '2026-09-15')
    const stats = db.getHomeStats('2026-10')
    expect(stats.monthTotal).toBe(0)
    expect(stats.monthCount).toBe(0)
  })

  it('月份格式不对会报错（包括 13 月）', () => {
    expect(() => db.getHomeStats('2026-1')).toThrow('月份格式不正确')
    expect(() => db.getHomeStats('2026-13')).toThrow('月份格式不正确')
    expect(() => db.getHomeStats('abc')).toThrow('月份格式不正确')
  })
})

describe('月度统计', () => {
  it('统计本月总额、笔数、上月总额', () => {
    add(1000, '2026-10-01')
    add(500, '2026-10-31')
    add(300, '2026-09-20')

    const stats = db.getMonthStats('2026-10')
    expect(stats.month).toBe('2026-10')
    expect(stats.monthTotal).toBe(1500)
    expect(stats.monthCount).toBe(2)
    expect(stats.prevMonthTotal).toBe(300)
  })

  it('1 月的“上个月”是去年 12 月', () => {
    add(800, '2025-12-31')
    add(200, '2026-01-01')

    const stats = db.getMonthStats('2026-01')
    expect(stats.monthTotal).toBe(200)
    expect(stats.prevMonthTotal).toBe(800)
  })

  it('分类汇总按金额从大到小排序，并计算占比', () => {
    add(2000, '2026-10-01', '餐饮', '午餐')
    add(1000, '2026-10-02', '交通', '打车')

    const stats = db.getMonthStats('2026-10')
    expect(stats.categories.map((c) => c.categoryName)).toEqual(['餐饮', '交通'])
    expect(stats.categories[0].total).toBe(2000)
    expect(stats.categories[0].percent).toBe(66.7) // 2000 / 3000
    expect(stats.categories[1].percent).toBe(33.3) // 1000 / 3000
  })

  it('没有任何支出的分类不出现在汇总里', () => {
    add(1000, '2026-10-01', '餐饮', '午餐')
    const stats = db.getMonthStats('2026-10')
    expect(stats.categories).toHaveLength(1)
  })

  it('每日数据补齐整个月，没花钱的日子为 0', () => {
    add(1200, '2026-10-05')
    add(300, '2026-10-05')
    add(500, '2026-10-01')

    const stats = db.getMonthStats('2026-10')
    expect(stats.daily).toHaveLength(31)
    expect(stats.daily[0]).toEqual({ date: '2026-10-01', total: 500 })
    expect(stats.daily[4]).toEqual({ date: '2026-10-05', total: 1500 })
    expect(stats.daily[1]).toEqual({ date: '2026-10-02', total: 0 })
    expect(stats.daily[30]).toEqual({ date: '2026-10-31', total: 0 })
  })

  it('闰年 2 月有 29 天，平年 2 月有 28 天', () => {
    expect(db.getMonthStats('2024-02').daily).toHaveLength(29)
    expect(db.getMonthStats('2026-02').daily).toHaveLength(28)
  })

  it('空月份返回全 0、空分类、每日全 0', () => {
    const stats = db.getMonthStats('2026-10')
    expect(stats.monthTotal).toBe(0)
    expect(stats.monthCount).toBe(0)
    expect(stats.prevMonthTotal).toBe(0)
    expect(stats.categories).toEqual([])
    expect(stats.daily.every((d) => d.total === 0)).toBe(true)
  })

  it('月份格式不对会报错', () => {
    expect(() => db.getMonthStats('2026-00')).toThrow('月份格式不正确')
    expect(() => db.getMonthStats('2026-13')).toThrow('月份格式不正确')
  })
})

describe('年度统计', () => {
  it('返回 1~12 月共 12 条，按月份排序', () => {
    const stats = db.getYearStats('2026')
    expect(stats).toHaveLength(12)
    expect(stats.map((s) => s.month)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12'
    ])
  })

  it('各月金额汇总正确，没有支出的月份为 0', () => {
    add(1000, '2026-01-15')
    add(2000, '2026-01-20')
    add(500, '2026-12-31')

    const stats = db.getYearStats('2026')
    expect(stats[0]).toEqual({ month: '2026-01', total: 3000 })
    expect(stats[11]).toEqual({ month: '2026-12', total: 500 })
    expect(stats[5]).toEqual({ month: '2026-06', total: 0 })
  })

  it('不会把别年份的账算进来', () => {
    add(1000, '2025-12-31')
    add(2000, '2027-01-01')
    const stats = db.getYearStats('2026')
    expect(stats.every((s) => s.total === 0)).toBe(true)
  })

  it('年份格式不对会报错', () => {
    expect(() => db.getYearStats('26')).toThrow('年份格式不正确')
    expect(() => db.getYearStats('2026-01')).toThrow('年份格式不正确')
    expect(() => db.getYearStats('abcd')).toThrow('年份格式不正确')
  })
})
