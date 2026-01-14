import { $, show, hide } from '../utils/DOM.js';
import { UI } from '../utils/UI.js';
import { OrderService } from '../services/OrderService.js';

export class KanbanModule {
    constructor() {
        this.service = new OrderService();
        this.unsub = null;

        // Seletores do Board (Colunas e Contadores)
        this.cols = {
            'Pendente': $('col-pending'),
            'Preparo': $('col-prep'),
            'Pronto/Envio': $('col-sent'),
            'Concluído': $('col-done')
        };
        this.counts = {
            'Pendente': $('count-pending'),
            'Preparo': $('count-prep'),
            'Pronto/Envio': $('count-sent'),
            'Concluído': $('count-done')
        };
    }

    init() {
        console.log('[Kanban] Iniciando Gestão de Fluxo...');
        
        // 1. Carrega o Quadro
        this.loadOrders();

        // 2. Listener do Modal de Edição (que está no index.html global)
        if($('editOrderForm')) $('editOrderForm').onsubmit = (e) => this.handleEditSubmit(e);
    }

    destroy() {
        if (this.unsub) this.unsub();
        console.log('[Kanban] Finalizado.');
    }

    // --- FORMATAÇÃO VISUAL ---
    _formatItems(items, separator = '<br>') {
        if (!items) return '-';
        if (typeof items === 'string') return separator === '<br>' ? items.replace(/\n/g, '<br>') : items;
        if (Array.isArray(items)) {
            return items.map(i => {
                if (typeof i === 'object') {
                    const qtd = i.qty || i.quantity || i.q || 1;
                    const nome = i.name || i.item || i.n || 'Item sem nome';
                    const obs = i.obs ? ` (${i.obs})` : '';
                    return `${qtd}x ${nome}${obs}`;
                }
                return String(i);
            }).join(separator);
        }
        return String(items);
    }

    // --- AÇÕES DO MODAL DE EDIÇÃO ---
    async handleEditSubmit(e) {
        e.preventDefault();
        const id = $('editOrderId').value;
        const data = { 
            items: $('editOrderItems').value, 
            total: parseFloat($('editOrderTotal').value) || 0, 
            paymentMethod: $('editOrderPayment').value, 
            deliveryMethod: $('editOrderDelivery').value, 
            address: $('editOrderAddress').value,
            dueDate: $('editOrderDate').value 
        };

        try {
            const res = await this.service.updateOrder(id, data);
            if(res.success) {
                UI.toast('Pedido atualizado!');
                hide($('editOrderModal'));
            }
        } catch(err) {
            UI.alert('Erro', err.message);
        }
    }

    // --- LÓGICA DO QUADRO KANBAN ---

    loadOrders() {
        this.unsub = this.service.listenToPendingOrders((orders) => {
            this.renderBoard(orders);
        });
    }

    renderBoard(orders) {
        // Limpa colunas
        Object.values(this.cols).forEach(col => col.innerHTML = '');
        
        // Zera contadores
        const countsCalc = { 'Pendente': 0, 'Preparo': 0, 'Pronto/Envio': 0, 'Concluído': 0 };

        orders.forEach(order => {
            if(order.status === 'Agendado') return; // Ignora agendamentos futuros
            
            let status = order.status;
            // Normalização de status antigos ou variações
            if (status === 'Entregue' || status === 'Finalizado') status = 'Concluído';
            if (!this.cols[status]) status = 'Pendente';

            countsCalc[status]++;
            
            const card = this.createCard(order, status);
            this.cols[status].appendChild(card);
        });

        // Atualiza badges de contagem
        Object.keys(countsCalc).forEach(key => {
            if (this.counts[key]) this.counts[key].innerText = countsCalc[key];
        });
    }

