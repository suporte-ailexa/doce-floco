// ================================================================================
// ARQUIVO: /src/main/controllers/AppController.js
// ================================================================================

const { ipcMain, BrowserWindow, app } = require('electron');
const path = require('path');
const fs = require('fs');

const DatabaseService = require('../services/DatabaseService');
const AIService = require('../services/AIService');
const WhatsappService = require('../services/WhatsappService');

const AI_REPLY_DELAY = 15000; 

class AppController {
    constructor(dbInstance, mainWindow) {
        this.mainWindow = mainWindow;
        this.db = new DatabaseService(dbInstance);
        this.ai = new AIService();
        
        const isDev = !app.isPackaged;
        const resourcePath = isDev ? path.join(__dirname, '../../../') : process.resourcesPath;
        const sessionPath = path.join(resourcePath, 'whatsapp_session');
        const chromePath = isDev ? undefined : path.join(resourcePath, 'chrome-bin', 'chrome-win64', 'chrome.exe');
        
        this.wa = new WhatsappService(sessionPath, chromePath, isDev);
        this.messageBuffers = new Map();
        this.workerWindow = null; 
    }

    async initialize() {
        console.log('[Controller] Inicializando sistema Doce Floco (V6.5 - Correção Estoque/Crash)...');
        const storeConfig = await this.db.getStoreConfig();
        if (storeConfig.geminiApiKey) {
            this.ai.init(storeConfig.geminiApiKey);
            this.ai.updateConfig(storeConfig);
        }
        this._setupWhatsappListeners();
        this._setupIpcHandlers();
        console.log('[Controller] Iniciando conexão automática do WhatsApp...');
        this.wa.initialize(); 
        console.log('[Controller] Sistema pronto.');
    }

    _setupWhatsappListeners() {
        this.wa.on('qr', (qr) => this.mainWindow.webContents.send('whatsapp-qr', qr));
        this.wa.on('status', (status) => this.mainWindow.webContents.send('whatsapp-status', status));
        this.wa.on('message', async (message) => { await this._handleIncomingMessage(message); });
    }

    async _handleIncomingMessage(message) {
        try {
            let rawPhone = message.from.replace('@c.us', '');
            let contactInfo = await message.getContact().catch(() => ({}));
            let senderName = contactInfo.pushname || contactInfo.name || `Cliente ${rawPhone.slice(-4)}`;
            
            const client = await this.db.getOrCreateClient(rawPhone, senderName);
            
            let body = message.body;
            let isAudio = false;

            if (message.type === 'ptt' || message.type === 'audio') {
                isAudio = true;
                const media = await message.downloadMedia();
                const transcript = await this.ai.transcribeAudio(media.data, media.mimetype);
                body = transcript ? `[ÁUDIO]: ${transcript}` : "[ÁUDIO INAUDÍVEL]";
            } else if (message.type !== 'chat') {
                return; 
            }

            let quotedContext = null;
            if (message.hasQuotedMsg) {
                try {
                    const quoted = await message.getQuotedMessage();
                    const content = quoted.caption || quoted.body || "[Mídia]";
                    quotedContext = `[CLIENTE RESPONDEU À MENSAGEM: "${content}"]`;
                } catch (e) {
                    console.error("Erro ao ler quoted message:", e);
                }
            }

            await this.db.logMessage(client.id, {
                chatId: message.from,
                fromMe: false,
                content: body + (quotedContext ? `\n${quotedContext}` : ""), 
                body: body, 
                originalType: message.type,
                isAudio,
                read: false
            });

            if (client.aiPaused) return;
            this._queueAutoReply(message.from, client, body, quotedContext);

        } catch (error) {
            console.error('[Controller] Erro no handler de mensagem:', error);
        }
    }

    _queueAutoReply(chatId, client, text, quotedContext = null) {
        if (this.messageBuffers.has(chatId)) {
            const existing = this.messageBuffers.get(chatId);
            clearTimeout(existing.timer);
            existing.text += " " + text;
            if (quotedContext) existing.quotedContext = quotedContext;
            existing.timer = setTimeout(() => {
                this._processAiReply(chatId, client, existing.text, existing.quotedContext);
                this.messageBuffers.delete(chatId);
            }, AI_REPLY_DELAY);
            this.messageBuffers.set(chatId, existing);
        } else {
            const timer = setTimeout(() => {
                this._processAiReply(chatId, client, text, quotedContext);
                this.messageBuffers.delete(chatId);
            }, AI_REPLY_DELAY);
            this.messageBuffers.set(chatId, { timer, text, quotedContext });
        }
    }

