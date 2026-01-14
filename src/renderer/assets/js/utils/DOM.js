export const $ = (id) => document.getElementById(id);
export const $$ = (selector) => document.querySelectorAll(selector);

export const show = (element) => {
    if (element) element.classList.remove('hidden');
};

export const hide = (element) => {
    if (element) element.classList.add('hidden');
};

export const hideAll = (selector) => {
    $$(selector).forEach(el => el.classList.add('hidden'));
};