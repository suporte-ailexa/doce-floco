// .puppeteerrc.cjs
const path = require("path");

module.exports = {
  // Diz ao Puppeteer para baixar o Chrome dentro da pasta do projeto
  cacheDirectory: path.join(__dirname, ".cache", "puppeteer"),
};