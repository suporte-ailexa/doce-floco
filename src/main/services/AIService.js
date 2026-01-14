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
            console.log('[AI] Serviço Gemini inicializado (V6.2 - Pagamento Obrigatório).');
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
     * PROMPT ENGENHARIA: PICOLÉS & AÇAÍ (COM VALIDAÇÃO DE DISPONIBILIDADE)
     */
    _buildSystemPrompt({ clientName, history, chatRecent, menuJson, todayDate, dayName, forcedContext, lastAddress }) {
        const { 
            storeName, deliveryFee, address,
            acaiSizes,      
            freeAddons,     
            paidAddons,     
        } = this.config;

        const contextWarning = forcedContext 
            ? `ATENÇÃO: O cliente está respondendo sobre: ${forcedContext}.` 
            : "";

        const knownAddressInfo = lastAddress 
            ? `Endereço Conhecido: "${lastAddress}".` 
            : "Endereço: Não informado.";

        const hasAcaiMenu = acaiSizes && acaiSizes.trim().length > 0;
        
        let acaiSection = hasAcaiMenu ? `
            === 🟣 AÇAÍ ===
            1. TAMANHOS: [${acaiSizes}].
            2. GRÁTIS: [${freeAddons || 'Nenhum'}].
            3. 💰 EXTRAS (Pagos): [${paidAddons || 'Nenhum'}].
        ` : `=== 🚫 AÇAÍ OFF === (Não estamos servindo açaí hoje).`;

        return `
        PERSONA: Atendente da ${storeName}. Data: ${todayDate}. Cliente: ${clientName}.
        LOCAL: ${address || 'Balcão'}.
        ${knownAddressInfo}

        ${acaiSection}

        === 🍦 ESTOQUE (VITRINE) ===
        ${menuJson}
        *Se estoque (s) = 0, diga que acabou.*

        === 🚨 REGRAS DE PAGAMENTO (IMPORTANTE) ===
        1. Aceitamos APENAS: **Pix**, **Dinheiro** ou **Cartão**.
        2. "A Combinar" NÃO EXISTE.
        3. **OBRIGATÓRIO:** Antes de confirmar o pedido, você DEVE perguntar: "Qual a forma de pagamento? (Pix, Dinheiro ou Cartão)".
        4. NÃO gere o JSON "create_order" se o cliente não tiver definido o pagamento.

        === REGRAS DE ENTREGA ===
        - Retirada: Grátis.
        - Entrega: Taxa R$ ${parseFloat(deliveryFee || 0).toFixed(2)}. Endereço obrigatório.

        === COMANDOS JSON ===
        Só gere quando tiver: Itens, Endereço (se entrega) e PAGAMENTO DEFINIDO.
        ###JSON### {"type": "create_order", "items": "...", "total": 0.00, "method": "Entrega", "payment": "Pix", "address": "..."} ###ENDJSON###
        
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
                
                // Validação de Segurança do Pagamento
                if (command.type === 'create_order') {
                    const validPayments = ['Pix', 'Dinheiro', 'Cartão'];
                    // Normaliza para Title Case (ex: pix -> Pix)
                    let pay = command.payment || '';
                    pay = pay.charAt(0).toUpperCase() + pay.slice(1).toLowerCase();
                    
                    if (!validPayments.includes(pay)) {
                        // Se a IA alucinar um pagamento inválido, forçamos null para não criar o pedido ainda
                        // e deixamos apenas o texto perguntando.
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