    /**
     * MELHORADO: Parser de Produtos para Baixa de Estoque
     * Agora aceita "Picolé Coco" sem número (assume 1) e é case-insensitive
     */
    _matchProductsFromText(textItems, allProducts) {
        if (!textItems || typeof textItems !== 'string') return [];
        const cart = [];
        
        // Separa linhas ou vírgulas
        const lines = textItems.split(/[\n,]/);
        
        lines.forEach(line => {
            let clean = line.trim();
            if (!clean) return;

            // Remove hífens no início (ex: "- Picolé")
            clean = clean.replace(/^-\s*/, '');

            // Regex tenta achar número no começo. 
            // Ex: "2x Coca" -> qty=2, name="Coca"
            // Ex: "Coca" -> match null -> qty=1, name="Coca"
            const match = clean.match(/^(\d+)\s*[xX]?\s*(.+)$/);
            
            let qty = 1;
            let searchName = clean.toLowerCase();

            if (match) {
                qty = parseInt(match[1]);
                searchName = match[2].trim().toLowerCase();
            }

            // Busca produto na lista (Case Insensitive)
            // Tenta match exato ou parcial
            const product = allProducts.find(p => {
                const pName = p.name.toLowerCase();
                return pName === searchName || pName.includes(searchName) || searchName.includes(pName);
            });
            
            if (product) {
                cart.push({ id: product.id, qty: qty, name: product.name });
            }
        });
        
        if(cart.length > 0) console.log(`[Estoque] Itens identificados para baixa: ${cart.length}`);
        return cart;
    }

