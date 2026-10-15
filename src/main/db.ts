// 数据库模块：负责账本数据的保存和查询（数据存在本机 SQLite 文件里）
// 说明：使用 Node.js 自带的 SQLite 模块（node:sqlite），无需安装任何额外编译工具
import { DatabaseSync } from 'node:sqlite'
import type { Category, Expense, ExpenseInput, HomeStats, Subcategory } from '../shared/types'

// 内置两级分类（与 CLAUDE.md 第三章保持一致）
const BUILTIN_CATEGORIES: Record<string, string[]> = {
  餐饮: ['早餐', '午餐', '晚餐', '外卖', '零食饮料', '聚餐'],
  交通: ['公交地铁', '打车', '加油', '停车费', '火车高铁', '飞机', '汽车保养维修'],
  购物: ['日用品', '服饰鞋包', '数码家电', '美妆护肤', '书籍文具', '烟酒'],
  居住: ['房租', '水电燃气', '物业费', '家居用品', '维修装修'],
  娱乐: ['电影演出', '游戏', '旅行', '运动健身', '会员订阅', '休闲玩乐'],
  医疗: ['门诊挂号', '药品', '体检', '住院'],
  教育: ['学费', '培训课程', '书籍资料', '考试报名'],
  人情往来: ['红包', '礼物', '请客', '婚礼随礼'],
  其他: ['宠物', '通讯话费', '快递', '杂项']
}

/** 数据库操作接口（界面上能做的所有数据操作） */
export interface Db {
  listCategories(): Category[]
  addCategory(name: string): Category
  deleteCategory(id: number): void
  addSubcategory(categoryId: number, name: string): Subcategory
  deleteSubcategory(id: number): void
  listExpenses(month: string): Expense[]
  createExpense(input: ExpenseInput): Expense
  updateExpense(id: number, input: ExpenseInput): Expense
  deleteExpense(id: number): void
  getHomeStats(month: string): HomeStats
  close(): void
}

