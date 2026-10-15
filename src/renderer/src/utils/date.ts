// 日期工具：获取今天的日期（YYYY-MM-DD）和当前月份（YYYY-MM）
import dayjs from 'dayjs'

export function today(): string {
  return dayjs().format('YYYY-MM-DD')
}

export function currentMonth(): string {
  return dayjs().format('YYYY-MM')
}
