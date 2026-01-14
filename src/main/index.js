// --- Arquivo: src/main/index.js (Entry Point) ---
// VERSÃO: V4.0 - CLEAN ARCHITECTURE (REFATORADO)

const { app, BrowserWindow } = require('electron');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');
const admin = require('firebase-admin');

// Importa o Maestro da Aplicação
const AppController = require('./controllers/AppController');

const isDev = !app.isPackaged;

// --- 1. Utilitários de Caminho ---
function getResourcePath(relativePath) {
    if (isDev) {
        return path.join(__dirname, '../../', relativePath);
    } else {
        return path.join(process.resourcesPath, relativePath);
    }
}

// Carrega variáveis de ambiente
dotenv.config({ path: getResourcePath('config/.env') });

let mainWindow;
let appController; // Mantém referência para não ser coletado pelo GC
let db; // Instância do Firestore

// --- 2. Inicialização do Firebase (Única responsabilidade lógica aqui) ---
function initializeFirebase() {
    try {
        const serviceAccountPath = getResourcePath('config/serviceAccountKey.json');
        if (fs.existsSync(serviceAccountPath)) {
            const serviceAccount = require(serviceAccountPath);
            // Evita erro de re-inicialização em hot-reload
            if (!admin.apps.length) {
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount)
                });
            }
            db = admin.firestore();
            console.log('[Main] Firebase conectado com sucesso.');
            return db;
        } else {
            console.error('[Main] CRÍTICO: serviceAccountKey.json não encontrado.');
            return null;
        }
    } catch (error) {
        console.error('[Main] Erro fatal no Firebase:', error.message);
        return null;
    }
}

// --- 3. Gerenciamento de Janelas ---
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1024,
        minHeight: 600,
        title: 'Doce Floco Dashboard',
        icon: path.join(__dirname, '../../src/renderer/assets/icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    
    // Em dev, pode abrir o DevTools opcionalmente
    // if (isDev) mainWindow.webContents.openDevTools();
}

// --- 4. Ciclo de Vida da Aplicação ---
app.whenReady().then(async () => {
    // A. Cria a Interface
    createWindow();

    // B. Conecta ao Banco
    const dbInstance = initializeFirebase();

    // C. Inicializa o Controlador Principal (O "Cérebro")
    if (dbInstance) {
        appController = new AppController(dbInstance, mainWindow);
        await appController.initialize();
    } else {
        console.error("Aplicação iniciada sem Banco de Dados. Funcionalidades limitadas.");
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', async () => {
    // Garante logout limpo do WhatsApp ao fechar
    if (appController) {
        try {
            // Se tiver método de cleanup no controller
            if(appController.wa) await appController.wa.logout(); 
        } catch (e) { }
    }
    
    if (process.platform !== 'darwin') app.quit();
});