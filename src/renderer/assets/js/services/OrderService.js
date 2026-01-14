import { FirebaseService } from './FirebaseService.js';

export class OrderService {
    constructor() {
        this.db = FirebaseService.getInstance().db;
    }

    // Ouve pedidos em tempo real (Kanban)
    listenToPendingOrders(callback) {
        return this.db.collection('orders')
            .orderBy('createdAt', 'desc')
            .limit(60)
            .onSnapshot(snapshot => {
                const orders = [];
                snapshot.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));
                callback(orders);
            });
    }

    // Ouve agendamentos (Calendário)
    async getScheduledOrders() {
        return await window.electronAPI.getScheduledOrders();
    }

    // --- CORREÇÃO: Método adicionado para o Modal de Edição funcionar ---
    async updateOrder(id, data) {
        // Envia para o preload (backend) fazer a atualização no Firestore
        return await window.electronAPI.updateOrder(id, data);
    }
    // -------------------------------------------------------------------

    async updateStatus(orderId, newStatus, shouldNotify, orderData) {
        return await window.electronAPI.updateOrderStatus({ 
            orderId, newStatus, shouldNotify, orderData 
        });
    }

    async deleteOrder(id) {
        return await window.electronAPI.deleteOrder(id);
    }
    
    async printOrder(order) {
        return await window.electronAPI.printOrder(order);
    }
}