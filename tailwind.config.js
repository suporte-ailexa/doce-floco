/** @type {import('tailwindcss').Config} */
    module.exports = {
      content: [
        "./src/renderer/**/*.html",
        "./src/renderer/**/*.js",
      ],
      safelist: [
        'hidden', // Garante que a classe 'hidden' com !important seja sempre gerada.
      ],
      theme: {
        extend: {},
      },
      plugins: [],
    }