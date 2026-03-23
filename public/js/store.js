/**
 * Simple local-first store using localStorage.
 */
const store = {
    get(key, defaultValue = null) {
        const val = localStorage.getItem(`ht_sys_${key}`);
        if (!val) return defaultValue;
        try {
            return JSON.parse(val);
        } catch (e) {
            return val;
        }
    },

    set(key, value) {
        localStorage.setItem(`ht_sys_${key}`, JSON.stringify(value));
    },

    initialize() {
        if (!this.get('settings')) {
            this.set('settings', { vat: 20, commission: 5, rowCount: 25 });
        }
        const u = this.get('users');
        if (!u || !Array.isArray(u) || u.length === 0) {
            this.set('users', [
                { id: 1, name: 'Admin', role: 'admin', pass: '1234' },
                { id: 2, name: 'User', role: 'user', pass: '1234' }
            ]);
        }
        if (!this.get('personnel')) {
            this.set('personnel', []);
        }
        if (!this.get('records')) {
            this.set('records', {});
        }
        if (!this.get('announcements')) {
            this.set('announcements', ["Yeni hesap takip sistemine hoş geldiniz!"]);
        }
        if (!this.get('todo')) {
            this.set('todo', { pending: [], remaining: [] });
        }
        if (!this.get('closedDays')) {
            this.set('closedDays', []);
        }
        if (!this.get('panelTitles')) {
            this.set('panelTitles', { pending: "BEKLEYENLER", remaining: "ÖDEME KALANLAR" });
        }
        if (!this.get('definitions')) {
            this.set('definitions', { income: [], expense: [] });
        }
        if (!this.get('transactions')) {
            this.set('transactions', []);
        }
        if (!this.get('permissions')) {
            this.set('permissions', {
                admin: ['main', 'finance', 'personnel', 'customers', 'users', 'definitions', 'permissions', 'settings'],
                user: ['main', 'finance', 'customers', 'settings']
            });
        }
        if (!this.get('leaves')) {
            this.set('leaves', {});
        }
        if (!this.get('activeShift')) {
            this.set('activeShift', null);
        }
        if (this.get('personNotes') === null) {
            this.set('personNotes', {});
        }
        if (!this.get('ledgers')) {
            this.set('ledgers', {});
        }
        if (!this.get('lists')) {
            this.set('lists', {});
        }
        if (!this.get('customers')) {
            this.set('customers', []);
        }
        if (!this.get('customerLedgers')) {
            this.set('customerLedgers', {});
        }
    }
};

store.initialize();
window.appStore = store;
