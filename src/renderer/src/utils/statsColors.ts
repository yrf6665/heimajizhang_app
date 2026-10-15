// 统计图表配色：遵循数据可视化设计规范（色盲安全配色，已通过专业校验工具验证）
// 核心原则：颜色固定跟随"分类"本身，不随排名变化；自定义分类统一归入"其他"灰色
export const CATEGORY_COLORS: Record<string, string> = {
  餐饮: '#2a78d6',
  交通: '#eb6834',
  购物: '#1baf7a',
  居住: '#eda100',
  娱乐: '#e87ba4',
  医疗: '#008300',
  教育: '#6250d6',
  人情往来: '#e34948'
}

/** "其他"及自定义分类的颜色（弱化处理，不抢主要分类的注意力） */
export const OTHER_GRAY = '#c3c2b7'

/** 图表文字与辅助线颜色（浅色背景专用） */
export const INK = {
  primary: '#0b0b0b',
  secondary: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7'
}

/** 涨跌状态色（花钱变多=红提醒，变少=绿安心），必须搭配 ▲▼ 图标使用 */
export const DELTA_COLORS = {
  up: '#d03b3b',
  down: '#0ca30c'
}

/** 单系列图表（每日/每月支出）统一使用蓝色 */
export const SINGLE_SERIES_BLUE = '#2a78d6'

export function categoryColor(name: string): string {
  return CATEGORY_COLORS[name] ?? OTHER_GRAY
}
