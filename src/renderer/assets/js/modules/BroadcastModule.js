// ================================================================================
// ATUALIZADO ARQUIVO: /src/renderer/assets/js/modules/BroadcastModule.js (COM LOGS DE DEBUG REFINADOS)
// ================================================================================
import { $, $$, show, hide } from '../utils/DOM.js';
import { UI } from '../utils/UI.js';
import { ClientService } from '../services/ClientService.js';

export class BroadcastModule {
    constructor() {
        this.clientService = new ClientService();
        this.messageInput = $('broadcastMessageInput');
        this.sendButton = $('btnStartBroadcast');
        this.stopButton = $('btnStopBroadcast');
        this.progressContainer = $('broadcastProgressContainer');
        this.progressBar = $('broadcastProgressBar');
        this.progressText = $('broadcastProgressText');
        this.statusList = $('broadcastStatusList');

        this.btnSelectFromDB = $('btnSelectFromDB');
        this.btnSelectFromFile = $('btnSelectFromFile');
        this.dbClientSelection = $('dbClientSelection');
        this.fileUploadSelection = $('fileUploadSelection');
        this.broadcastClientList = $('broadcastClientList');
        this.btnSelectAllClients = $('btnSelectAllClients');
        this.btnDeselectAllClients = $('btnDeselectAllClients');
        this.csvFileInput = $('csvFileInput');
        this.uploadedFileName = $('uploadedFileName');
        this.csvPreview = $('csvPreview');

        this.allClients = [];
        this.selectedClientIds = new Set();
        this.spreadsheetContacts = [];
        this.selectionType = 'db';

        this.handleSend = this.handleSend.bind(this);
        this.handleStop = this.handleStop.bind(this);
        this.handleStatusUpdate = this.handleStatusUpdate.bind(this);
        this.handleSelectionTypeChange = this.handleSelectionTypeChange.bind(this);
        this.handleClientSelection = this.handleClientSelection.bind(this);
        this.handleFileSelect = this.handleFileSelect.bind(this);
        this.updateStartButtonText = this.updateStartButtonText.bind(this);
    }

    init() {
        console.log('[Broadcast] Iniciando Módulo de Disparo em Massa...');
        if (this.sendButton) this.sendButton.onclick = this.handleSend;
        if (this.stopButton) this.stopButton.onclick = this.handleStop;

        hide(this.progressContainer);
        hide(this.stopButton);
        this.statusList.innerHTML = '';
        this.sendButton.disabled = false; // Garante que comece HABILITADO por padrão

        if (this.btnSelectFromDB) this.btnSelectFromDB.onclick = () => this.handleSelectionTypeChange('db');
        if (this.btnSelectFromFile) this.btnSelectFromFile.onclick = () => this.handleSelectionTypeChange('file');
        
        if (this.btnSelectAllClients) this.btnSelectAllClients.onclick = () => this.toggleAllClients(true);
        if (this.btnDeselectAllClients) this.btnDeselectAllClients.onclick = () => this.toggleAllClients(false);
        
        if (this.csvFileInput) this.csvFileInput.onchange = this.handleFileSelect;

        window.electronAPI.onMassSendStatus(this.handleStatusUpdate);

        this.loadClientsFromDB();
        this.handleSelectionTypeChange('db'); // Define 'db' como padrão
    }

    destroy() {
        console.log('[Broadcast] Finalizado.');
    }

    async loadClientsFromDB() {
        this.broadcastClientList.innerHTML = '<p class="text-xs text-gray-500 text-center py-4">Carregando clientes...</p>';
        this.clientService.listenToClients((clients) => {
            this.allClients = clients;
            this.renderClientSelection();
        });
    }

    renderClientSelection() {
        this.broadcastClientList.innerHTML = '';
        if (this.allClients.length === 0) {
            this.broadcastClientList.innerHTML = '<p class="text-xs text-gray-500 text-center py-4">Nenhum cliente cadastrado.</p>';
            return;
        }

        this.allClients.forEach(client => {
            const div = document.createElement('div');
            div.className = 'flex items-center gap-2 py-1 px-2 hover:bg-gray-100 rounded transition';
            div.innerHTML = `
                <input type="checkbox" id="client-${client.id}" data-client-id="${client.id}" class="accent-purple-500 client-checkbox">
                <label for="client-${client.id}" class="text-sm font-medium text-gray-700 flex-1 cursor-pointer">${client.name} <span class="text-xs text-gray-400">(${client.phone})</span></label>
            `;
            this.broadcastClientList.appendChild(div);
        });

        this.broadcastClientList.querySelectorAll('.client-checkbox').forEach(checkbox => {
            checkbox.checked = this.selectedClientIds.has(checkbox.dataset.clientId);
            checkbox.onchange = this.handleClientSelection;
        });
        this.updateStartButtonText();
    }