/** 取本地时区的日期字符串 YYYY-MM-DD（不用 UTC，避免日期差一天） */
function localDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 创建并初始化数据库（首次创建时自动写入内置分类） */
export function createDatabase(filePath: string): Db {
  const db = new DatabaseSync(filePath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      is_system INTEGER NOT NULL DEFAULT 0,
      sort INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS subcategories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 0,
      sort INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount INTEGER NOT NULL CHECK (amount > 0),
      date TEXT NOT NULL,
      subcategory_id INTEGER NOT NULL REFERENCES subcategories(id),
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT
    );
  `)
  seed()

  // ---- 分类 ----

  function listCategories(): Category[] {
    const cats = db
      .prepare('SELECT id, name, is_system AS isSystem FROM categories ORDER BY sort, id')
      .all() as unknown as {
      id: number
      name: string
      isSystem: number
    }[]
    const subs = db
      .prepare('SELECT id, category_id AS categoryId, name, is_system AS isSystem FROM subcategories ORDER BY sort, id')
      .all() as unknown as { id: number; categoryId: number; name: string; isSystem: number }[]
    return cats.map((c) => ({
      id: c.id,
      name: c.name,
      isSystem: c.isSystem === 1,
      subcategories: subs
        .filter((s) => s.categoryId === c.id)
        .map((s) => ({ id: s.id, name: s.name, isSystem: s.isSystem === 1 }))
    }))
  }

  function addCategory(name: string): Category {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('分类名称不能为空')
    if (db.prepare('SELECT id FROM categories WHERE name = ?').get(trimmed)) throw new Error('该大类已存在')
    const sort = (db.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM categories').get() as { m: number }).m + 1
    const info = db.prepare('INSERT INTO categories (name, is_system, sort) VALUES (?, 0, ?)').run(trimmed, sort)
    return { id: Number(info.lastInsertRowid), name: trimmed, isSystem: false, subcategories: [] }
  }

  function deleteCategory(id: number): void {
    const cat = db.prepare('SELECT is_system FROM categories WHERE id = ?').get(id) as
      | { is_system: number }
      | undefined
    if (!cat) throw new Error('分类不存在')
    if (cat.is_system === 1) throw new Error('内置分类不能删除')
    const used = db
      .prepare(
        'SELECT COUNT(*) AS n FROM expenses e JOIN subcategories s ON s.id = e.subcategory_id WHERE s.category_id = ?'
      )
      .get(id) as { n: number }
    if (used.n > 0) throw new Error('该大类下已有账单，不能删除')
    db.prepare('DELETE FROM categories WHERE id = ?').run(id)
  }

  function addSubcategory(categoryId: number, name: string): Subcategory {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('小类名称不能为空')
    if (!db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId)) throw new Error('大类不存在')
    if (db.prepare('SELECT id FROM subcategories WHERE category_id = ? AND name = ?').get(categoryId, trimmed))
      throw new Error('该小类已存在')
    const sort = (
      db.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM subcategories WHERE category_id = ?').get(categoryId) as {
        m: number
      }
    ).m + 1
    const info = db
      .prepare('INSERT INTO subcategories (category_id, name, is_system, sort) VALUES (?, ?, 0, ?)')
      .run(categoryId, trimmed, sort)
    return { id: Number(info.lastInsertRowid), name: trimmed, isSystem: false }
  }

  function deleteSubcategory(id: number): void {
    const sub = db.prepare('SELECT is_system FROM subcategories WHERE id = ?').get(id) as
      | { is_system: number }
      | undefined
    if (!sub) throw new Error('小类不存在')
    if (sub.is_system === 1) throw new Error('内置小类不能删除')
    const used = db.prepare('SELECT COUNT(*) AS n FROM expenses WHERE subcategory_id = ?').get(id) as { n: number }
    if (used.n > 0) throw new Error('该小类下已有账单，不能删除')
    db.prepare('DELETE FROM subcategories WHERE id = ?').run(id)
  }

  // ---- 账单 ----

  function validateInput(input: ExpenseInput): void {
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error('金额必须大于 0')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('日期格式不正确')
    if (!db.prepare('SELECT id FROM subcategories WHERE id = ?').get(input.subcategoryId))
      throw new Error('所选分类不存在')
  }

  function getExpense(id: number): Expense | undefined {
    return db
      .prepare(
        `SELECT e.id, e.amount, e.date,
                e.subcategory_id AS subcategoryId, s.category_id AS categoryId,
                s.name AS subcategoryName, c.name AS categoryName,
                e.note, e.created_at AS createdAt
         FROM expenses e
         JOIN subcategories s ON s.id = e.subcategory_id
         JOIN categories c ON c.id = s.category_id
         WHERE e.id = ?`
      )
      .get(id) as Expense | undefined
  }

  function listExpenses(month: string): Expense[] {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('月份格式不正确')
    return db
      .prepare(
        `SELECT e.id, e.amount, e.date,
                e.subcategory_id AS subcategoryId, s.category_id AS categoryId,
                s.name AS subcategoryName, c.name AS categoryName,
                e.note, e.created_at AS createdAt
         FROM expenses e
         JOIN subcategories s ON s.id = e.subcategory_id
         JOIN categories c ON c.id = s.category_id
         WHERE e.date LIKE ?
         ORDER BY e.date DESC, e.id DESC`
      )
      .all(`${month}-%`) as unknown as Expense[]
  }

  function createExpense(input: ExpenseInput): Expense {
    validateInput(input)
    const info = db
      .prepare('INSERT INTO expenses (amount, date, subcategory_id, note) VALUES (?, ?, ?, ?)')
      .run(input.amount, input.date, input.subcategoryId, input.note ?? '')
    return getExpense(Number(info.lastInsertRowid)) as Expense
  }

  function updateExpense(id: number, input: ExpenseInput): Expense {
    validateInput(input)
    const info = db
      .prepare(
        "UPDATE expenses SET amount = ?, date = ?, subcategory_id = ?, note = ?, updated_at = datetime('now', 'localtime') WHERE id = ?"
      )
      .run(input.amount, input.date, input.subcategoryId, input.note ?? '', id)
    if (info.changes === 0) throw new Error('账单不存在')
    return getExpense(id) as Expense
  }

  function deleteExpense(id: number): void {
    const info = db.prepare('DELETE FROM expenses WHERE id = ?').run(id)
    if (info.changes === 0) throw new Error('账单不存在')
  }

  // ---- 首页统计 ----

  function getHomeStats(month: string): HomeStats {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('月份格式不正确')
    const monthTotal = (
      db.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE date LIKE ?').get(`${month}-%`) as {
        total: number
      }
    ).total
    const monthCount = (
      db.prepare('SELECT COUNT(*) AS n FROM expenses WHERE date LIKE ?').get(`${month}-%`) as { n: number }
    ).n
    const todayTotal = (
      db.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE date = ?').get(localDate(new Date())) as {
        total: number
      }
    ).total
    return { monthTotal, monthCount, todayTotal }
  }

  /** 首次创建数据库时写入内置分类 */
  function seed(): void {
    const row = db.prepare('SELECT COUNT(*) AS n FROM categories').get() as { n: number }
    if (row.n > 0) return
    const insertCat = db.prepare('INSERT INTO categories (name, is_system, sort) VALUES (?, 1, ?)')
    const insertSub = db.prepare('INSERT INTO subcategories (category_id, name, is_system, sort) VALUES (?, ?, 1, ?)')
    db.exec('BEGIN')
    try {
      Object.keys(BUILTIN_CATEGORIES).forEach((name, i) => {
        const info = insertCat.run(name, i)
        const catId = Number(info.lastInsertRowid)
        BUILTIN_CATEGORIES[name].forEach((sub, j) => insertSub.run(catId, sub, j))
      })
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }

  return {
    listCategories,
    addCategory,
    deleteCategory,
    addSubcategory,
    deleteSubcategory,
    listExpenses,
    createExpense,
    updateExpense,
    deleteExpense,
    getHomeStats,
    close: () => db.close()
  }
}
