// 通信桥模块：把界面（渲染进程）发来的请求转给数据库模块处理
// 同时负责：导出 Excel 文件、记账超支时发送系统弹窗提醒
import { BrowserWindow, dialog, ipcMain, Notification } from 'electron'
import type { SaveDialogOptions } from 'electron'
import * as XLSX from 'xlsx'
import type { BudgetInput, Expense, ExpenseFilters, ExpenseInput } from '../shared/types'
import type { Db } from './db'

export function registerIpc(db: Db): void {
  ipcMain.handle('categories:list', () => db.listCategories())
  ipcMain.handle('categories:add', (_e, name: string) => db.addCategory(name))
  ipcMain.handle('categories:remove', (_e, id: number) => db.deleteCategory(id))
  ipcMain.handle('subcategories:add', (_e, categoryId: number, name: string) =>
    db.addSubcategory(categoryId, name)
  )
  ipcMain.handle('subcategories:remove', (_e, id: number) => db.deleteSubcategory(id))
  ipcMain.handle('expenses:list', (_e, filters: ExpenseFilters) => db.listExpenses(filters))
  ipcMain.handle('expenses:create', (_e, input: ExpenseInput) => {
    const expense = db.createExpense(input)
    checkBudgetAlerts(db, input)
    return expense
  })
  ipcMain.handle('expenses:update', (_e, id: number, input: ExpenseInput) => {
    const expense = db.updateExpense(id, input)
    checkBudgetAlerts(db, input)
    return expense
  })
  ipcMain.handle('expenses:delete', (_e, id: number) => db.deleteExpense(id))
  ipcMain.handle('stats:home', (_e, month: string) => db.getHomeStats(month))
  ipcMain.handle('stats:month', (_e, month: string) => db.getMonthStats(month))
  ipcMain.handle('stats:year', (_e, year: string) => db.getYearStats(year))
  ipcMain.handle('budgets:list', (_e, month: string) => db.getBudgets(month))
  ipcMain.handle('budgets:set', (_e, input: BudgetInput) => db.setBudget(input))
  ipcMain.handle('budgets:remove', (_e, id: number) => db.deleteBudget(id))
  ipcMain.handle('export:excel', (_e, expenses: Expense[], fileName: string) => exportExcel(expenses, fileName))
}

/**
 * 记账后检查预算：只有当"这一笔"导致支出从预算内跨到预算外时，才弹系统通知
 * （平时保存不会打扰用户）
 */
function checkBudgetAlerts(db: Db, input: ExpenseInput): void {
  const month = input.date.slice(0, 7)
  const budgets = db.getBudgets(month)
  if (budgets.length === 0) return

  const monthTotal = db.getHomeStats(month).monthTotal
  const messages: string[] = []

  // 总预算：这一笔让本月总支出越过总预算线
  const totalBudget = budgets.find((b) => b.categoryId === null)
  if (totalBudget && monthTotal > totalBudget.amount && monthTotal - input.amount <= totalBudget.amount) {
    messages.push(
      `本月总支出已超出预算：已花 ¥${(monthTotal / 100).toFixed(2)}，预算 ¥${(totalBudget.amount / 100).toFixed(2)}`
    )
  }

  // 分类预算：找到这笔账所属大类，看它是否越过该分类的预算线
  const categoryId = db
    .listCategories()
    .find((c) => c.subcategories.some((s) => s.id === input.subcategoryId))?.id
  if (categoryId) {
    const catBudget = budgets.find((b) => b.categoryId === categoryId)
    if (catBudget) {
      const catTotal = db.getMonthStats(month).categories.find((c) => c.categoryId === categoryId)?.total ?? 0
      if (catTotal > catBudget.amount && catTotal - input.amount <= catBudget.amount) {
        messages.push(
          `「${catBudget.categoryName}」分类已超出预算：已花 ¥${(catTotal / 100).toFixed(2)}，预算 ¥${(catBudget.amount / 100).toFixed(2)}`
        )
      }
    }
  }

  if (messages.length > 0 && Notification.isSupported()) {
    new Notification({ title: '黑马记账 · 预算提醒', body: messages.join('\n') }).show()
  }
}

/** 导出账单为真正的 Excel 文件（.xlsx），让用户选择保存位置 */
async function exportExcel(expenses: Expense[], fileName: string): Promise<{ canceled: boolean; path?: string }> {
  const options: SaveDialogOptions = {
    title: '导出账单到 Excel',
    defaultPath: `${fileName}.xlsx`,
    filters: [{ name: 'Excel 文件', extensions: ['xlsx'] }]
  }
  const win = BrowserWindow.getFocusedWindow()
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return { canceled: true }

  const rows = expenses.map((e) => ({
    日期: e.date,
    大类: e.categoryName,
    小类: e.subcategoryName,
    '金额（元）': e.amount / 100,
    备注: e.note
  }))
  const sheet = XLSX.utils.json_to_sheet(rows)
  sheet['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 32 }]
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, '账单')
  XLSX.writeFile(book, result.filePath)
  return { canceled: false, path: result.filePath }
}
