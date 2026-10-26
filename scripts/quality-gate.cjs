#!/usr/bin/env node
// ============================================================================
// 提交质量门禁（quality gate）
// ----------------------------------------------------------------------------
// 作用：给 git 提交装一道"安检门"。只有单元测试和质量检查都通过、并且
//      通过之后代码没有再改动过，git 才允许存档（提交）。
//
// 大白话解释几个词：
//   · 门禁 = 进门前的安检，不合格不让进
//   · 指纹（tree hash）= git 给"当前所有文件内容"算出的一个长编号。
//     哪怕只改一个字，编号就会变。所以它能代表"检查的是不是现在这份代码"。
//
// 用法（一般不用手敲，/git-commit 技能会自动调用）：
//   node scripts/quality-gate.cjs report --agent tester --from-vitest .quality/vitest.json
//   node scripts/quality-gate.cjs report --agent quality --security-high 0 --dep-high 3 --typecheck pass --comment-severe 0
//   node scripts/quality-gate.cjs seal      # 封存结论 + 记录指纹，提交前由技能调用
//   node scripts/quality-gate.cjs check      # 提交时由 git 钩子自动调用
//   node scripts/quality-gate.cjs status     # 看看现在门禁是什么状态
//   node scripts/quality-gate.cjs reset      # 清空结论，重新来过
//
// 退出码约定：0 = 放行 / 成功；1 = 拦下 / 失败（git 钩子只认"非零"为失败）
// ============================================================================

const { execFileSync } = require('node:child_process')
const { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } = require('node:fs')
const { join } = require('node:path')

// 合并提交（把一条分支并进来）默认放行，因为合并本身不写新代码。
// 想改成"合并也要检查"，把这里改成 false 即可。
const ALLOW_MERGE_COMMITS = true

// 结论文件固定放在项目根目录的 .quality 文件夹里（这个文件夹已被 .gitignore 忽略，
// 所以标记文件不会被提交，也就不会自己弄脏指纹）。
const QUALITY_DIR_NAME = '.quality'

// ---------------------------------------------------------------------------
// 小工具：执行 git 命令并拿到输出文字
// ---------------------------------------------------------------------------
function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim()
}

// 找到项目根目录（git 仓库的最外层）。所有路径都以它为基准，避免"在哪个文件夹里
// 执行"影响结果。
const ROOT = git(['rev-parse', '--show-toplevel'])
const QUALITY_DIR = join(ROOT, QUALITY_DIR_NAME)

// 文件路径拼接工具，读起来短一点
const inQuality = (name) => join(QUALITY_DIR, name)

// 把时间写成"2026-10-27 20:15:30"这种人能看懂的样子（本机时区）
function nowText() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

// 读一个 JSON 文件；文件不存在或者内容坏了都返回 null（调用方按"没有"处理）
function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