    handleClientSelection(event) {
        const checkbox = event.target;
        const clientId = checkbox.dataset.clientId;
        if (checkbox.checked) {
            this.selectedClientIds.add(clientId);
        } else {
            this.selectedClientIds.delete(clientId);
        }
        this.updateStartButtonText();
    }

    toggleAllClients(select) {
        this.selectedClientIds.clear();
        this.broadcastClientList.querySelectorAll('.client-checkbox').forEach(checkbox => {
            checkbox.checked = select;
            if (select) {
                this.selectedClientIds.add(checkbox.dataset.clientId);
            }
        });
        this.updateStartButtonText();
    }

    updateStartButtonText() {
        // Garantimos que o botão esteja visível (não escondido por display: none)
        // Isso resolve o problema de 'hidden' anterior se ele estivesse presente
        show(this.sendButton); 
        console.log('[Broadcast] updateStartButtonText triggered. Current selectionType:', this.selectionType);

        if (this.selectionType === 'db') {
            const count = this.selectedClientIds.size;
            this.sendButton.innerText = count > 0
                ? `Iniciar Disparo para ${count} Cliente(s)`
                : 'Selecione clientes ou faça upload';
            this.sendButton.disabled = count === 0;
            console.log(`[Broadcast] DB mode: count=${count}, disabled=${this.sendButton.disabled}`);
        } else if (this.selectionType === 'file') {
            const count = this.spreadsheetContacts.length;
            this.sendButton.innerText = count > 0
                ? `Iniciar Disparo para ${count} Contato(s) da Planilha`
                : 'Nenhum contato válido no CSV'; // Mudei o texto aqui para ser mais claro
            this.sendButton.disabled = count === 0;
            console.log(`[Broadcast] File mode: count=${count}, disabled=${this.sendButton.disabled}`);
        }
        console.log('[Broadcast] sendButton final state: disabled=', this.sendButton.disabled, 'text=', this.sendButton.innerText);
    }

    handleFileSelect(event) {
        console.log('[Broadcast] handleFileSelect triggered.');
        const file = event.target.files[0];
        if (!file) {
            console.log('[Broadcast] No file selected or file cleared.');
            this.spreadsheetContacts = [];
            hide(this.uploadedFileName);
            hide(this.csvPreview);
            this.updateStartButtonText();
            return;
        }
        console.log('[Broadcast] File:', file.name, 'Type:', file.type);
        if (file.type !== 'text/csv') {
            console.warn('[Broadcast] Invalid file type.');
            UI.toast('Por favor, selecione um arquivo CSV.', 'error');
            this.csvFileInput.value = '';
            this.spreadsheetContacts = [];
            hide(this.uploadedFileName);
            hide(this.csvPreview);
            this.updateStartButtonText();
            return;
        }

        this.uploadedFileName.innerText = `Arquivo carregado: ${file.name}`;
        show(this.uploadedFileName);

        const reader = new FileReader();
        reader.onload = (e) => {
            console.log('[Broadcast] FileReader loaded.');
            const text = e.target.result;
            this.parseCSV(text);
        };
        reader.readAsText(file);
    }

