import type { UserConfig } from '@commitlint/config-conventional'

const config: UserConfig = {
    extends: ['git-commit-emoji'],
    rules: {
        'subject-max-length': [2, 'always', 100],
        'body-max-line-length': [1, 'always', 200],
    },
}

export default config
