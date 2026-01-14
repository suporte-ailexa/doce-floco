export class FirebaseService {
    constructor() {
        try {
            const config = window.electronAPI.getFirebaseConfig();
            this.app = firebase.initializeApp(config);
            this.auth = firebase.auth();
            this.db = firebase.firestore();
            console.log('[Firebase] Inicializado');
        } catch (e) {
            console.error('[Firebase] Erro Crítico:', e);
        }
    }

    // Retorna a instância compartilhada
    static getInstance() {
        if (!FirebaseService.instance) {
            FirebaseService.instance = new FirebaseService();
        }
        return FirebaseService.instance;
    }
}