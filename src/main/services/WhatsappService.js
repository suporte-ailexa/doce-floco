const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const EventEmitter = require('events');
const fs = require('fs');

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
            this.client.destroy().catch(() => {});
            this.client = null;
        }

        console.log('[WhatsApp] Inicializando cliente...');

        this.client = new Client({
            authStrategy: new LocalAuth({ 
                clientId: 'doce-floco-session', 
                dataPath: this.sessionPath 
            }),
            puppeteer: {
                headless: true,
                executablePath: this.chromePath,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            }
        });

        this._setupListeners();
        
        this.client.initialize().catch(err => {
            console.error('[WhatsApp] Falha na inicialização:', err.message);
            this.emit('status', 'erro_inicializacao');
            this._scheduleReconnect();
        });
    }

    _setupListeners() {
        this.client.on('qr', (qr) => {
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
            console.log('[WhatsApp] Tentando reconectar...');
            this.initialize();
        }, 10000);
    }

    async logout() {
        if (this.client) {
            await this.client.logout();
            await this.client.destroy();
            this.client = null;
            this.status = 'desconectado';
            this.emit('status', this.status);
        }
    }

    /**
     * Lógica INTELIGENTE de ID.
     * Resolve o problema de mensagens não chegando.
     */
    async _getSmartId(rawNumber) {
        if (!this.client) return null;

        // 1. Limpeza brutal: Apenas números
        let clean = rawNumber.toString().replace(/\D/g, '');

        // 2. Heurística Brasil: Se tem 10 ou 11 dígitos, provavelmente falta o 55
        if ((clean.length === 10 || clean.length === 11) && !clean.startsWith('55')) {
            clean = '55' + clean;
        }

        // 3. Consulta o WhatsApp (A MÁGICA ACONTECE AQUI)
        try {
            // O getNumberId verifica se o número existe e devolve o formato interno correto (_serialized)
            const contactId = await this.client.getNumberId(clean);
            if (contactId && contactId._serialized) {
                return contactId._serialized;
            }
        } catch (e) {
            console.warn(`[WhatsApp] Falha ao verificar número ${clean}:`, e.message);
        }

        // 4. Fallback: Se a verificação falhar (ex: internet lenta), tenta o formato padrão
        return clean.includes('@c.us') ? clean : `${clean}@c.us`;
    }

    async sendText(to, text) {
        if (this.status !== 'conectado') return false;
        try {
            // Usa o ID verificado em vez do ID cru
            const finalId = await this._getSmartId(to);
            if (!finalId) throw new Error("ID inválido");

            await this.client.sendMessage(finalId, text);
            return true;
        } catch (error) {
            console.error(`[WhatsApp] Erro envio para ${to}:`, error.message);
            return false;
        }
    }

    async sendImage(to, filePath, caption = "") {
        if (this.status !== 'conectado') return false;
        try {
            const finalId = await this._getSmartId(to); // Usa a mesma validação
            if (!finalId) throw new Error("ID inválido");

            if (fs.existsSync(filePath)) {
                const media = MessageMedia.fromFilePath(filePath);
                await this.client.sendMessage(finalId, media, { caption });
                return true;
            }
            return false;
        } catch (error) {
            console.error('[WhatsApp] Erro envio imagem:', error.message);
            return false;
        }
    }
}

module.exports = WhatsappService;