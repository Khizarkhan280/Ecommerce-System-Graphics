let cart = [];
let currentToken = null;
let isAdmin = false;
let currentUser = null;

// Product icons by name keyword
const productIcons = {
    laptop: '💻', phone: '📱', mobile: '📱', mouse: '🖱️',
    keyboard: '⌨️', monitor: '🖥️', headphone: '🎧', speaker: '🔊',
    camera: '📷', tablet: '📱', watch: '⌚', default: '📦'
};

function getProductIcon(name) {
    const lower = name.toLowerCase();
    for (const key in productIcons) {
        if (lower.includes(key)) return productIcons[key];
    }
    return productIcons.default;
}

// ─── Cart ────────────────────────────────────────────────────────

function loadCart() {
    const savedCart = localStorage.getItem('cart');
    if (savedCart) {
        cart = JSON.parse(savedCart);
        updateCartCount();
        renderCart();
    }
}

function saveCart() {
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartCount();
    renderCart();
}

function updateCartCount() {
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    const cartBadge = document.getElementById('cartCount');
    if (cartBadge) {
        cartBadge.textContent = count;
        cartBadge.style.display = count > 0 ? 'flex' : 'flex';
    }
}

function addToCart(product) {
    if (product.quantity <= 0) { showMessage('Out of stock!', 'error'); return; }
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
        if (existing.quantity + 1 > product.quantity) { showMessage('Not enough stock!', 'error'); return; }
        existing.quantity++;
    } else {
        cart.push({ id: product.id, name: product.name, price: product.price, quantity: 1, maxQty: product.quantity });
    }
    saveCart();
    showMessage(`${product.name} added to bag!`, 'success');
}

function removeFromCart(index) {
    cart.splice(index, 1);
    saveCart();
    showMessage('Removed from bag', 'success');
}

function updateQuantity(index, delta) {
    const item = cart[index];
    const newQty = item.quantity + delta;
    if (newQty < 1) { removeFromCart(index); return; }
    if (newQty > item.maxQty) { showMessage('Not enough stock!', 'error'); return; }
    item.quantity = newQty;
    saveCart();
}

function renderCart() {
    const container = document.getElementById('cart-items');
    const totalContainer = document.getElementById('cart-total');
    if (!container) return;

    if (cart.length === 0) {
        container.innerHTML = `<div class="loading" style="padding:60px 28px">
            <div style="font-size:40px;margin-bottom:12px">🛍️</div>
            Your bag is empty
        </div>`;
        if (totalContainer) totalContainer.innerHTML = '';
        return;
    }

    let total = 0;
    container.innerHTML = '';
    cart.forEach((item, index) => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        container.innerHTML += `
            <div class="cart-item">
                <div class="cart-item-info">
                    <div class="cart-item-name">${item.name}</div>
                    <div class="cart-item-price">Rs. ${item.price.toFixed(2)} each</div>
                </div>
                <div class="cart-item-quantity">
                    <button onclick="updateQuantity(${index}, -1)">−</button>
                    <span>${item.quantity}</span>
                    <button onclick="updateQuantity(${index}, 1)">+</button>
                </div>
                <div class="cart-item-total">Rs. ${itemTotal.toFixed(2)}</div>
                <button class="cart-item-remove" onclick="removeFromCart(${index})" title="Remove">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>`;
    });

    if (totalContainer) {
        totalContainer.innerHTML = `
            <div class="cart-total">
                <span style="color:var(--muted);font-size:14px;font-family:'DM Sans',sans-serif;font-weight:400">Total</span>
                <span>Rs. ${total.toFixed(2)}</span>
            </div>`;
    }
}

async function updateStock(productId, delta) {
    try {
        const response = await fetch(`/api/products/${productId}/stock`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
            body: JSON.stringify({ delta })
        });
        const result = await response.json();
        if (result.success) {
            showMessage(result.message, 'success');
            loadProducts();
        } else {
            showMessage(result.message, 'error');
        }
    } catch (err) {
        showMessage('Cannot update stock', 'error');
    }
}

// ─── User Authentication ─────────────────────────────────────────

