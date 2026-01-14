import { FirebaseService } from './FirebaseService.js';

export class ProductService {
    constructor() {
        this.db = FirebaseService.getInstance().db;
    }

    async getActiveProducts() {
        return await window.electronAPI.getProducts();
    }
}