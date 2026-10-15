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

/** 界面可以调用的全部数据接口（通过 window.api 访问） */
export interface Api {
  getCategories(): Promise<Category[]>
  addCategory(name: string): Promise<Category>
  deleteCategory(id: number): Promise<void>
  addSubcategory(categoryId: number, name: string): Promise<Subcategory>
  deleteSubcategory(id: number): Promise<void>
  listExpenses(month: string): Promise<Expense[]>
  createExpense(input: ExpenseInput): Promise<Expense>
  updateExpense(id: number, input: ExpenseInput): Promise<Expense>
  deleteExpense(id: number): Promise<void>
  getHomeStats(month: string): Promise<HomeStats>
}
