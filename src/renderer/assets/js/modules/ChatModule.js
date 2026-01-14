import { $, show, hide } from '../utils/DOM.js';
import { UI } from '../utils/UI.js';
import { FirebaseService } from '../services/FirebaseService.js';

export class ChatModule {
    constructor() {
        this.db = FirebaseService.getInstance().db;
        this.unsubList = null;
        this.unsubChat = null;
        this.currentChatId = null;

        // Elementos UI
        this.listEl = $('conversationsList');
        this.chatWindow = $('chatWindow');
        this.messagesContainer = $('messagesContainer');
        this.clientNameEl = $('currentChatClientName');
        this.emptyState = $('emptyChatState');
        this.input = $('chatMessageInput');
        this.sendBtn = $('sendChatMessageButton');
        this.aiToggle = $('aiToggleSwitch');
        this.galleryBtn = $('btnQuickGallery');
    }

    init() {
        console.log('[Chat] Iniciando...');
        this.loadConversations();
        this.setupInputListeners();
    }

    destroy() {
        if (this.unsubList) this.unsubList();
        if (this.unsubChat) this.unsubChat();
        console.log('[Chat] Finalizado.');
    }

    loadConversations() {
        // Ouve a lista de clientes em tempo real
        this.unsubList = this.db.collection('clients').orderBy('name', 'asc').onSnapshot(snap => {
            this.listEl.innerHTML = '';
            if (snap.empty) {
                this.listEl.innerHTML = '<p class="text-gray-500 text-sm p-4">Nenhum cliente.</p>';
                return;
            }
            snap.forEach(doc => {
                const c = doc.data();
                const div = document.createElement('div');
                div.className = 'p-4 hover:bg-purple-50 cursor-pointer border-b transition flex justify-between items-center';
                // Marca visualmente se for o chat ativo
                if(doc.id === this.currentChatId) div.classList.add('bg-purple-100');
                
                div.innerHTML = `
                    <span class="font-bold text-gray-700">${c.name}</span>
                    <i class="fas fa-chevron-right text-xs text-gray-300"></i>
                `;
                div.onclick = () => this.openChat(doc.id, c.name, c.phone);
                this.listEl.appendChild(div);
            });
        });
    }

    async openChat(clientId, name, phone) {
        this.currentChatId = clientId;
        this.clientNameEl.innerText = name;
        this.clientNameEl.dataset.phone = phone; // Armazena telefone para envio
        
        show(this.chatWindow);
        hide(this.emptyState);

        // Configura Toggle da IA
        if (this.aiToggle) {
            try {
                const doc = await this.db.collection('clients').doc(clientId).get();
                if(doc.exists) {
                    // Se aiPaused = true, o toggle deve estar unchecked (IA desligada)
                    // Se aiPaused = false (ou undefined), toggle checked (IA ativa)
                    const isPaused = doc.data().aiPaused === true;
                    this.aiToggle.checked = !isPaused;
                }
            } catch(e) { console.error(e); }
            
            // Listener do Toggle (Remove anterior para evitar duplicidade usando onclick direto)
            this.aiToggle.onclick = async (e) => {
                const isAiActive = e.target.checked; // checked = IA Ativa
                try {
                    await this.db.collection('clients').doc(this.currentChatId).update({ aiPaused: !isAiActive });
                    UI.toast(`IA ${isAiActive ? 'Ativada' : 'Pausada'}`);
                } catch(err) {
                    console.error(err);
                    e.target.checked = !isAiActive; // Reverte visualmente
                }
            };
        }

        // Listener de Mensagens
        if(this.unsubChat) this.unsubChat(); // Limpa listener anterior
        
        this.unsubChat = this.db.collection('clients').doc(clientId)
            .collection('messages')
            .orderBy('timestamp', 'asc')
            .onSnapshot(snap => {
                this.messagesContainer.innerHTML = '';
                snap.forEach(d => {
                    const m = d.data();
                    const div = document.createElement('div');
                    div.className = `flex ${m.fromMe ? 'justify-end' : 'justify-start'} mb-2`;
                    
                    let contentHtml = m.body || m.content || "";
                    // Se for imagem (hack visual simples)
                    if(contentHtml.includes('[FOTO')) {
                        contentHtml = `<span class="italic text-xs"><i class="fas fa-camera"></i> ${contentHtml}</span>`;
                    }

                    div.innerHTML = `
                        <div class="${m.fromMe ? 'bg-purple-100' : 'bg-white border'} px-4 py-2 rounded-lg max-w-xs text-sm shadow-sm">
                            ${contentHtml}
                        </div>`;
                    this.messagesContainer.appendChild(div);
                });
                // Auto-scroll para o fim
                setTimeout(() => { 
                    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight; 
                }, 100);
            });
    }

