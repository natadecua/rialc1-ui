module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2021: true,
  },
  extends: ['eslint:recommended', 'plugin:prettier/recommended'],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
  },
  globals: {
    L: 'readonly',
    proj4: 'readonly',
    shapefile: 'readonly',
  },
  ignorePatterns: ['Potree_1.8.2/**', 'lamesa_forest_final_fixed/**', 'raw_data/**'],
  overrides: [
    {
      files: ['public/potree-viewer.js'],
      env: {
        browser: true,
      },
      globals: {
        THREE: 'readonly',
        Potree: 'readonly',
        $: 'readonly',
        proj4: 'readonly',
      },
    },
    {
      files: ['scripts/**/*.js', 'server.js'],
      env: {
        node: true,
      },
    },
  ],
  reportUnusedDisableDirectives: true,
};