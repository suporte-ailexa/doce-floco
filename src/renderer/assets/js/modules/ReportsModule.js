import { $, $$, hide, show } from '../utils/DOM.js';
import { FirebaseService } from '../services/FirebaseService.js';
import { UI } from '../utils/UI.js';

export class ReportsModule {
    constructor() {
        this.db = FirebaseService.getInstance().db;
        this.charts = {}; // Armazena instâncias para destruição/re-render
        this.period = 30; // Default 30 dias
    }

    async init() {
        console.log('[Reports] Gerando Inteligência de Negócio...');
        this.setupListeners();
        await this.renderAll();
    }

    destroy() {
        Object.values(this.charts).forEach(chart => chart.destroy());
        this.charts = {};
    }

    setupListeners() {
        $$('.report-period-btn').forEach(btn => {
            btn.onclick = async () => {
                $$('.report-period-btn').forEach(b => b.classList.remove('bg-purple-600', 'text-white'));
                btn.classList.add('bg-purple-600', 'text-white');
                this.period = parseInt(btn.dataset.days);
                await this.renderAll();
            };
        });
        const btnPrint = $('btnIdPrintReport');
        if(btnPrint) btnPrint.onclick = () => this.printReport();
    }

    async renderAll() {
        UI.toast('Atualizando relatórios...');
        const data = await this.fetchData();
        
        this.renderMetrics(data);
        this.renderSalesChart(data);
        this.renderPaymentsChart(data);
        this.renderTopProducts(data);
        this.renderTopClients(data);
    }

