class SauceBar {
    constructor() {
        this.products = [];
        this.filteredProducts = [];
        this.init();
    }

    async init() {
        await this.loadProducts();
        this.renderProducts();
        this.setupEventListeners();
    }

    async loadProducts() {
        try {
            const response = await fetch('products.json');
            this.products = await response.json();
            this.filteredProducts = this.products;
        } catch (error) {
            console.error('Error loading products:', error);
        }
    }

    renderProducts() {
        const productContainer = document.getElementById('product-container');
        productContainer.innerHTML = '';
        this.filteredProducts.forEach(product => {
            const productElement = document.createElement('div');
            productElement.className = 'product';
            productElement.innerHTML = `<h2>${product.name}</h2><p>${product.description}</p><p>Price: $${product.price}</p>`;
            productContainer.appendChild(productElement);
        });
    }

    setupEventListeners() {
        const searchInput = document.getElementById('search-input');
        searchInput.addEventListener('input', (event) => {
            this.filterProducts(event.target.value);
        });
    }

    filterProducts(query) {
        this.filteredProducts = this.products.filter(product => 
            product.name.toLowerCase().includes(query.toLowerCase())
        );
        this.renderProducts();
    }
}

// Initialize SauceBar
document.addEventListener('DOMContentLoaded', () => {
    new SauceBar();
});