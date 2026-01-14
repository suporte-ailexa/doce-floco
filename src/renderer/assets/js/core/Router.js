import { $, hideAll, show } from '../utils/DOM.js';

export class Router {
    constructor(modules) {
        this.modules = modules; // Objeto com as instâncias dos módulos
        this.currentModule = null;
        this.setupListeners();
    }

    setupListeners() {
        const links = document.querySelectorAll('.nav-item');
        links.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.dataset.section;
                this.navigateTo(section);
            });
        });
    }

    navigateTo(sectionId) {
        // 1. UI: Esconde todas as seções
        hideAll('.content-section');
        
        // 2. UI: Atualiza Sidebar
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('bg-slate-800'));
        const activeNav = $(`nav${sectionId.charAt(0).toUpperCase() + sectionId.slice(1)}`);
        if(activeNav) activeNav.classList.add('bg-slate-800');

        // 3. UI: Atualiza Título
        const titles = { 
            'dashboard': 'Visão Geral', 
            'clientes': 'Gerenciar Clientes', 
            'pedidos': 'Kanban de Pedidos', 
            'encomendas': 'Gestão de Encomendas', 
            'whatsapp': 'Conexão WhatsApp', 
            'conversas': 'Atendimento', 
            'config': 'Configuração da Loja',
            'pos': 'PDV - Ponto de Venda',
            'relatorios': 'Relatórios e Análises'
        };
        const titleEl = $('currentSectionTitle');
        if(titleEl) titleEl.textContent = titles[sectionId] || 'App';

        // 4. Lógica: Desliga módulo anterior (Ex: para listeners do Firebase)
        if (this.currentModule && this.currentModule.destroy) {
            this.currentModule.destroy();
        }

        // 5. Lógica: Inicia novo módulo
        if (this.modules[sectionId]) {
            this.currentModule = this.modules[sectionId];
            if (this.currentModule.init) this.currentModule.init();
        }

        // 6. UI: Mostra a nova seção
        const sectionEl = $(`section${sectionId.charAt(0).toUpperCase() + sectionId.slice(1)}`);
        show(sectionEl);
    }
}