    parseCSV(csvText) {
        console.log('[Broadcast] parseCSV triggered. CSV text length:', csvText.length);
        this.spreadsheetContacts = [];
        this.csvPreview.innerHTML = '';
        hide(this.csvPreview);

        const lines = csvText.split('\n').filter(line => line.trim() !== '');
        console.log('[Broadcast] CSV lines (after filter):', lines.length);
        if (lines.length === 0) {
            UI.toast('CSV vazio ou mal formatado.', 'error');
            this.updateStartButtonText();
            return;
        }

        // Adição de cabeçalho dinâmico para CSVs com ou sem BOM (Byte Order Mark)
        // Alguns editores como o Excel salvam CSV com caracteres invisíveis no início
        let rawHeaders = lines[0].split(',');
        // Tenta limpar um possível BOM do primeiro cabeçalho
        if (rawHeaders[0].charCodeAt(0) === 0xFEFF) { // BOM UTF-8
            rawHeaders[0] = rawHeaders[0].substring(1);
        }
        const headers = rawHeaders.map(h => h.trim().toLowerCase());
        
        const nameIndex = headers.indexOf('nome');
        const phoneIndex = headers.indexOf('telefone');
        console.log('[Broadcast] Headers (parsed):', headers, 'Name index:', nameIndex, 'Phone index:', phoneIndex);

        if (nameIndex === -1 || phoneIndex === -1) {
            UI.toast('CSV deve conter as colunas "Nome" e "Telefone". Verifique maiúsculas/minúsculas.', 'error');
            // Debug: Mostrar os headers que foram lidos
            console.error('[Broadcast] CSV Headers mismatch. Found:', headers.join(', '));
            this.updateStartButtonText();
            return;
        }
        
        let validCount = 0;
        let invalidCount = 0;
        const previewItems = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            // Certifique-se de que estamos pegando os valores corretos com base nos índices
            const name = values[nameIndex] ? values[nameIndex].trim() : '';
            const phone = values[phoneIndex] ? values[phoneIndex].trim().replace(/\D/g, '') : '';
            
            // Debug: Log para cada linha processada
            console.log(`[Broadcast] Processing line ${i}: Name='${name}', Phone='${phone}'`);

            if (name && phone && phone.length >= 8) {
                this.spreadsheetContacts.push({ name, phone });
                previewItems.push(`<li class="text-emerald-700"><i class="fas fa-check-circle mr-1"></i> ${name} (${phone})</li>`);
                validCount++;
            } else {
                // Debug: Log de linhas inválidas
                console.warn(`[Broadcast] Invalid contact found (line ${i}): Name='${name}', Phone='${phone}'`);
                previewItems.push(`<li class="text-red-700"><i class="fas fa-times-circle mr-1"></i> Inválido: ${values.join(',').substring(0, Math.min(values.join(',').length, 50))}</li>`);
                invalidCount++;
            }
        }
        console.log('[Broadcast] Final spreadsheetContacts length (after parsing):', this.spreadsheetContacts.length);
        console.log('[Broadcast] Valid contacts:', validCount, 'Invalid contacts:', invalidCount);

