module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    parserOptions: {
        project: [
            __dirname + '/tsconfig.json',
            __dirname + '/tsconfig.test.json',
        ],
        sourceType: 'module',
        ecmaVersion: 2020,
    },
    plugins: [
        '@typescript-eslint'
    ],
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:import/recommended',
        'airbnb-base',
        'airbnb-typescript/base',
    ],
    env: {
        browser: true,
        es2020: true
    },
    settings: {
        'import/extensions': ['.ts'],
    },
    globals: {},
    rules: {
        '@typescript-eslint/indent': ['error', 4],
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-inferrable-types': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/return-await': 'off',
        'import/extensions': ['error', 'ignorePackages'],
        'import/no-unresolved': 'off',
        'import/prefer-default-export': 'off',
        'max-len': ['error', 140],
        'no-restricted-syntax': 'off',
        'no-underscore-dangle': 'off',
        'quotes': ['error', 'single'],
    }
}
