const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

class WhatsappService extends EventEmitter {
    constructor(sessionPath, chromePath, isDev) {
        super();
        this.client = null;
        this.sessionPath = sessionPath;
        this.chromePath = chromePath;
        this.isDev = isDev;
        this.reconnectTimer = null;
        this.status = 'desconectado';
    }

    initialize() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        
        if (this.client) {
            try { this.client.destroy(); } catch(e){}
            this.client = null;
        }

        console.log('[WhatsApp] Inicializando com FIX de VERSÕES: w-w.js@1.19.5 + puppeteer@13.0.0 + Web@2.2307.7 (DEBUG)...');

        this.client = new Client({
            authStrategy: new LocalAuth({ 
                clientId: 'doce-floco-session', 
                dataPath: this.sessionPath 
            }),
            // --- FIX CRÍTICO: FORÇAR VERSÃO ESTÁVEL DO WHATSAPP WEB ---
            // Esta versão (2.2307.7) é mais compatível com puppeteer v13 e w-w.js v1.19.5
            //webVersionCache: {
            //    type: 'remote',
            //    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2307.7.html',
            //},
            // --- Mantenha autoMarkRead: false ---
            autoMarkRead: false,
            // ------------------------------------
            puppeteer: {
                headless: false, // Mantenha false para observar o que acontece
                executablePath: this.chromePath, // Usará o Chromium compatível com Puppeteer 13.0.0
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--window-size=1280,800', 
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process'
                ]
            }
        });

        this._setupListeners();
        
        this.client.initialize().catch(err => {
            console.error('[WhatsApp] Falha crítica na inicialização:', err.message);
            this.emit('status', 'erro_inicializacao');
            this._scheduleReconnect();
        });
    }

    _setupListeners() {
        this.client.on('qr', (qr) => {
            console.log('[WhatsApp] QR Code gerado.');
            this.status = 'aguardando_scan';
            this.emit('qr', qr);
            this.emit('status', this.status);
        });

        this.client.on('ready', () => {
            console.log('[WhatsApp] Conectado e Pronto!');
            this.status = 'conectado';
            this.emit('ready');
            this.emit('status', this.status);
            this.emit('qr', ''); 
        });

        this.client.on('auth_failure', (msg) => {
            console.error('[WhatsApp] Falha de autenticação:', msg);
            this.status = 'desconectado';
            this.emit('status', 'erro_autenticacao');
            this._scheduleReconnect();
        });

        this.client.on('disconnected', (reason) => {
            console.log('[WhatsApp] Desconectado:', reason);
            this.status = 'desconectado';
            this.emit('status', this.status);
            this._scheduleReconnect();
        });

        this.client.on('message', async (message) => {
            if (message.isStatus || message.from.includes('@g.us') || message.from.includes('@broadcast')) return;
            this.emit('message', message);
        });
    }

    _scheduleReconnect() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
            console.log('[WhatsApp] Tentando reconectar automaticamente...');
            this.initialize();
        }, 15000);
    }

    async logout() {
        if (this.client) {
            try { await this.client.logout(); } catch(e){ console.warn('[WhatsApp] Erro ao fazer logout:', e.message); }
            try { await this.client.destroy(); } catch(e){ console.warn('[WhatsApp] Erro ao destruir cliente:', e.message); }
            this.client = null;
            this.status = 'desconectado';
            this.emit('status', this.status);
            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        }
    }

    async sendText(to, text) {
        if (this.status !== 'conectado' || !this.client) {
            console.warn('[WhatsApp] Não conectado ou cliente indisponível para enviar texto.');
            return false;
        }
        try {
            let clean = to.toString().replace(/\D/g, '');
            if ((clean.length === 10 || clean.length === 11) && !clean.startsWith('55')) clean = '55' + clean;
            const finalId = clean.includes('@c.us') ? clean : `${clean}@c.us`;

            console.log(`[WhatsApp-DEBUG] Tentando enviar mensagem. ID: ${finalId}, Texto: "${text.substring(0, 50)}..."`);
            
            await this.client.sendMessage(finalId, text);
            console.log(`[WhatsApp-DEBUG] Mensagem enviada com sucesso para ${finalId}.`);
            return true;
        } catch (error) {
            console.error(`[WhatsApp] Erro envio texto para ${to}:`, error.message);
            if (error.message.includes('markedUnread') || error.message.includes('multiple-uim-roots')) {
                console.error(`[WhatsApp-DEBUG] ERRO CRÍTICO de COMPATIBILIDADE. O WhatsApp Web (versão ${this.client.info ? this.client.info.webVersion : 'desconhecida'}) pode estar incompatível com o w-w.js ${require('whatsapp-web.js/package.json').version}.`);
            }
            return false;
        }
    }

    async sendImage(to, filePath, caption = "") {
        if (this.status !== 'conectado' || !this.client) {
            console.warn('[WhatsApp] Não conectado ou cliente indisponível para enviar imagem.');
            return false;
        }
        try {
            let clean = to.toString().replace(/\D/g, '');
            if ((clean.length === 10 || clean.length === 11) && !clean.startsWith('55')) clean = '55' + clean;
            const finalId = clean.includes('@c.us') ? clean : `${clean}@c.us`;

            if (fs.existsSync(filePath)) {
                const media = MessageMedia.fromFilePath(filePath);
                await this.client.sendMessage(finalId, media, { caption });
                return true;
            }
            console.warn(`[WhatsApp] Imagem não encontrada ou inválida: ${filePath}`);
            return false;
        } catch (error) {
            console.error('[WhatsApp] Erro envio imagem:', error.message);
            return false;
        }
    }
}

module.exports = WhatsappService;