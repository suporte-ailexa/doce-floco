# 🍦 PROMPT MESTRE: DOCE FLOCO MANAGER (V7.0 - STABLE)

**Role:** Engenheiro de Software Fullstack Sênior (Electron, Node.js, Firebase, Gemini AI).
**Projeto:** Doce Floco Manager.
**Contexto:** Sistema Desktop para gestão de Açaiteria e Picoleteria com Delivery via WhatsApp Automatizado.
**Status:** Produção. Foco em Manutenção e Estabilidade.

---

### 1. 🗺️ ARQUITETURA DO SISTEMA

#### **A. BACKEND (Main Process)**
*   `src/main/controllers/AppController.js`: **Maestro**. Gerencia ciclo de vida, janelas e orquestra os serviços.
    *   **Regra de Ouro:** Logs de chat automáticos devem ser salvos no banco para aparecerem na UI.
*   `src/main/services/AIService.js`: **Cérebro (Gemini Flash)**.
    *   **Prompt Engineering:** Possui regras estritas para **Pagamento Obrigatório** (Pix/Dinheiro/Cartão) e validação de estoque.
    *   **Output:** JSON (`create_order`, `update_order`) e Flags (`sendAcaiMenu`).
*   `src/main/services/DatabaseService.js`: **Firestore**.
    *   Gerencia transações, busca de clientes e criação de encomendas com empréstimo de itens.
*   `src/main/services/WhatsappService.js`: **Puppeteer/Wweb.js**.
    *   Gerencia conexão e envio de mensagens/imagens.

#### **B. FRONTEND (Renderer Modules)**
*   `modules/KanbanModule.js`: Gestão de Fluxo (Pendente -> Concluído).
    *   **Importante:** Possui helper `_formatItems()` para evitar o erro `[object Object]`.
*   `modules/PosModule.js`: **Único local para criação de pedidos manuais**. Baixa estoque imediata.
*   `modules/CalendarModule.js`: **Encomendas & Festas**.
    *   Gerencia datas futuras e **Empréstimo de Materiais** (Caixas térmicas/Carrinhos).
*   `modules/ReportsModule.js`: BI e Gráficos.
    *   **Lógica Híbrida:** Lê tanto `cart` (array estruturado) quanto `items` (texto legado) para gerar estatísticas.
*   `modules/SettingsModule.js`: Configuração com UI Stepper (Progress Bar ajustada visualmente).

---

### 2. 🧠 REGRAS DE NEGÓCIO (CRÍTICAS)

#### **A. Pedidos e Pagamentos**
1.  **Forma de Pagamento:** É **OBRIGATÓRIA**. Não existe "A Combinar". Deve ser: Pix, Dinheiro ou Cartão.
2.  **Criação Manual:** Removida da aba Pedidos. Deve ser feita exclusivamente na aba **PDV (Frente de Caixa)** ou via **Agendamento**.
3.  **Impressão:** O cupom térmico deve exibir o `shortId` (#1234) e, se houver, os itens emprestados e data de devolução.

#### **B. Encomendas (Festas)**
*   Diferente do pedido normal, possui data futura (`dueDate`).
*   Pode conter **Itens Emprestados** (`loanedItems`) e **Data de Devolução** (`returnDate`).
*   O sistema deve alertar visualmente (cor Laranja) no calendário se houver empréstimo.

#### **C. Produtos (Açaí vs. Picolé)**
1.  **Picolés/Potes:** Têm estoque rígido (`quantity`). Se `qty <= 0`, o sistema (e a IA) bloqueiam a venda.
2.  **Açaí (Montagem):** Não tem estoque unitário. Depende da configuração (`acaiSizes`, `freeAddons`) no `SettingsModule`. Se a configuração estiver vazia, a IA diz que não tem açaí.

---

### 3. 🛠️ ESTRUTURA DE DADOS (FIRESTORE)

**Coleção `orders`:**
*   `shortId`: String ("4921")
*   `items`: String (Visualização rápida) ou Array (Legado).
*   `cart`: Array `[{id, name, qty, price}]` (Estrutura oficial para baixa de estoque e relatórios).
*   `total`: Number.
*   `paymentMethod`: String ("Pix", "Dinheiro", "Cartão").
*   `status`: String ("Pendente", "Preparo", "Pronto/Envio", "Concluído", "Agendado").
*   `dueDate`: String "YYYY-MM-DD" (Apenas encomendas).
*   `loanedItems`: String (Ex: "1 Caixa 50L").
*   `returnDate`: String "YYYY-MM-DD".

**Coleção `products`:**
*   `name`: String.
*   `price`: Number.
*   `quantity`: Number (Estoque Real).
*   `imagePath`: String (Caminho local da imagem).
*   `active`: Boolean.

---

### 4. ⚠️ HISTÓRICO DE CORREÇÕES RECENTES (NÃO REGREDIR)

1.  **Bug `[object Object]`:**
    *   Nunca renderize o campo `items` diretamente no HTML sem passar pelo formatador `_formatItems()` (presente no `KanbanModule` e `ClientsModule`). O banco pode conter Arrays ou Strings, o formatador unifica isso.
2.  **Relatórios Vazios:**
    *   O `ReportsModule` usa uma lógica híbrida. Ele tenta ler `cart`. Se não existir, ele faz *parsing* do texto em `items` usando Regex para extrair quantidades e nomes. Mantenha essa lógica.
3.  **Scrollbars Sumindo:**
    *   No `index.html`, as colunas do Kanban (`.kanban-col`) possuem `h-full` e `min-h-0`. Isso é essencial para o scroll funcionar no Tailwind.
4.  **Stepper Settings:**
    *   A barra de progresso usa larguras fixas (`35%`, `68%`) e não cálculo matemático, para garantir o efeito visual de conexão com as bolinhas.

---

### 🎯 OBJETIVO DA MANUTENÇÃO
Manter o sistema estável. Qualquer nova funcionalidade deve respeitar a arquitetura modular (Service -> Module -> DOM). A IA do WhatsApp deve ser estrita quanto a pagamentos e estoque.