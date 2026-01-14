import { $, hide, show } from '../utils/DOM.js';
import { FirebaseService } from '../services/FirebaseService.js';
// Certifique-se de que luxon está disponível globalmente ou importe-o
const DateTime = luxon.DateTime;

export class DashboardModule {
    constructor() {
        this.db = FirebaseService.getInstance().db;
        this.chartInstance = null;
    }

    async init() {
        console.log('[Dashboard] Iniciando com Raio-X do Dia...');
        
        // Exibe a data de hoje no título
        if($('dashTodayDate')) $('dashTodayDate').innerText = DateTime.now().toFormat('dd/MM/yyyy');

        this.loadTodayMetrics();     // NOVA FUNÇÃO
        this.loadTodaySchedule();    // NOVA FUNÇÃO
        this.loadSalesChart();       // Mantida (Gráfico 7 dias)
        
        // Listener simples para atualizar status do bot (opcional manter)
        this.updateBotStatus();
    }

    destroy() {
        if (this.chartInstance) {
            this.chartInstance.destroy();
            this.chartInstance = null;
        }
    }

    // --- NOVA: Carrega métricas APENAS DE HOJE ---
    async loadTodayMetrics() {
        try {
            const todayStart = DateTime.now().startOf('day').toJSDate();
            const todayEnd = DateTime.now().endOf('day').toJSDate();

            // 1. Busca pedidos criados HOJE (exclui cancelados se tiver status 'Cancelado')
            const snapshot = await this.db.collection('orders')
                .where('createdAt', '>=', todayStart)
                .where('createdAt', '<=', todayEnd)
                .get();

            let revenue = 0;
            let count = 0;
            let pending = 0;

            snapshot.forEach(doc => {
                const data = doc.data();
                
                // Ignora cancelados
                if (data.status === 'Cancelado') return;
                
                // Soma Pendentes para o card amarelo
                if (data.status === 'Pendente') pending++;

                // Soma receita
                revenue += parseFloat(data.total || 0);
                count++;
            });

            const avgTicket = count > 0 ? revenue / count : 0;

            // Atualiza UI
            if($('dashTodayRevenue')) $('dashTodayRevenue').innerText = `R$ ${revenue.toFixed(2)}`;
            if($('dashTodayCount')) $('dashTodayCount').innerText = count;
            if($('dashTodayTicket')) $('dashTodayTicket').innerText = `R$ ${avgTicket.toFixed(2)}`;
            
            // Atualiza Pendentes (Sobrepõe a lógica antiga para ser mais preciso com o snapshot atual)
            if($('dashOpenOrders')) $('dashOpenOrders').innerText = pending;

        } catch (e) {
            console.error('[Dashboard] Erro métricas hoje:', e);
        }
    }

    // --- NOVA: Carrega Encomendas/Festas Agendadas para HOJE ---
    async loadTodaySchedule() {
        const container = $('dashTodaySchedule');
        if(!container) return;

        try {
            // Data formato string YYYY-MM-DD igual salvo no CalendarModule
            const todayStr = DateTime.now().toFormat('yyyy-MM-dd');

            const snapshot = await this.db.collection('orders')
                .where('status', '==', 'Agendado')
                .where('dueDate', '==', todayStr)
                .get();

            container.innerHTML = '';

            if (snapshot.empty) {
                container.innerHTML = '<div class="text-center py-6 text-gray-400 text-xs"><i class="fas fa-mug-hot text-2xl mb-2 opacity-30"></i><br>Nada agendado para hoje.</div>';
                return;
            }

            snapshot.forEach(doc => {
                const d = doc.data();
                const div = document.createElement('div');
                // Estilo condicional se for empréstimo
                const isLoan = !!d.loanedItems;
                const borderClass = isLoan ? 'border-l-4 border-orange-400' : 'border-l-4 border-purple-400';
                
                div.className = `bg-gray-50 p-3 rounded-lg border border-gray-100 ${borderClass} text-xs shadow-sm`;
                div.innerHTML = `
                    <div class="flex justify-between font-bold text-gray-700 mb-1">
                        <span>${d.clientName}</span>
                        <span>R$ ${parseFloat(d.total).toFixed(2)}</span>
                    </div>
                    <div class="text-gray-500 mb-1 truncate">${d.items}</div>
                    ${isLoan ? `<div class="text-[10px] text-orange-600 font-bold bg-orange-100 px-1 rounded inline-block"><i class="fas fa-box"></i> Empréstimo</div>` : ''}
                    <div class="mt-1 text-gray-400 text-[10px]"><i class="fas fa-map-marker-alt"></i> ${d.address || 'Retirada'}</div>
                `;
                container.appendChild(div);
            });

        } catch (e) {
            console.error('[Dashboard] Erro agenda hoje:', e);
        }
    }

    async updateBotStatus() {
        // ... (Mantenha o código original do updateBotStatus aqui)
        try {
            const status = await window.electronAPI.getWhatsappStatus();
            // Se você quiser mostrar isso no header ou outro lugar
            console.log('Bot Status:', status); 
        } catch (e) {}
    }

    async loadSalesChart() {
        // ... (Mantenha o código original do loadSalesChart aqui, ele já funciona bem para os 7 dias)
        // Apenas garanta que o ID do canvas seja 'salesChart' como no HTML acima
        const ctx = $('salesChart');
        if (!ctx || typeof Chart === 'undefined') return;
        
        // ... (Resto do código do gráfico original) ...
        // Certifique-se de copiar a lógica do seu arquivo original para cá
        if (this.chartInstance) this.chartInstance.destroy();
        
        try {
            const snapshot = await this.db.collection('orders')
                .orderBy('createdAt', 'desc')
                .limit(50)
                .get();
                
             // ... (Lógica de processamento de dados do gráfico original) ...
             // Para brevidade, use a lógica que você já tem no arquivo original aqui.
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
                    if (dateObj > today.minus({ days: 7 })) {
                        const key = dateObj.toFormat('dd/MM');
                        if (salesData[key] !== undefined) salesData[key] += parseFloat(data.total);
                    }
                }
             });

             this.chartInstance = new Chart(ctx, {
                type: 'bar', // ou 'line' se preferir
                data: {
                    labels: Object.keys(salesData),
                    datasets: [{
                        label: 'Vendas (R$)',
                        data: Object.values(salesData),
                        backgroundColor: '#a78bfa',
                        borderRadius: 4
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
             });

        } catch (error) { console.error(error); }
    }
}