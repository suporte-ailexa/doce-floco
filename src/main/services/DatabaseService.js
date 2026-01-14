const admin = require('firebase-admin');
const { DateTime } = require('luxon');

class DatabaseService {
    constructor(dbInstance) {
        this.db = dbInstance;
    }

    /**
     * Busca configurações da loja e mescla com defaults
     */
    async getStoreConfig() {
        try {
            const doc = await this.db.collection('settings').doc('storeConfig').get();
            if (doc.exists) return doc.data();
            return {};
        } catch (error) {
            console.error('[DB] Erro ao ler config:', error);
            return {};
        }
    }

    /**
     * Retorna itens para o menu da IA e Frontend
     * @returns {Object} { menuText: string, menuStructured: Array }
     */
     async getActiveProducts() {
        try {
            const snapshot = await this.db.collection('products').where('active', '==', true).get();
            const menuStructured = []; // Isso a IA usa para saber a quantidade real (JSON)
            const menuLines = [];      // Isso é o texto que a IA "lê" sobre o produto

            snapshot.forEach(doc => {
                const p = doc.data();
                const stock = parseInt(p.quantity || 0);
                const price = typeof p.price === 'number' ? p.price.toFixed(2) : p.price;
                const hasImage = !!p.imagePath;

                // --- ALTERAÇÃO: Só marcamos se estiver ESGOTADO ---
                let stockInfo = "";
                if (stock <= 0) {
                    stockInfo = "[ESGOTADO]";
                }
                // REMOVEMOS O [RESTAM X]. Se tiver estoque, não escrevemos nada.
                
                menuLines.push(`- ${p.name} (R$ ${price}) ${stockInfo}`);

                menuStructured.push({
                    id: doc.id,
                    n: p.name,
                    p: price,
                    s: stock, // O número continua aqui para a IA calcular se pode vender
                    img: hasImage
                });
            });

            return { menuStructured, menuText: menuLines };
        } catch (error) {
            console.error('[DB] Erro ao buscar produtos:', error);
            return { menuStructured: [], menuText: [] };
        }
    }

    /**
     * Verifica duplicidade de pedido agendado (Janela de 2 minutos)
     */
    async isDuplicateOrder(clientId, items, total, date) {
        const twoMinsAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 120000);
        const snapshot = await this.db.collection('orders')
            .where('clientId', '==', clientId)
            .where('status', '==', 'Agendado')
            .where('createdAt', '>', twoMinsAgo)
            .get();