async function userRegister() {
    const username = document.getElementById('regUsername').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;

    if (!username || !email || !password || !confirmPassword) {
        showMessage('Please fill all fields', 'error');
        return;
    }
    
    if (username.length < 3) {
        showMessage('Username must be at least 3 characters', 'error');
        return;
    }
    
    if (password.length < 6) {
        showMessage('Password must be at least 6 characters', 'error');
        return;
    }
    
    if (password !== confirmPassword) {
        showMessage('Passwords do not match', 'error');
        return;
    }

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });
        const result = await response.json();
        if (result.success) {
            showMessage(result.message, 'success');
            // Clear form and switch to login
            document.getElementById('regUsername').value = '';
            document.getElementById('regEmail').value = '';
            document.getElementById('regPassword').value = '';
            document.getElementById('regConfirmPassword').value = '';
            switchToLogin();
        } else {
            showMessage(result.message, 'error');
        }
    } catch (err) {
        showMessage('Cannot reach server.', 'error');
        console.error('Register error:', err);
    }
}

async function userLogin() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    if (!username || !password) {
        showMessage('Please enter username and password', 'error');
        return;
    }

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const result = await response.json();
        if (result.success) {
            currentToken = result.token;
            isAdmin = result.isAdmin;
            currentUser = { username: result.username, isAdmin: result.isAdmin };
            localStorage.setItem('token', result.token);
            localStorage.setItem('isAdmin', result.isAdmin);
            localStorage.setItem('username', result.username);
            showMessage(`Welcome back, ${result.username}!`, 'success');
            closeUserLoginModal();
            updateUIAfterLogin();
            loadProducts();
            // Update cart display
            renderCart();
            // Clear login form
            document.getElementById('loginUsername').value = '';
            document.getElementById('loginPassword').value = '';
        } else {
            showMessage(result.message, 'error');
        }
    } catch (err) {
        showMessage('Cannot reach server.', 'error');
        console.error('Login error:', err);
    }
}

async function adminLogin() {
    const password = document.getElementById('adminPassword').value;
    try {
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        if (!response.ok) { showMessage('Server error: ' + response.status, 'error'); return; }
        const result = await response.json();
        if (result.success) {
            currentToken = result.token;
            isAdmin = true;
            currentUser = { username: 'Admin', isAdmin: true };
            localStorage.setItem('token', result.token);
            localStorage.setItem('isAdmin', 'true');
            localStorage.setItem('username', 'Admin');
            showMessage('Welcome back, Admin!', 'success');
            closeAdminModal();
            updateUIAfterLogin();
            loadProducts();
            // Clear admin password field
            document.getElementById('adminPassword').value = '';
        } else {
            showMessage(result.message, 'error');
        }
    } catch (err) {
        showMessage('Cannot reach server. Is the backend running?', 'error');
        console.error('Login error:', err);
    }
}

function logout() {
    localStorage.clear();
    currentToken = null;
    isAdmin = false;
    currentUser = null;
    updateUIForGuest();
    showMessage('Logged out successfully', 'success');
    loadProducts();
    // Clear cart on logout
    cart = [];
    saveCart();
    // Switch back to products view
    showSection('products');
}

