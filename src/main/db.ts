// 数据库模块：负责账本数据的保存和查询（数据存在本机 SQLite 文件里）
// 说明：使用 Node.js 自带的 SQLite 模块（node:sqlite），无需安装任何额外编译工具
import { DatabaseSync } from 'node:sqlite'
import type {
  Budget,
  BudgetInput,
  Category,
  CategoryStat,
  DailyStat,
  Expense,
  ExpenseFilters,
  ExpenseInput,
  HomeStats,
  MonthStats,
  MonthlyStat,
  Subcategory
} from '../shared/types'

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
  listExpenses(filters: ExpenseFilters): Expense[]
  createExpense(input: ExpenseInput): Expense
  updateExpense(id: number, input: ExpenseInput): Expense
  deleteExpense(id: number): void
  getHomeStats(month: string): HomeStats
  getMonthStats(month: string): MonthStats
  getYearStats(year: string): MonthlyStat[]
  getBudgets(month: string): Budget[]
  setBudget(input: BudgetInput): Budget
  deleteBudget(id: number): void
  close(): void
}

/** 校验月份格式且必须是真实存在的月份（1~12 月） */
function isValidMonth(month: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(month)) return false
  const m = Number(month.slice(5))
  return m >= 1 && m <= 12
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
    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL CHECK (amount > 0)
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

  function listExpenses(filters: ExpenseFilters): Expense[] {
    const where: string[] = []
    const params: (string | number)[] = []
    if (filters.month) {
      if (!/^\d{4}-\d{2}$/.test(filters.month)) throw new Error('月份格式不正确')
      where.push('e.date LIKE ?')
      params.push(`${filters.month}-%`)
    }
    if (filters.dateFrom) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(filters.dateFrom)) throw new Error('起始日期格式不正确')
      where.push('e.date >= ?')
      params.push(filters.dateFrom)
    }
    if (filters.dateTo) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(filters.dateTo)) throw new Error('结束日期格式不正确')
      where.push('e.date <= ?')
      params.push(filters.dateTo)
    }
    if (filters.categoryId) {
      where.push('s.category_id = ?')
      params.push(filters.categoryId)
    }
    if (filters.keyword && filters.keyword.trim()) {
      where.push('(e.note LIKE ? OR s.name LIKE ? OR c.name LIKE ?)')
      const kw = `%${filters.keyword.trim()}%`
      params.push(kw, kw, kw)
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
    return db
      .prepare(
        `SELECT e.id, e.amount, e.date,
                e.subcategory_id AS subcategoryId, s.category_id AS categoryId,
                s.name AS subcategoryName, c.name AS categoryName,
                e.note, e.created_at AS createdAt
         FROM expenses e
         JOIN subcategories s ON s.id = e.subcategory_id
         JOIN categories c ON c.id = s.category_id
         ${whereSql}
         ORDER BY e.date DESC, e.id DESC`
      )
      .all(...params) as unknown as Expense[]
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
    if (!isValidMonth(month)) throw new Error('月份格式不正确')
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

  // ---- 统计 ----

  function prevMonthOf(month: string): string {
    const [y, m] = month.split('-').map(Number)
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
  }

  function sumInMonth(month: string): number {
    return (
      db.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE date LIKE ?').get(`${month}-%`) as {
        total: number
      }
    ).total
  }

  function getMonthStats(month: string): MonthStats {
    if (!isValidMonth(month)) throw new Error('月份格式不正确')
    const monthTotal = sumInMonth(month)
    const monthCount = (
      db.prepare('SELECT COUNT(*) AS n FROM expenses WHERE date LIKE ?').get(`${month}-%`) as { n: number }
    ).n
    const prevMonthTotal = sumInMonth(prevMonthOf(month))

    // 各分类汇总（只列出有支出的分类，按金额从大到小）
    const categories = db
      .prepare(
        `SELECT c.id AS categoryId, c.name AS categoryName, COALESCE(SUM(e.amount), 0) AS total
         FROM categories c
         LEFT JOIN subcategories s ON s.category_id = c.id
         LEFT JOIN expenses e ON e.subcategory_id = s.id AND e.date LIKE ?
         GROUP BY c.id, c.name
         HAVING total > 0
         ORDER BY total DESC`
      )
      .all(`${month}-%`) as unknown as CategoryStat[]
    for (const c of categories) {
      c.percent = monthTotal > 0 ? Math.round((c.total / monthTotal) * 1000) / 10 : 0
    }

    // 补齐当月每一天（没花钱的日子为 0）
    const [y, m] = month.split('-').map(Number)
    const daysInMonth = new Date(y, m, 0).getDate()
    const rows = db
      .prepare('SELECT date, SUM(amount) AS total FROM expenses WHERE date LIKE ? GROUP BY date ORDER BY date')
      .all(`${month}-%`) as unknown as DailyStat[]
    const byDate = new Map(rows.map((r) => [r.date, r.total]))
    const daily: DailyStat[] = []
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${month}-${String(d).padStart(2, '0')}`
      daily.push({ date, total: byDate.get(date) ?? 0 })
    }

    return { month, monthTotal, monthCount, prevMonthTotal, categories, daily }
  }

  function getYearStats(year: string): MonthlyStat[] {
    if (!/^\d{4}$/.test(year)) throw new Error('年份格式不正确')
    const rows = db
      .prepare(
        'SELECT substr(date, 1, 7) AS month, SUM(amount) AS total FROM expenses WHERE date LIKE ? GROUP BY month ORDER BY month'
      )
      .all(`${year}-%`) as unknown as MonthlyStat[]
    const byMonth = new Map(rows.map((r) => [r.month, r.total]))
    const result: MonthlyStat[] = []
    for (let m = 1; m <= 12; m++) {
      const month = `${year}-${String(m).padStart(2, '0')}`
      result.push({ month, total: byMonth.get(month) ?? 0 })
    }
    return result
  }

  // ---- 预算 ----

  function getBudgets(month: string): Budget[] {
    if (!isValidMonth(month)) throw new Error('月份格式不正确')
    return db
      .prepare(
        `SELECT b.id, b.month, b.category_id AS categoryId, c.name AS categoryName, b.amount
         FROM budgets b
         LEFT JOIN categories c ON c.id = b.category_id
         WHERE b.month = ?
         ORDER BY (b.category_id IS NULL) DESC, c.sort, c.id`
      )
      .all(month) as unknown as Budget[]
  }

  function setBudget(input: BudgetInput): Budget {
    if (!isValidMonth(input.month)) throw new Error('月份格式不正确')
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error('预算金额必须大于 0')
    if (input.categoryId !== null && !db.prepare('SELECT id FROM categories WHERE id = ?').get(input.categoryId))
      throw new Error('分类不存在')

    // 同一个"月份+分类"只保留一条预算：已存在就更新，不存在就新建
    let existing: { id: number } | undefined
    if (input.categoryId === null) {
      existing = db.prepare('SELECT id FROM budgets WHERE month = ? AND category_id IS NULL').get(input.month) as
        | { id: number }
        | undefined
    } else {
      existing = db
        .prepare('SELECT id FROM budgets WHERE month = ? AND category_id = ?')
        .get(input.month, input.categoryId) as { id: number } | undefined
    }
    if (existing) {
      db.prepare('UPDATE budgets SET amount = ? WHERE id = ?').run(input.amount, existing.id)
    } else {
      db.prepare('INSERT INTO budgets (month, category_id, amount) VALUES (?, ?, ?)').run(
        input.month,
        input.categoryId,
        input.amount
      )
    }

    const row =
      input.categoryId === null
        ? (db.prepare('SELECT id, month, category_id AS categoryId, amount FROM budgets WHERE month = ? AND category_id IS NULL').get(input.month) as unknown as {
            id: number
            month: string
            categoryId: number | null
            amount: number
          })
        : (db
            .prepare('SELECT id, month, category_id AS categoryId, amount FROM budgets WHERE month = ? AND category_id = ?')
            .get(input.month, input.categoryId) as unknown as {
            id: number
            month: string
            categoryId: number | null
            amount: number
          })
    const categoryName =
      row.categoryId === null
        ? null
        : (db.prepare('SELECT name FROM categories WHERE id = ?').get(row.categoryId) as { name: string }).name
    return { id: row.id, month: row.month, categoryId: row.categoryId, categoryName, amount: row.amount }
  }

  function deleteBudget(id: number): void {
    const info = db.prepare('DELETE FROM budgets WHERE id = ?').run(id)
    if (info.changes === 0) throw new Error('预算不存在')
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
    getMonthStats,
    getYearStats,
    getBudgets,
    setBudget,
    deleteBudget,
    close: () => db.close()
  }
}
