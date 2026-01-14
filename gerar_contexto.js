const fs = require('fs');
const path = require('path');

const outputFile = 'CODIGO_COMPLETO.txt';

// Extensões permitidas (O que a IA precisa ler)
const allowedExtensions = ['.js', '.html', '.css', '.json', '.md'];

// Arquivos EXCLUÍDOS (Segurança e limpeza)
const ignoredFiles = [
    '.env', 
    'serviceAccountKey.json', 
    'package-lock.json', 
    'stats.json', 
    'gerar_contexto.js', // Não copiar o próprio script
    outputFile // Não copiar o arquivo de saída
];

// Pastas EXCLUÍDAS (O script NEM entra aqui)
const ignoredFolders = [
    'node_modules', 
    'dist', 
    '.git', 
    '.cache', 
    'chrome-bin',
    '.wwebjs_cache',    // <--- ADICIONADO: Cache do WWebJS
    'whatsapp_session', // <--- ADICIONADO: Sessão do WhatsApp
    'win-unpacked'      // <--- ADICIONADO: Prevenção extra
];

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    const fullPath = path.join(dirPath, file);
    
    // Se for pasta
    if (fs.statSync(fullPath).isDirectory()) {
      // Verifica se o nome da pasta está na lista negra
      if (!ignoredFolders.includes(file)) {
        arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
      } else {
        console.log(`🚫 Ignorando pasta: ${file}`);
      }
    } 
    // Se for arquivo
    else {
      const ext = path.extname(file);
      // Verifica extensão E se o nome do arquivo não está na lista negra
      if (allowedExtensions.includes(ext) && !ignoredFiles.includes(file)) {
        arrayOfFiles.push(fullPath);
      }
    }
  });

  return arrayOfFiles;
}

console.log("Iniciando varredura...");
const allFiles = getAllFiles(__dirname);
let content = "CONTEXTO DO PROJETO (CÓDIGO FONTE)\n";
content += "Data da geração: " + new Date().toLocaleString() + "\n\n";

allFiles.forEach(file => {
    // Caminho relativo para facilitar a leitura da IA (ex: src/main/index.js)
    const relativePath = file.replace(__dirname, '').replace(/\\/g, '/'); // Força barra normal mesmo no Windows
    
    console.log(`📄 Lendo: ${relativePath}`);
    
    content += "=".repeat(80) + "\n";
    content += `ARQUIVO: ${relativePath}\n`;
    content += "=".repeat(80) + "\n";
    
    try {
        content += fs.readFileSync(file, 'utf8') + "\n\n";
    } catch (e) {
        content += `[ERRO AO LER ARQUIVO: ${e.message}]\n\n`;
    }
});

fs.writeFileSync(outputFile, content);
console.log(`\n✅ SUCESSO! Arquivo gerado: ${outputFile}`);
console.log(`⚠️  Confira se as pastas de sessão sumiram antes de enviar.`);