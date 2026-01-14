export class CalendarService {
    // Busca encomendas agendadas
    async getScheduledOrders() {
        return await window.electronAPI.getScheduledOrders();
    }

    // Atualiza uma encomenda (data, itens, valor)
    async updateOrder(id, data) {
        return await window.electronAPI.updateOrder(id, data);
    }

    // Exclui encomenda
    async deleteOrder(id) {
        return await window.electronAPI.deleteOrder(id);
    }

    // Imprime comprovante
    async printOrder(order) {
        return await window.electronAPI.printOrder(order);
    }
}