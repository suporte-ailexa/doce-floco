import { FirebaseService } from './FirebaseService.js';

export class ClientService {
    constructor() {
        this.db = FirebaseService.getInstance().db;
    }

    // Ouve mudanças na lista de clientes (Realtime)
    listenToClients(callback) {
        return this.db.collection('clients')
            .orderBy('name', 'asc')
            .onSnapshot(snapshot => {
                const clients = [];
                snapshot.forEach(doc => {
                    clients.push({ id: doc.id, ...doc.data() });
                });
                callback(clients);
            });
    }

    // Cria cliente via Backend (IPC) para validar telefone
    async createClient(data) {
        return await window.electronAPI.createClientIfNotExists(data);
    }

    // Atualiza dados
    async updateClient(id, data) {
        return await window.electronAPI.updateClient(id, data);
    }

    // Deleta cliente
    async deleteClient(id) {
        return await window.electronAPI.deleteClient(id);
    }

    // Busca histórico de pedidos (IPC)
    async getHistory(clientId) {
        return await window.electronAPI.getClientAppointments(clientId);
    }
}