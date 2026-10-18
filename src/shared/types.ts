// 前后端共享的数据类型定义（大白话：记账数据的"格式约定"，界面和数据库都按这个格式传数据）

/** 二级小类 */
export interface Subcategory {
  id: number
  name: string
  /** 是否为内置小类（内置的不能删除，自定义的可以删） */
  isSystem: boolean
}

/** 一级大类 */
export interface Category {
  id: number
  name: string
  isSystem: boolean
  subcategories: Subcategory[]
}

/** 一笔账单 */
export interface Expense {
  id: number
  /** 金额，单位：分（内部用整数保存，避免小数计算误差；显示时除以 100 变成元） */
  amount: number
  /** 日期，格式 YYYY-MM-DD，例如 2026-10-15 */
  date: string
  categoryId: number
  categoryName: string
  subcategoryId: number
  subcategoryName: string
  note: string
  createdAt: string
}

/** 新增/编辑账单时提交的数据 */
export interface ExpenseInput {
  amount: number
  date: string
  subcategoryId: number
  note: string
}

/** 首页概览统计数据 */
export interface HomeStats {
  /** 本月总支出（分） */
  monthTotal: number
  /** 本月记账笔数 */
  monthCount: number
  /** 今日支出（分） */
  todayTotal: number
}

/** 某个分类的月度汇总 */
export interface CategoryStat {
  categoryId: number
  categoryName: string
  /** 该分类当月总支出（分） */
  total: number
  /** 占当月总支出百分比（0-100，保留 1 位小数） */
  percent: number
}

/** 某一天的支出汇总 */
export interface DailyStat {
  date: string
  total: number
}

/** 某一月的支出汇总（用于年度对比图） */
export interface MonthlyStat {
  month: string
  total: number
}

/** 统计页某个月份的完整数据 */
export interface MonthStats {
  month: string
  monthTotal: number
  monthCount: number
  /** 上月总支出（分），用于环比 */
  prevMonthTotal: number
  /** 各分类汇总（按金额从大到小） */
  categories: CategoryStat[]
  /** 当月每一天的支出（缺失日期补 0） */
  daily: DailyStat[]
}

/** 账单查询筛选条件（全部可选，可组合使用） */
export interface ExpenseFilters {
  /** 按月份（YYYY-MM），与起止日期二选一 */
  month?: string
  /** 起始日期（含，YYYY-MM-DD） */
  dateFrom?: string
  /** 结束日期（含，YYYY-MM-DD） */
  dateTo?: string
  /** 关键词：匹配备注、小类名、大类名 */
  keyword?: string
  /** 按一级大类筛选 */
  categoryId?: number
}

/** 预算（总预算或分类预算） */
export interface Budget {
  id: number
  month: string
  /** null 表示总预算 */
  categoryId: number | null
  /** null 表示总预算 */
  categoryName: string | null
  /** 预算金额（分） */
  amount: number
}

/** 设置预算时提交的数据 */
export interface BudgetInput {
  month: string
  categoryId: number | null
  amount: number
}

/** 导出 Excel 的结果 */
export interface ExportResult {
  /** 用户是否取消了保存 */
  canceled: boolean
  /** 保存成功时的文件路径 */
  path?: string
}

/** 界面可以调用的全部数据接口（通过 window.api 访问） */
export interface Api {
  getCategories(): Promise<Category[]>
  addCategory(name: string): Promise<Category>
  deleteCategory(id: number): Promise<void>
  renameCategory(id: number, name: string): Promise<void>
  addSubcategory(categoryId: number, name: string): Promise<Subcategory>
  deleteSubcategory(id: number): Promise<void>
  renameSubcategory(id: number, name: string): Promise<void>
  listExpenses(filters: ExpenseFilters): Promise<Expense[]>
  createExpense(input: ExpenseInput): Promise<Expense>
  updateExpense(id: number, input: ExpenseInput): Promise<Expense>
  deleteExpense(id: number): Promise<void>
  getHomeStats(month: string): Promise<HomeStats>
  getMonthStats(month: string): Promise<MonthStats>
  getYearStats(year: string): Promise<MonthlyStat[]>
  getBudgets(month: string): Promise<Budget[]>
  setBudget(input: BudgetInput): Promise<Budget>
  deleteBudget(id: number): Promise<void>
  exportExcel(expenses: Expense[], fileName: string): Promise<ExportResult>
}
