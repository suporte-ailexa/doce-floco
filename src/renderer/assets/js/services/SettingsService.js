import { FirebaseService } from './FirebaseService.js';

export class SettingsService {
    constructor() {
        this.db = FirebaseService.getInstance().db;
    }

    // --- CONFIGURAÇÕES DA LOJA ---

    async getStoreConfig() {
        try {
            const doc = await this.db.collection('settings').doc('storeConfig').get();
            return doc.exists ? doc.data() : {};
        } catch (error) {
            console.error('[Settings] Erro ao ler config:', error);
            throw error;
        }
    }

    async saveStoreConfig(data) {
        // 1. Salva no Firestore
        await this.db.collection('settings').doc('storeConfig').set(data, { merge: true });
        // 2. Avisa o Backend (Main Process) para atualizar a IA em memória
        await window.electronAPI.updateAiSettings(data);
        return { success: true };
    }

    async uploadMenuFile(fileData) {
        return await window.electronAPI.uploadMenuFile(fileData);
    }

    // --- HARDWARE ---

    async getPrinters() {
        return await window.electronAPI.getPrinters();
    }

    // --- PRODUTOS (CRUD) ---

    async getProducts() {
        return await window.electronAPI.getProducts();
    }

    async addProduct(product) {
        return await window.electronAPI.addProduct(product);
    }

    async deleteProduct(id) {
        return await window.electronAPI.deleteProduct(id);
    }

    async toggleProductStatus(id, isActive) {
        return await window.electronAPI.toggleProductStatus({ id, isActive });
    }

    async updateProductStock(id, quantity) {
        return await window.electronAPI.updateProductStock({ id, quantity });
    }

    async selectProductImage(id) {
        // Abre diálogo nativo do sistema operacional
        return await window.electronAPI.selectProductImage(id);
    }
}