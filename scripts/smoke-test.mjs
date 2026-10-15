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
assert.equal(db.listExpenses('2026-10').length, 1, '10 月应有 1 笔账单')

// 3. 首页统计
const stats = db.getHomeStats('2026-10')
assert.equal(stats.monthTotal, 1580)
assert.equal(stats.monthCount, 1)

// 4. 编辑 + 删除
const u = db.updateExpense(e.id, { amount: 2000, date: '2026-10-15', subcategoryId: lunch.id, note: '改' })
assert.equal(u.amount, 2000, '编辑后金额应为 2000')
db.deleteExpense(e.id)
assert.equal(db.listExpenses('2026-10').length, 0, '删除后应为 0 笔')

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

db.close()
rmSync(dir, { recursive: true, force: true })
console.log('✅ 数据库冒烟测试全部通过（内置分类 / 记账 / 查询 / 统计 / 编辑 / 删除 / 分类管理 / 非法输入保护）')
