// 数据库冒烟测试：不开软件窗口，直接检验数据库模块是否正常工作
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDatabase } from './.tmp/db.mjs'

const dir = mkdtempSync(join(tmpdir(), 'heima-smoke-'))
const db = createDatabase(join(dir, 'test.db'))

// 1. 首次创建自动写入 9 个内置大类
const cats = db.listCategories()
assert.equal(cats.length, 9, '内置大类应为 9 个')
const food = cats.find((c) => c.name === '餐饮')
const lunch = food?.subcategories.find((s) => s.name === '午餐')
assert.ok(food && lunch, '应能找到 餐饮/午餐')

// 2. 记一笔 + 查询
const e = db.createExpense({ amount: 1580, date: '2026-10-15', subcategoryId: lunch.id, note: '测试午餐' })
assert.equal(e.amount, 1580)
assert.equal(e.categoryName, '餐饮')
assert.equal(e.subcategoryName, '午餐')
assert.equal(db.listExpenses({ month: '2026-10' }).length, 1, '10 月应有 1 笔账单')

// 3. 首页统计
const stats = db.getHomeStats('2026-10')
assert.equal(stats.monthTotal, 1580)
assert.equal(stats.monthCount, 1)

// 4. 编辑 + 删除
const u = db.updateExpense(e.id, { amount: 2000, date: '2026-10-15', subcategoryId: lunch.id, note: '改' })
assert.equal(u.amount, 2000, '编辑后金额应为 2000')
db.deleteExpense(e.id)
assert.equal(db.listExpenses({ month: '2026-10' }).length, 0, '删除后应为 0 笔')

// 5. 分类增删与内置保护
assert.throws(() => db.deleteCategory(food.id), /内置分类/, '内置大类不可删除')
const pet = db.addCategory('宠物')
db.addSubcategory(pet.id, '猫粮')
assert.throws(() => db.deleteSubcategory(lunch.id), /内置小类/, '内置小类不可删除')
db.deleteCategory(pet.id)

// 6. 非法输入保护
assert.throws(
  () => db.createExpense({ amount: -5, date: '2026-10-15', subcategoryId: lunch.id, note: '' }),
  /金额/,
  '金额必须大于 0'
)
assert.throws(
  () => db.createExpense({ amount: 100, date: '2026/10/15', subcategoryId: lunch.id, note: '' }),
  /日期/,
  '日期格式必须为 YYYY-MM-DD'
)

// 7. 月度统计（分类汇总 / 每日补齐 / 上月对比）
db.createExpense({ amount: 3000, date: '2026-09-20', subcategoryId: lunch.id, note: '' })
db.createExpense({ amount: 1500, date: '2026-10-05', subcategoryId: lunch.id, note: '' })
db.createExpense({ amount: 500, date: '2026-10-06', subcategoryId: lunch.id, note: '' })
const ms = db.getMonthStats('2026-10')
assert.equal(ms.monthTotal, 2000, '10 月总支出应为 2000 分')
assert.equal(ms.prevMonthTotal, 3000, '上月总支出应为 3000 分')
assert.equal(ms.monthCount, 2)
const foodStat = ms.categories.find((c) => c.categoryName === '餐饮')
assert.equal(foodStat.total, 2000)
assert.equal(foodStat.percent, 100)
assert.equal(ms.daily.length, 31, '10 月应有 31 天')
assert.equal(ms.daily.find((d) => d.date === '2026-10-05').total, 1500)
assert.equal(ms.daily.find((d) => d.date === '2026-10-01').total, 0, '没花钱的日子应为 0')

// 8. 年度统计（12 个月补齐）
const ys = db.getYearStats('2026')
assert.equal(ys.length, 12)
assert.equal(ys.find((m) => m.month === '2026-09').total, 3000)
assert.equal(ys.find((m) => m.month === '2026-01').total, 0)

// 9. 搜索与筛选
const traffic = cats.find((c) => c.name === '交通')
const bus = traffic.subcategories.find((s) => s.name === '公交地铁')
db.createExpense({ amount: 800, date: '2026-10-10', subcategoryId: lunch.id, note: '和同事聚餐' })
db.createExpense({ amount: 200, date: '2026-10-12', subcategoryId: bus.id, note: '' })
assert.equal(db.listExpenses({ month: '2026-10', keyword: '聚餐' }).length, 1, '关键词应只匹配到聚餐那笔')
assert.equal(db.listExpenses({ month: '2026-10', keyword: '餐饮' }).length, 3, '关键词匹配大类名')
assert.equal(db.listExpenses({ month: '2026-10', categoryId: traffic.id }).length, 1, '按大类筛选')
assert.equal(db.listExpenses({ dateFrom: '2026-10-10', dateTo: '2026-10-31' }).length, 2, '按日期范围筛选')
assert.equal(db.listExpenses({ month: '2026-09' }).length, 1, '9 月应有 1 笔')

// 10. 预算
db.setBudget({ month: '2026-10', categoryId: null, amount: 10000 })
db.setBudget({ month: '2026-10', categoryId: null, amount: 20000 })
assert.equal(db.getBudgets('2026-10').find((b) => b.categoryId === null).amount, 20000, '重复设置应更新金额')
const catBudget = db.setBudget({ month: '2026-10', categoryId: food.id, amount: 5000 })
assert.equal(catBudget.categoryName, '餐饮')
assert.equal(db.getBudgets('2026-10').length, 2, '总预算 + 分类预算共 2 条')
db.deleteBudget(catBudget.id)
assert.equal(db.getBudgets('2026-10').length, 1)
assert.throws(() => db.setBudget({ month: '2026-13', categoryId: null, amount: 100 }), /月份/, '非法月份')
assert.throws(() => db.setBudget({ month: '2026-10', categoryId: null, amount: -1 }), /金额/, '预算必须大于 0')

db.close()
rmSync(dir, { recursive: true, force: true })
console.log('✅ 数据库冒烟测试全部通过（内置分类 / 记账 / 查询 / 统计 / 编辑 / 删除 / 分类管理 / 非法输入保护）')
