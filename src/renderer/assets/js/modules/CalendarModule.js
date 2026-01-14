import { $, show, hide } from '../utils/DOM.js';
import { UI } from '../utils/UI.js';
import { CalendarService } from '../services/CalendarService.js';
import { ClientService } from '../services/ClientService.js';

export class CalendarModule {
    constructor() {
        this.service = new CalendarService();
        this.clientService = new ClientService();
        this.DateTime = luxon.DateTime; 
        this.currentDate = this.DateTime.now();

        // Elementos UI Principal
        this.grid = $('calendarGrid');
        this.monthLabel = $('currentMonthLabel');
        this.btnPrev = $('btnPrevMonth');
        this.btnNext = $('btnNextMonth');
        this.btnNew = $('btnNewEncomenda');

        // Modal Encomenda (Novo)
        this.modal = $('encomendaModal');
        this.form = $('encomendaForm');
        this.clientSelect = $('encClientSelect');
        this.btnClose = $('closeEncomendaModal');
        this.btnDelete = $('btnDeleteEncomenda');

        // Bindings
        this.changeMonth = this.changeMonth.bind(this);
        this.handleSave = this.handleSave.bind(this);
        this.openModal = this.openModal.bind(this);
    }

    init() {
        console.log('[Calendar] Iniciando Gestão de Encomendas...');
        this.renderCalendar();
        this.loadClients();

        // Listeners Navegação
        if (this.btnPrev) this.btnPrev.onclick = () => this.changeMonth(-1);
        if (this.btnNext) this.btnNext.onclick = () => this.changeMonth(1);
        
        // Listener Novo Agendamento
        if (this.btnNew) this.btnNew.onclick = () => this.openModal();

        // Listeners Modal
        if (this.form) this.form.onsubmit = this.handleSave;
        if (this.btnClose) this.btnClose.onclick = () => hide(this.modal);
        if (this.btnDelete) this.btnDelete.onclick = async () => {
             if(await UI.confirm('Excluir', 'Tem certeza?', 'Excluir', 'red')) {
                 const id = $('encId').value;
                 if(id) {
                     await this.service.deleteOrder(id);
                     hide(this.modal);
                     this.renderCalendar();
                 }
             }
        };
    }