    setupInputListeners() {
        // Envio de Texto
        this.sendBtn.onclick = async () => {
            const phone = this.clientNameEl.dataset.phone;
            const msg = this.input.value;
            if (phone && msg.trim()) {
                this.input.value = '';
                const res = await window.electronAPI.sendWhatsappMessage(phone, msg);
                if(!res.success) UI.alert('Erro', 'Falha ao enviar mensagem via WhatsApp.');
            }
        };

        // Envio com Enter
        this.input.onkeyup = (e) => {
            if(e.key === 'Enter') this.sendBtn.click();
        };

        // Galeria Rápida
        if (this.galleryBtn) {
            console.log('[Chat] Vinculando botão da galeria...');
            this.galleryBtn.onclick = () => {
                console.log('[Chat] Botão galeria clicado');
                this.openQuickGallery();
            };
        } else {
            console.error('[Chat] Erro: Botão btnQuickGallery não encontrado no DOM');
        }
        // LISTENER DA VITRINE DO DIA
        const btnShowcase = $('btnDailyShowcase');
        if (btnShowcase) {
            btnShowcase.onclick = async () => {
                const phone = this.clientNameEl.dataset.phone;
                const name = this.clientNameEl.innerText;

                if (!phone) {
                    UI.alert('Erro', 'Selecione uma conversa primeiro.');
                    return;
                }

                if (await UI.confirm('Enviar Vitrine?', `Isso enviará fotos de TODOS os produtos com estoque para ${name}.`, 'Enviar Agora', 'purple')) {
                    
                    UI.toast('Enviando fotos... (Isso pode levar uns segundos)');
                    const cleanPhone = phone.includes('@') ? phone : `${phone}@c.us`;
                    
                    const res = await window.electronAPI.sendDailyShowcase(cleanPhone);
                    
                    if (res.success) {
                        UI.toast(`${res.count} fotos enviadas!`, 'success');
                    } else {
                        UI.alert('Aviso', res.message || res.error);
                    }
                }
            };
        }
}

async openQuickGallery() {
    const res = await window.electronAPI.getProducts(); 
    if(!res.success) return;
    
    // Filtro: Imagem existe e produto está ativo
    const productsWithImages = res.products.filter(p => p.imagePath && p.active !== false);
    
    if(productsWithImages.length === 0) {
        UI.toast('Nenhum produto com foto.', 'error');
        return;
    }
    
    // HTML EXATAMENTE COMO ERA NO ORIGINAL
    let galleryHtml = `<div class="grid grid-cols-3 gap-3 max-h-96 overflow-y-auto">`;
    productsWithImages.forEach(p => { 
        const safePath = p.imagePath.replace(/\\/g, '/'); 
        galleryHtml += `
            <div class="cursor-pointer group relative border rounded-lg overflow-hidden h-24 bg-gray-100 photo-item" 
                 data-path="${safePath}" data-name="${p.name}">
                <img src="file://${safePath}" class="w-full h-full object-cover group-hover:opacity-80 transition">
                <div class="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-[9px] p-1 truncate text-center">
                    ${p.name}
                </div>
            </div>`; 
    });
    galleryHtml += `</div>`;

    // Chamada do Modal igual à antiga
    UI._createModal(`
        <h3 class="text-lg font-bold text-gray-800 mb-4">
            <i class="fas fa-images text-purple-500"></i> Galeria Rápida
        </h3>
        ${galleryHtml}
        <p class="text-xs text-center text-gray-400 mt-4">Clique na foto para enviar.</p>
    `, (card, close) => {
        card.querySelectorAll('.photo-item').forEach(item => {
            item.onclick = async () => {
                const imgPath = item.dataset.path; 
                const caption = item.dataset.name; 
                // Buscamos o telefone direto do elemento da UI do chat atual
                const phone = this.clientNameEl.dataset.phone;

                if(phone) { 
                    UI.toast(`Enviando foto de ${caption}...`); 
                    close(); 
                    const sendRes = await window.electronAPI.sendProductImage({ 
                        chatId: phone.includes('@') ? phone : `${phone}@c.us`, 
                        imagePath: imgPath, 
                        caption: `Aqui está a foto do nosso ${caption}! 🎂` 
                    }); 
                    if(sendRes.success) { 
                        UI.toast('Foto enviada!', 'success'); 
                    } else { 
                        UI.alert('Erro', sendRes.error); 
                    } 
                } else { 
                    UI.alert('Erro', 'Nenhum chat selecionado.'); 
                }
            };
        });
    });
}
}