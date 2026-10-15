// 通信桥模块：把界面（渲染进程）发来的请求转给数据库模块处理
import { ipcMain } from 'electron'
import type { ExpenseInput } from '../shared/types'
import type { Db } from './db'

export function registerIpc(db: Db): void {
  ipcMain.handle('categories:list', () => db.listCategories())
  ipcMain.handle('categories:add', (_e, name: string) => db.addCategory(name))
  ipcMain.handle('categories:remove', (_e, id: number) => db.deleteCategory(id))
  ipcMain.handle('subcategories:add', (_e, categoryId: number, name: string) =>
    db.addSubcategory(categoryId, name)
  )
  ipcMain.handle('subcategories:remove', (_e, id: number) => db.deleteSubcategory(id))
  ipcMain.handle('expenses:list', (_e, month: string) => db.listExpenses(month))
  ipcMain.handle('expenses:create', (_e, input: ExpenseInput) => db.createExpense(input))
  ipcMain.handle('expenses:update', (_e, id: number, input: ExpenseInput) => db.updateExpense(id, input))
  ipcMain.handle('expenses:delete', (_e, id: number) => db.deleteExpense(id))
  ipcMain.handle('stats:home', (_e, month: string) => db.getHomeStats(month))
}
