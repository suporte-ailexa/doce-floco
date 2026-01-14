const { GoogleGenerativeAI } = require("@google/generative-ai");

class AIService {
    constructor(apiKey, initialConfig = {}) {
        this.genAI = null;
        this.model = null;
        this.config = initialConfig;
        
        if (apiKey) {
            this.init(apiKey);
        }
    }

    init(apiKey) {
        try {
            this.genAI = new GoogleGenerativeAI(apiKey);
            this.model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            console.log('[AI] Serviço Gemini inicializado (V6.3 - Anti-Duplicidade).');
        } catch (e) {
            console.error('[AI] Falha ao iniciar Gemini:', e.message);
        }
    }

    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        if (newConfig.geminiApiKey && this.genAI && newConfig.geminiApiKey !== this.genAI.apiKey) {
            this.init(newConfig.geminiApiKey);
        }
    }

    async transcribeAudio(mediaBuffer, mimeType) {
        if (!this.model) return null;
        try {
            const result = await this.model.generateContent([
                "Transcreva este áudio exatamente como falado. Se for apenas ruído, responda [INAUDÍVEL].",
                {
                    inlineData: {
                        data: mediaBuffer.toString("base64"),
                        mimeType: mimeType
                    }
                }
            ]);
            return result.response.text().trim();
        } catch (error) {
            console.error('[AI] Erro transcrição:', error);
            return null;
        }
    }

    async generateSalesResponse(context, userMessage) {
        if (!this.model) return { text: "", command: null };

        try {
            const systemPrompt = this._buildSystemPrompt(context);
            
            const result = await this.model.generateContent([
                systemPrompt,
                `Cliente diz: "${userMessage}"`
            ]);

            return this._parseResponse(result.response.text());

        } catch (error) {
            console.error('[AI] Erro geração:', error);
            return { text: "Ops, minha mente congelou por um instante! Pode repetir?", command: null };
        }
    }

    /**
     * PROMPT ENGENHARIA: COM CONTEXTO DE PEDIDO ATIVO
     */
    _buildSystemPrompt({ clientName, history, chatRecent, menuJson, todayDate, dayName, forcedContext, lastAddress, activeOrder }) {
        const { 
            storeName, deliveryFee, address,
            acaiSizes, freeAddons, paidAddons,     
        } = this.config;

        const knownAddressInfo = lastAddress ? `Endereço Conhecido: "${lastAddress}".` : "Endereço: Não informado.";
        const hasAcaiMenu = acaiSizes && acaiSizes.trim().length > 0;
        
        // --- ALTERAÇÃO AQUI: Lógica de Açaí ---
        let acaiSection = "";
        let acaiSilentRule = "";

        if (hasAcaiMenu) {
            acaiSection = `
            === 🟣 AÇAÍ ===
            1. TAMANHOS: [${acaiSizes}].
            2. GRÁTIS: [${freeAddons || 'Nenhum'}].
            3. 💰 EXTRAS (Pagos): [${paidAddons || 'Nenhum'}].
            `;
        } else {
            // Se não tem açaí, NÃO CRIAMOS UM CABEÇALHO VISÍVEL.
            // Apenas uma regra interna.
            acaiSilentRule = `
            REGRA DE AÇAÍ:
            - Atualmente NÃO estamos servindo Açaí (não cadastrado).
            - IMPORTANTE: NÃO mencione que "não tem açaí" a menos que o cliente pergunte explicitamente sobre açaí.
            - Se o cliente pedir o cardápio ou disser "Oi", ofereça apenas os picolés/sorvetes da vitrine.
            `;
        }
        // --------------------------------------

        // Lógica Anti-Duplicidade
        let activeOrderSection = "";
        if (activeOrder) {
            activeOrderSection = `
            === 🚨 PEDIDO EM ABERTO DETECTADO ===
            O cliente JÁ POSSUI um pedido PENDENTE (ID: ${activeOrder.shortId}).
            Itens Atuais: ${activeOrder.items}
            Total Atual: R$ ${activeOrder.total}
            
            REGRAS CRÍTICAS:
            1. Se o cliente quiser adicionar, remover ou mudar algo, use JSON "update_order" com "orderId": "${activeOrder.shortId}".
            2. NUNCA use "create_order" se o cliente estiver apenas continuando a conversa sobre o mesmo pedido.
            3. Só use "create_order" se o cliente disser explicitamente "Quero fazer OUTRO pedido novo" ou "Cancele esse e faça outro".
            `;
        } else {
            activeOrderSection = `
            === STATUS ===
            Nenhum pedido pendente no momento. Se o cliente pedir algo e confirmar pagamento, use "create_order".
            `;
        }

        return `
        PERSONA: Atendente da ${storeName}. Data: ${todayDate}. Cliente: ${clientName}.
        LOCAL: ${address || 'Balcão'}.
        ${knownAddressInfo}

        ${acaiSection}

        === 🍦 ESTOQUE (VITRINE) ===
        ${menuJson}
        *Se estoque (s) = 0, diga que acabou.*

        ${activeOrderSection}

        === 🚨 REGRAS DE PAGAMENTO (IMPORTANTE) ===
        1. Aceitamos APENAS: **Pix**, **Dinheiro** ou **Cartão**.
        2. "A Combinar" NÃO EXISTE.
        3. **OBRIGATÓRIO:** Antes de confirmar o pedido, você DEVE perguntar: "Qual a forma de pagamento? (Pix, Dinheiro ou Cartão)".
        4. NÃO gere o JSON "create_order" se o cliente não tiver definido o pagamento.

        === REGRAS GERAIS ===
        - Retirada: Grátis.
        - Entrega: Taxa R$ ${parseFloat(deliveryFee || 0).toFixed(2)}. Endereço obrigatório.
        ${acaiSilentRule}

        === COMANDOS JSON ===
        
        A) CRIAR NOVO PEDIDO (Só se não houver pendente):
        ###JSON### {"type": "create_order", "items": "...", "total": 0.00, "method": "Entrega", "payment": "Pix", "address": "..."} ###ENDJSON###
        
        B) ATUALIZAR PEDIDO EXISTENTE (Se houver pendente):
        ###JSON### {"type": "update_order", "orderId": "ID_DO_PEDIDO", "newItems": "...", "newTotal": 0.00, "newAddress": "..."} ###ENDJSON###
        *Mande apenas os campos que mudaram em update_order.*

        Histórico: ${history}
        Chat Atual:
        ${chatRecent}
        `;
    }

    _parseResponse(aiResponseText) {
        let cleanText = aiResponseText;
        let command = null;
        let sendAcaiMenu = false;
        let sendVitrine = false;

        const jsonMatch = aiResponseText.match(/###JSON###([\s\S]*?)###ENDJSON###/);
        if (jsonMatch && jsonMatch[1]) {
            try {
                command = JSON.parse(jsonMatch[1].trim());
                cleanText = cleanText.replace(jsonMatch[0], "").trim();
                
                if (command.type === 'create_order') {
                    const validPayments = ['Pix', 'Dinheiro', 'Cartão'];
                    let pay = command.payment || '';
                    pay = pay.charAt(0).toUpperCase() + pay.slice(1).toLowerCase();
                    if (!validPayments.includes(pay)) {
                        command = null; 
                    } else {
                        command.payment = pay;
                    }
                }

            } catch (e) {
                console.error("[AI] JSON Parse Error:", e);
            }
        }

        if (cleanText.includes('###SEND_ACAI_MENU###')) {
            sendAcaiMenu = true;
            cleanText = cleanText.split('###SEND_ACAI_MENU###').join('').trim();
        }

        if (cleanText.includes('###SEND_DAILY_VITRINE###')) {
            sendVitrine = true;
            cleanText = cleanText.split('###SEND_DAILY_VITRINE###').join('').trim();
        }
        
        return { text: cleanText, command, specialActions: { sendAcaiMenu, sendVitrine } };
    }
}

module.exports = AIService;