export class UI {
    static _createModal(contentHtml, onMount) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            // Classes originais do seu projeto
            overlay.className = 'fixed inset-0 bg-slate-900 bg-opacity-70 flex items-center justify-center z-[100] animate-fade-in backdrop-blur-sm';
            
            const card = document.createElement('div');
            // O segredo do "ajustável" era o w-96 e o overflow
            card.className = 'bg-white p-6 rounded-xl shadow-2xl w-96 transform transition-all scale-100 border-t-4 border-purple-500 relative max-h-[90vh] overflow-y-auto'; 
            card.innerHTML = contentHtml;
            
            const closeBtn = document.createElement('button');
            closeBtn.className = 'absolute top-3 right-3 text-gray-300 hover:text-red-500 transition';
            closeBtn.innerHTML = '<i class="fas fa-times"></i>';
            
            const close = (val) => { 
                overlay.classList.add('opacity-0'); 
                setTimeout(() => { 
                    if(document.body.contains(overlay)) document.body.removeChild(overlay); 
                    resolve(val); 
                }, 200); 
            };
            
            closeBtn.onclick = () => close(null);
            overlay.onclick = (e) => { if (e.target === overlay) close(null); };
            
            card.appendChild(closeBtn);
            overlay.appendChild(card);
            document.body.appendChild(overlay);

            if (onMount) onMount(card, close);
        });
    }

    // Mantendo os outros métodos simples
    static alert(title, message) {
        return UI._createModal(`<div class="text-center"><div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4"><i class="fas fa-check text-green-600 text-xl"></i></div><h3 class="text-lg font-bold text-gray-900">${title}</h3><p class="text-sm text-gray-500 mt-2 mb-6">${message}</p><button id="btnOk" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-purple-600 text-base font-medium text-white hover:bg-purple-700 focus:outline-none sm:text-sm">OK</button></div>`, (card, close) => { card.querySelector('#btnOk').onclick = () => close(true); });
    }

    static confirm(title, message, confirmText = 'Confirmar', color = 'purple') {
        const btnColorClass = color === 'red' ? 'bg-red-600 hover:bg-red-700' : 'bg-purple-600 hover:bg-purple-700';
        return UI._createModal(`<div class="text-left"><h3 class="text-lg font-bold text-gray-900 mb-2">${title}</h3><p class="text-sm text-gray-600 mb-6">${message}</p><div class="flex justify-end gap-3"><button id="btnCancel" class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm transition">Cancelar</button><button id="btnConfirm" class="px-4 py-2 ${btnColorClass} text-white rounded-lg font-bold shadow-md text-sm transition flex items-center gap-2">${confirmText}</button></div></div>`, (card, close) => { card.querySelector('#btnConfirm').onclick = () => close(true); card.querySelector('#btnCancel').onclick = () => close(false); });
    }

    // NOVO MÉTODO ADICIONADO ABAIXO:
    static decision(title, message, primaryLabel, secondaryLabel) {
        return UI._createModal(`
            <h3 class="text-lg font-bold text-gray-800 mb-2">${title}</h3>
            <p class="text-gray-600 mb-6 text-sm">${message}</p>
            <div class="flex flex-col gap-3">
                <button id="btnPrimary" class="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold shadow-md transition flex justify-center items-center gap-2">
                    <i class="fab fa-whatsapp text-lg"></i> ${primaryLabel}
                </button>
                <button id="btnSecondary" class="w-full py-3 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition">
                    ${secondaryLabel}
                </button>
            </div>
        `, (card, close) => {
            const btnPrimary = card.querySelector('#btnPrimary');
            const btnSecondary = card.querySelector('#btnSecondary');

            if (btnPrimary) btnPrimary.onclick = () => close(true);
            if (btnSecondary) btnSecondary.onclick = () => close(false);
        });
    }

    static toast(message, type = 'success') {
        const container = document.getElementById('toast-container') || (() => { const d = document.createElement('div'); d.id = 'toast-container'; d.className = 'fixed bottom-4 right-4 z-[200] flex flex-col gap-2'; document.body.appendChild(d); return d; })();
        const el = document.createElement('div');
        const colors = type === 'success' ? 'bg-slate-800 text-green-400 border-green-500' : 'bg-slate-800 text-red-400 border-red-500';
        el.className = `${colors} border-l-4 px-4 py-3 rounded shadow-lg flex items-center gap-3 min-w-[250px] animate-slide-in`;
        el.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i><span class="text-sm font-medium text-white">${message}</span>`;
        container.appendChild(el);
        setTimeout(() => { if(container.contains(el)) container.removeChild(el); }, 3000);
    }
}