    async _processAiReply(chatId, client, userText, quotedContext = null) {
        try {
            const history = await this.db.getClientHistory(client.id);
            const chatRecent = await this.db.getRecentChat(client.id);
            
            // Carrega produtos para o parser de estoque
            const productsSnapshot = await this.db.db.collection('products').where('active', '==', true).get();
            const allProducts = productsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            
            const productsData = await this.db.getActiveProducts();
            
            // Anti-Duplicidade
            const activeOrder = await this.db.getLastPendingOrder(client.id);
            
            const { DateTime } = require('luxon');
            const today = DateTime.now().setLocale('pt-BR');
            const lastAddress = client.lastAddress || null;

            const context = {
                clientName: client.name,
                history,
                chatRecent,
                menuJson: JSON.stringify(productsData.menuStructured),
                todayDate: today.toFormat('dd/MM/yyyy'),
                dayName: today.toFormat('cccc'),
                forcedContext: quotedContext,
                lastAddress,
                activeOrder: activeOrder ? { shortId: activeOrder.shortId, items: activeOrder.items, total: activeOrder.total } : null
            };

            const response = await this.ai.generateSalesResponse(context, userText);
            let finalReply = response.text;
            
            if (response.command) {
                const cmd = response.command;
                console.log(`[IA Action] Executando: ${cmd.type}`);
                
                let result = { success: false };

                switch (cmd.type) {
                    case 'schedule_order':
                        result = await this.db.createScheduledOrder({ ...cmd, clientId: client.id, clientName: client.name });
                        if (result.success && !finalReply) {
                            finalReply = `🗓️ Agendado para ${cmd.date.split('-').reverse().join('/')}!`;
                        }
                        break;
                        
                    case 'create_order':
                        const shortId = Date.now().toString().slice(-4);
                        if (cmd.method === 'Entrega' && cmd.address) {
                            await this.db.updateDocument('clients', client.id, { lastAddress: cmd.address });
                        }
                        
                        // TENTA IDENTIFICAR PRODUTOS PARA BAIXA DE ESTOQUE
                        const computedCart = this._matchProductsFromText(cmd.items, allProducts);

                        result = await this.db.createStandardOrder({ 
                            ...cmd, 
                            clientId: client.id, 
                            clientName: client.name,
                            shortId: shortId,
                            cart: computedCart // IMPORTANTE: Passa o carrinho
                        });
                        
                        if (result.success) {
                            if (!finalReply) finalReply = `📝 Pedido #${shortId} confirmado! Total: R$ ${cmd.total}.`;
                            const conf = await this.db.getStoreConfig();
                            if (conf.autoPrint && conf.printerName) {
                                this._printOrder(result.orderId, { ...result, items: cmd.items, clientName: client.name, total: cmd.total, deliveryMethod: cmd.method, address: cmd.address || 'Retirada', paymentMethod: cmd.payment || 'A Combinar', shortId: shortId });
                            }
                        } else {
                            if (result.error && result.error.includes('Estoque insuficiente')) {
                                finalReply = "⚠️ Ops! Acabei de conferir e algum item acabou de esgotar. 😔";
                            }
                        }
                        break;

                    case 'update_order':
                    case 'update_last_order':
                        let orderDoc = null;
                        
                        if (cmd.orderId) {
                            const qCheck = await this.db.db.collection('orders').where('shortId', '==', String(cmd.orderId)).limit(1).get();
                            if (!qCheck.empty) orderDoc = qCheck.docs[0];
                        }

                        // Fallback: Se não achou pelo ID, tenta pelo pedido ativo na memória
                        if (!orderDoc && activeOrder) {
                             orderDoc = await this.db.db.collection('orders').doc(activeOrder.id).get();
                        }
                        
                        // Fallback 2: Busca no banco
                        if (!orderDoc) {
                            const lastOrders = await this.db.db.collection('orders')
                                .where('clientId', '==', client.id)
                                .where('status', '==', 'Pendente')
                                .orderBy('createdAt', 'desc')
                                .limit(1)
                                .get();
                            if (!lastOrders.empty) orderDoc = lastOrders.docs[0];
                        }
                        
                        if (orderDoc) {
                            const updates = {};
                            
                            // CORREÇÃO DO ERRO ReferenceError: logMsg DEFINIDA AQUI
                            let logMsg = "Pedido Atualizado"; 

                            if (cmd.newAddress || cmd.address) {
                                const addr = cmd.newAddress || cmd.address;
                                updates.address = addr;
                                await this.db.updateDocument('clients', client.id, { lastAddress: addr });
                                logMsg = "Endereço Atualizado";
                            }
                            
                            if (cmd.newItems) {
                                updates.items = cmd.newItems;
                                if(cmd.newTotal) updates.total = cmd.newTotal;
                                logMsg = "Itens Alterados";
                            }

                            updates.notes = `${orderDoc.data().notes || ''} | ${logMsg}`;

                            await orderDoc.ref.update(updates);

                            const conf = await this.db.getStoreConfig();
                            if (conf.autoPrint && conf.printerName) {
                                const updatedData = { ...orderDoc.data(), ...updates };
                                this._printOrder(orderDoc.id, updatedData);
                            }

                            const displayId = orderDoc.data().shortId || '...';
                            if (!finalReply) finalReply = `✅ Pedido #${displayId} atualizado com sucesso!`;
                            result.success = true;
                        } else {
                            finalReply = "Não encontrei o pedido para alterar. Pode me confirmar o número dele?";
                        }
                        break;
                        
                    case 'send_image':
                        const imgData = await this.db.getProductImagePath(cmd.id);
                        if (imgData) {
                            await this.wa.sendImage(chatId, imgData.path, `📸 ${imgData.name}`);
                            result.success = true;
                        }
                        break;
                }
            }

            if (finalReply.trim()) {
                await this.wa.sendText(chatId, finalReply);
                await this.db.logMessage(client.id, { chatId, fromMe: true, body: finalReply, isAutoReply: true });
            }

            if (response.specialActions) {
                if (response.specialActions.sendAcaiMenu) {
                    const config = await this.db.getStoreConfig();
                    if (config.imgAcaiPath) {
                        setTimeout(() => this.wa.sendImage(chatId, config.imgAcaiPath, "💜 Tabela de Açaí"), 1500);
                    }
                }
                if (response.specialActions.sendVitrine) {
                    setTimeout(() => this._sendDailyShowcase(chatId), 2000); 
                }
            }

        } catch (error) {
            console.error('[Controller] Erro processamento IA:', error);
        }
    }
    
    
    async _sendDailyShowcase(chatId) {
        try {
            const snap = await this.db.db.collection('products')
                .where('active', '==', true)
                .where('quantity', '>', 0)
                .get();

            const itemsToSend = [];
            snap.forEach(doc => {
                const p = doc.data();
                if (p.imagePath) {
                    itemsToSend.push({ name: p.name, price: p.price, path: p.imagePath, qty: p.quantity });
                }
            });
            if (itemsToSend.length === 0) return { success: false };
            await this.wa.sendText(chatId, `📸 *Vitrine de Hoje:*`);
            for (const item of itemsToSend) {
                if (!fs.existsSync(item.path)) continue;
                await new Promise(r => setTimeout(r, 4000));
                try {
                    const caption = `${item.name}\n💰 R$ ${parseFloat(item.price).toFixed(2)}\n📦 Restam: ${item.qty}un`;
                    await this.wa.sendImage(chatId, item.path, caption);
                } catch (e) {}
            }
            await new Promise(r => setTimeout(r, 2000));
            await this.wa.sendText(chatId, "😋 Escolheu? É só me falar o nome!");
            return { success: true };

        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    _setupIpcHandlers() {
        ipcMain.handle('get-whatsapp-qr', () => null);
        ipcMain.handle('get-whatsapp-status', () => this.wa.status);
        ipcMain.handle('whatsapp-initialize', () => { this.wa.initialize(); return { success: true }; });
        ipcMain.handle('whatsapp-logout', async () => { await this.wa.logout(); return { success: true }; });
        ipcMain.handle('send-whatsapp-message', async (e, rawPhone, msg) => { 
            const success = await this.wa.sendText(rawPhone, msg);
            if (success) {
                try {
                    const cleanPhone = rawPhone.replace(/\D/g, '');
                    const client = await this.db.getOrCreateClient(cleanPhone);
                    if (client && client.id) {
                        await this.db.logMessage(client.id, { chatId: rawPhone.includes('@c.us') ? rawPhone : `${cleanPhone}@c.us`, fromMe: true, body: msg, content: msg, isAutomated: false });
                    }
                } catch (e) {}
            }
            return { success }; 
        });

        ipcMain.handle('send-product-image', async (e, { chatId, imagePath, caption }) => { const success = await this.wa.sendImage(chatId, imagePath, caption); return { success }; });

        ipcMain.handle('select-product-image', async (e, productId) => {
            const { dialog } = require('electron');
            const result = await dialog.showOpenDialog(this.mainWindow, { properties: ['openFile'], filters: [{ name: 'Imagens', extensions: ['jpg', 'png', 'jpeg', 'webp'] }] });
            if (result.canceled || result.filePaths.length === 0) return { success: false };
            try {
                const sourcePath = result.filePaths[0];
                const ext = path.extname(sourcePath);
                const userDataPath = app.getPath('userData');
                const imagesDir = path.join(userDataPath, 'product_images');
                if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir);
                const destPath = path.join(imagesDir, `${productId}${ext}`);
                fs.copyFileSync(sourcePath, destPath);
                await this.db.updateDocument('products', productId, { imagePath: destPath });
                return { success: true, path: destPath };
            } catch (err) { return { success: false, error: err.message }; }
        });

        ipcMain.handle('send-daily-showcase', async (e, chatId) => await this._sendDailyShowcase(chatId));

        ipcMain.handle('upload-config-image', async (e, { category, buffer }) => {
            try {
                const userDataPath = app.getPath('userData');
                const configDir = path.join(userDataPath, 'config_images');
                if (!fs.existsSync(configDir)) fs.mkdirSync(configDir);
                const fileName = `${category}_menu.jpg`; 
                const filePath = path.join(configDir, fileName);
                fs.writeFileSync(filePath, Buffer.from(buffer));
                return { success: true, path: filePath };
            } catch (err) { return { success: false, error: err.message }; }
        });

        ipcMain.handle('create-scheduled-order', async (e, data) => await this.db.createScheduledOrder(data));
        ipcMain.handle('get-scheduled-orders', async () => await this.db.getScheduledOrders());
        ipcMain.handle('get-client-appointments', async (e, clientId) => await this.db.getClientAppointments(clientId));
        ipcMain.handle('delete-order', async (e, id) => await this.db.deleteDocument('orders', id));
        ipcMain.handle('update-order', async (e, { id, data }) => await this.db.updateDocument('orders', id, data));

        ipcMain.handle('update-order-status', async (e, { orderId, newStatus, shouldNotify, orderData }) => {
            const res = await this.db.updateDocument('orders', orderId, { status: newStatus });
            if (!res.success) return res;
            if (shouldNotify && this.wa.status === 'conectado') {
                try {
                    const clientDoc = await this.db.db.collection('clients').doc(orderData.clientId).get();
                    if (clientDoc.exists) {
                        const phone = clientDoc.data().phone;
                        let message = "";
                        const method = (orderData.deliveryMethod || "").toLowerCase();
                        const isDelivery = method.includes('entrega') || method.includes('delivery');
                        switch (newStatus) {
                            case 'Preparo': message = `👩‍🍳 Olá ${orderData.clientName}! Seu pedido está sendo preparado! 🍦`; break;
                            case 'Pronto/Envio': message = isDelivery ? `🛵 Saiu para entrega!` : `🎁 Pronto para retirada!`; break;
                            case 'Concluído': message = `💜 Pedido finalizado! Obrigado!`; break;
                        }
                        if (message) {
                            const sent = await this.wa.sendText(phone, message);
                            if (sent) {
                                const chatId = phone.includes('@') ? phone : `${phone.replace(/\D/g,'')}@c.us`;
                                await this.db.logMessage(orderData.clientId, { chatId, fromMe: true, body: message, content: message, isAutomated: true, read: true });
                            }
                        }
                    }
                } catch (e) {}
            }
            return { success: true };
        });

        ipcMain.handle('create-client-if-not-exists', async (e, data) => {
            try { 
                return { 
                    success: true, 
                    client: await this.db.getOrCreateClient(
                        data.rawPhone, 
                        data.name, 
                        data.countryCode, 
                        data.address 
                    ) 
                }; 
            } 
            catch (err) { return { success: false, error: err.message }; }
        });
        ipcMain.handle('update-client', async (e, id, data) => await this.db.updateDocument('clients', id, data));
        ipcMain.handle('delete-client', async (e, id) => await this.db.deleteDocument('clients', id));
        
        ipcMain.handle('get-products', async () => {
             const snap = await this.db.db.collection('products').orderBy('name').get();
             return { success: true, products: snap.docs.map(d => ({ id: d.id, ...d.data() })) };
        });

        ipcMain.handle('add-product', async (e, p) => {
            try { await this.db.db.collection('products').add({ ...p, price: parseFloat(p.price), quantity: 0, active: true }); return { success: true }; } catch(err) { return { success: false, error: err.message }; }
        });

        ipcMain.handle('delete-product', async (e, id) => await this.db.deleteDocument('products', id));
        ipcMain.handle('toggle-product-status', async (e, { id, isActive }) => await this.db.updateDocument('products', id, { active: isActive }));
        ipcMain.handle('update-product-stock', async (e, { id, quantity }) => await this.db.updateDocument('products', id, { quantity: parseInt(quantity) }));
        ipcMain.handle('update-ai-settings', (e, s) => { this.db.updateDocument('settings', 'storeConfig', s); this.ai.updateConfig(s); return { success: true }; });
        ipcMain.handle('print-order-manual', (e, order) => this._printOrder('manual', order));
        ipcMain.handle('get-printers', async () => ({ success: true, printers: await this.mainWindow.webContents.getPrintersAsync() }));
        ipcMain.handle('create-manual-order', async (e, order) => {
            // Gera ID numérico simples baseado no tempo (últimos 4 dígitos)
            const shortId = Date.now().toString().slice(-4);
            return await this.db.createStandardOrder({ ...order, shortId });
        });
        
        ipcMain.handle('print-report', async (e, data) => {
            const workerWindow = new BrowserWindow({ show: false });
            const html = `<html><body><h1>Relatório Gerado</h1></body></html>`; 
            await workerWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
            workerWindow.webContents.print({ silent: false }); 
            return { success: true };
        });

        ipcMain.handle('print-close-register', async (e, summaryData) => {
             return await this._printCloseRegister(summaryData);
        });
    }

    async _printCloseRegister(data) {
        const conf = await this.db.getStoreConfig();
        const printerName = conf.printerName || ''; 

        if (this.workerWindow) { try { this.workerWindow.close(); } catch(e){} this.workerWindow = null; }
        this.workerWindow = new BrowserWindow({ show: false, width: 400, height: 600, webPreferences: { nodeIntegration: true } });

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    @page { margin: 0; size: auto; }
                    body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; margin: 0; padding: 0; width: 100%; background: #fff; }
                    .ticket-wrapper { width: 92%; margin: 5px auto; padding-left: 5px; }
                    .header { margin-bottom: 10px; border-bottom: 2px dashed #000; padding-bottom: 5px; text-align: center; }
                    .title { font-size: 14px; font-weight: bold; }
                    .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
                    .total-row { border-top: 1px solid #000; border-bottom: 1px solid #000; margin: 10px 0; padding: 5px 0; font-weight: bold; font-size: 14px; }
                    .footer { text-align: center; margin-top: 10px; font-size: 10px; }
                </style>
            </head>
            <body>
                <div class="ticket-wrapper">
                    <div class="header">
                        <div class="title">FECHAMENTO DE CAIXA</div>
                        <div>${conf.storeName || 'Doce Floco'}</div>
                        <div style="font-size: 10px; margin-top:4px;">${data.date}</div>
                    </div>

                    <div class="row"><span>Qtd Pedidos:</span> <span>${data.count}</span></div>
                    <div style="border-bottom: 1px dashed #000; margin: 5px 0;"></div>

                    <div class="row"><span>Pix:</span> <span>R$ ${data.methods['Pix'].toFixed(2)}</span></div>
                    <div class="row"><span>Dinheiro:</span> <span>R$ ${data.methods['Dinheiro'].toFixed(2)}</span></div>
                    <div class="row"><span>Cartão:</span> <span>R$ ${data.methods['Cartão'].toFixed(2)}</span></div>
                    ${data.methods['Outros'] > 0 ? `<div class="row"><span>Outros:</span> <span>R$ ${data.methods['Outros'].toFixed(2)}</span></div>` : ''}

                    <div class="total-row row">
                        <span>TOTAL GERAL:</span>
                        <span>R$ ${data.total.toFixed(2)}</span>
                    </div>

                    <div class="footer">
                        <br>__________________________<br>
                        Assinatura Responsável
                    </div>
                </div>
            </body>
            </html>
        `;

        const tempPath = path.join(app.getPath('temp'), `close_reg_${Date.now()}.html`);
        fs.writeFileSync(tempPath, html);
        
        this.workerWindow.loadURL(`file://${tempPath}`);
        this.workerWindow.webContents.once('did-finish-load', () => {
            const printOptions = { silent: true, margins: { marginType: 'none' } };
            if (printerName) printOptions.deviceName = printerName;
            this.workerWindow.webContents.print(printOptions, () => {
                setTimeout(() => { 
                    if (this.workerWindow) { this.workerWindow.close(); this.workerWindow = null; } 
                    try { fs.unlinkSync(tempPath); } catch(e){} 
                }, 5000);
            });
        });

        return { success: true };
    }

    async _printOrder(orderId, orderData) {
        const conf = await this.db.getStoreConfig();
        const printerName = conf.printerName || ''; 

        if (this.workerWindow) { try { this.workerWindow.close(); } catch(e){} this.workerWindow = null; }
        this.workerWindow = new BrowserWindow({ show: false, width: 400, height: 600, webPreferences: { nodeIntegration: true } });
        
        const { DateTime } = require('luxon');
        const dateStr = DateTime.now().setLocale('pt-BR').toLocaleString(DateTime.DATETIME_SHORT);
        
        let itemsHtml = "-";
        if (orderData.items) {
            if (Array.isArray(orderData.items)) {
                const firstItem = orderData.items[0];
                if (firstItem && typeof firstItem === 'object') {
                    itemsHtml = orderData.items.map(i => {
                        const qtd = i.qty || i.quantity || i.q || 1;
                        const nome = i.name || i.item || i.n || 'Item sem nome';
                        const obs = i.obs ? ` (${i.obs})` : '';
                        return `${qtd}x ${nome}${obs}`;
                    }).join('<br>');
                } else {
                    itemsHtml = orderData.items.join('<br>');
                }
            } 
            else if (typeof orderData.items === 'string') {
                itemsHtml = orderData.items.replace(/\n/g, '<br>');
            } 
            else {
                itemsHtml = String(orderData.items);
            }
        }

        const totalFormatted = parseFloat(orderData.total || 0).toFixed(2);
        const displayId = orderData.shortId || (typeof orderId === 'string' ? orderId.slice(0, 4).toUpperCase() : 'MANUAL');
        const addressDisplay = orderData.address && orderData.address !== 'undefined' ? orderData.address : 'Retirada/Balcão';
        const notesHtml = orderData.notes ? `<div style="margin-top:5px; font-weight:bold; border:1px solid #000; padding:2px; font-size:10px;">OBS: ${orderData.notes}</div>` : '';
        let loanHtml = '';
        if (orderData.loanedItems) {
            loanHtml = `<div class="divider"></div><div class="info-row"><span class="info-label">DEVOLUÇÃO:</span> <span class="info-val">${orderData.returnDate || 'A combinar'}</span></div><div class="items-box">EMPRÉSTIMO:<br>${orderData.loanedItems}</div>`;
        }

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    @page { margin: 0; size: auto; }
                    body { font-family: 'Courier New', monospace; font-size: 11px; color: #000; margin: 0; padding: 0; width: 100%; background: #fff; }
                    .ticket-wrapper { width: 92%; margin: 5px auto; padding-left: 5px; }
                    .header { margin-bottom: 8px; border-bottom: 1px dashed #000; padding-bottom: 5px; text-align: center; }
                    .store-name { font-size: 14px; font-weight: bold; text-transform: uppercase; }
                    .id-box { text-align:center; font-size:18px; font-weight:bold; margin: 5px 0; border: 2px solid #000; padding: 2px; }
                    .info-row { margin-bottom: 2px; display: flex; }
                    .info-label { font-weight: bold; margin-right: 4px; }
                    .info-val { flex: 1; word-wrap: break-word; }
                    .divider { border-top: 1px dashed #000; margin: 8px 0; }
                    .items-box { margin: 5px 0; line-height: 1.3; }
                    .total-box { font-size: 16px; font-weight: bold; text-align: right; margin-top: 5px; }
                    .footer { margin-top: 15px; font-size: 9px; text-align: center; }
                </style>
            </head>
            <body>
                <div class="ticket-wrapper">
                    <div class="header">
                        <div class="store-name">${conf.storeName || 'Doce Floco'}</div>
                        <div style="font-size: 9px;">${dateStr}</div>
                    </div>
                    
                    <div class="id-box">SENHA: #${displayId}</div>

                    <div class="info-row"><span class="info-label">Cliente:</span> <span class="info-val">${orderData.clientName || 'Cliente'}</span></div>
                    <div class="info-row"><span class="info-label">End:</span> <span class="info-val">${addressDisplay}</span></div>
                    <div class="info-row"><span class="info-label">Tipo:</span> <span class="info-val">${orderData.deliveryMethod || 'Balcão'}</span></div>
                    <div class="info-row"><span class="info-label">Pag:</span> <span class="info-val">${orderData.paymentMethod || 'A Combinar'}</span></div>
                    
                    <div class="divider"></div>
                    <div class="items-box">${itemsHtml}</div>
                    ${loanHtml}
                    ${notesHtml}
                    <div class="divider"></div>
                    
                    <div class="total-box">TOTAL: R$ ${totalFormatted}</div>
                    <div class="footer">Obrigado pela preferência!</div>
                </div>
            </body>
            </html>
        `;

        const tempPath = path.join(app.getPath('temp'), `print_${Date.now()}.html`);
        fs.writeFileSync(tempPath, html);
        
        this.workerWindow.loadURL(`file://${tempPath}`);
        this.workerWindow.webContents.once('did-finish-load', () => {
            const printOptions = { silent: true, margins: { marginType: 'none' } };
            if (printerName) printOptions.deviceName = printerName;
            this.workerWindow.webContents.print(printOptions, () => {
                setTimeout(() => { 
                    if (this.workerWindow) { this.workerWindow.close(); this.workerWindow = null; } 
                    try { fs.unlinkSync(tempPath); } catch(e){} 
                }, 5000);
            });
        });
        return { success: true };
    }
}

module.exports = AppController;