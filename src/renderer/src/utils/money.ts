// 金额工具：内部以"分"为单位保存（避免小数误差），显示时转成"元"
export function formatMoney(cents: number): string {
  return '¥ ' + (cents / 100).toFixed(2)
}

export function yuanToCents(yuan: number): number {
  return Math.round(yuan * 100)
}

export function centsToYuan(cents: number): number {
  return cents / 100
}