// 写 JSON 文件；保证 .quality 文件夹存在
function writeJson(path, data) {
  mkdirSync(QUALITY_DIR, { recursive: true })
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

// 计算当前代码的指纹。注意：它算的是"暂存区"（已经放进待提交篮子的内容）。
// 提交时 git 正是用暂存区里的内容来生成这次提交，所以两者对得上。
function currentTree() {
  return git(['write-tree'], { cwd: ROOT })
}

// 统一打印一行提示
function say(text = '') {
  process.stdout.write(text + '\n')
}

// 被拦截时的统一收尾：打印应急办法并返回失败
function reject(reason, advice) {
  say('')
  say('✗ 提交被质量门禁拦下')
  say('原因：' + reason)
  if (advice) say('处理：' + advice)
  say('应急：确有必要可执行 `git commit --no-verify` 跳过检查（Claude 不会主动这么做）。')
  say('')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 子命令 1：report —— 登记某一项检查的结论
// ---------------------------------------------------------------------------
function cmdReport(argv) {
  const agent = getArg(argv, '--agent')

  if (agent === 'tester') {
    // 单元测试结论：直接读 Vitest 自己生成的 JSON 报告，
    // 通过与否由脚本按"失败数是否为 0"自动判定，不让人手工填"通过"。
    const from = getArg(argv, '--from-vitest')
    if (!from) fail('report 缺少 --from-vitest 参数（Vitest 报告的路径）')

    const reportPath = join(ROOT, from)
    const raw = readJson(reportPath)
    if (!raw) {
      fail(`读不到单元测试报告：${from}\n请先运行 npx vitest run --reporter=default --reporter=json --outputFile.json=.quality/vitest.json`)
    }

    // Vitest 的 JSON 里，这几个数字就是最终的考试成绩
    const passed = Number(raw.numPassedTests)
    const failed = Number(raw.numFailedTests)
    const total = Number(raw.numTotalTests)

    // 任何一个数字缺失，都按"不可信"处理（宁可拦下，不可放过）
    if (!Number.isFinite(passed) || !Number.isFinite(failed) || !Number.isFinite(total)) {
      fail('单元测试报告格式看不懂（缺少通过数/失败数），本次按"未通过"处理')
    }

    const verdict = failed === 0 && passed > 0 ? 'pass' : 'fail'
    writeJson(inQuality('tester.json'), {
      agent: 'tester',
      verdict,
      passed,
      failed,
      total,
      // 记下"这条结论是针对哪份代码"的指纹。封存时要对得上，
      // 防止"检查完、封存前又改了文件"把旧结论套到新代码上。
      tree: currentTree(),
      at: nowText()
    })

    say(`单元测试结论：${verdict === 'pass' ? '通过' : '不通过'}（共 ${total} 条，通过 ${passed}，失败 ${failed}）`)
    return
  }

  if (agent === 'quality') {
    // 质量检查结论：由 quality-engineer 分身把体检数字报进来。
    // 能写文件的工具它没有，所以这是它唯一的写入口。
    const securityHigh = Number(getArg(argv, '--security-high'))
    const typecheck = getArg(argv, '--typecheck')
    const commentSevere = Number(getArg(argv, '--comment-severe'))
    // 依赖包漏洞（第三方积木包自带的毛病）只记录、不拦提交。
    // 理由：这些不是本次改动引入的，拦下来会导致升级依赖之前谁都提交不了。
    const depHigh = Number(getArg(argv, '--dep-high') ?? 0)

    if (!Number.isInteger(securityHigh) || !Number.isInteger(commentSevere) || !Number.isInteger(depHigh)) {
      fail('report 缺少数字参数：--security-high（代码级安全高危条数）、--comment-severe（严重注释问题条数）、--dep-high（依赖包高危条数，可选）')
    }
    if (typecheck !== 'pass' && typecheck !== 'fail') {
      fail('report 的 --typecheck 只能填 pass 或 fail')
    }
    if (securityHigh < 0 || commentSevere < 0 || depHigh < 0) {
      fail('report 的条数不能是负数')
    }

    // "只拦硬伤"的判定口径：代码级安全高危、类型检查失败、严重注释问题，
    // 出现任何一项就不通过。中危/低危/注释比例不足/依赖漏洞只记录，不拦。
    const hardProblems = []
    if (securityHigh > 0) hardProblems.push(`代码级安全高危 ${securityHigh} 条`)
    if (typecheck === 'fail') hardProblems.push('类型检查未通过')
    if (commentSevere > 0) hardProblems.push(`严重注释问题 ${commentSevere} 条`)

    const verdict = hardProblems.length === 0 ? 'pass' : 'fail'
    writeJson(inQuality('quality.json'), {
      agent: 'quality',
      verdict,
      securityHigh,
      depHigh,
      typecheck,
      commentSevere,
      tree: currentTree(),
      at: nowText()
    })

    say(
      verdict === 'pass'
        ? '质量检查结论：通过（无硬伤）'
        : `质量检查结论：不通过（${hardProblems.join('、')}）`
    )
    return
  }

  fail('report 的 --agent 只能是 tester 或 quality')
}

// ---------------------------------------------------------------------------
// 子命令 2：seal —— 把两项结论"封存"，并记下当前代码的指纹
// ---------------------------------------------------------------------------
function cmdSeal() {
  // 安全前提：.quality 必须被 git 忽略。否则标记文件本身会被提交，
  // 指纹就会"算完又变"，永远对不上。
  if (!isIgnored(QUALITY_DIR_NAME + '/')) {
    fail(`.quality 文件夹没有被 .gitignore 忽略，门禁无法工作。\n请在 .gitignore 里加一行：${QUALITY_DIR_NAME}/`)
  }

  const tester = readJson(inQuality('tester.json'))
  const quality = readJson(inQuality('quality.json'))

  if (!tester) fail('还没有单元测试结论，请先运行 /git-commit（它会让 tester 分身跑测试）')
  if (!quality) fail('还没有质量检查结论，请先运行 /git-commit（它会让 quality-engineer 分身做体检）')

  if (tester.verdict !== 'pass') {
    fail(`单元测试未通过（失败 ${tester.failed} 条），不能封存。修好后再重新检查。`)
  }
  if (quality.verdict !== 'pass') {
    fail('质量检查未通过（存在硬伤），不能封存。修好后再重新检查。')
  }

  // 把工作区里所有改动都放进"待提交篮子"，这样指纹涵盖的就是即将提交的全部内容
  git(['add', '-A'], { cwd: ROOT })
  const tree = currentTree()

  // 两份结论必须都是针对"现在这份代码"做的。
  // 每份结论在登记时都记了自己的指纹，这里逐一核对：
  // 对不上说明检查完之后又改过文件，旧结论不能算数。
  if (tester.tree !== tree) {
    fail('单元测试结论是针对另一份代码做的（检查之后又改过文件），请重新运行 /git-commit。')
  }
  if (quality.tree !== tree) {
    fail('质量检查结论是针对另一份代码做的（检查之后又改过文件），请重新运行 /git-commit。')
  }

  let head = ''
  try {
    head = git(['rev-parse', 'HEAD'], { cwd: ROOT })
  } catch {
    // 仓库还没有任何提交时会失败，属正常情况，留空即可
    head = ''
  }

  writeJson(inQuality('stamp.json'), {
    version: 1,
    tree,
    head,
    sealedAt: nowText(),
    tests: { passed: tester.passed, failed: tester.failed },
    quality: {
      securityHigh: quality.securityHigh,
      depHigh: quality.depHigh,
      typecheck: quality.typecheck,
      commentSevere: quality.commentSevere
    }
  })

  say('✓ 门禁已封存：单元测试 + 质量检查均通过，指纹已记录')
  say(`  指纹 ${tree.slice(0, 12)}…`)
}

// ---------------------------------------------------------------------------
// 子命令 3：check —— 提交时由 git 钩子调用，决定放行还是拦下
// ---------------------------------------------------------------------------
function cmdCheck() {
  // 合并提交：只提示，不拦。因为分支在合并进来之前已经各自过了门禁，
  // 合并动作本身不产生新代码。
  if (ALLOW_MERGE_COMMITS && existsSync(join(ROOT, '.git', 'MERGE_HEAD'))) {
    say('ℹ 检测到合并提交，跳过质量门禁（合并前两侧分支已各自通过检查）')
    return
  }

  const stamp = readJson(inQuality('stamp.json'))
  if (!stamp) {
    reject(
      '还没有做过质量检查，或者检查结论已被清空。',
      '请运行 /git-commit，它会先跑单元测试和质量检查，通过后再提交。'
    )
  }

  // 结论本身没通过（理论上 seal 已经拦过，这里再兜一次底）
  if (stamp.tests && stamp.tests.failed > 0) {
    reject(`最近一次单元测试有 ${stamp.tests.failed} 条失败。`, '修好测试后再运行 /git-commit。')
  }
  if (stamp.quality && (stamp.quality.securityHigh > 0 || stamp.quality.typecheck === 'fail' || stamp.quality.commentSevere > 0)) {
    reject('最近一次质量检查存在硬伤（安全高危 / 类型错误 / 严重注释问题）。', '处理后重新运行 /git-commit。')
  }

  // 核心一步：比对指纹。检查完成之后只要有人改过文件，这里就对不上。
  // 不过指纹只看"待提交篮子"里的内容，看不到还没 add 的改动——
  // 那种情况下提交会悄悄漏掉用户的改动，所以先单独查一遍。
  const pending = pendingPaths()
  if (pending.length > 0) {
    reject(
      `有 ${pending.length} 个改动还没放进待提交篮子（例如 ${pending[0]}），这次提交不会包含它们。`,
      '请重新运行 /git-commit，让这些改动也一起过检查并提交。'
    )
  }

  const now = currentTree()
  if (now !== stamp.tree) {
    reject(
      '当前要提交的内容，和上次检查时的内容不一致（检查之后又改过文件）。',
      '请重新运行 /git-commit，让新代码也过一遍检查。'
    )
  }

  say(`✓ 质量门禁通过（单元测试 ${stamp.tests.passed} 条全过，质量检查无硬伤）`)
}

// ---------------------------------------------------------------------------
// 子命令 4：status —— 人工查看当前状态
// ---------------------------------------------------------------------------
function cmdStatus() {
  const tester = readJson(inQuality('tester.json'))
  const quality = readJson(inQuality('quality.json'))
  const stamp = readJson(inQuality('stamp.json'))

  say('【提交质量门禁 · 当前状态】')
  say('')
  say(
    tester
      ? `单元测试：${tester.verdict === 'pass' ? '通过' : '不通过'}（共 ${tester.total} 条，失败 ${tester.failed}），${tester.at}`
      : '单元测试：未检查'
  )
  say(
    quality
      ? `质量检查：${quality.verdict === 'pass' ? '通过' : '不通过'}` +
          `（代码级高危 ${quality.securityHigh} 条，依赖包高危 ${quality.depHigh ?? 0} 条），${quality.at}`
      : '质量检查：未检查'
  )

  if (!stamp) {
    say('封存标记：无（现在提交会被拦下）')
    return
  }

  say(`封存标记：有，于 ${stamp.sealedAt}`)

  // 顺手判断这个标记现在还管不管用
  let same = false
  try {
    same = currentTree() === stamp.tree
  } catch {
    same = false
  }
  const pending = pendingPaths()
  if (!same) {
    say('标记有效性：已失效（待提交内容与检查时不一致，需要重新检查）')
  } else if (pending.length > 0) {
    say(`标记有效性：部分失效（有 ${pending.length} 个改动还没纳入检查，例如 ${pending[0]}）`)
  } else {
    say('标记有效性：有效（代码与检查时一致，可以提交）')
  }
}

// ---------------------------------------------------------------------------
// 子命令 5：reset —— 清空所有结论，回到"未检查"状态
// ---------------------------------------------------------------------------
function cmdReset() {
  if (!existsSync(QUALITY_DIR)) {
    say('本来就没有检查记录，无需清理。')
    return
  }
  let count = 0
  for (const name of readdirSync(QUALITY_DIR)) {
    if (name.endsWith('.json')) {
      rmSync(join(QUALITY_DIR, name), { force: true })
      count += 1
    }
  }
  say(`已清空 ${count} 个检查记录文件，下次提交需要重新检查。`)
}

// ---------------------------------------------------------------------------
// 杂项：判断某个路径是否被 git 忽略、读取参数、报错退出
// ---------------------------------------------------------------------------
// 找出"改了但还没 add"的文件：已跟踪文件的改动 + 还没纳入版本管理的新文件。
// 已忽略的文件（node_modules、.quality 等）不算在内。
function pendingPaths() {
  const changed = git(['diff', '--name-only'], { cwd: ROOT })
  const untracked = git(['ls-files', '--others', '--exclude-standard'], { cwd: ROOT })
  return [changed, untracked]
    .filter((text) => text.length > 0)
    .flatMap((text) => text.split('\n'))
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

function isIgnored(path) {
  try {
    git(['check-ignore', '-q', path], { cwd: ROOT })
    return true
  } catch {
    return false
  }
}

// 从参数列表里取 "--名字 值" 这种形式的值
function getArg(argv, name) {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}

// 出错时打印中文说明并以失败退出
function fail(message) {
  say('✗ ' + message)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 入口：根据第一个参数决定做哪件事
// ---------------------------------------------------------------------------
const [, , command, ...rest] = process.argv

switch (command) {
  case 'report':
    cmdReport(rest)
    break
  case 'seal':
    cmdSeal()
    break
  case 'check':
    cmdCheck()
    break
  case 'status':
    cmdStatus()
    break
  case 'reset':
    cmdReset()
    break
  default:
    say('提交质量门禁脚本')
    say('可用命令：report / seal / check / status / reset')
    say('详细说明见文件开头注释，或项目 CLAUDE.md 第十二章。')
    process.exit(command ? 1 : 0)
}
