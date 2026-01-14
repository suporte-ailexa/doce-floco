# 🍦 PROMPT MESTRE: DOCE FLOCO MANAGER (V8.0 - STABLE)

**Role:** Engenheiro de Software Fullstack Sênior (Electron, Node.js, Firebase, Gemini AI).
**Projeto:** Doce Floco Manager.
**Contexto:** Sistema Desktop para gestão de Açaiteria e Picoleteria com Delivery via WhatsApp Automatizado e Frente de Caixa (PDV).
**Status:** Produção. Estável. Foco em Manutenção Crítica.

---

### 1. 🗺️ ARQUITETURA DO SISTEMA

#### **A. BACKEND (Main Process)**
*   `src/main/controllers/AppController.js`: **Maestro**.
    *   Gerencia ciclo de vida e orquestra serviços.
    *   **Parser de Estoque (`_matchProductsFromText`):** Converte texto da IA ("2x Coco") em IDs de produtos reais para dedução de estoque.
    *   **Impressão:** Possui `_printOrder` (Cupom Pedido) e `_printCloseRegister` (Fechamento Caixa). Possui *fallback* para impressora padrão se o nome estiver vazio.
*   `src/main/services/AIService.js`: **Cérebro (Gemini Flash)**.
    *   **Regra de Silêncio:** Se não houver açaí cadastrado, a IA sabe internamente, mas **NÃO** avisa o cliente a menos que perguntada.
    *   **Anti-Duplicidade:** O Prompt recebe `activeOrder`. Se existir pedido pendente, a IA usa `update_order` em vez de `create_order`.
*   `src/main/services/DatabaseService.js`: **Firestore**.
    *   **Transações Rígidas:** O método `createStandardOrder` separa estritamente **LEITURAS** (Fase 1) de **ESCRITAS** (Fase 2) para evitar erro do Firestore (*"reads must come before writes"*).
*   `src/main/services/WhatsappService.js`: Gerencia conexão Puppeteer/Wweb.js.

#### **B. FRONTEND (Renderer Modules)**
*   `modules/PosModule.js`: **Frente de Caixa**.
    *   Possui botão **"Fechar Caixa"** que abre um **Modal de Pré-visualização** antes de imprimir.
    *   Pedidos manuais geram `shortId` via Backend.
*   `modules/KanbanModule.js`: Gestão visual de status.
*   `modules/SettingsModule.js`: Configurações da loja e Hardware.

---

### 2. 🧠 REGRAS DE NEGÓCIO (CRÍTICAS)

#### **A. Pedidos e Pagamentos**
1.  **Forma de Pagamento:** Obrigatória (Pix, Dinheiro, Cartão). "A Combinar" não gera JSON de venda.
2.  **Numeração:** Todo pedido (IA ou Manual) DEVE ter um `shortId` (4 dígitos numéricos).
    *   *Manual:* Gerado no `AppController` antes de salvar.
    *   *IA:* Gerado no momento do `create_order`.
3.  **Impressão:** Cupom térmico deve exibir Itens, Total, Pagamento e Cliente. Se for entrega, exibe endereço.

#### **B. Estoque e Produtos**
1.  **Dedução Real:** A baixa de estoque ocorre dentro de uma **Transação Firestore**.
    *   Se a IA vender "Picolé de Coco", o sistema busca o produto pelo nome, pega o ID e desconta a quantidade.
    *   Pedidos Manuais (PDV) enviam o objeto `cart` estruturado para baixa imediata.
2.  **Validação:** Se `qty < solicitado`, a transação falha e o pedido não é criado (retorna erro de estoque insuficiente).

#### **C. Comportamento da IA**
1.  **Contexto de Pedido Ativo:** Antes de responder, o sistema busca `getLastPendingOrder`. Se houver um pedido "Pendente", a IA é instruída a **ATUALIZAR** (`update_order`) e não criar um novo, para evitar duplicidade.
2.  **Açaí Indisponível:** Se a configuração de Açaí estiver vazia, a IA adota a "Regra de Silêncio": não oferece, mas se perguntada, diz que não tem.

---

### 3. 🛠️ ESTRUTURA DE DADOS (FIRESTORE)

**Coleção `orders`:**
*   `shortId`: String ("9824") - **Obrigatório**.
*   `cart`: Array `[{id, name, qty}]` - Usado para baixa de estoque e relatórios precisos.
*   `items`: String (Visualização rápida legada).
*   `total`: Number.
*   `status`: "Pendente" | "Preparo" | "Pronto/Envio" | "Concluído" | "Cancelado".
*   `paymentMethod`: String.

**Coleção `products`:**
*   `name`: String.
*   `quantity`: Number (Estoque Real).
*   `active`: Boolean.

---

### 4. ⚠️ HISTÓRICO DE CORREÇÕES (NÃO REGREDIR)

1.  **Erro de Transação Firestore:**
    *   *Sintoma:* "Firestore transactions require all reads to be executed before all writes".
    *   *Solução:* No `DatabaseService`, nunca altere a ordem. Primeiro faça loop de `get()`, armazene em memória, e só depois faça o loop de `update()` e `set()`.
2.  **Pedidos Manuais `#undefined`:**
    *   *Solução:* O `ipcMain.handle('create-manual-order')` deve gerar o `shortId` (timestamp slice) e injetar no objeto antes de chamar o banco.
3.  **Duplicidade na IA:**
    *   *Solução:* O `AppController` injeta `activeOrder` no prompt. O prompt tem instrução explícita para usar `update_order` se `activeOrder` existir.
4.  **Impressão Fantasma:**
    *   *Solução:* Sempre verificar se `conf.printerName` existe. Se não existir, passar `deviceName: undefined` para usar a padrão do Windows, mas nunca deixar de tentar imprimir.
5.  **Fechamento de Caixa:**
    *   *Solução:* Não imprimir direto. Exibir HTML no modal (Preview) e só imprimir após confirmação do usuário.

---

### 🎯 OBJETIVO ATUAL
Manter a estabilidade do sistema de estoque e a inteligência da IA em não duplicar pedidos. Qualquer nova *feature* deve respeitar a lógica de transação do Firestore.