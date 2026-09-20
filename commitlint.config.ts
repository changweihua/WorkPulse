import type { UserConfig } from '@commitlint/config-conventional';

/**
 * 内联 emoji commit 类型定义（替代 commitlint-config-git-commit-emoji 外部包）
 * 格式: `emoji type: subject`
 * 完整 emoji 列表见 .cz-config.js
 */
const COMMIT_TYPES = [
  '🎉 init',
  '✨ feat',
  '🐞 fix',
  '📃 docs',
  '🌈 style',
  '🦄 refactor',
  '🎈 perf',
  '🧪 test',
  '🔧 build',
  '🐎 ci',
  '🐳 chore',
  '↩ revert',
  '🔒 security',
  '📦 deps',
  '🗑️ remove',
];

const config: UserConfig = {
  parserPreset: {
    parserOpts: {
      // 匹配 `emoji type(scope): subject` 格式
      headerPattern:
        /^(?<type>.+?\s\w+)(?:\((?<scope>.*)\))?!?:\s(?<subject>(?:(?!#).)*(?:(?!\s).))$/,
      headerCorrespondence: ['type', 'scope', 'subject'],
    },
  },
  rules: {
    'type-enum': [2, 'always', COMMIT_TYPES],
    'type-empty': [2, 'never'],
    'subject-empty': [2, 'never'],
    'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
    'subject-full-stop': [2, 'never', '.'],
    'subject-max-length': [2, 'always', 72],
    'header-max-length': [2, 'always', 72],
    'body-leading-blank': [2, 'always'],
    'body-max-line-length': [1, 'always', 200],
    'footer-leading-blank': [2, 'always'],
    'scope-case': [2, 'always', 'lower-case'],
  },
};

export default config;
