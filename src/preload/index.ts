// 预加载脚本：在界面和主进程之间搭一座"安全桥"，界面只能通过这座桥访问数据
import { contextBridge, ipcRenderer } from 'electron'
import type { Api, BudgetInput, Expense, ExpenseFilters, ExpenseInput } from '../shared/types'

const api: Api = {
  getCategories: () => ipcRenderer.invoke('categories:list'),
  addCategory: (name: string) => ipcRenderer.invoke('categories:add', name),
  deleteCategory: (id: number) => ipcRenderer.invoke('categories:remove', id),
  renameCategory: (id: number, name: string) => ipcRenderer.invoke('categories:rename', id, name),
  addSubcategory: (categoryId: number, name: string) => ipcRenderer.invoke('subcategories:add', categoryId, name),
  deleteSubcategory: (id: number) => ipcRenderer.invoke('subcategories:remove', id),
  renameSubcategory: (id: number, name: string) => ipcRenderer.invoke('subcategories:rename', id, name),
  listExpenses: (filters: ExpenseFilters) => ipcRenderer.invoke('expenses:list', filters),
  createExpense: (input: ExpenseInput) => ipcRenderer.invoke('expenses:create', input),
  updateExpense: (id: number, input: ExpenseInput) => ipcRenderer.invoke('expenses:update', id, input),
  deleteExpense: (id: number) => ipcRenderer.invoke('expenses:delete', id),
  getHomeStats: (month: string) => ipcRenderer.invoke('stats:home', month),
  getMonthStats: (month: string) => ipcRenderer.invoke('stats:month', month),
  getYearStats: (year: string) => ipcRenderer.invoke('stats:year', year),
  getBudgets: (month: string) => ipcRenderer.invoke('budgets:list', month),
  setBudget: (input: BudgetInput) => ipcRenderer.invoke('budgets:set', input),
  deleteBudget: (id: number) => ipcRenderer.invoke('budgets:remove', id),
  exportExcel: (expenses: Expense[], fileName: string) => ipcRenderer.invoke('export:excel', expenses, fileName)
}

contextBridge.exposeInMainWorld('api', api)