    createCard(data, currentStatus) {
        const div = document.createElement('div');
        div.className = 'kanban-card group bg-white p-3 rounded-xl shadow-sm border border-gray-100 mb-3';
        
        const { DateTime } = luxon;
        const timeStr = data.createdAt ? DateTime.fromJSDate(data.createdAt.toDate()).toFormat('HH:mm') : '--:--';
        const itemsFormatted = this._formatItems(data.items, '<br>');

        // Destaque para o Pagamento no Card
        const payMethod = data.paymentMethod || '?';
        let payColor = 'text-gray-500';
        if(payMethod === 'Pix') payColor = 'text-green-600 font-bold';
        if(payMethod === 'Cartão') payColor = 'text-blue-600 font-bold';

        div.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <span class="font-bold text-gray-700 text-sm truncate w-24">${data.clientName}</span>
                <span class="text-[10px] text-gray-400 font-mono">${timeStr}</span>
            </div>
            <div class="text-xs text-gray-600 mb-2 leading-tight max-h-24 overflow-y-auto custom-scrollbar">${itemsFormatted}</div>
            
            <div class="flex justify-between items-center border-t border-gray-50 pt-2 mt-1">
                <span class="font-bold text-gray-800 text-xs">R$ ${parseFloat(data.total).toFixed(2)}</span>
                <div class="text-xs ${payColor}">${payMethod}</div>
            </div>
            ${data.notes ? `<div class="text-[10px] text-red-400 mt-1 italic truncate"><i class="fas fa-sticky-note mr-1"></i>${data.notes}</div>` : ''}
            
            <div class="flex justify-between mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                 <div class="flex gap-1">
                    <button class="text-gray-400 hover:text-red-500 p-1 btn-delete" title="Excluir"><i class="fas fa-trash text-xs"></i></button>
                    <button class="text-gray-400 hover:text-gray-600 p-1 btn-print" title="Imprimir"><i class="fas fa-print text-xs"></i></button>
                    <button class="text-gray-400 hover:text-blue-500 p-1 btn-edit" title="Editar Pedido"><i class="fas fa-pen-to-square text-xs"></i></button>
                 </div>
                 <div class="flex gap-1">${this.getKanbanButtons(currentStatus)}</div>
            </div>`;

        // Listeners dos Botões do Card
        div.querySelector('.btn-edit').onclick = () => this.openEditOrderModal(data);
        
        div.querySelector('.btn-print').onclick = async () => {
            if(await UI.confirm('Imprimir', 'Deseja imprimir o cupom?', 'Imprimir', 'blue')) { 
                await this.service.printOrder(data); 
            }
        };
        
        div.querySelector('.btn-delete').onclick = async () => {
            if(await UI.confirm('Excluir', 'Tem certeza?', 'Sim, Excluir', 'red')) { 
                await this.service.deleteOrder(data.id); 
            }
        };
        
        const btnNext = div.querySelector('.btn-next');
        if(btnNext) btnNext.onclick = () => this.advanceStatus(data.id, currentStatus, data);

        return div;
    }

    openEditOrderModal(order) {
        // Preenche Modal
        $('editOrderId').value = order.id;
        $('editOrderItems').value = this._formatItems(order.items, '\n');
        $('editOrderTotal').value = parseFloat(order.total).toFixed(2);
        
        // Pagamento
        const currentPay = order.paymentMethod;
        const validOptions = ['Pix', 'Dinheiro', 'Cartão'];
        if(validOptions.includes(currentPay)) {
            $('editOrderPayment').value = currentPay;
        } else {
            $('editOrderPayment').selectedIndex = -1; // Força escolha se estiver inválido
        }

        $('editOrderDelivery').value = order.deliveryMethod;
        $('editOrderAddress').value = order.address || '';
        
        const dateInput = $('editOrderDate');
        if (order.dueDate) {
            dateInput.value = order.dueDate;
        } else if (order.createdAt) {
            const dt = luxon.DateTime.fromJSDate(order.createdAt.toDate ? order.createdAt.toDate() : new Date(order.createdAt));
            dateInput.value = dt.toFormat('yyyy-MM-dd');
        }

        const badge = $('modalStatusBadge');
        if(badge) {
            badge.innerText = order.status;
            badge.className = 'text-[10px] px-2 py-1 rounded bg-gray-100 text-gray-500 font-bold uppercase border border-gray-200';
        }

        // Botões do Rodapé do Modal
        const btnDel = $('btnModalDelete');
        // Clonamos o nó para remover listeners antigos e evitar duplicação de execução
        const newBtnDel = btnDel.cloneNode(true);
        btnDel.parentNode.replaceChild(newBtnDel, btnDel);
        
        newBtnDel.onclick = async () => {
            if (await UI.confirm('Excluir Pedido', 'Tem certeza?', 'Excluir', 'red')) {
                await this.service.deleteOrder(order.id);
                hide($('editOrderModal'));
            }
        };

        const btnPrint = $('btnModalPrint');
        const newBtnPrint = btnPrint.cloneNode(true);
        btnPrint.parentNode.replaceChild(newBtnPrint, btnPrint);

        newBtnPrint.onclick = async () => { await this.service.printOrder(order); };

        // Botão Fechar/Cancelar
        $('cancelEditOrderButton').onclick = () => hide($('editOrderModal'));
        
        show($('editOrderModal'));
    }

    getKanbanButtons(status) {
        if(status === 'Pendente') return `<button class="text-green-500 hover:bg-green-50 rounded p-1 btn-next"><i class="fas fa-arrow-right"></i></button>`;
        if(status === 'Preparo') return `<button class="text-blue-500 hover:bg-blue-50 rounded p-1 btn-next"><i class="fas fa-arrow-right"></i></button>`;
        if(status === 'Pronto/Envio') return `<button class="text-gray-500 hover:bg-gray-50 rounded p-1 btn-next"><i class="fas fa-check"></i></button>`;
        return '';
    }

    async advanceStatus(orderId, currentStatus, orderData) {
        let nextStatus = '';
        if(currentStatus === 'Pendente') nextStatus = 'Preparo';
        else if(currentStatus === 'Preparo') nextStatus = 'Pronto/Envio';
        else if(currentStatus === 'Pronto/Envio') nextStatus = 'Concluído';
        if(!nextStatus) return;

        const notify = await UI.decision(`Mover para "${nextStatus}"?`, `Deseja avisar o cliente no WhatsApp?`, "Sim", "Não");
        if (notify === null) return;
        await this.service.updateStatus(orderId, nextStatus, notify, orderData);
    }
}