// 单元测试：账单的新增、修改、删除、按条件查询
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

describe('账单 - 新增', () => {
  it('新增后返回完整信息（含大类名、小类名）', () => {
    const created = db.createExpense({
      amount: 1850, // 分，即 18.50 元
      date: '2026-10-19',
      subcategoryId: subId(db, '餐饮', '午餐'),
      note: '楼下面馆'
    })

    expect(created.id).toBeGreaterThan(0)
    expect(created.amount).toBe(1850)
    expect(created.date).toBe('2026-10-19')
    expect(created.categoryName).toBe('餐饮')
    expect(created.subcategoryName).toBe('午餐')
    expect(created.note).toBe('楼下面馆')
    expect(created.createdAt).toBeTruthy()
  })

  it('备注可以为空', () => {
    const created = db.createExpense({
      amount: 100,
      date: '2026-10-19',
      subcategoryId: subId(db, '交通', '公交地铁'),
      note: ''
    })
    expect(created.note).toBe('')
  })

  it('金额必须是“分”为单位的正整数：0、负数、小数都会被拒绝', () => {
    const lunch = subId(db, '餐饮', '午餐')
    const base = { date: '2026-10-19', subcategoryId: lunch, note: '' }

    expect(() => db.createExpense({ ...base, amount: 0 })).toThrow('金额必须大于 0')
    expect(() => db.createExpense({ ...base, amount: -100 })).toThrow('金额必须大于 0')
    expect(() => db.createExpense({ ...base, amount: 12.5 })).toThrow('金额必须大于 0')
  })

  it('日期格式不对会被拒绝', () => {
    const lunch = subId(db, '餐饮', '午餐')
    const base = { amount: 100, subcategoryId: lunch, note: '' }

    expect(() => db.createExpense({ ...base, date: '2026/10/19' })).toThrow('日期格式不正确')
    expect(() => db.createExpense({ ...base, date: '2026-1-1' })).toThrow('日期格式不正确')
    expect(() => db.createExpense({ ...base, date: '今天' })).toThrow('日期格式不正确')
  })

  it('选择不存在的小类会被拒绝', () => {
    expect(() =>
      db.createExpense({ amount: 100, date: '2026-10-19', subcategoryId: 999999, note: '' })
    ).toThrow('所选分类不存在')
  })

  it('超大金额也能正常保存为整数分', () => {
    const created = db.createExpense({
      amount: 99_999_999,
      date: '2026-10-19',
      subcategoryId: subId(db, '购物', '数码家电'),
      note: '测试大额'
    })
    expect(created.amount).toBe(99_999_999)
  })
})

describe('账单 - 修改与删除', () => {
  it('修改金额、日期、分类、备注都生效', () => {
    const created = db.createExpense({
      amount: 100,
      date: '2026-10-01',
      subcategoryId: subId(db, '餐饮', '早餐'),
      note: '旧备注'
    })

    const updated = db.updateExpense(created.id, {
      amount: 2000,
      date: '2026-10-02',
      subcategoryId: subId(db, '购物', '日用品'),
      note: '新备注'
    })

    expect(updated.amount).toBe(2000)
    expect(updated.date).toBe('2026-10-02')
    expect(updated.categoryName).toBe('购物')
    expect(updated.subcategoryName).toBe('日用品')
    expect(updated.note).toBe('新备注')
  })

  it('修改不存在的账单会报错', () => {
    expect(() =>
      db.updateExpense(999999, {
        amount: 100,
        date: '2026-10-19',
        subcategoryId: subId(db, '餐饮', '午餐'),
        note: ''
      })
    ).toThrow('账单不存在')
  })

  it('删除后查询不到；删除不存在的账单会报错', () => {
    const created = db.createExpense({
      amount: 100,
      date: '2026-10-19',
      subcategoryId: subId(db, '餐饮', '午餐'),
      note: ''
    })

    db.deleteExpense(created.id)
    expect(db.listExpenses({})).toHaveLength(0)
    expect(() => db.deleteExpense(created.id)).toThrow('账单不存在')
  })
})

describe('账单 - 查询与筛选', () => {
  function seedThree() {
    // 2026-09：1 笔；2026-10：2 笔（同一天两笔，测试排序）
    db.createExpense({
      amount: 100,
      date: '2026-09-30',
      subcategoryId: subId(db, '交通', '打车'),
      note: '九月打车'
    })
    db.createExpense({
      amount: 200,
      date: '2026-10-05',
      subcategoryId: subId(db, '餐饮', '午餐'),
      note: '公司楼下'
    })
    db.createExpense({
      amount: 300,
      date: '2026-10-05',
      subcategoryId: subId(db, '餐饮', '晚餐'),
      note: '家里做饭'
    })
  }

  it('不传条件时返回全部账单，按日期倒序、同日期按编号倒序', () => {
    seedThree()
    const list = db.listExpenses({})
    expect(list).toHaveLength(3)
    expect(list.map((e) => e.date)).toEqual(['2026-10-05', '2026-10-05', '2026-09-30'])
    expect(list[0].amount).toBe(300) // 同一天，后录入的排前面
    expect(list[1].amount).toBe(200)
  })

  it('按月份筛选', () => {
    seedThree()
    expect(db.listExpenses({ month: '2026-09' })).toHaveLength(1)
    expect(db.listExpenses({ month: '2026-10' })).toHaveLength(2)
    expect(db.listExpenses({ month: '2026-11' })).toHaveLength(0)
  })

  it('按日期范围筛选（起止日期都包含在内）', () => {
    seedThree()
    expect(db.listExpenses({ dateFrom: '2026-10-05', dateTo: '2026-10-05' })).toHaveLength(2)
    expect(db.listExpenses({ dateFrom: '2026-10-01' })).toHaveLength(2)
    expect(db.listExpenses({ dateTo: '2026-09-30' })).toHaveLength(1)
  })

  it('关键词能匹配备注、小类名、大类名', () => {
    seedThree()
    expect(db.listExpenses({ keyword: '公司' })).toHaveLength(1) // 备注
    expect(db.listExpenses({ keyword: '晚餐' })).toHaveLength(1) // 小类名
    expect(db.listExpenses({ keyword: '餐饮' })).toHaveLength(2) // 大类名
    expect(db.listExpenses({ keyword: '不存在的词' })).toHaveLength(0)
  })

  it('关键词首尾空格会被忽略；空关键词等于不筛选', () => {
    seedThree()
    expect(db.listExpenses({ keyword: '  公司  ' })).toHaveLength(1)
    expect(db.listExpenses({ keyword: '   ' })).toHaveLength(3)
  })

  it('按一级大类筛选', () => {
    seedThree()
    expect(db.listExpenses({ categoryId: catId(db, '餐饮') })).toHaveLength(2)
    expect(db.listExpenses({ categoryId: catId(db, '交通') })).toHaveLength(1)
  })

  it('多个条件可以组合使用', () => {
    seedThree()
    expect(
      db.listExpenses({ month: '2026-10', categoryId: catId(db, '餐饮'), keyword: '公司' })
    ).toHaveLength(1)
  })

  it('月份、日期格式不对会报错', () => {
    expect(() => db.listExpenses({ month: '2026-1' })).toThrow('月份格式不正确')
    expect(() => db.listExpenses({ month: '2026/10' })).toThrow('月份格式不正确')
    expect(() => db.listExpenses({ dateFrom: '2026-1-1' })).toThrow('起始日期格式不正确')
    expect(() => db.listExpenses({ dateTo: '10/19' })).toThrow('结束日期格式不正确')
  })
})
