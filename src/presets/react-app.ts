import type { Preset } from './types.js'

/**
 * Preset for React applications — same positioning as `vue-app` (a real app, not a library, with
 * some CSS), for the other big framework people asked for. Verified with a real `eslint` run
 * against a `.tsx` file exercising hooks, JSX, and TypeScript together, same rigor as `vue-app`.
 */
const reactAppPreset: Preset = {
  name: 'react-app',
  version: '0.1.0',
  tools: {
    eslint: {
      configFormat: 'flat',
      configFileName: 'eslint.config.mjs',
      // eslint-plugin-react pinned via its own peer range: it hasn't published ESLint 10 support
      // yet (peerDependencies caps at ^9.7 — verified against the published package; eslint-
      // plugin-react-hooks already supports ^10.0.0), so a bare "eslint"/"@eslint/js" here would
      // resolve latest (10.x) and fail npm's peer resolution during `init`'s own install step.
      dependencies: [
        'eslint@^9',
        '@eslint/js@^9',
        'typescript-eslint',
        'eslint-plugin-react',
        'eslint-plugin-react-hooks',
      ],
      baseExtends: [
        // See base.ts for why this is needed.
        {
          importPath: '@eslint/js',
          importName: 'js',
          expression: '[js.configs.recommended]',
        },
        {
          importPath: 'eslint-plugin-react',
          importName: 'pluginReact',
          expression: '[pluginReact.configs.flat.recommended]',
        },
        // eslint-plugin-react-hooks v6+ merged in the React Compiler's static-analysis rules
        // (purity, immutability, set-state-in-render, ...) under the same "recommended" flat
        // config, not just the classic rules-of-hooks/exhaustive-deps pair — verified with a real
        // `eslint` run against an unremarkable, idiomatic component that it stays silent there
        // and only flags genuine issues (a conditionally-called hook), so the fuller upstream
        // "recommended" is used as-is rather than hand-picking a narrower subset.
        {
          importPath: 'eslint-plugin-react-hooks',
          importName: 'pluginReactHooks',
          expression: '[pluginReactHooks.configs.flat.recommended]',
        },
        {
          importPath: 'typescript-eslint',
          importName: 'tseslint',
          expression: 'tseslint.configs.recommended',
        },
        // No import needed — eslint-plugin-react warns on every run without this (React version
        // affects a few rules' exact behavior); 'detect' reads it from the installed `react`
        // package rather than needing to hardcode a version here.
        {
          expression: "[{ settings: { react: { version: 'detect' } } }]",
        },
      ],
      rules: {
        'no-console': 'warn',
        'no-debugger': 'error',
        // React 17+'s automatic JSX runtime (the default in every current toolchain) doesn't
        // need React in scope for JSX to work, unlike what flat/recommended still assumes.
        'react/react-in-jsx-scope': 'off',
        // Redundant with (and blind to) TypeScript's own prop typing — flags components with
        // interface/type-based props as if they had no prop validation at all.
        'react/prop-types': 'off',
        '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        '@typescript-eslint/no-explicit-any': 'warn',
      },
      managedKeys: ['rules.*'],
    },

    prettier: {
      configFormat: 'json',
      configFileName: '.prettierrc.json',
      dependencies: ['prettier'],
      rules: {
        semi: false,
        singleQuote: true,
        trailingComma: 'all',
        printWidth: 100,
        tabWidth: 2,
      },
      managedKeys: ['*'],
    },

    stylelint: {
      configFormat: 'json',
      configFileName: '.stylelintrc.json',
      dependencies: ['stylelint', 'stylelint-config-standard'],
      extendsPackages: ['stylelint-config-standard'],
      rules: {},
      managedKeys: ['rules.*'],
    },
  },
}

export default reactAppPreset