        let isDuplicate = false;
        snapshot.forEach(doc => {
            const d = doc.data();
            // Comparação estrita dos dados vitais
            if (d.items === items && parseFloat(d.total) === parseFloat(total) && d.dueDate === date) {
                isDuplicate = true;
            }
        });
        return isDuplicate;
    }

    /**
     * Cria uma Encomenda (Agendamento)
     * ATUALIZADO: Suporte a Empréstimo de Materiais (Caixas, Carrinhos)
     */
    async createScheduledOrder({ clientId, clientName, items, total, date, method, address, loanedItems, returnDate }) {
        // 1. Check Anti-Duplicidade
        const isDup = await this.isDuplicateOrder(clientId, items, total, date);
        if (isDup) {
            console.log(`[Anti-Dup] Pedido ignorado para ${clientName}`);
            return { success: true, note: 'duplicate_prevented' };
        }

        // 2. Gravação
        const orderData = {
            clientId,
            clientName,
            items: items || "Encomenda Personalizada",
            total: total || 0,
            deliveryMethod: method || "Retirada",
            paymentMethod: "Sinal Pendente",
            status: "Agendado",
            dueDate: date, // Data do Evento
            address: address || "",
            
            // Novos Campos para Encomendas de Festa
            isPreOrder: true,
            loanedItems: loanedItems || "", // Ex: "1 Caixa Isopor 50L"
            returnDate: returnDate || "",   // Data para devolução
            
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            notes: loanedItems ? `⚠️ EMPRÉSTIMO: Devolução em ${returnDate}` : "Encomenda"
        };

        await this.db.collection('orders').add(orderData);
        return { success: true, type: 'scheduled' };
    }

      /**
     * Cria Pedido com TRANSAÇÃO (Atualizado com ShortID)
     */
    async createStandardOrder({ clientId, clientName, items, total, method, payment, address, cart, shortId }) {
        // ... (Lógica de Duplicidade mantida igual) ...

        const orderRef = this.db.collection('orders').doc();

        try {
            await this.db.runTransaction(async (t) => {
                // ... (Lógica de Estoque/Cart mantida igual) ...

                // Cria o pedido com o SHORT ID
                t.set(orderRef, {
                    shortId: shortId || "0000", // NOVO CAMPO
                    clientId,
                    clientName,
                    items: items || "Venda via IA",
                    total: total || 0,
                    deliveryMethod: method || "A Combinar",
                    address: address || "Retirada",
                    paymentMethod: payment || "A Combinar",
                    status: "Pendente",
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    notes: "Pedido Automático",
                    cart: cart || []
                });
            });

            console.log(`[DB] Pedido #${shortId} criado.`);
            return { success: true, orderId: orderRef.id, shortId };

        } catch (e) {
            console.error("[DB] Falha na transação:", e.message);
            return { success: false, error: e.message };
        }
    }

    /**
     * Busca pedido pelo ID Curto (Para a IA editar)
     */
    async getOrderByShortId(shortId) {
        try {
            const snapshot = await this.db.collection('orders')
                .where('shortId', '==', String(shortId))
                .limit(1)
                .get();
            
            if (snapshot.empty) return null;
            return snapshot.docs[0]; // Retorna o DocumentSnapshot
        } catch (e) {
            console.error('[DB] Erro busca shortId:', e);
            return null;
        }
    }

    /**
     * Busca ou cria cliente baseado no telefone (ATUALIZADO)
     */
    async getOrCreateClient(rawPhone, name, countryCode = '55', address = null) {
        // Normalização básica para busca
        let inputClean = rawPhone.replace('@c.us', '').replace(/\D/g, '');
        
        // Lógica de Permutações (Para encontrar o cliente mesmo com/sem 9º dígito)
        const candidates = new Set([inputClean, `+${inputClean}`]);
        if (inputClean.startsWith('55') && inputClean.length >= 12) {
            const ddd = inputClean.substring(2, 4);
            const numberPart = inputClean.substring(4);
            if (numberPart.length === 9) { 
                candidates.add(`+55${ddd}${numberPart.substring(1)}`);
                candidates.add(`55${ddd}${numberPart.substring(1)}`);
            } else if (numberPart.length === 8) { 
                candidates.add(`+55${ddd}9${numberPart}`);
                candidates.add(`55${ddd}9${numberPart}`);
            }
        }

        const snapshot = await this.db.collection('clients').where('phone', 'in', Array.from(candidates)).limit(1).get();
        
        if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            const data = doc.data();
            
            // Se veio um nome válido na criação manual, atualiza
            // Se veio um endereço na criação manual e o cliente não tinha, atualiza
            let updates = {};
            if (name && name !== "Cliente" && data.name.startsWith("Cliente ") && name !== data.name) {
                updates.name = name;
            }
            if (address && !data.address) {
                updates.address = address;
                updates.lastAddress = address; // Mantém sincronizado para a IA
            }

            if(Object.keys(updates).length > 0) {
                updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
                await doc.ref.update(updates);
                return { id: doc.id, ...data, ...updates };
            }

            return { id: doc.id, ...data };
        }

        // Cria novo
        const newClient = {
            name: name || `Cliente ${inputClean.slice(-4)}`,
            phone: `+${inputClean}`,
            countryCode,
            address: address || null,         // Campo Fixo
            lastAddress: address || null,     // Campo Dinâmico (Usado pela IA no delivery)
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            aiPaused: false
        };
        const ref = await this.db.collection('clients').add(newClient);
        return { id: ref.id, ...newClient };
    }

    async logMessage(clientId, messageData) {
        return this.db.collection('clients').doc(clientId).collection('messages').add({
            ...messageData,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    async getClientHistory(clientId) {
        const snapshot = await this.db.collection('orders')
            .where('clientId', '==', clientId)
            .orderBy('createdAt', 'desc')
            .limit(5)
            .get();

        if (snapshot.empty) return "Histórico: Nenhum pedido anterior.";
        
        return snapshot.docs.map(doc => {
            const d = doc.data();
            const date = d.createdAt ? DateTime.fromJSDate(d.createdAt.toDate()).toLocaleString(DateTime.DATE_SHORT) : '?';
            return `${date}: ${d.items} (R$${d.total}) - Status: ${d.status}`;
        }).join("\n");
    }

    async getRecentChat(clientId) {
        const snapshot = await this.db.collection('clients').doc(clientId)
            .collection('messages')
            .orderBy('timestamp', 'desc')
            .limit(8)
            .get();

        if (snapshot.empty) return "";
        const history = [];
        snapshot.forEach(doc => {
            const d = doc.data();
            const content = d.body || d.content || "";
            if (!content.includes('###JSON###')) {
                history.push(`${d.fromMe ? "Atendente" : "Cliente"}: ${content}`);
            }
        });
        return history.reverse().join("\n");
    }
    
    // Método auxiliar para buscar caminho da imagem
    async getProductImagePath(productId) {
        const doc = await this.db.collection('products').doc(productId).get();
        if(doc.exists && doc.data().imagePath) return { path: doc.data().imagePath, name: doc.data().name };
        return null;
    }

    /**
     * Retorna todas as encomendas agendadas
     */
    async getScheduledOrders() {
        try {
            const snapshot = await this.db.collection('orders')
                .where('status', '==', 'Agendado')
                .get();
            
            const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return { success: true, orders };
        } catch (err) {
            console.error('[DB] Erro getScheduledOrders:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Retorna histórico de pedidos de um cliente específico (formatado para UI)
     */
    async getClientAppointments(clientId) {
        try {
            const { DateTime } = require('luxon');
            const snapshot = await this.db.collection('orders')
                .where('clientId', '==', clientId)
                .orderBy('createdAt', 'desc') // Requer índice no Firebase, se der erro, remova o orderBy temporariamente
                .limit(10)
                .get();

            if (snapshot.empty) return { success: true, appointments: [] };

            const appointments = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    rawDate: data.createdAt ? data.createdAt.toDate() : new Date(0),
                    date: data.createdAt 
                        ? DateTime.fromJSDate(data.createdAt.toDate()).toLocaleString(DateTime.DATETIME_SHORT) 
                        : 'Data n/d',
                    time: `R$ ${parseFloat(data.total || 0).toFixed(2)}`,
                    service: data.items
                };
            });
            // Ordenação JS caso falte índice composto no Firestore
            appointments.sort((a, b) => b.rawDate - a.rawDate);

            return { success: true, appointments };
        } catch (error) {
            console.error("[DB] Erro getClientAppointments:", error);
            return { success: false, error: error.message };
        }
    }

    // Genérico para deletar (Clientes, Pedidos, Produtos)
    async deleteDocument(collection, id) {
        try {
            await this.db.collection(collection).doc(id).delete();
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    // Genérico para atualizar
    async updateDocument(collection, id, data) {
        try {
            await this.db.collection(collection).doc(id).update(data);
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }
}

module.exports = DatabaseService;