    async fetchData() {
        const { DateTime } = luxon;
        const startDate = DateTime.now().minus({ days: this.period }).startOf('day');

        // 1. Busca todos os produtos para ter um "Dicionário de Nomes" (mapeia ID -> Nome)
        const productsSnap = await this.db.collection('products').get();
        const productLookup = {};
        productsSnap.forEach(doc => {
            productLookup[doc.id] = doc.data().name;
        });

        // 2. Busca pedidos (Status != Cancelado seria ideal, mas pegamos todos que tem total > 0)
        const snap = await this.db.collection('orders')
            .where('createdAt', '>=', startDate.toJSDate())
            .get();

        const orders = [];
        snap.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));

        const stats = {
            totalRevenue: 0,
            orderCount: orders.length,
            payments: {},
            products: {}, 
            dailySales: {},
            clients: {},
            avgTicket: 0
        };

        orders.forEach(o => {
            // Pula pedidos cancelados se houver status explícito, ou considera todos
            // Aqui assumimos que se tem total, conta.
            
            const val = parseFloat(o.total || 0);
            stats.totalRevenue += val;

            // --- 1. Pagamentos ---
            // Normaliza nomes (ex: pix -> Pix)
            let method = o.paymentMethod || 'Outros';
            method = method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
            if(method === 'A combinar') method = 'Outros'; 
            stats.payments[method] = (stats.payments[method] || 0) + val;

            // --- 2. Vendas Diárias ---
            if (o.createdAt) {
                const day = DateTime.fromJSDate(o.createdAt.toDate()).toFormat('dd/MM');
                stats.dailySales[day] = (stats.dailySales[day] || 0) + val;
            }

            // --- 3. Ranking Clientes ---
            const cName = o.clientName || 'Anônimo';
            if (!stats.clients[cName]) stats.clients[cName] = { total: 0, count: 0 };
            stats.clients[cName].total += val;
            stats.clients[cName].count += 1;

            // --- 4. PRODUTOS POPULARES (CORREÇÃO DE PARSE) ---
            
            // CASO A: Carrinho Estruturado (Vindo do PDV ou IA Nova)
            if (o.cart && Array.isArray(o.cart) && o.cart.length > 0) {
                o.cart.forEach(item => {
                    // Tenta pegar o nome salvo, ou busca no lookup, ou usa o ID
                    const pName = item.name || productLookup[item.id] || item.id || 'Item Desconhecido';
                    const qty = parseInt(item.qty || item.quantity || 0);
                    if(qty > 0) {
                        stats.products[pName] = (stats.products[pName] || 0) + qty;
                    }
                });
            } 
            // CASO B: Texto Simples (Vindo da IA antiga, Manual ou Edição)
            else if (typeof o.items === 'string') {
                // Quebra por quebra de linha ou vírgula
                const lines = o.items.split(/[\n,]/);
                
                lines.forEach(line => {
                    let cleanLine = line.trim();
                    if(!cleanLine) return;

                    // Regex inteligente para capturar quantidade: "2x Picolé" ou "2 Picolé" ou "Picolé"
                    // Grupo 1: Quantidade (Opcional)
                    // Grupo 2: Nome
                    const match = cleanLine.match(/^(\d+)\s*[xX]?\s*(.+)$/);
                    
                    let qty = 1;
                    let name = cleanLine;

                    if (match) {
                        qty = parseInt(match[1]);
                        name = match[2].trim();
                    } else {
                        // Se não tem número, assume 1, mas tenta limpar caracteres soltos como "-"
                        name = name.replace(/^-\s*/, ''); 
                    }

                    // Ignora textos muito longos (provavelmente observações) ou vazios
                    if (name.length > 2 && name.length < 60 && !name.toLowerCase().includes('entrega')) {
                        // Padroniza primeira letra maiúscula para agrupar melhor
                        name = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
                        stats.products[name] = (stats.products[name] || 0) + qty;
                    }
                });
            }
        });

        stats.avgTicket = stats.orderCount > 0 ? stats.totalRevenue / stats.orderCount : 0;
        return stats;
    }

    async printReport() {
        UI.toast("Preparando documento...");

        const chartRevenueImg = this.charts.revenue ? this.charts.revenue.toBase64Image() : '';
        const chartPaymentsImg = this.charts.payments ? this.charts.payments.toBase64Image() : '';

        const reportData = {
            period: this.period,
            revenue: $('repTotalRevenue').innerText,
            orders: $('repOrderCount').innerText,
            avgTicket: $('repAvgTicket').innerText,
            clients: $('repTopClientsList').innerHTML,
            products: $('repTopProductsList').innerHTML,
            charts: {
                revenue: chartRevenueImg,
                payments: chartPaymentsImg
            },
            date: luxon.DateTime.now().toFormat('dd/MM/yyyy HH:mm')
        };

        const res = await window.electronAPI.printReport(reportData);
        if(res.success) {
            UI.toast("Relatório enviado para a impressora!");
        } else {
            UI.alert("Erro", "Não foi possível gerar o relatório.");
        }
    }

    renderMetrics(stats) {
        $('repTotalRevenue').innerText = `R$ ${stats.totalRevenue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        $('repOrderCount').innerText = stats.orderCount;
        $('repAvgTicket').innerText = `R$ ${stats.avgTicket.toFixed(2)}`;
    }

    renderSalesChart(stats) {
        const ctx = $('chartRevenue');
        if (this.charts.revenue) this.charts.revenue.destroy();

        // Ordena as datas para o gráfico não ficar bagunçado
        const sortedDates = Object.keys(stats.dailySales).sort((a, b) => {
            const [da, ma] = a.split('/');
            const [db, mb] = b.split('/');
            return new Date(2024, ma-1, da) - new Date(2024, mb-1, db);
        });

        this.charts.revenue = new Chart(ctx, {
            type: 'line',
            data: {
                labels: sortedDates,
                datasets: [{
                    label: 'Faturamento Diário',
                    data: sortedDates.map(d => stats.dailySales[d]),
                    borderColor: '#ec4899',
                    backgroundColor: 'rgba(236, 72, 153, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    renderPaymentsChart(stats) {
        const ctx = $('chartPayments');
        if (this.charts.payments) this.charts.payments.destroy();

        this.charts.payments = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(stats.payments),
                datasets: [{
                    data: Object.values(stats.payments),
                    backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#6366f1']
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }

    renderTopProducts(stats) {
        const list = $('repTopProductsList');
        list.innerHTML = '';

        // Converte objeto em array e ordena por quantidade decrescente
        const sorted = Object.entries(stats.products)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5);

        if (sorted.length === 0) {
            list.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">Sem dados suficientes para ranking.</p>';
            return;
        }

        sorted.forEach(([name, qty]) => {
            const div = document.createElement('div');
            div.className = 'flex justify-between items-center p-2 border-b border-gray-50';
            div.innerHTML = `
                <span class="text-sm text-gray-700 truncate pr-2" title="${name}">${name}</span>
                <span class="text-sm font-bold text-purple-500 whitespace-nowrap">${qty} un.</span>
            `;
            list.appendChild(div);
        });
    }

    renderTopClients(stats) {
        const list = $('repTopClientsList');
        list.innerHTML = '';
        
        const sorted = Object.entries(stats.clients)
            .sort(([,a], [,b]) => b.total - a.total)
            .slice(0, 5);

        if (sorted.length === 0) {
            list.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">Sem dados.</p>';
            return;
        }

        sorted.forEach(([name, data]) => {
            const div = document.createElement('div');
            div.className = 'flex justify-between items-center p-2 border-b border-gray-50';
            div.innerHTML = `
                <div class="flex flex-col">
                    <span class="text-sm font-bold text-gray-700 truncate w-32" title="${name}">${name}</span>
                    <span class="text-[10px] text-gray-400">${data.count} pedidos</span>
                </div>
                <span class="text-sm font-bold text-emerald-600">R$ ${data.total.toFixed(2)}</span>
            `;
            list.appendChild(div);
        });
    }
}