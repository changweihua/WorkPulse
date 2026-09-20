/**
 * cz-customizable 配置
 * 匹配 AGENTS.md 中的 git-commit-emoji 规范
 */
module.exports = {
  types: [
    { name: '🎉 init:  项目初始化', value: '🎉 init' },
    { name: '✨ feat:  新功能', value: '✨ feat' },
    { name: '🐞 fix:   Bug 修复', value: '🐞 fix' },
    { name: '📃 docs:  文档', value: '📃 docs' },
    { name: '🌈 style: 样式调整（不影响逻辑）', value: '🌈 style' },
    { name: '🦄 refactor: 重构', value: '🦄 refactor' },
    { name: '🎈 perf:  性能优化', value: '🎈 perf' },
    { name: '🧪 test:  测试', value: '🧪 test' },
    { name: '🔧 build: 构建/依赖', value: '🔧 build' },
    { name: '🐎 ci:    CI/CD', value: '🐎 ci' },
    { name: '🐳 chore: 其他杂项', value: '🐳 chore' },
    { name: '↩ revert: 回滚', value: '↩ revert' },
    { name: '🔒 security: 安全修复', value: '🔒 security' },
    { name: '📦 deps: 依赖更新', value: '📦 deps' },
    { name: '🗑️ remove: 代码/功能移除', value: '🗑️ remove' },
  ],

  scopes: [
    { name: 'main', value: 'main' },
    { name: 'renderer', value: 'renderer' },
    { name: 'preload', value: 'preload' },
    { name: 'scripts', value: 'scripts' },
    { name: 'shared', value: 'shared' },
    { name: 'config', value: 'config' },
  ],

  // 允许自定义 scope
  allowCustomScopes: true,
  allowEmptyScopes: true,

  // subject 规则
  subjectLimit: 72,
  subjectSeparator: ': ',
  breaklineChar: '|',

  // 格式
  headerPrefix: '',
  headerSuffix: '',
  appendBranchSeparator: false,
  appendIssueTrigger: false,
};