function updateUIAfterLogin() {
    const username = localStorage.getItem('username') || (isAdmin ? 'Admin' : 'User');
    const userNameDisplay = document.getElementById('userNameDisplay');
    const userLoginBtn = document.getElementById('userLoginBtn');
    const adminLoginBtn = document.getElementById('adminLoginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const adminAddBtn = document.getElementById('adminAddBtn');
    const adminAnalyticsBtn = document.getElementById('adminAnalyticsBtn');
    const clearOrdersBtn = document.getElementById('clearOrdersBtn');
    
    if (userNameDisplay) {
        if (isAdmin) {
            userNameDisplay.innerHTML = '<i class="fas fa-shield-alt"></i> Admin';
        } else {
            userNameDisplay.innerHTML = `<i class="fas fa-user"></i> ${username}`;
        }
        userNameDisplay.style.display = 'flex';
    }
    
    if (userLoginBtn) userLoginBtn.style.display = 'none';
    if (adminLoginBtn) adminLoginBtn.style.display = isAdmin ? 'none' : 'flex';
    if (logoutBtn) logoutBtn.style.display = 'flex';
    
    if (isAdmin) {
        if (adminAddBtn) adminAddBtn.style.display = 'flex';
        if (adminAnalyticsBtn) adminAnalyticsBtn.style.display = 'flex';
        if (clearOrdersBtn) clearOrdersBtn.style.display = 'flex';
    } else {
        if (adminAddBtn) adminAddBtn.style.display = 'none';
        if (adminAnalyticsBtn) adminAnalyticsBtn.style.display = 'none';
        if (clearOrdersBtn) clearOrdersBtn.style.display = 'none';
    }
}

function updateUIForGuest() {
    const userNameDisplay = document.getElementById('userNameDisplay');
    const userLoginBtn = document.getElementById('userLoginBtn');
    const adminLoginBtn = document.getElementById('adminLoginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const adminAddBtn = document.getElementById('adminAddBtn');
    const adminAnalyticsBtn = document.getElementById('adminAnalyticsBtn');
    const clearOrdersBtn = document.getElementById('clearOrdersBtn');
    
    if (userNameDisplay) {
        userNameDisplay.innerHTML = '';
        userNameDisplay.style.display = 'none';
    }
    if (userLoginBtn) userLoginBtn.style.display = 'flex';
    if (adminLoginBtn) adminLoginBtn.style.display = 'flex';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (adminAddBtn) adminAddBtn.style.display = 'none';
    if (adminAnalyticsBtn) adminAnalyticsBtn.style.display = 'none';
    if (clearOrdersBtn) clearOrdersBtn.style.display = 'none';
}

function checkAuth() {
    const token = localStorage.getItem('token');
    const admin = localStorage.getItem('isAdmin') === 'true';
    const username = localStorage.getItem('username');
    
    if (token) {
        currentToken = token;
        if (admin) {
            isAdmin = true;
            currentUser = { username: 'Admin', isAdmin: true };
            updateUIAfterLogin();
        } else if (username) {
            isAdmin = false;
            currentUser = { username: username, isAdmin: false };
            updateUIAfterLogin();
        } else {
            updateUIForGuest();
        }
    } else {
        updateUIForGuest();
    }
}

// ─── Products (Admin) ────────────────────────────────────────────

async function addProduct() {
    const id = parseInt(document.getElementById('prodId').value);
    const name = document.getElementById('prodName').value;
    const price = parseFloat(document.getElementById('prodPrice').value);
    const quantity = parseInt(document.getElementById('prodQty').value);
    if (!id || !name || !price || !quantity) { showMessage('Please fill all fields', 'error'); return; }
    try {
        const response = await fetch('/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
            body: JSON.stringify({ id, name, price, quantity })
        });
        const result = await response.json();
        if (result.success) {
            showMessage(result.message, 'success');
            closeAddProductModal();
            loadProducts();
            ['prodId','prodName','prodPrice','prodQty'].forEach(id => document.getElementById(id).value = '');
        } else {
            showMessage(result.message, 'error');
        }
    } catch (err) {
        showMessage('Cannot add product', 'error');
    }
}

async function deleteProduct(id) {
    if (!confirm('Remove this product from the catalog?')) return;
    try {
        const response = await fetch(`/api/products/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const result = await response.json();
        if (result.success) { showMessage(result.message, 'success'); loadProducts(); }
        else { showMessage(result.message, 'error'); }
    } catch (err) {
        showMessage('Cannot delete product', 'error');
    }
}

async function loadProducts() {
    let products;
    try {
        const response = await fetch('/api/products');
        if (!response.ok) { document.getElementById('products-list').innerHTML = '<div class="loading">Server error loading products.</div>'; return; }
        products = await response.json();
    } catch (err) {
        document.getElementById('products-list').innerHTML = '<div class="loading">Cannot reach server. Start the backend and refresh.</div>';
        console.error('Load products error:', err);
        return;
    }
    const container = document.getElementById('products-list');
    if (products.length === 0) { container.innerHTML = '<div class="loading">No products in catalog</div>'; return; }

    container.innerHTML = '';
    products.forEach((product, i) => {
        const stockClass = product.inStock ? 'in-stock' : 'out-of-stock';
        const stockText = product.inStock
            ? `<i class="fas fa-circle" style="font-size:8px"></i> ${product.quantity} in stock`
            : `<i class="fas fa-circle" style="font-size:8px"></i> Out of Stock`;
        const icon = getProductIcon(product.name);

        container.innerHTML += `
            <div class="product-card" style="animation-delay:${i * 0.06}s">
                <div class="product-card-top">
                    <div class="product-icon">${icon}</div>
                    ${isAdmin ? `<button class="btn-delete-product" onclick="deleteProduct(${product.id})" title="Remove product">
                        <i class="fas fa-times"></i>
                    </button>` : ''}
                </div>
                <div class="product-name">${product.name}</div>
                <div class="product-price"><span>Rs.</span>${product.price.toFixed(2)}</div>
                <div class="product-stock ${stockClass}">${stockText}</div>
                ${isAdmin ? `
                <div class="stock-controls">
                    <button class="btn-stock" onclick="updateStock(${product.id}, -1)" title="Decrease stock">−</button>
                    <span class="stock-count">${product.quantity}</span>
                    <button class="btn-stock" onclick="updateStock(${product.id}, 1)" title="Increase stock">+</button>
                </div>
            ` : `
                <button class="btn-add-to-cart" onclick='addToCart(${JSON.stringify(product).replace(/'/g, "&#39;")})' ${!product.inStock ? 'disabled' : ''}>
                    <i class="fas fa-shopping-bag"></i> Add to Bag
                </button>
            `}
            </div>`;
    });
}

// ─── Checkout ────────────────────────────────────────────────────

async function checkout() {
    if (cart.length === 0) { showMessage('Your bag is empty!', 'error'); return; }
    
    // Check if user is logged in
    if (!currentToken) {
        showMessage('Please login to place order', 'error');
        showUserLoginModal();
        return;
    }
    
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    try {
        const response = await fetch('/api/checkout', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ items: cart, total })
        });
        if (!response.ok) { showMessage('Server error: ' + response.status, 'error'); return; }
        const result = await response.json();
        if (result.success) {
            showMessage(result.message, 'success');
            cart = []; saveCart(); renderCart(); updateCartCount();
            showSection('products');
        } else {
            if (result.requiresLogin) {
                showMessage('Please login to place order', 'error');
                showUserLoginModal();
            } else {
                showMessage(result.message, 'error');
            }
        }
    } catch (err) {
        showMessage('Cannot reach server. Is the backend running?', 'error');
        console.error('Checkout error:', err);
    }
}

// ─── Orders (Admin) ──────────────────────────────────────────────

async function loadOrders() {
    const container = document.getElementById('orders-list');
    if (!container) return;
    
    container.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading orders…</p></div>`;
    try {
        const response = await fetch('/api/orders', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!response.ok) { container.innerHTML = '<div class="loading">Server error loading orders.</div>'; return; }
        const result = await response.json();

        if (!result.orders || result.orders.length === 0) {
            container.innerHTML = `<div class="loading">
                <div style="font-size:40px;margin-bottom:12px">📭</div>
                No orders yet
            </div>`;
            return;
        }

        container.innerHTML = result.orders.map((order, i) => `
            <div class="order-card">
                <div class="order-header">
                    <div class="order-meta">
                        <span class="order-number">Order #${i + 1}</span>
                        <span class="order-date"><i class="fas fa-clock"></i> ${order.timestamp}</span>
                    </div>
                    <span class="order-total-badge">Rs. ${order.total}</span>
                </div>
                ${order.username && order.username !== "" ? `
                <div style="padding: 12px 24px; background: var(--gold-dim); border-bottom: 1px solid var(--border);">
                    <i class="fas fa-user" style="color: var(--gold); margin-right: 8px;"></i>
                    <span style="color: var(--text); font-weight: 500;">Customer: ${order.username}</span>
                </div>
                ` : ''}
                <div class="order-items">
                    ${order.items.map(item => `
                        <div class="order-item-row">
                            <span class="order-item-name">${item.name}</span>
                            <span class="order-item-qty">× ${item.quantity}</span>
                            <span class="order-item-price">Rs. ${item.itemTotal}</span>
                        </div>`).join('')}
                </div>
            </div>`).join('');
    } catch (err) {
        container.innerHTML = '<div class="loading">Cannot reach server.</div>';
        console.error('Load orders error:', err);
    }
}

async function clearAllOrders() {
    if (!confirm('Clear ALL orders? This cannot be undone.')) return;
    try {
        const response = await fetch('/api/orders', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const result = await response.json();
        if (result.success) {
            showMessage('All orders cleared', 'success');
            loadOrders();
        } else {
            showMessage(result.message, 'error');
        }
    } catch (err) {
        showMessage('Cannot reach server.', 'error');
    }
}

// ─── Modal Management ────────────────────────────────────────────

function showUserLoginModal() {
    const modal = document.getElementById('userLoginModal');
    if (modal) modal.style.display = 'flex';
    switchToLogin();
}

function closeUserLoginModal() {
    const modal = document.getElementById('userLoginModal');
    if (modal) modal.style.display = 'none';
}

function switchToRegister() {
    const loginForm = document.getElementById('userLoginForm');
    const registerForm = document.getElementById('userRegisterForm');
    if (loginForm) loginForm.style.display = 'none';
    if (registerForm) registerForm.style.display = 'block';
}

function switchToLogin() {
    const loginForm = document.getElementById('userLoginForm');
    const registerForm = document.getElementById('userRegisterForm');
    if (loginForm) loginForm.style.display = 'block';
    if (registerForm) registerForm.style.display = 'none';
}

function showAdminModal() {
    const modal = document.getElementById('adminModal');
    if (modal) modal.style.display = 'flex';
}

function closeAdminModal() {
    const modal = document.getElementById('adminModal');
    if (modal) modal.style.display = 'none';
}

function showAddProductModal() {
    if (!isAdmin) { showMessage('Admin access required', 'error'); return; }
    const modal = document.getElementById('addProductModal');
    if (modal) modal.style.display = 'flex';
}

function closeAddProductModal() {
    const modal = document.getElementById('addProductModal');
    if (modal) modal.style.display = 'none';
}

// ─── Section Navigation ──────────────────────────────────────────

function showSection(section, element) {
    const sections = ['products', 'cart', 'orders', 'analytics'];
    sections.forEach(s => {
        const el = document.getElementById(`${s}Section`);
        if (el) el.style.display = 'none';
    });
    const target = document.getElementById(`${section}Section`);
    if (target) target.style.display = 'block';

    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    if (element && element.classList) {
        element.classList.add('active');
    } else {
        // Find the corresponding nav link
        const navLinks = document.querySelectorAll('.nav-link');
        for (let link of navLinks) {
            if (link.textContent.toLowerCase().includes(section.toLowerCase())) {
                link.classList.add('active');
                break;
            }
        }
    }

    if (section === 'cart') renderCart();
    if (section === 'orders') loadOrders();
}

// ─── Toast ───────────────────────────────────────────────────────

function showMessage(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    const msg = document.getElementById('toast-msg');
    const icon = toast.querySelector('.toast-icon');
    if (msg) msg.textContent = message;
    if (icon) {
        icon.className = `toast-icon fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`;
    }
    toast.className = `toast ${type}`;
    toast.style.display = 'flex';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 3200);
}

// ─── Init ────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    // Enter key handlers
    const adminPw = document.getElementById('adminPassword');
    if (adminPw) adminPw.addEventListener('keydown', e => { if (e.key === 'Enter') adminLogin(); });
    
    const loginPw = document.getElementById('loginPassword');
    if (loginPw) loginPw.addEventListener('keydown', e => { if (e.key === 'Enter') userLogin(); });
    
    const regPw = document.getElementById('regPassword');
    if (regPw) regPw.addEventListener('keydown', e => { if (e.key === 'Enter') userRegister(); });
    
    const regConfirmPw = document.getElementById('regConfirmPassword');
    if (regConfirmPw) regConfirmPw.addEventListener('keydown', e => { if (e.key === 'Enter') userRegister(); });
});

checkAuth();
loadCart();
loadProducts();