    loadClients() {
        this.clientService.listenToClients((clients) => {
            if(!this.clientSelect) return;
            this.clientSelect.innerHTML = '<option value="">Selecione o Cliente...</option>';
            clients.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.name;
                this.clientSelect.appendChild(opt);
            });
        });
    }

    changeMonth(direction) {
        this.currentDate = this.currentDate.plus({ months: direction });
        this.renderCalendar();
    }

    async renderCalendar() {
        if (!this.grid || !this.monthLabel) return;

        this.grid.innerHTML = '<div class="col-span-7 text-center py-10"><i class="fas fa-spinner fa-spin"></i></div>';
        this.monthLabel.textContent = this.currentDate.setLocale('pt-BR').toFormat('MMMM yyyy').toUpperCase();

        const res = await this.service.getScheduledOrders();
        const scheduledOrders = (res.success && res.orders) ? res.orders : [];

        this.grid.innerHTML = '';

        const firstDay = this.currentDate.startOf('month');
        const daysInMonth = this.currentDate.daysInMonth;
        const startDayOfWeek = firstDay.weekday === 7 ? 0 : firstDay.weekday;

        // Dias vazios
        for (let i = 0; i < startDayOfWeek; i++) {
            const empty = document.createElement('div');
            empty.className = 'bg-gray-50 opacity-30 border border-gray-100 rounded-lg';
            this.grid.appendChild(empty);
        }

        // Dias do Mês
        for (let i = 1; i <= daysInMonth; i++) {
            const currentDayDate = firstDay.set({ day: i });
            const dateStr = currentDayDate.toFormat('yyyy-MM-dd');
            const isToday = dateStr === this.DateTime.now().toFormat('yyyy-MM-dd');

            // Filtra encomendas
            const daysOrders = scheduledOrders.filter(o => o.dueDate === dateStr);

            const cell = document.createElement('div');
            cell.className = `border rounded-lg p-2 flex flex-col relative h-32 transition overflow-hidden group hover:border-purple-400 ${isToday ? 'bg-purple-50 border-purple-300' : 'bg-white border-gray-100'}`;
            
            cell.innerHTML = `<span class="text-xs font-bold ${isToday ? 'text-purple-600' : 'text-gray-400'} mb-1">${i}</span>`;
            
            // Botão "+" no hover do dia
            const addBtn = document.createElement('button');
            addBtn.className = 'absolute top-1 right-1 text-purple-400 hover:text-purple-700 opacity-0 group-hover:opacity-100 transition text-xs';
            addBtn.innerHTML = '<i class="fas fa-plus"></i>';
            addBtn.onclick = (e) => { e.stopPropagation(); this.openModal(null, dateStr); };
            cell.appendChild(addBtn);

            const listDiv = document.createElement('div');
            listDiv.className = 'flex-1 overflow-y-auto space-y-1 custom-scrollbar';
            
            daysOrders.forEach(o => {
                const badge = document.createElement('div');
                const hasLoan = !!o.loanedItems;
                // Cor diferente se tiver empréstimo (Laranja) ou normal (Roxo)
                const colorClass = hasLoan 
                    ? 'bg-orange-100 text-orange-700 border-orange-200' 
                    : 'bg-purple-100 text-purple-700 border-purple-200';

                badge.className = `text-[9px] px-1 py-0.5 rounded truncate cursor-pointer border hover:opacity-80 transition ${colorClass}`;
                badge.innerHTML = `${hasLoan ? '<i class="fas fa-box text-[8px] mr-1"></i>' : ''} ${o.clientName.split(' ')[0]}`;
                
                badge.onclick = (e) => { e.stopPropagation(); this.openModal(o); };
                listDiv.appendChild(badge);
            });

            cell.appendChild(listDiv);
            this.grid.appendChild(cell);
        }
    }

    openModal(order = null, preSelectedDate = null) {
        // Reset Form
        this.form.reset();
        $('encId').value = '';
        show(this.btnDelete); // Default show, hide se for novo
        
        if (order) {
            // EDIÇÃO
            $('encId').value = order.id;
            this.clientSelect.value = order.clientId;
            $('encDate').value = order.dueDate;
            $('encItems').value = order.items;
            $('encTotal').value = parseFloat(order.total || 0).toFixed(2);
            $('encAddress').value = order.address || '';
            
            // Carrega Pagamento (NOVO)
            if(order.paymentMethod) $('encPayment').value = order.paymentMethod;
            
            // Novos campos empréstimo
            $('encLoanedItems').value = order.loanedItems || '';
            $('encReturnDate').value = order.returnDate || '';
            
            show(this.btnDelete);
        } else {
            // NOVO
            hide(this.btnDelete);
            if (preSelectedDate) $('encDate').value = preSelectedDate;
        }

        show(this.modal);
    }

    async handleSave(e) {
        e.preventDefault();
        
        const id = $('encId').value;
        const clientId = this.clientSelect.value;
        if(!clientId) { UI.toast('Selecione um cliente', 'error'); return; }
        
        const clientName = this.clientSelect.options[this.clientSelect.selectedIndex].text;
        
        const data = {
            clientId,
            clientName,
            date: $('encDate').value,
            items: $('encItems').value,
            total: parseFloat($('encTotal').value) || 0,
            address: $('encAddress').value,
            loanedItems: $('encLoanedItems').value,
            returnDate: $('encReturnDate').value,
            // Salva Pagamento
            paymentMethod: $('encPayment').value,
            method: $('encAddress').value ? 'Entrega' : 'Retirada'
        };

        try {
            if (id) {
                // Update
                const res = await this.service.updateOrder(id, {
                    dueDate: data.date,
                    items: data.items,
                    total: data.total,
                    address: data.address,
                    deliveryMethod: data.method,
                    paymentMethod: data.paymentMethod, // Envia para o banco
                    loanedItems: data.loanedItems,
                    returnDate: data.returnDate,
                    notes: data.loanedItems ? `⚠️ EMPRÉSTIMO: Devolução em ${data.returnDate}` : ''
                });
                if(res.success) UI.toast('Encomenda atualizada!');
            } else {
                // Create
                const res = await window.electronAPI.createScheduledOrder(data);
                if(res.success) UI.toast('Encomenda agendada!');
            }
            hide(this.modal);
            this.renderCalendar();
        } catch (err) {
            UI.alert('Erro', err.message);
        }
    }
}