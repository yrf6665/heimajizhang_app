// 错误提示工具：把系统内部报错转成用户看得懂的中文提示
export function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  // 去掉系统自动加的前缀，只保留真正的原因
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
