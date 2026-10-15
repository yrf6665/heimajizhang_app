// 预加载脚本：在界面和主进程之间搭一座"安全桥"，界面只能通过这座桥访问数据
import { contextBridge, ipcRenderer } from 'electron'
import type { Api, ExpenseInput } from '../shared/types'

const api: Api = {
  getCategories: () => ipcRenderer.invoke('categories:list'),
  addCategory: (name: string) => ipcRenderer.invoke('categories:add', name),
  deleteCategory: (id: number) => ipcRenderer.invoke('categories:remove', id),
  addSubcategory: (categoryId: number, name: string) => ipcRenderer.invoke('subcategories:add', categoryId, name),
  deleteSubcategory: (id: number) => ipcRenderer.invoke('subcategories:remove', id),
  listExpenses: (month: string) => ipcRenderer.invoke('expenses:list', month),
  createExpense: (input: ExpenseInput) => ipcRenderer.invoke('expenses:create', input),
  updateExpense: (id: number, input: ExpenseInput) => ipcRenderer.invoke('expenses:update', id, input),
  deleteExpense: (id: number) => ipcRenderer.invoke('expenses:delete', id),
  getHomeStats: (month: string) => ipcRenderer.invoke('stats:home', month),
  getMonthStats: (month: string) => ipcRenderer.invoke('stats:month', month),
  getYearStats: (year: string) => ipcRenderer.invoke('stats:year', year)
}

contextBridge.exposeInMainWorld('api', api)
