import { $, show, hide } from '../utils/DOM.js';
import { UI } from '../utils/UI.js';
import { ClientService } from '../services/ClientService.js';

export class ClientsModule {
    constructor() {
        this.service = new ClientService();
        this.unsub = null;

        // Elementos DOM
        this.listContainer = $('clientsList');
        this.addForm = $('addClientForm');
        this.noClientsMsg = $('noClientsMessage');
        
        // Modal Edição
        this.editModal = $('editClientModal');
        this.editForm = $('editClientForm');
        this.historyContainer = $('clientAppointmentsHistory');
        this.cancelEditBtn = $('cancelEditClientButton');

        this.handleListClick = this.handleListClick.bind(this);
        this.handleAddSubmit = this.handleAddSubmit.bind(this);
        this.handleEditSubmit = this.handleEditSubmit.bind(this);
    }

    init() {
        console.log('[Clients] Iniciando...');
        this.loadClients();
        if (this.addForm) this.addForm.addEventListener('submit', this.handleAddSubmit);
        if (this.editForm) this.editForm.addEventListener('submit', this.handleEditSubmit);
        if (this.listContainer) this.listContainer.addEventListener('click', this.handleListClick);
        if (this.cancelEditBtn) this.cancelEditBtn.onclick = () => hide(this.editModal);
    }

    destroy() {
        if (this.unsub) { this.unsub(); this.unsub = null; }
        if (this.addForm) this.addForm.removeEventListener('submit', this.handleAddSubmit);
        if (this.editForm) this.editForm.removeEventListener('submit', this.handleEditSubmit);
        if (this.listContainer) this.listContainer.removeEventListener('click', this.handleListClick);
    }

    // --- HELPER PARA FORMATAR ITENS (CORREÇÃO DO [object Object]) ---
    _formatItems(items) {
        if (!items) return '-';
        
        // Se for string, retorna ela mesma
        if (typeof items === 'string') return items;

        // Se for Array de objetos (do Carrinho/PDV)
        if (Array.isArray(items)) {
            return items.map(i => {
                if (typeof i === 'object') {
                    const qtd = i.qty || i.quantity || i.q || 1;
                    const nome = i.name || i.item || i.n || 'Item';
                    return `${qtd}x ${nome}`;
                }
                return String(i);
            }).join(', '); // Separa por vírgula para ficar compacto no histórico
        }

        return String(items);
    }

    loadClients() {
        this.unsub = this.service.listenToClients((clients) => {
            this.renderList(clients);
        });
    }

    renderList(clients) {
        this.listContainer.innerHTML = '';
        if (clients.length === 0) { show(this.noClientsMsg); return; }
        hide(this.noClientsMsg);

        clients.forEach(c => {
            const div = document.createElement('div');
            div.className = 'bg-white p-3 rounded-lg shadow-sm border border-gray-100 flex justify-between items-center mb-2 animate-fade-in hover:border-purple-200 transition';
            
            const addressDisplay = c.address || c.lastAddress || 'Sem endereço cadastrado';

            div.innerHTML = `
                <div>
                    <p class="font-bold text-gray-800 text-sm">${c.name}</p>
                    <p class="text-xs text-gray-500">${c.phone}</p>
                    <p class="text-[10px] text-gray-400 mt-1"><i class="fas fa-map-marker-alt mr-1"></i>${addressDisplay}</p>
                </div>
                <div class="space-x-1 flex items-center">
                    <button class="bg-purple-100 hover:bg-purple-200 text-purple-600 px-3 py-1 rounded text-xs transition btn-action font-bold" 
                            data-action="chat" data-id="${c.id}" data-name="${c.name}" data-phone="${c.phone}">
                        Chat
                    </button>
                    <button class="bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1 rounded text-xs transition btn-action" 
                            data-action="edit" data-id="${c.id}" 
                            data-name="${c.name}" data-phone="${c.phone}" 
                            data-cc="${c.countryCode || '55'}"
                            data-address="${c.address || c.lastAddress || ''}">
                        Editar
                    </button>
                    <button class="text-red-300 hover:text-red-500 px-2 transition btn-action" 
                            data-action="delete" data-id="${c.id}" title="Excluir Cliente">
                        <i class="fas fa-trash pointer-events-none"></i>
                    </button>
                </div>
            `;
            this.listContainer.appendChild(div);
        });
    }

