#!/usr/bin/env node
// ============================================================================
// 一键安装"提交质量门禁"
// ----------------------------------------------------------------------------
// 大白话：告诉 git "以后每次提交前，先跑 scripts/git-hooks 里的小脚本"。
//        相当于给 git 装上一道安检门，装一次长期有效。
//
// 运行方式：npm run gate:setup
// 换电脑后，只要跑一次这个命令，门禁就恢复了（它不需要联网、不装任何东西）。
// ============================================================================

const { execFileSync } = require('node:child_process')
const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')

const ROOT = join(__dirname, '..')
const HOOKS_DIR = 'scripts/git-hooks'
const HOOK_FILE = join(ROOT, HOOKS_DIR, 'pre-commit')
const GATE_SCRIPT = join(ROOT, 'scripts', 'quality-gate.cjs')

// 执行 git 命令，返回输出文字；失败时把错误往下抛，由调用方处理
function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function say(text = '') {
  process.stdout.write(text + '\n')
}

function stop(message) {
  say('✗ ' + message)
  process.exit(1)
}

// ---- 第 1 步：确认是在 git 仓库里 ----------------------------------------
try {
  git(['rev-parse', '--git-dir'])
} catch {
  stop('当前目录不是 git 仓库，无法安装门禁。请确认在项目目录里运行。')
}

// ---- 第 2 步：确认需要的文件都在 ------------------------------------------
if (!existsSync(HOOK_FILE)) stop(`缺少钩子文件：${HOOKS_DIR}/pre-commit`)
if (!existsSync(GATE_SCRIPT)) stop('缺少门禁脚本：scripts/quality-gate.cjs')

// ---- 第 3 步：检查钩子文件的换行符 ----------------------------------------
// 必须是 LF。如果被 Windows 的自动转换弄成了 CRLF，钩子会执行失败，
// 这里提前发现并给出解决提示，省得用户提交时看到看不懂的报错。
const hookContent = readFileSync(HOOK_FILE, 'utf8')
if (hookContent.includes('\r\n')) {
  stop(
    '钩子文件的换行符是 Windows 格式（CRLF），git 无法执行。\n' +
      '解决：在项目目录运行  git add --renormalize .  然后再运行一次本命令。'
  )
}

// ---- 第 4 步：把钩子登记为"可执行" ----------------------------------------
// Windows 上文件没有"可执行"这个概念，但把项目拷到 Mac/Linux 之后，git 会检查
// 这个标记；没设的话钩子在那里会被直接忽略，门禁就悄悄失效了（而项目是支持 Mac 的）。
try {
  git(['update-index', '--add', '--chmod=+x', `${HOOKS_DIR}/pre-commit`])
} catch {
  // 文件还没被 git 管理时会失败；不影响本机使用，提示一下就好
  say('提示：钩子暂时无法登记到 git 索引（文件还没加入版本管理），不影响本机使用。')
}

// ---- 第 5 步：正式安装 ----------------------------------------------------
// core.hooksPath = 告诉 git "钩子不在默认的 .git/hooks 里，去这个文件夹找"
git(['config', 'core.hooksPath', HOOKS_DIR])

// 安装完复核一次：权限标记和换行符都必须正确，否则等于装了个哑门禁
const mode = git(['ls-files', '-s', `${HOOKS_DIR}/pre-commit`]).split(/\s+/)[0]
if (mode && mode !== '100755') {
  say(`注意：钩子在 git 里的权限是 ${mode}（应为 100755），Mac/Linux 上可能不执行。`)
}

say('✓ 提交质量门禁已安装')
say('')
say('  钩子目录：' + HOOKS_DIR)
say('  生效范围：只在当前这个项目（不影响你电脑上其它项目）')
say('')
say('以后每次 git commit 之前，git 会自动检查：')
say('  · 单元测试是否全部通过')
say('  · 质量检查是否有硬伤（安全高危 / 类型错误 / 严重注释问题）')
say('  · 检查完成之后，代码有没有再改动过')
say('')
say('最省事的做法：直接用 /git-commit，它会自动做完全部检查再提交。')
say('想临时跳过检查：git commit --no-verify（不推荐，紧急情况才用）')
