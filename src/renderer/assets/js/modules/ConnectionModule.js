import { $, show, hide } from '../utils/DOM.js';

export class ConnectionModule {
    constructor() {
        this.statusEl = $('whatsappStatusText');
        this.qrContainer = $('whatsappQrContainer');
        this.qrCanvas = $('whatsappQrCodeCanvas');
        this.logoutBtn = $('whatsappLogoutButton');
        this.reconnectBtn = $('whatsappReconnectButton');
        
        // QRious Instance
        this.qr = null; 
        if (typeof QRious !== 'undefined' && this.qrCanvas) {
            this.qr = new QRious({ element: this.qrCanvas, size: 200, value: '...' });
        }
        
        // Bindings para não perder o 'this'
        this.handleQr = this.handleQr.bind(this);
        this.handleStatus = this.handleStatus.bind(this);
    }

    async init() {
        console.log('[Connection] Iniciando...');
        
        // Listeners do IPC
        window.electronAPI.onWhatsappQr(this.handleQr);
        window.electronAPI.onWhatsappStatus(this.handleStatus);

        // Listeners de Botões
        if(this.reconnectBtn) this.reconnectBtn.onclick = () => window.electronAPI.whatsappInitialize();
        if(this.logoutBtn) this.logoutBtn.onclick = () => window.electronAPI.whatsappLogout();

        // Estado inicial
        const initialStatus = await window.electronAPI.getWhatsappStatus();
        const initialQr = await window.electronAPI.getWhatsappQr();
        
        this.handleStatus(initialStatus);
        if(initialQr) this.handleQr(initialQr);
    }

    destroy() {
        // Remove listeners para evitar memory leak ao trocar de aba
        // Nota: O Electron `ipcRenderer.on` acumula listeners se não removermos.
        // Como o `contextBridge` não expõe `removeListener` facilmente no seu preload atual,
        // garantimos que o callback verifique se o módulo ainda está ativo ou aceitamos o overhead leve.
        // O ideal seria adicionar `removeListener` no preload.js, mas vamos seguir sem alterar o preload agora.
        console.log('[Connection] Parando...');
    }

    handleQr(qrData) {
        if (this.qr && this.qrContainer && qrData) {
            show(this.qrContainer);
            this.qr.value = qrData;
        }
    }

    handleStatus(status) {
        if (!this.statusEl) return;
        
        let txt = status;
        let clr = 'text-gray-500';
        
        hide(this.logoutBtn);
        hide(this.reconnectBtn);
        hide(this.qrContainer);

        if (status === 'conectado') {
            txt = 'Conectado';
            clr = 'text-green-600';
            show(this.logoutBtn);
        } else if (status === 'aguardando_scan') {
            txt = 'Leia o QR Code';
            clr = 'text-yellow-600';
            show(this.qrContainer);
            show(this.logoutBtn); // Permite cancelar
        } else if (status === 'desconectado') {
            txt = 'Desconectado';
            clr = 'text-red-600';
            show(this.reconnectBtn);
        }

        this.statusEl.textContent = txt;
        this.statusEl.className = `font-bold ${clr}`;
    }
}