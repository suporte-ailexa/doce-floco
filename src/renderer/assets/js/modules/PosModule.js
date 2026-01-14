import { $, $$, show, hide } from '../utils/DOM.js';
import { UI } from '../utils/UI.js';
import { ProductService } from '../services/ProductService.js';
import { ClientService } from '../services/ClientService.js';
import { FirebaseService } from '../services/FirebaseService.js';

export class PosModule {
    constructor() {
        this.productService = new ProductService();
        this.clientService = new ClientService();
        this.db = FirebaseService.getInstance().db;
        
        this.products = [];
        this.cart = [];
        this.paymentMethod = 'Pix';

        // Elementos
        this.grid = $('posProductGrid');
        this.searchInput = $('posSearchInput');
        this.cartList = $('posCartList');
        this.clientSelect = $('posClientSelect');
        this.totalEl = $('posTotal');
        this.subtotalEl = $('posSubtotal');
        this.btnFinalize = $('btnPosFinalize');
        this.btnCloseRegister = $('btnCloseRegister');
    }

    async init() {
        console.log('[POS] Inicializando Frente de Caixa...');
        this.cart = [];
        this.renderCart();
        
        await this.loadProducts();
        await this.loadClients();
        this.setupEvents();
    }

    destroy() {
        document.onkeydown = null;
    }

    async loadProducts() {
        const res = await this.productService.getActiveProducts();
        if (res.success) {
            this.products = res.products.filter(p => p.active !== false);
            this.renderProducts(this.products);
        }
    }