    async handleListClick(e) {
        const btn = e.target.closest('.btn-action');
        if (!btn) return;
        const action = btn.dataset.action;
        const id = btn.dataset.id;

        if (action === 'chat') {
            const chatNav = $('navConversas');
            if(chatNav) {
                chatNav.click();
                // Pequeno delay para garantir que a UI trocou
                setTimeout(() => {
                    // Tenta acessar o ChatModule via global window.app (definido no App.js)
                    if (window.app && window.app.modules.conversas) {
                        window.app.modules.conversas.openChat(id, btn.dataset.name, btn.dataset.phone);
                    }
                }, 100);
            }
        }
        
        if (action === 'delete') {
            if (await UI.confirm('Excluir Cliente', 'Isso não apaga o histórico de pedidos, apenas o cadastro.', 'Excluir', 'red')) {
                await this.service.deleteClient(id);
                UI.toast('Cliente excluído.');
            }
        }

        if (action === 'edit') {
            this.openEditModal({
                id: id,
                name: btn.dataset.name,
                phone: btn.dataset.phone,
                countryCode: btn.dataset.cc,
                address: btn.dataset.address
            });
        }
    }

    async handleAddSubmit(e) {
        e.preventDefault();
        const name = $('clientNameInput').value.trim();
        const phone = $('clientPhoneInput').value.trim();
        const cc = $('addClientCountryCode').value;
        const address = $('clientAddressInput').value.trim();

        if (!name || !phone) {
            UI.alert('Atenção', 'Preencha nome e telefone.');
            return;
        }

        try {
            const res = await this.service.createClient({ rawPhone: phone, name, countryCode: cc, address });
            if (res.success) {
                this.addForm.reset();
                UI.toast('Cliente salvo com sucesso!');
            } else {
                UI.alert('Erro', res.error || 'Falha ao criar cliente.');
            }
        } catch (err) {
            UI.alert('Erro', err.message);
        }
    }

    async openEditModal(clientData) {
        $('editClientId').value = clientData.id;
        $('editClientName').value = clientData.name;
        $('editClientPhone').value = clientData.phone;
        $('editClientCountryCode').value = clientData.countryCode;
        $('editClientAddress').value = clientData.address || '';

        this.historyContainer.innerHTML = '<p class="text-xs text-gray-400 text-center py-4"><i class="fas fa-spinner fa-spin mr-2"></i>Carregando histórico...</p>';
        show(this.editModal);

        try {
            const res = await this.service.getHistory(clientData.id);
            this.renderHistory(res.appointments);
        } catch (error) {
            this.historyContainer.innerHTML = '<p class="text-xs text-red-400 text-center">Erro ao carregar histórico.</p>';
        }
    }

    renderHistory(appointments) {
        this.historyContainer.innerHTML = '';
        if (!appointments || appointments.length === 0) {
            this.historyContainer.innerHTML = '<div class="text-center py-4 text-gray-400 text-xs">Nenhum pedido encontrado.</div>';
            return;
        }
        
        appointments.forEach(o => {
            // AQUI APLICAMOS A FORMATAÇÃO
            const itemsReadable = this._formatItems(o.service);

            const item = document.createElement('div');
            item.className = 'border-b border-gray-50 py-2 hover:bg-gray-50 px-2 rounded';
            item.innerHTML = `
                <div class="flex justify-between items-center mb-1">
                    <span class="text-[10px] font-bold text-gray-400">${o.date}</span>
                    <span class="text-[10px] font-bold text-purple-600">${o.status}</span>
                </div>
                <!-- Exibe os itens formatados -->
                <div class="text-xs text-gray-700 truncate" title="${itemsReadable}">${itemsReadable}</div>
                <div class="text-[10px] text-gray-400 text-right">${o.time}</div>
            `;
            this.historyContainer.appendChild(item);
        });
    }

    async handleEditSubmit(e) {
        e.preventDefault();
        const id = $('editClientId').value;
        const name = $('editClientName').value.trim();
        const phone = $('editClientPhone').value.trim();
        const countryCode = $('editClientCountryCode').value;
        const address = $('editClientAddress').value.trim();

        try {
            const res = await this.service.updateClient(id, { name, phone, countryCode, address });
            if (res.success) {
                UI.toast('Cliente atualizado!');
                hide(this.editModal);
            } else {
                UI.alert('Erro', res.error);
            }
        } catch (err) {
            UI.alert('Erro', err.message);
        }
    }
}