import { $, $$, show, hide } from '../utils/DOM.js';
import { UI } from '../utils/UI.js';
import { SettingsService } from '../services/SettingsService.js';

export class SettingsModule {
    constructor() {
        this.service = new SettingsService();
        
        // Elementos UI Principais
        this.form = $('configForm');
        this.btnSave = $('btnSaveConfig');
        this.btnNext = $('next-step-btn');
        this.btnPrev = $('prev-step-btn');
        
        // ESTRUTURA DE DADOS
        this.chips = {
            acaiSizes: new Set(),
            freeAddons: new Set(),
            paidAddons: new Set()
        };

        // Controle do Stepper
        this.currentStep = 1;
        this.totalSteps = 4;

        // Bindings
        this.handleSave = this.handleSave.bind(this);
        this.handleAddProduct = this.handleAddProduct.bind(this);
        this.handleProductAction = this.handleProductAction.bind(this);
    }

    init() {
        console.log('[Settings] Iniciando V6.2 (Doce Floco Manager)...');
        
        this.loadConfig();
        this.loadProducts();
        this.setupStepper();
        this.setupChips();

        if (this.form) this.form.addEventListener('submit', this.handleSave);
        
        const btnAdd = $('btnAddProduct');
        if (btnAdd) btnAdd.onclick = this.handleAddProduct;
        
        const prodList = $('productsListConfig');
        if (prodList) prodList.onclick = this.handleProductAction;
        
        const btnRefresh = $('btnRefreshPrinters');
        if (btnRefresh) btnRefresh.onclick = () => this.loadPrinters($('cfgPrinterSelect').value);
    }

    // =========================================================================
    // 1. STEPPER NAVIGATION (CORRIGIDO VISUAL)
    // =========================================================================
    setupStepper() {
        const updateUI = () => {
            // CORREÇÃO: Mapa de larguras fixas para garantir que a linha chegue na bolinha
            // Como a bolinha tem fundo branco e z-index maior, podemos "passar" um pouco.
            const widthMap = {
                1: '0%',
                2: '35%', // Era 33% (aumentado para esconder a ponta atrás da bolinha)
                3: '68%', // Era 66%
                4: '100%'
            };

            const progressBar = $('stepperProgress');
            if(progressBar) progressBar.style.width = widthMap[this.currentStep];

            // Atualiza visibilidade dos painéis e indicadores
            for (let i = 1; i <= this.totalSteps; i++) {
                const panel = $(`step-${i}`);
                if(panel) i === this.currentStep ? show(panel) : hide(panel);

                // Atualiza visual das bolinhas (steps)
                // Usamos querySelector para achar o elemento específico pelo data-step
                const indicatorDiv = document.querySelector(`.step-indicator[data-step="${i}"] div`);
                const indicatorText = document.querySelector(`.step-indicator[data-step="${i}"] span`);
                
                if (indicatorDiv && indicatorText) {
                    if (i <= this.currentStep) {
                        // Ativo ou Passado (Roxo)
                        indicatorDiv.className = 'w-6 h-6 rounded-full bg-purple-600 border-2 border-purple-600 mx-auto transition-colors duration-300 shadow-md ring-2 ring-purple-100';
                        indicatorText.className = 'text-[10px] font-bold text-purple-600 mt-2 block uppercase tracking-wide';
                    } else {
                        // Futuro (Cinza)
                        indicatorDiv.className = 'w-6 h-6 rounded-full bg-white border-2 border-gray-200 mx-auto transition-colors duration-300';
                        indicatorText.className = 'text-[10px] font-bold text-gray-400 mt-2 block uppercase tracking-wide';
                    }
                }
            }

            // Controle dos botões Voltar/Próximo/Salvar
            if (this.currentStep === 1) hide(this.btnPrev); else show(this.btnPrev);
            
            if (this.currentStep === this.totalSteps) { 
                hide(this.btnNext); 
                show(this.btnSave); 
            } else { 
                show(this.btnNext); 
                hide(this.btnSave); 
            }
        };

        if(this.btnNext) this.btnNext.onclick = () => {
            if (this.validateStep(this.currentStep)) {
                if (this.currentStep < this.totalSteps) {
                    this.currentStep++;
                    updateUI();
                }
            }
        };

        if(this.btnPrev) this.btnPrev.onclick = () => {
            if (this.currentStep > 1) {
                this.currentStep--;
                updateUI();
            }
        };

        updateUI();
    }