        if (this.spreadsheetContacts.length > 0) {
            this.csvPreview.innerHTML = `
                <p class="text-xs font-bold mb-2">Pré-visualização (Válidos: ${validCount}, Inválidos: ${invalidCount})</p>
                <ul>${previewItems.join('')}</ul>
            `;
            show(this.csvPreview);
        } else {
            UI.toast('Nenhum contato válido encontrado no CSV.', 'error');
        }
        // CHAMADA CRÍTICA: Assegura que o texto e estado do botão sejam atualizados
        this.updateStartButtonText(); 
    }

    // =========================================
    // LÓGICA DA UI PARA TIPO DE SELEÇÃO
    // =========================================
    handleSelectionTypeChange(type) {
        this.selectionType = type;
        
        $$('.current-selection-type').forEach(btn => {
            if (btn.dataset.type === type) {
                btn.classList.add('bg-purple-100', 'text-purple-700', 'active');
                btn.classList.remove('text-gray-700');
            } else {
                btn.classList.remove('bg-purple-100', 'text-purple-700', 'active');
                btn.classList.add('text-gray-700');
            }
        });

        $$('.selection-content').forEach(content => hide(content));
        if (type === 'db') {
            show(this.dbClientSelection);
        } else if (type === 'file') {
            show(this.fileUploadSelection);
        }
        this.updateStartButtonText();
    }

    // =========================================
    // LÓGICA DE ENVIO (START/STOP)
    // =========================================
    async handleSend() {
        const message = this.messageInput.value.trim();
        if (!message) {
            UI.toast('A mensagem não pode estar vazia!', 'error');
            return;
        }

        let recipients = null;
        let recipientCount = 0;

        if (this.selectionType === 'db') {
            if (this.selectedClientIds.size === 0) {
                UI.toast('Selecione pelo menos um cliente cadastrado.', 'error');
                return;
            }
            recipients = { clientIds: Array.from(this.selectedClientIds) };
            recipientCount = this.selectedClientIds.size;
            
        } else if (this.selectionType === 'file') {
            if (this.spreadsheetContacts.length === 0) {
                UI.toast('Carregue um arquivo CSV com contatos válidos.', 'error');
                return;
            }
            recipients = { spreadsheetData: this.spreadsheetContacts };
            recipientCount = this.spreadsheetContacts.length;
        }
        
        const confirm = await UI.confirm(
            'Confirmar Disparo em Massa?',
            `Você está prestes a enviar esta mensagem para *${recipientCount}* contatos. Isso pode levar tempo e consumir dados.\n\n*Mensagem:* "${message.substring(0, Math.min(message.length, 100))}..."`,
            'Confirmar Envio',
            'red'
        );

        if (!confirm) return;

        // Reset UI para novo envio
        this.statusList.innerHTML = '';
        this.progressBar.style.width = '0%';
        this.progressText.innerText = '0/0 (0%)';
        show(this.progressContainer);
        show(this.stopButton);
        this.sendButton.disabled = true;
        this.sendButton.innerText = 'Enviando...';

        UI.toast('Iniciando disparo em massa...');
        window.electronAPI.startMassSend(message, recipients);
    }

    // ... (handleStop e handleStatusUpdate permanecem os mesmos) ...
    async handleStop() {
        const confirm = await UI.confirm(
            'Interromper Disparo?',
            'Tem certeza que deseja parar o disparo em massa? Clientes que ainda não receberam não serão notificados.',
            'Sim, Parar',
            'orange'
        );
        if (confirm) {
            window.electronAPI.stopMassSend();
            UI.toast('Solicitação de interrupção enviada.');
        }
    }

    handleStatusUpdate(status) {
        if (status.totalClients === 0 && !status.lastMessage) {
            // Caso especial de nenhum cliente encontrado antes de iniciar
            this.progressText.innerText = `Nenhum cliente elegível encontrado.`;
            this.progressBar.style.width = '100%';
            this.progressBar.classList.add('bg-red-500'); 
            this.sendButton.disabled = false;
            this.sendButton.innerText = 'Iniciar Disparo em Massa';
            hide(this.stopButton);
            this.addItemToStatusList('Nenhum cliente elegível encontrado para o disparo.', 'info');
            return;
        }
        
        const currentProgressCount = status.sentCount + status.failedCount;
        const percentage = status.totalClients > 0
            ? (currentProgressCount / status.totalClients) * 100
            : 0;
        
        this.progressBar.style.width = `${percentage.toFixed(0)}%`;
        this.progressText.innerText = `${currentProgressCount}/${status.totalClients} (${percentage.toFixed(0)}%)`;

        this.progressBar.classList.remove('bg-purple-500', 'bg-emerald-500', 'bg-red-500', 'bg-orange-500');
        if (status.isFinished) {
            if (status.failedCount === 0) {
                this.progressBar.classList.add('bg-emerald-500');
                this.addItemToStatusList('Disparo em massa concluído com sucesso!', 'success');
            } else if (status.sentCount > 0 && status.failedCount > 0) {
                this.progressBar.classList.add('bg-orange-500');
                this.addItemToStatusList(`Disparo em massa finalizado com ${status.failedCount} falhas.`, 'warning');
            } else {
                 this.progressBar.classList.add('bg-red-500');
                 this.addItemToStatusList('Disparo em massa finalizado, mas houve falhas.', 'error');
            }
            this.sendButton.disabled = false;
            this.updateStartButtonText(); // Atualiza texto do botão após conclusão
            hide(this.stopButton);
        } else if (status.isStopped) {
            this.progressBar.classList.add('bg-orange-500');
            this.addItemToStatusList('Disparo em massa INTERROMPIDO pelo usuário.', 'warning');
            this.sendButton.disabled = false;
            this.updateStartButtonText(); // Atualiza texto do botão após interrupção
            hide(this.stopButton);
        }
        else {
            this.progressBar.classList.add('bg-purple-500');
        }

        if (status.lastMessage) {
            this.addItemToStatusList(status.lastMessage.text, status.lastMessage.type);
        }
    }

    addItemToStatusList(text, type = 'info') {
        const item = document.createElement('li');
        item.className = 'py-1 border-b border-gray-50 flex items-center gap-2 text-xs last:border-b-0 animate-fade-in';
        let iconClass = '';
        let textColorClass = 'text-gray-600';

        switch (type) {
            case 'success':
                iconClass = 'fas fa-check-circle text-emerald-500';
                textColorClass = 'text-emerald-700';
                break;
            case 'error':
                iconClass = 'fas fa-times-circle text-red-500';
                textColorClass = 'text-red-700';
                break;
            case 'warning':
                iconClass = 'fas fa-exclamation-triangle text-orange-500';
                textColorClass = 'text-orange-700';
                break;
            case 'info':
            default:
                iconClass = 'fas fa-info-circle text-blue-500';
                textColorClass = 'text-gray-600';
                break;
        }

        item.innerHTML = `<i class="${iconClass}"></i> <span class="${textColorClass}">${text}</span>`;
        this.statusList.prepend(item); 
        if (this.statusList.children.length > 20) { 
            this.statusList.removeChild(this.statusList.lastChild);
        }
    }
}