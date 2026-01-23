
import { FirebaseService } from '../services/FirebaseService.js';
import { Router } from './Router.js';
import { $, hide, show } from '../utils/DOM.js';

// Importe seus módulos aqui
import { KanbanModule } from '../modules/KanbanModule.js';
import { DashboardModule } from '../modules/DashboardModule.js';
import { ChatModule } from '../modules/ChatModule.js';
import { ConnectionModule } from '../modules/ConnectionModule.js';
import { ClientsModule } from '../modules/ClientsModule.js';
import { CalendarModule } from '../modules/CalendarModule.js';
import { SettingsModule } from '../modules/SettingsModule.js';
import { PosModule } from '../modules/PosModule.js';
import { ReportsModule } from '../modules/ReportsModule.js';
import { BroadcastModule } from '../modules/BroadcastModule.js';

class App {
    constructor() {
        this.firebase = FirebaseService.getInstance();
        
        // REGISTRE AQUI OS NOVOS MÓDULOS
        this.modules = {
            'dashboard': new DashboardModule(),
            'pedidos': new KanbanModule(),
            'conversas': new ChatModule(),
            'whatsapp': new ConnectionModule(), 
            'clientes': new ClientsModule(),
            'encomendas': new CalendarModule(),
            'config': new SettingsModule(),
            'pos': new PosModule(),
            'relatorios': new ReportsModule(),
            'broadcast': new BroadcastModule()
        };

        this.router = new Router(this.modules);
    }

    init() {
        console.log('[App] Inicializando Doce Floco Dashboard V5.0...');
        
        /** 
         * CRÍTICO: Tornamos a instância da App global.
         * Isso permite que o HTML gerado dinamicamente (como no PDV/POS)
         * consiga chamar funções como: window.app.modules.pos.updateQty()
         */
        window.app = this;

        // Listener de Autenticação
        this.firebase.auth.onAuthStateChanged(user => {
            if (user) {
                this._onLogin(user);
            } else {
                this._onLogout();
            }
        });

        // Inicializa listeners do formulário de login (submit, etc)
        this._setupAuthForm();
    }

    _onLogin(user) {
        if ($('userEmail')) $('userEmail').textContent = user.email;
        hide($('authSection'));
        show($('appSection'));
        
        // Inicia na Dashboard (ou Pedidos se Dashboard não estiver pronta)
        this.router.navigateTo('dashboard'); 
    }

    _onLogout() {
        if ($('userEmail')) $('userEmail').textContent = '';
        show($('authSection'));
        hide($('appSection'));
    }

    _setupAuthForm() {
        const form = $('loginForm');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                try {
                    const email = form.email.value;
                    const pass = form.password.value;
                    await this.firebase.auth.signInWithEmailAndPassword(email, pass);
                    form.reset();
                } catch (error) {
                    const msg = $('authMessage');
                    if(msg) {
                        msg.textContent = `Erro: ${error.message}`;
                        show(msg);
                    }
                }
            });
        }
        
        const logoutBtn = $('logoutButtonSidebar');
        if(logoutBtn) logoutBtn.addEventListener('click', () => this.firebase.auth.signOut());
    }
}

// Inicialização Global
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
});