    async loadClients() {
        this.clientService.listenToClients((clients) => {
            this.clientSelect.innerHTML = '<option value="">Consumidor Final</option>';
            clients.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.name;
                this.clientSelect.appendChild(opt);
            });
        });
    }

    setupEvents() {
        this.searchInput.oninput = (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = this.products.filter(p => p.name.toLowerCase().includes(term));
            this.renderProducts(filtered);
        };

        $$('.pos-pay-btn').forEach(btn => {
            btn.onclick = () => {
                $$('.pos-pay-btn').forEach(b => b.classList.remove('bg-purple-600', 'border-purple-500'));
                btn.classList.add('bg-purple-600', 'border-purple-500');
                this.paymentMethod = btn.dataset.method;
            };
        });

        $('btnPosClear').onclick = () => {
            this.cart = [];
            this.renderCart();
        };

        this.btnFinalize.onclick = () => this.handleCheckout();

        if (this.btnCloseRegister) {
            this.btnCloseRegister.onclick = () => this.handleCloseRegister();
        }

        document.onkeydown = (e) => {
            if (e.key === 'F10') {
                e.preventDefault();
                this.btnFinalize.click();
            }
        };
    }

    // --- NOVA LÓGICA: PRÉ-VISUALIZAÇÃO NA TELA ---
    async handleCloseRegister() {
        UI.toast('Calculando fechamento...');

        try {
            const { DateTime } = luxon;
            const now = DateTime.now();
            const startOfDay = now.startOf('day').toJSDate();
            const endOfDay = now.endOf('day').toJSDate();

            // Busca pedidos válidos do dia
            const snapshot = await this.db.collection('orders')
                .where('createdAt', '>=', startOfDay)
                .where('createdAt', '<=', endOfDay)
                .get();

            const summary = {
                date: now.toFormat('dd/MM/yyyy HH:mm'),
                total: 0,
                count: 0,
                methods: { 'Pix': 0, 'Dinheiro': 0, 'Cartão': 0, 'Outros': 0 }
            };

            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.status === 'Cancelado') return; // Ignora cancelados

                const val = parseFloat(data.total || 0);
                summary.total += val;
                summary.count++;

                let method = data.paymentMethod || 'Outros';
                // Normaliza (ex: pix -> Pix)
                method = method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
                
                if (summary.methods[method] !== undefined) {
                    summary.methods[method] += val;
                } else {
                    summary.methods['Outros'] += val;
                }
            });

            // GERA HTML DO CUPOM PARA VISUALIZAÇÃO
            const cupomHtml = `
                <div class="bg-yellow-50 border border-yellow-200 p-4 font-mono text-sm text-gray-800 shadow-inner rounded mb-4">
                    <div class="text-center border-b border-dashed border-gray-400 pb-2 mb-2">
                        <h3 class="font-bold text-lg">FECHAMENTO DE CAIXA</h3>
                        <p class="text-xs">${summary.date}</p>
                    </div>
                    
                    <div class="flex justify-between mb-1"><span>Qtd Pedidos:</span> <span>${summary.count}</span></div>
                    <div class="border-b border-dashed border-gray-300 my-2"></div>

                    <div class="flex justify-between"><span>Pix:</span> <span>R$ ${summary.methods.Pix.toFixed(2)}</span></div>
                    <div class="flex justify-between"><span>Dinheiro:</span> <span>R$ ${summary.methods.Dinheiro.toFixed(2)}</span></div>
                    <div class="flex justify-between"><span>Cartão:</span> <span>R$ ${summary.methods.Cartão.toFixed(2)}</span></div>
                    ${summary.methods.Outros > 0 ? `<div class="flex justify-between text-gray-500"><span>Outros:</span> <span>R$ ${summary.methods.Outros.toFixed(2)}</span></div>` : ''}

                    <div class="border-t border-dashed border-gray-800 mt-3 pt-2">
                        <div class="flex justify-between font-bold text-lg">
                            <span>TOTAL:</span>
                            <span>R$ ${summary.total.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
                <p class="text-center text-xs text-gray-500 mb-4">Confira os valores antes de imprimir.</p>
            `;

            // ABRE MODAL DE DECISÃO
            UI._createModal(`
                <h3 class="text-lg font-bold text-gray-800 mb-2">Conferência de Caixa</h3>
                ${cupomHtml}
                <div class="flex flex-col gap-2">
                    <button id="btnPrintConfirm" class="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-lg shadow-lg flex justify-center items-center gap-2">
                        <i class="fas fa-print"></i> CONFIRMAR E IMPRIMIR
                    </button>
                    <button id="btnCancelClose" class="w-full bg-white border border-gray-300 text-gray-700 font-bold py-2 rounded-lg hover:bg-gray-50">
                        Apenas Fechar (Não Imprimir)
                    </button>
                </div>
            `, async (card, close) => {
                
                // Botão IMPRIMIR
                card.querySelector('#btnPrintConfirm').onclick = async () => {
                    close();
                    UI.toast('Enviando para impressora...');
                    const res = await window.electronAPI.printCloseRegister(summary);
                    if (!res.success) {
                        UI.alert('Erro Impressão', res.error || 'Verifique se a impressora está ligada e selecionada nas Configurações.');
                    } else {
                        UI.toast('Relatório impresso com sucesso!', 'success');
                    }
                };

                // Botão FECHAR
                card.querySelector('#btnCancelClose').onclick = () => close();
            });

        } catch (e) {
            console.error(e);
            UI.alert('Erro', 'Falha ao processar fechamento: ' + e.message);
        }
    }

    renderProducts(list) {
        this.grid.innerHTML = '';
        list.forEach(p => {
            const hasStock = p.quantity > 0;
            const card = document.createElement('div');
            card.className = `bg-white border border-gray-100 rounded-xl p-3 shadow-sm hover:shadow-md transition cursor-pointer flex flex-col gap-2 relative ${!hasStock ? 'opacity-60 grayscale' : ''}`;
            
            card.innerHTML = `
                <div class="h-24 w-full bg-gray-50 rounded-lg overflow-hidden relative">
                    ${p.imagePath ? `<img src="file://${p.imagePath.replace(/\\/g, '/')}" class="w-full h-full object-cover">` : `<i class="fas fa-image text-gray-200 text-3xl flex items-center justify-center h-full"></i>`}
                    ${!hasStock ? `<div class="absolute inset-0 bg-black/50 flex items-center justify-center"><span class="text-white text-[10px] font-bold uppercase">Esgotado</span></div>` : ''}
                </div>
                <div class="flex flex-col">
                    <span class="text-xs font-bold text-gray-700 truncate">${p.name}</span>
                    <span class="text-sm font-black text-purple-600">R$ ${parseFloat(p.price).toFixed(2)}</span>
                    <span class="text-[9px] text-gray-400">Estoque: ${p.quantity}</span>
                </div>
            `;

            if(hasStock) {
                card.onclick = () => this.addToCart(p);
            }
            this.grid.appendChild(card);
        });
    }

    addToCart(product) {
        const existing = this.cart.find(item => item.id === product.id);
        if (existing) {
            if (existing.quantity < product.quantity) {
                existing.quantity++;
            } else {
                UI.toast('Limite de estoque atingido', 'error');
            }
        } else {
            this.cart.push({ ...product, quantity: 1 });
        }
        this.renderCart();
    }

    renderCart() {
        this.cartList.innerHTML = '';
        if (this.cart.length === 0) {
            show($('posEmptyCart'));
            this.totalEl.innerText = 'R$ 0,00';
            this.subtotalEl.innerText = 'R$ 0,00';
            return;
        }
        hide($('posEmptyCart'));

        let total = 0;
        this.cart.forEach((item, index) => {
            const sub = item.price * item.quantity;
            total += sub;

            const div = document.createElement('div');
            div.className = 'bg-slate-800 rounded-lg p-3 flex justify-between items-center animate-fade-in';
            div.innerHTML = `
                <div class="flex flex-col">
                    <span class="text-xs font-bold">${item.name}</span>
                    <div class="flex items-center gap-2 mt-1">
                        <button class="w-5 h-5 bg-slate-700 rounded text-xs hover:bg-slate-600" onclick="event.stopPropagation(); window.app.modules.pos.updateQty(${index}, -1)">-</button>
                        <span class="text-xs font-mono w-4 text-center">${item.quantity}</span>
                        <button class="w-5 h-5 bg-slate-700 rounded text-xs hover:bg-slate-600" onclick="event.stopPropagation(); window.app.modules.pos.updateQty(${index}, 1)">+</button>
                    </div>
                </div>
                <div class="flex flex-col items-end">
                    <span class="text-xs font-bold text-purple-400">R$ ${sub.toFixed(2)}</span>
                    <button class="text-red-400 text-[10px] mt-1 hover:underline" onclick="window.app.modules.pos.removeFromCart(${index})">Remover</button>
                </div>
            `;
            this.cartList.appendChild(div);
        });

        this.totalEl.innerText = `R$ ${total.toFixed(2)}`;
        this.subtotalEl.innerText = `R$ ${total.toFixed(2)}`;
        
        this.cartList.scrollTop = this.cartList.scrollHeight;
    }

    updateQty(index, delta) {
        const item = this.cart[index];
        const product = this.products.find(p => p.id === item.id);
        
        if (delta > 0 && item.quantity >= product.quantity) {
            UI.toast('Estoque insuficiente', 'error');
            return;
        }

        item.quantity += delta;
        if (item.quantity <= 0) {
            this.cart.splice(index, 1);
        }
        this.renderCart();
    }

    removeFromCart(index) {
        this.cart.splice(index, 1);
        this.renderCart();
    }

    async handleCheckout() {
        if (this.cart.length === 0) return;

        const totalValue = parseFloat(this.totalEl.innerText.replace('R$ ', ''));
        const clientName = this.clientSelect.options[this.clientSelect.selectedIndex].text;
        const clientId = this.clientSelect.value || "CONSUMIDOR_FINAL";

        const orderData = {
            clientId,
            clientName: clientId === "CONSUMIDOR_FINAL" ? "Consumidor Final" : clientName,
            items: this.cart.map(i => `${i.quantity}x ${i.name}`).join(', '),
            total: totalValue,
            paymentMethod: this.paymentMethod,
            deliveryMethod: 'Balcão',
            status: 'Concluído',
            notes: 'Venda Rápida POS',
            cart: this.cart.map(i => ({ id: i.id, qty: i.quantity })) 
        };

        this.btnFinalize.disabled = true;
        this.btnFinalize.innerText = "PROCESSANDO...";

        try {
            const res = await window.electronAPI.createManualOrder(orderData);
            if (res.success) {
                UI.toast('Venda finalizada com sucesso!', 'success');
                
                const print = await UI.confirm('Sucesso!', 'Deseja imprimir o cupom?', 'Imprimir', 'blue');
                if (print) {
                    await window.electronAPI.printOrder({ ...orderData, id: res.orderId });
                }

                this.cart = [];
                this.renderCart();
                await this.loadProducts(); 
            } else {
                UI.alert('Erro na Venda', res.error);
            }
        } catch (err) {
            UI.alert('Erro', err.message);
        } finally {
            this.btnFinalize.disabled = false;
            this.btnFinalize.innerText = "FINALIZAR VENDA (F10)";
        }
    }
}