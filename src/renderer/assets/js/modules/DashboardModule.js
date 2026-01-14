import { $, hide, show } from '../utils/DOM.js';
import { FirebaseService } from '../services/FirebaseService.js';

export class DashboardModule {
    constructor() {
        this.db = FirebaseService.getInstance().db;
        this.chartInstance = null;
    }

    async init() {
        console.log('[Dashboard] Iniciando...');
        this.loadMetrics();
        this.loadSalesChart();
        this.updateBotStatus();

        // Listeners dos Cards (Navegação rápida)
        // Nota: O Router cuida da navegação, aqui apenas disparamos o click nos links da sidebar
        if($('dashCardOrders')) $('dashCardOrders').onclick = () => $('navPedidos').click();
        if($('dashCardClients')) $('dashCardClients').onclick = () => $('navClientes').click();
        if($('dashCardStatus')) $('dashCardStatus').onclick = () => $('navWhatsapp').click();
    }

    destroy() {
        // Limpeza crítica para liberar memória do Chart.js
        if (this.chartInstance) {
            this.chartInstance.destroy();
            this.chartInstance = null;
        }
    }

    async loadMetrics() {
        try {
            // Contagem de Clientes
            const clientsSnap = await this.db.collection('clients').get();
            if($('dashTotalClients')) $('dashTotalClients').innerText = clientsSnap.size;

            // Contagem de Pedidos Pendentes
            const ordersSnap = await this.db.collection('orders').where('status', '==', 'Pendente').get();
            if($('dashOpenOrders')) $('dashOpenOrders').innerText = ordersSnap.size;
        } catch (e) {
            console.error('[Dashboard] Erro ao carregar métricas:', e);
        }
    }

    async updateBotStatus() {
        const slot = $('dashNextSlot');
        if (!slot) return;
        
        try {
            const status = await window.electronAPI.getWhatsappStatus();
            slot.innerText = status === 'conectado' ? 'Ativo 🟢' : 'Offline 🔴';
            slot.className = `text-3xl font-bold ${status === 'conectado' ? 'text-green-600' : 'text-red-600'} mt-1`;
        } catch (e) {
            slot.innerText = "Erro";
        }
    }

    async loadSalesChart() {
        const ctx = $('salesChart');
        if (!ctx || typeof Chart === 'undefined') return;

        // Se já existe gráfico, destroi antes de recriar
        if (this.chartInstance) this.chartInstance.destroy();

        try {
            const snapshot = await this.db.collection('orders')
                .orderBy('createdAt', 'desc')
                .limit(50)
                .get();

            if (snapshot.empty) return;

            // Prepara dados dos últimos 7 dias
            const { DateTime } = luxon;
            const salesData = {};
            const today = DateTime.now();

            for (let i = 6; i >= 0; i--) {
                const d = today.minus({ days: i }).toFormat('dd/MM');
                salesData[d] = 0;
            }

            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.createdAt && (data.total > 0)) {
                    const dateObj = DateTime.fromJSDate(data.createdAt.toDate());
                    // Filtra apenas se estiver dentro dos últimos 7 dias
                    if (dateObj > today.minus({ days: 7 })) {
                        const key = dateObj.toFormat('dd/MM');
                        if (salesData[key] !== undefined) {
                            salesData[key] += parseFloat(data.total);
                        }
                    }
                }
            });

            this.chartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: Object.keys(salesData),
                    datasets: [{
                        label: 'Faturamento (R$)',
                        data: Object.values(salesData),
                        backgroundColor: 'rgba(236, 72, 153, 0.6)',
                        borderColor: 'rgba(236, 72, 153, 1)',
                        borderWidth: 1,
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: '#f3f4f6' } },
                        x: { grid: { display: false } }
                    }
                }
            });

        } catch (error) {
            console.error("[Dashboard] Erro no gráfico:", error);
        }
    }
}