    validateStep(step) {
        if (step === 1) {
            const name = $('cfgStoreName').value.trim();
            if (!name) {
                UI.toast('Por favor, informe o nome da loja.', 'error');
                $('cfgStoreName').focus();
                return false;
            }
        }
        return true;
    }

    // =========================================================================
    // 2. CHIPS LOGIC (Etiquetas)
    // =========================================================================
    setupChips() {
        const setupInput = (inputId, containerId, setKey) => {
            const input = $(inputId);
            const container = $(containerId);
            if(!input || !container) return;

            input.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const val = input.value.trim();
                    if (val && !this.chips[setKey].has(val)) {
                        this.chips[setKey].add(val);
                        input.value = '';
                        this.renderChips(container, setKey);
                    }
                }
            };
        };

        setupInput('inpAcaiSize', 'chipsAcaiSizeContainer', 'acaiSizes');
        setupInput('inpFreeAddon', 'chipsFreeAddonContainer', 'freeAddons');
        setupInput('inpPaidAddon', 'chipsPaidAddonContainer', 'paidAddons');
    }

    renderChips(container, setKey) {
        if(!container) return;
        container.innerHTML = '';
        
        this.chips[setKey].forEach(tag => {
            const span = document.createElement('span');
            const hasPrice = tag.includes('=');
            
            span.className = `text-xs px-2 py-1 rounded-full flex items-center gap-1 border transition shadow-sm ${
                hasPrice ? 'bg-cyan-50 text-cyan-700 border-cyan-200 font-bold' : 'bg-purple-50 text-purple-700 border-purple-200 font-medium'
            }`;
            
            let displayText = tag;
            if (hasPrice) {
                const parts = tag.split('=');
                if(parts.length === 2) {
                    displayText = `${parts[0]} <span class="text-[9px] opacity-70">R$${parts[1]}</span>`;
                }
            }

            span.innerHTML = `${displayText} <i class="fas fa-times cursor-pointer hover:text-red-500 ml-1 opacity-60 hover:opacity-100"></i>`;
            
            span.querySelector('i').onclick = () => {
                this.chips[setKey].delete(tag);
                this.renderChips(container, setKey);
            };
            container.appendChild(span);
        });
    }

    // =========================================================================
    // 3. LOAD DATA
    // =========================================================================
    async loadConfig() {
        try {
            const d = await this.service.getStoreConfig();
            
            // Step 1: Identidade
            $('cfgStoreName').value = d.storeName || '';
            $('cfgPixKey').value = d.pixKey || '';
            $('cfgAddress').value = d.address || '';
            $('cfgWelcomeMsg').value = d.welcomeMsg || '';
            if($('cfgUseEmojis')) $('cfgUseEmojis').checked = d.useEmojis || false;

            // Step 2: Regras & Açaí
            $('cfgDeliveryFee').value = d.deliveryFee || '';
            $('cfgMinDeliveryQty').value = d.minDeliveryQty || 0;
            
            if (d.imgAcaiPath) show($('statusImgAcai'));

            // Preenchimento dos Chips
            const loadSet = (dbString, setKey, containerId) => {
                this.chips[setKey].clear();
                if (dbString) {
                    dbString.split(',').forEach(t => {
                        if(t.trim()) this.chips[setKey].add(t.trim());
                    });
                }
                this.renderChips($(containerId), setKey);
            };

            loadSet(d.acaiSizes, 'acaiSizes', 'chipsAcaiSizeContainer');
            loadSet(d.freeAddons, 'freeAddons', 'chipsFreeAddonContainer');
            loadSet(d.paidAddons, 'paidAddons', 'chipsPaidAddonContainer');

            // Step 4: Sistema
            $('cfgApiKey').value = d.geminiApiKey || '';
            $('cfgAutoPrint').checked = d.autoPrint || false;
            
            await this.loadPrinters(d.printerName);

        } catch (e) {
            console.error('[Settings] Erro loadConfig:', e);
            UI.toast('Erro ao carregar configurações.', 'error');
        }
    }

    async loadPrinters(selected) {
        const el = $('cfgPrinterSelect');
        if(!el) return;
        el.innerHTML = '<option>Carregando...</option>';
        const res = await this.service.getPrinters();
        el.innerHTML = '<option value="">Selecione...</option>';
        if (res.success && res.printers) {
            res.printers.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.name;
                opt.textContent = p.name + (p.isDefault ? ' (Padrão)' : '');
                if (p.name === selected) opt.selected = true;
                el.appendChild(opt);
            });
        }
    }

    // =========================================================================
    // 4. PRODUTOS / ESTOQUE
    // =========================================================================
    async loadProducts() {
        const container = $('productsListConfig');
        if(!container) return;
        container.innerHTML = '<div class="col-span-3 text-center text-gray-400 py-10"><i class="fas fa-spinner fa-spin mr-2"></i>Carregando picolés...</div>';
        
        const res = await this.service.getProducts();
        container.innerHTML = '';

        if (res.success && res.products.length > 0) {
            res.products.forEach(p => {
                const isActive = p.active !== false;
                const card = document.createElement('div');
                card.className = `relative group bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md transition flex flex-col justify-between ${!isActive ? 'opacity-50 grayscale' : ''}`;
                
                const imgDisplay = p.imagePath 
                    ? `<img src="file://${p.imagePath.replace(/\\/g, '/')}" class="w-full h-full object-cover group-hover:scale-110 transition duration-500">`
                    : `<i class="fas fa-ice-cream text-gray-300 text-lg"></i>`;

                card.innerHTML = `
                    <div class="flex justify-between items-start mb-2">
                        <div class="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-100">
                             ${imgDisplay}
                        </div>
                        <input type="checkbox" class="toggle-active accent-purple-500 cursor-pointer w-4 h-4" data-id="${p.id}" ${isActive ? 'checked' : ''} title="Ativar/Desativar">
                    </div>
                    <div class="mb-2">
                        <p class="text-xs font-bold text-gray-700 truncate" title="${p.name}">${p.name}</p>
                        <p class="text-[10px] font-bold text-purple-600 bg-purple-50 inline-block px-1 rounded">R$ ${parseFloat(p.price).toFixed(2)}</p>
                    </div>
                    <div class="flex items-center gap-1 border-t border-gray-100 pt-2 mt-auto">
                        <div class="relative flex-1">
                            <input type="number" class="stock-input w-full bg-gray-50 border rounded text-center text-xs py-1 outline-none focus:ring-1 ring-purple-300 font-bold text-gray-600" 
                                value="${p.quantity || 0}" data-id="${p.id}" placeholder="Qtd">
                        </div>
                        <button class="text-gray-400 hover:text-blue-500 p-1.5 rounded hover:bg-blue-50 transition btn-img" data-id="${p.id}" title="Alterar Foto"><i class="fas fa-camera"></i></button>
                        <button class="text-gray-400 hover:text-red-500 p-1.5 rounded hover:bg-red-50 transition btn-del" data-id="${p.id}" title="Excluir"><i class="fas fa-trash"></i></button>
                    </div>
                `;
                container.appendChild(card);
            });
        } else {
            container.innerHTML = '<div class="col-span-3 text-center text-gray-400 py-4 text-xs">Nenhum produto cadastrado.</div>';
        }
    }

    async handleAddProduct() {
        const nameInput = $('prodName');
        const priceInput = $('prodPrice');
        const name = nameInput.value.trim();
        const price = priceInput.value;
        if(name && price) {
            await this.service.addProduct({ name, price, quantity: 0, active: true });
            nameInput.value = '';
            priceInput.value = '';
            nameInput.focus();
            UI.toast('Produto adicionado!');
            this.loadProducts();
        } else {
            UI.toast('Preencha nome e preço.', 'error');
        }
    }

    async handleProductAction(e) {
        const t = e.target.closest('button') || e.target; 
        
        // Excluir
        if (t.classList.contains('btn-del') || (t.parentElement && t.parentElement.classList.contains('btn-del'))) {
            const btn = t.classList.contains('btn-del') ? t : t.parentElement;
            if(await UI.confirm('Excluir Produto', 'Essa ação não pode ser desfeita.', 'Excluir', 'red')) {
                await this.service.deleteProduct(btn.dataset.id);
                this.loadProducts();
            }
            return;
        }
        
        // Ativar/Desativar
        if (t.classList.contains('toggle-active')) {
            await this.service.toggleProductStatus(t.dataset.id, t.checked);
            this.loadProducts(); 
            return;
        }
        
        // Alterar Imagem
        if (t.classList.contains('btn-img') || (t.parentElement && t.parentElement.classList.contains('btn-img'))) {
            const btn = t.classList.contains('btn-img') ? t : t.parentElement;
            const res = await this.service.selectProductImage(btn.dataset.id);
            if(res.success) {
                UI.toast('Imagem atualizada!');
                this.loadProducts();
            }
            return;
        }
        
        // Atualizar Estoque (Input)
        if (t.classList.contains('stock-input')) {
            t.onblur = async () => {
                const newVal = parseInt(t.value) || 0;
                await this.service.updateProductStock(t.dataset.id, newVal);
            };
            t.onkeydown = (k) => {
                if(k.key === 'Enter') t.blur();
            };
        }
    }

    // =========================================================================
    // 5. SAVE CONFIGURATION
    // =========================================================================
    async handleSave(e) {
        e.preventDefault();
        
        const originalBtnText = this.btnSave.innerHTML;
        this.btnSave.disabled = true;
        this.btnSave.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Salvando...';

        try {
            let newAcaiPath = null;
            const inpAcai = $('cfgImgAcai');
            if (inpAcai && inpAcai.files.length > 0) {
                const file = inpAcai.files[0];
                const reader = new FileReader();
                await new Promise(r => {
                    reader.onload = async () => {
                        const res = await window.electronAPI.uploadConfigImage({ category: 'acai', buffer: reader.result });
                        if(res.success) newAcaiPath = res.path;
                        r();
                    };
                    reader.readAsArrayBuffer(file);
                });
            }

            const data = {
                storeName: $('cfgStoreName').value,
                pixKey: $('cfgPixKey').value,
                address: $('cfgAddress').value,
                welcomeMsg: $('cfgWelcomeMsg').value,
                useEmojis: $('cfgUseEmojis').checked,
                deliveryFee: parseFloat($('cfgDeliveryFee').value) || 0,
                minDeliveryQty: parseInt($('cfgMinDeliveryQty').value) || 0,
                acaiSizes: Array.from(this.chips.acaiSizes).join(', '),
                freeAddons: Array.from(this.chips.freeAddons).join(', '),
                paidAddons: Array.from(this.chips.paidAddons).join(', '),
                geminiApiKey: $('cfgApiKey').value,
                printerName: $('cfgPrinterSelect').value,
                autoPrint: $('cfgAutoPrint').checked
            };

            if (newAcaiPath) data.imgAcaiPath = newAcaiPath;

            await this.service.saveStoreConfig(data);
            UI.toast('Configurações salvas e IA atualizada!');

            if (newAcaiPath) show($('statusImgAcai'));

        } catch (err) {
            console.error(err);
            UI.alert('Erro ao Salvar', err.message);
        } finally {
            this.btnSave.disabled = false;
            this.btnSave.innerHTML = originalBtnText;
        }
    }
}