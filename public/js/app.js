class App {
    constructor() {
        try {
            this.store = window.appStore;
            this.formatDate = (d) => {
                const date = new Date(d);
                const y = date.getFullYear();
                const m = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${y}-${m}-${day}`;
            };

            this.getBusinessDate = () => {
                const now = new Date();
                const hours = now.getHours();
                // Ensure business date doesn't shift until 03:00 AM
                if (hours < 3) now.setDate(now.getDate() - 1);
                return this.formatDate(now);
            };

            this.timeToMinutes = (t) => {
                if (!t || typeof t !== 'string' || !t.includes(':')) return -1;
                const parts = t.split(':');
                return (parseInt(parts[0]) * 60) + parseInt(parts[1]);
            };

            this.currentDate = this.getBusinessDate();
            this.today = this.formatDate(new Date());

            setInterval(() => {
                console.log("Saatlik otomatik yedekleme çalışıyor...");
                this.backupData(true);
            }, 3600000);

            // UI Auto-Refresh every 10 seconds (for status / time changes)
            setInterval(() => {
                const mainContent = document.getElementById('mainContent');
                // Only refresh if we are on the grid page (has hRow and bRow)
                if (mainContent && document.getElementById('hRow')) {
                    console.log("10 saniyelik durum güncellemesi yapılıyor...");
                    this.renderGrid();
                }
            }, 10000);
            this.user = null;
            this.pFilter = 'active'; // Default personnel filter
            this.cFilter = 'active'; // Default customer filter
            this.searchQuery = ''; // Grid customer search
            
            // Customer Ledger Filter Defaults (This Month)
            const now = new Date();
            this.lStart = this.formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
            this.lEnd = this.formatDate(now);

            // Finance Filter Defaults (Today)
            this.finStart = this.today;
            this.finEnd = this.today;

            // Report Filter Defaults (This Month)
            this.rStart = this.lStart;
            this.rEnd = this.lEnd;
            this.rPid = 'all';
            this.rCid = 'all';

            // Action Logs Filter Defaults (Today)
            this.logStart = this.today;
            this.logEnd = this.today;
            this.logUser = 'all';

            this.cache = {
                personnel: this.store.get('personnel') || [],
                settings: this.store.get('settings') || { vat: 20, commission: 5, reklam: 0, rowCount: 25 },
                records: this.store.get('records') || {},
                announcements: this.store.get('announcements') || [],
                todo: this.store.get('todo') || { pending: [], remaining: [] },
                closedDays: this.store.get('closedDays') || [],
                panelTitles: this.store.get('panelTitles') || { pending: "BEKLEYENLER", remaining: "ÖDEME KALANLAR" },
                definitions: this.store.get('definitions') || { income: [], expense: [], bank: [] },
                transactions: this.store.get('transactions') || [],
                permissions: this.store.get('permissions') || {
                    admin: ['main', 'finance', 'personnel', 'users', 'definitions', 'permissions', 'settings'],
                    user: ['main', 'finance', 'settings']
                },
                leaves: this.store.get('leaves') || {},
                activeShift: this.store.get('activeShift') || null,
                ledgers: this.store.get('ledgers') || {},
                lists: this.store.get('lists') || {},
                customers: this.store.get('customers') || [],
                customerLedgers: this.store.get('customerLedgers') || {},
                dailyNotes: this.store.get('dailyNotes') || {},
                waitingRecords: this.store.get('waitingRecords') || [],
                lastPersonnelId: this.store.get('lastPersonnelId') || null,
                actionLogs: this.store.get('actionLogs') || []
            };
            // Robust check for definitions
            if (!this.cache.definitions.income) this.cache.definitions.income = [];
            if (!this.cache.definitions.expense) this.cache.definitions.expense = [];
            if (!this.cache.definitions.bank) this.cache.definitions.bank = [];

            this.cache.personNotes = this.store.get('personNotes', {});

            // Migration: Ensure 'extra' exists in todo
            if (!this.cache.todo.extra) {
                this.cache.todo.extra = [];
                this.store.set('todo', this.cache.todo);
            }

            // Force add 'permissions' and 'actionLogs' to admin if missing (migration)
            if (this.cache.permissions.admin) {
                if (!this.cache.permissions.admin.includes('permissions')) this.cache.permissions.admin.push('permissions');
                if (!this.cache.permissions.admin.includes('actionLogs')) this.cache.permissions.admin.push('actionLogs');
                this.store.set('permissions', this.cache.permissions);
            }
            // Migration: Add 'customers' to existing permission sets if missing
            ['admin', 'user'].forEach(role => {
                if (this.cache.permissions[role] && !this.cache.permissions[role].includes('customers')) {
                    this.cache.permissions[role].push('customers');
                    this.store.set('permissions', this.cache.permissions);
                }
            });

            // Clean up personnel colors (reset previous blue default to white)
            let changed = false;
            this.cache.personnel.forEach(p => {
                if (p.color === '#4f46e5') {
                    p.color = '#ffffff';
                    changed = true;
                }
            });
            if (changed) this.store.set('personnel', this.cache.personnel);

            // Migration: Clean up 'undefined' string values in shift fields
            let shiftCleaned = false;
            this.cache.personnel.forEach(p => {
                ['shiftStart', 'shiftEnd', 'shiftStart2', 'shiftEnd2'].forEach(key => {
                    if (p[key] === 'undefined' || p[key] === undefined) {
                        p[key] = '';
                        shiftCleaned = true;
                    }
                });
            });
            if (shiftCleaned) this.store.set('personnel', this.cache.personnel);

            this.checkLicense();
        } catch (err) {
            console.error("Başlatma hatası:", err);
            document.body.innerHTML = `<div style="color:red; padding:20px;">Sistem başlatılamadı: ${err.message}</div>`;
        }
    }

    formatNum(val) {
        if (val === undefined || val === null || isNaN(val)) return '0';
        return Math.round(Number(val)).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
    }

    // --- LOGGING ---
    logAction(actionDesc) {
        if (!this.cache.actionLogs) this.cache.actionLogs = [];
        const now = new Date();
        const dateStr = this.formatDate(now);
        const timeStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const username = this.user ? (this.user.name || this.user.username || 'Kullanıcı') : 'Sistem';
        
        this.cache.actionLogs.push({
            id: Date.now().toString(),
            date: dateStr,
            time: timeStr,
            user: username,
            action: actionDesc
        });

        // Limit logs to the last 10000 records to prevent performance issues
        if (this.cache.actionLogs.length > 10000) {
            this.cache.actionLogs = this.cache.actionLogs.slice(-10000);
        }
        this.store.set('actionLogs', this.cache.actionLogs);
    }

    // --- LICENSING ---
    checkLicense() {
        let mid = this.store.get('machineId');
        if (!mid) {
            mid = 'HT-' + Math.random().toString(36).substring(2, 10).toUpperCase() + '-' + Date.now().toString(36).toUpperCase();
            this.store.set('machineId', mid);
        }

        const lk = this.store.get('licenseKey');
        const expected = this.genLK(mid);

        if (lk === expected) {
            this.init();
        } else {
            this.renderLicenseScreen(mid);
        }
    }

    genLK(mid) {
        // Reverse string + salt
        return mid.split('').reverse().join('') + '-SYS77';
    }

    showToast(msg, type = 'info') {
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        t.innerText = msg;
        container.appendChild(t);
        setTimeout(() => {
            t.style.opacity = '0';
            t.style.transform = 'translateX(100%)';
            t.style.transition = '0.3s';
            setTimeout(() => t.remove(), 300);
        }, 3000);
    }

    renderLicenseScreen(mid) {
        document.body.innerHTML = `
            <div class="login-container">
                <div class="login-card" style="width:400px;">
                    <h2 style="font-family:'Outfit';">LİSANS GEREKLİ</h2>
                    <p style="color:var(--text-dim); margin-bottom:20px; font-size:14px;">Bu cihaz için aktivasyon yapılması gerekmektedir.</p>
                    
                    <div style="background:var(--bg-input); padding:15px; border-radius:8px; margin-bottom:20px; text-align:left;">
                        <label style="font-size:11px; color:var(--text-dim);">Cihaz Kimliği (Machine ID):</label>
                        <div style="font-family:monospace; color:var(--accent-color); word-break:break-all; margin-top:5px; font-size:13px;">${mid}</div>
                    </div>

                    <form id="licForm">
                        <input type="text" id="licInput" placeholder="Lisans Anahtarı" required style="width:100%; padding:12px; margin-bottom:20px; background:var(--bg-input); border:1px solid var(--border-color); color:white; border-radius:8px; outline:none;">
                        <button type="submit" class="btn-primary" style="width:100%;">Sistemi Etkinleştir</button>
                    </form>
                    <p style="margin-top:20px; font-size:11px; color:var(--text-dim); line-height:1.4;">
                        * Uygulama dosyaları kopyalandığında veya farklı cihazda çalıştırıldığında yeni bir anahtar gerekir.
                    </p>
                </div>
            </div>
        `;
        document.getElementById('licForm').onsubmit = (e) => {
            e.preventDefault();
            const val = document.getElementById('licInput').value.trim();
            if (val === this.genLK(mid)) {
                this.store.set('licenseKey', val);

                // Alert yerine inline mesaj göstererek donmayı engelliyoruz
                const card = document.querySelector('.login-card');
                if (card) {
                    card.innerHTML = `
                        <div style="padding:40px; text-align:center;">
                            <div style="font-size:40px; margin-bottom:20px;">✅</div>
                            <h2 style="margin-bottom:10px;">Etkinleştirildi!</h2>
                            <p style="color:var(--text-dim);">Uygulama başlatılıyor, lütfen bekleyin...</p>
                        </div>
                    `;
                }

                setTimeout(() => {
                    this.init();
                }, 1500);
            } else {
                this.showToast('Hatalı lisans anahtarı! Lütfen yönetici ile iletişime geçin.', 'error');
            }
        };
    }

    resetLicense() {
        if (confirm('DİKKAT! Lisans anahtarı silinecek ve uygulama aktivasyon ekranına dönecektir.\n\nDevam etmek istiyor musunuz?')) {
            this.store.set('licenseKey', null);
            location.reload();
        }
    }

    showInputModal(title, defaultValue, cb, allowEmpty = false, maxLength = null) {
        const ov = document.getElementById('modalOverlay');
        ov.classList.remove('hidden');
        ov.innerHTML = `
            <div class="modal-content" style="max-width:350px;">
                <h2 style="margin-bottom:15px;">${title}</h2>
                <div class="form-group">
                    <input type="text" id="modalInp" value="${defaultValue || ''}" ${maxLength ? `maxlength="${maxLength}"` : ''} style="width:100%; padding:10px; background:var(--bg-input); border:1px solid var(--border-color); color:white; border-radius:6px;">
                </div>
                <div style="display:flex; gap:10px; margin-top:20px;">
                    <button class="btn-primary" id="modalConfirm" style="flex:1;">Tamam</button>
                    <button class="btn-text" onclick="app.closeModal()" style="flex:1;">İptal</button>
                </div>
            </div>
        `;
        const inp = document.getElementById('modalInp');
        inp.focus();
        inp.select();

        document.getElementById('modalConfirm').onclick = () => {
            const val = inp.value.trim();
            this.closeModal();
            if (val || allowEmpty) cb(val);
        };

        inp.onkeyup = (e) => {
            if (e.key === 'Enter') document.getElementById('modalConfirm').click();
            if (e.key === 'Escape') this.closeModal();
        };
    }

    init() {
        const session = sessionStorage.getItem('ht_session');
        if (session) {
            try {
                this.user = JSON.parse(session);
                this.showView('main');
            } catch (e) {
                this.showLogin();
            }
        } else {
            this.showLogin();
        }
    }

    showLogin() {
        this.user = null;
        sessionStorage.removeItem('ht_session');

        document.body.innerHTML = `
            <div class="login-container">
                <div class="login-card">
                    <h1 style="font-family:'Outfit'; margin-bottom:10px;">HESAP TAKİP</h1>
                    <p style="color:var(--text-dim); margin-bottom:25px;">Sisteme giriş yapınız</p>
                    <form id="loginForm">
                        <input type="text" id="username" placeholder="Kullanıcı Adı" required 
                            autocomplete="off" autofocus
                            style="width:100%; padding:12px; margin-bottom:15px; background:var(--bg-input); border:1px solid var(--border-color); color:white; border-radius:8px;">
                        <input type="password" id="password" placeholder="Parola" required 
                            autocomplete="off"
                            style="width:100%; padding:12px; margin-bottom:20px; background:var(--bg-input); border:1px solid var(--border-color); color:white; border-radius:8px;">
                        <button type="submit" class="btn-primary" style="width:100%;">Giriş Yap</button>
                    </form>
                </div>
            </div>
        `;

        // Giriş alanına otomatik odaklan
        setTimeout(() => {
            const userIn = document.getElementById('username');
            if (userIn) {
                userIn.focus();
                userIn.click(); // Bazı Electron sürümlerinde etkileşimi tetikler
            }
        }, 500);

        const form = document.getElementById('loginForm');
        if (form) {
            form.onsubmit = (e) => {
                e.preventDefault();
                const u = document.getElementById('username').value.trim();
                const p = document.getElementById('password').value.trim();
                const users = this.store.get('users') || [];
                const user = users.find(x => x.name.toLowerCase() === u.toLowerCase() && x.pass === p);

                if (user) {
                    this.user = user;
                    sessionStorage.setItem('ht_session', JSON.stringify(user));
                    this.showView('main');
                } else {
                    this.showToast('Hatalı kullanıcı adı veya parola!', 'error');
                }
            };
        }
    }

    showView(view) {
        const perms = this.cache.permissions[this.user.role] || [];
        if (!perms.includes(view) && view !== 'main') {
            this.showToast('Bu sayfaya erişim yetkiniz yok!', 'error');
            return;
        }
        this.currentView = view;
        this.renderBase();
        if (view === 'main') this.renderMain();
        else if (view === 'personnel') this.renderPersonnel();
        else if (view === 'settings') this.renderSettings();
        else if (view === 'finance') this.renderFinance();
        else if (view === 'users') this.renderUsers();
        else if (view === 'definitions') this.renderDefinitions();
        else if (view === 'permissions') this.renderPermissions();
        else if (view === 'customers') this.renderCustomers();
        else if (view === 'actionLogs') this.renderActionLogs();
    }

    renderBase() {
        const isAdmin = this.user.role === 'admin';
        document.body.innerHTML = `
            <div id="app">
                <header class="announcement-bar">
                    <div class="announcement-content">
                        <span class="badge">DUYURU</span>
                        <marquee>${this.cache.announcements.join(' | ') || 'Hoş geldiniz'}</marquee>
                    </div>
                    <div class="user-info">
                        <span id="headerClock" style="font-weight:bold; color:var(--accent-color); margin-right:8px; border-right:1px solid var(--border-color); padding-right:8px;"></span>
                        <span>${this.user.name}</span>
                        <button class="btn-icon" id="logoutBtn">🚪</button>
                    </div>
                </header>
                <nav class="sub-nav">
                    <div class="nav-links">
                        ${this.cache.permissions[this.user.role].includes('main') ? `<button class="${this.currentView === 'main' ? 'active' : ''}" onclick="app.showView('main')">Ön Panel</button>` : ''}
                        ${this.cache.permissions[this.user.role].includes('finance') ? `<button class="${this.currentView === 'finance' ? 'active' : ''}" onclick="app.showView('finance')">Hesap Detay</button>` : ''}
                        ${this.cache.permissions[this.user.role].includes('personnel') ? `<button class="${this.currentView === 'personnel' ? 'active' : ''}" onclick="app.showView('personnel')">Personeller</button>` : ''}
                        ${this.cache.permissions[this.user.role].includes('customers') ? `<button class="${this.currentView === 'customers' ? 'active' : ''}" onclick="app.showView('customers')">Müşteriler</button>` : ''}
                        
                        <div class="dropdown">
                            <button class="${['users', 'definitions', 'permissions', 'settings', 'actionLogs'].includes(this.currentView) ? 'active' : ''}">Yönetim ▾</button>
                            <div class="dropdown-content">
                                ${this.cache.permissions[this.user.role].includes('users') ? `<button onclick="app.showView('users')">Kullanıcılar</button>` : ''}
                                ${this.cache.permissions[this.user.role].includes('definitions') ? `<button onclick="app.showView('definitions')">Tanımlamalar</button>` : ''}
                                ${this.cache.permissions[this.user.role].includes('permissions') ? `<button onclick="app.showView('permissions')">Yetkiler</button>` : ''}
                                ${this.cache.permissions[this.user.role].includes('actionLogs') ? `<button onclick="app.showView('actionLogs')">İşlem Kayıtları</button>` : ''}
                                ${this.cache.permissions[this.user.role].includes('settings') ? `<button onclick="app.showView('settings')">Ayarlar</button>` : ''}
                                <button onclick="app.backupData()">Yedek Al</button>
                                ${isAdmin ? `<button onclick="app.restoreData()">Yedekten Geri Yükle</button>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="nav-controls" id="navControls"></div>
                </nav>
                <div class="main-layout" id="mainContent"></div>
            </div>
            <div id="modalOverlay" class="modal-overlay hidden" onclick="if(event.target === this) app.closeModal()"></div>
        `;
        const logout = document.getElementById('logoutBtn');
        if (logout) logout.onclick = () => { this.showLogin(); };

        // Start Clock
        this.updateClock();
        setInterval(() => this.updateClock(), 1000);
    }

    updateClock() {
        const el = document.getElementById('headerClock');
        const now = new Date();
        if (el) {
            el.innerText = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
        
        // Update Session Status Live
        if (this.currentView === 'main' && this.currentDate === this.getBusinessDate()) {
            const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
            const dayRecords = this.cache.records[this.currentDate] || [];
            const isClosed = this.cache.closedDays.includes(this.currentDate);
            const historicalLeaves = this.cache.leaves[this.currentDate] || [];
            const dayNamesShort = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
            const currentDayName = dayNamesShort[now.getDay()];

            this.cache.personnel.forEach(p => {
                const statusCell = document.getElementById(`statusCell_${p.id}`);
                if (statusCell) {
                    const isWeeklyLeaveMatch = p.weeklyLeaves && p.weeklyLeaves.includes(currentDayName);
                    const isOff = isClosed ? (historicalLeaves.some(lid => lid == p.id)) : (p.status === 'izinli' && isWeeklyLeaveMatch);
                    
                    if (!isOff) {
                        const pRecords = dayRecords.filter(r => r.personnelId == p.id && r.startTime && r.endTime);
                        
                        let inSession = false;
                        const currentMin = this.timeToMinutes(currentTime);
                        inSession = pRecords.some(r => {
                            const sMin = this.timeToMinutes(r.startTime);
                            const eMin = this.timeToMinutes(r.endTime);
                            return currentMin >= sMin && currentMin <= eMin;
                        });

                        if (inSession) {
                            statusCell.innerHTML = '<div style="color:#ef4444; font-weight:900; font-size:9.5px; letter-spacing:0.3px;">SEANSTA</div>';
                        } else {
                            let isWorkingHours = false;
                            const t1s = this.timeToMinutes(p.shiftStart), t1e = this.timeToMinutes(p.shiftEnd);
                            const t2s = this.timeToMinutes(p.shiftStart2), t2e = this.timeToMinutes(p.shiftEnd2);
                            
                            const hasS1 = t1s >= 0 && t1e >= 0;
                            const hasS2 = t2s >= 0 && t2e >= 0;

                            if (hasS1 || hasS2) {
                                const inS1 = hasS1 ? (currentMin >= t1s && currentMin <= t1e) : false;
                                const inS2 = hasS2 ? (currentMin >= t2s && currentMin <= t2e) : false;
                                isWorkingHours = inS1 || inS2;
                            }
                            
                            if (isWorkingHours) {
                                statusCell.innerHTML = '<div style="color:#10b981; font-weight:900; font-size:9px;">MESA\u0130DE</div>';
                            } else {
                                statusCell.innerHTML = '<div style="color:#94a3b8; font-weight:900; font-size:9px;">MESA\u0130 DI\u015eI</div>';
                            }
                        }
                    }
                }
            });
        }
    }

    renderMain() {
        const isAdmin = this.user.role === 'admin';
        const isClosed = this.cache.closedDays.includes(this.currentDate);

        const nc = document.getElementById('navControls');
        if (nc) {
            nc.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <div class="search-box">
                        <input type="text" id="gridSearch" placeholder="Müşteri ara..." 
                            value="${this.searchQuery}" 
                            style="padding: 5px 12px; height: 32px; background: var(--bg-input); border: 1px solid var(--border-color); color: white; border-radius: 6px; font-size: 13px; width: 140px;">
                    </div>
                    <div class="date-navigator">
                        <button class="btn-nav" onclick="app.changeDate(-1)">◀</button>
                        <input type="date" id="dateIn" class="input-date" value="${this.currentDate}" style="padding: 5px; height: 32px;">
                        <button class="btn-nav" onclick="app.changeDate(1)">▶</button>
                    </div>
                </div>
                <div>
                    ${isClosed ?
                    (isAdmin ? `<button class="btn-primary" onclick="app.reOpenDay()" style="padding: 6px 15px; background:#f59e0b;">Günü Yeniden Aç</button>` : '<span class="closed-badge">GÜN KAPALI</span>')
                    : (this.currentDate === this.getBusinessDate() ?
                        (this.cache.activeShift === this.currentDate ?
                            `<button class="btn-primary" onclick="app.closeDay()" style="padding: 6px 15px; background:var(--danger-color)">❌ Günü Kapat</button>` :
                            `<button class="btn-primary" onclick="app.startDay()" style="padding: 6px 15px; background:#10b981;">🚀 Günü Başlat</button>`)
                        : (isAdmin ? 
                            (this.cache.activeShift === this.currentDate ? 
                                `<button class="btn-primary" onclick="app.closeDay()" style="padding: 6px 15px; background:var(--danger-color)">❌ Günü Kapat</button>` :
                                `<button class="btn-primary" onclick="app.startDay()" style="padding: 6px 15px; background:#10b981;">🚀 Günü Başlat</button>`)
                            : '<span class="closed-badge" style="background:#64748b;">EYLEM YOK</span>')
                    )
                }
                </div>
            `;
        }

        document.getElementById('mainContent').innerHTML = `
            <section class="table-container" style="padding: 5px;">
                <div class="excel-wrapper">
                    <table class="excel-table">
                        <thead id="hRow"></thead>
                        <tbody id="bRow"></tbody>
                        <tfoot id="fRow"></tfoot>
                    </table>
                </div>
            </section>
            <aside class="side-panel">
                <div class="todo-section" style="margin-top:20px; border-top: 1px solid var(--border-color); padding-top: 15px;">
                    <h3 style="color:#6366f1;">
                        <span class="editable-title" onclick="app.editPanelTitle('extra')">${this.cache.panelTitles.extra || 'EXTRA'}</span>
                        <button class="btn-mini" onclick="app.addTodo('extra')" style="background:var(--accent-color);">+</button>
                    </h3>
                    <div id="eList" style="min-height: 50px;"></div>
                </div>
                <div class="todo-section" style="margin-top:20px; border-top: 1px solid var(--border-color); padding-top: 15px;">
                    <h3 style="color:#f59e0b;">BEKLEYEN KAYITLAR</h3>
                    <div id="wList" style="min-height: 100px; max-height:480px; overflow-y:auto; overflow-x:hidden; background:rgba(0,0,0,0.01); border-radius:8px; padding:5px;"></div>
                </div>
                <div class="todo-section" style="margin-top:20px">
                    <h3>
                        <span class="editable-title" onclick="app.editPanelTitle('remaining')">${this.cache.panelTitles.remaining}</span>
                        <button class="btn-mini" onclick="app.addTodo('remaining')">+</button>
                    </h3>
                    <div id="rList"></div>
                </div>
            </aside>
        `;

        const dateIn = document.getElementById('dateIn');
        if (dateIn) {
            dateIn.onchange = (e) => { this.currentDate = e.target.value; this.renderMain(); };
        }

        const gSearch = document.getElementById('gridSearch');
        if (gSearch) {
            gSearch.oninput = (e) => {
                this.searchQuery = e.target.value.toLocaleLowerCase('tr-TR');
                this.renderGrid();
            };
        }
        this.renderGrid();
    }

    renderGrid() {
        const isAdmin = this.user.role === 'admin';
        const isClosed = this.cache.closedDays.includes(this.currentDate);
        const isActive = this.cache.activeShift === this.currentDate;
        // CRITICAL: canEdit MUST require explicit isActive (started by user)
        // Admin bypass removed to enforce "Start Day" or "Re-open Day" rule
        const canEdit = isActive && !isClosed;
        const dateLeaves = this.cache.leaves[this.currentDate] || [];

        const h = document.getElementById('hRow');
        const b = document.getElementById('bRow');
        const activeP = this.cache.personnel
            .filter(p => p.status === 'active' || p.status === 'izinli')
            .sort((a, b) => (a.alias || a.name).localeCompare(b.alias || b.name, 'tr-TR'));
        const historicalLeaves = this.cache.leaves[this.currentDate] || [];

        const isToday = this.currentDate === this.getBusinessDate();
        const dayNames = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
        const todayName = dayNames[new Date().getDay()];
        const currentTime = new Date().getHours().toString().padStart(2, '0') + ':' + new Date().getMinutes().toString().padStart(2, '0');

        h.innerHTML = `
            <tr style="height:24px;">
                <th class="sticky-col" style="background:#f8fafc; border-bottom:none;"></th>
                ${activeP.map(p => {
                    const [y, m, d] = this.currentDate.split('-').map(Number);
                    const dObj = new Date(y, m - 1, d);
                    const dayNamesShort = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
                    const currentDayName = dayNamesShort[dObj.getDay()];
                    
                    const isWeeklyLeaveMatch = p.weeklyLeaves && p.weeklyLeaves.includes(currentDayName);
                    
                    const isOff = isClosed 
                        ? (historicalLeaves.some(lid => lid == p.id)) 
                        : (p.status === 'izinli' && isWeeklyLeaveMatch);

                    const bgColor = isOff ? '#cbd5e1' : '#ffffff';
                    
                    let statusHtml = '';
                    
                    if (isOff) {
                        statusHtml = '<div style="color:#b91c1c; font-weight:900; font-size:9px; letter-spacing:0.5px;">\u0130Z\u0130NL\u0130</div>';
                    } else {
                        const dayRecords = this.cache.records[this.currentDate] || [];
                        const pRecords = dayRecords.filter(r => r.personnelId == p.id && r.startTime && r.endTime);
                        let inSession = false;
                        if (isToday) {
                            const currentMin = this.timeToMinutes(currentTime);
                            inSession = pRecords.some(r => {
                                const sMin = this.timeToMinutes(r.startTime);
                                const eMin = this.timeToMinutes(r.endTime);
                                return currentMin >= sMin && currentMin <= eMin;
                            });
                        }
                        
                        if (inSession) {
                            statusHtml = '<div style="color:#ef4444; font-weight:900; font-size:9.5px; letter-spacing:0.3px;">SEANSTA</div>';
                        } else if (isToday) {
                            let isWorkingHours = false;
                            const currentMin = this.timeToMinutes(currentTime);
                            const t1s = this.timeToMinutes(p.shiftStart), t1e = this.timeToMinutes(p.shiftEnd);
                            const t2s = this.timeToMinutes(p.shiftStart2), t2e = this.timeToMinutes(p.shiftEnd2);
                            
                            const hasS1 = t1s >= 0 && t1e >= 0;
                            const hasS2 = t2s >= 0 && t2e >= 0;

                            if (hasS1 || hasS2) {
                                const inS1 = hasS1 ? (currentMin >= t1s && currentMin <= t1e) : false;
                                const inS2 = hasS2 ? (currentMin >= t2s && currentMin <= t2e) : false;
                                isWorkingHours = inS1 || inS2;
                            }
                            
                            if (isWorkingHours) {
                                statusHtml = '<div style="color:#10b981; font-weight:900; font-size:9px;">MESA\u0130DE</div>';
                            } else {
                                statusHtml = '<div style="color:#94a3b8; font-weight:900; font-size:9px;">MESA\u0130 DI\u015eI</div>';
                            }
                        } else {
                            // Show general status for non-today dates
                            statusHtml = `<div style="color:var(--text-dim); font-size:9px; font-weight:bold;">${p.status === 'active' ? 'AKT\u0130F' : 'PAS\u0130F'}</div>`;
                        }
                    }
                    
                    return `<th id="statusCell_${p.id}" style="background:${bgColor}; border-top:1px solid var(--border-color); border-bottom:none; padding:0; vertical-align:middle; text-align:center;">${statusHtml}</th>`;
                }).join('')}
                <th style="background:var(--bg-nav); border-top:1px solid var(--border-color); border-bottom:none;"></th>
            </tr>
            <tr style="height:28px;">
                <th class="sticky-col" style="height:28px; top:24px; z-index:13;">#</th>
                ${activeP.map(p => {
                    const [y, m, d] = this.currentDate.split('-').map(Number);
                    const dObj = new Date(y, m - 1, d);
                    const dayNamesShort = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
                    const currentDayName = dayNamesShort[dObj.getDay()];
                    const isWeeklyLeaveMatch = p.weeklyLeaves && p.weeklyLeaves.includes(currentDayName);

                    const isOff = isClosed 
                        ? (historicalLeaves.some(lid => lid == p.id)) 
                        : (p.status === 'izinli' && isWeeklyLeaveMatch);
                    const hasNote = this.cache.personNotes[p.id];
                    const color = isOff ? '#cbd5e1' : (p.color || '#ffffff');
                    const displayName = p.alias || p.name;
                    return `<th 
                        class="excel-header-cell ${hasNote ? 'has-person-note' : ''}" 
                        style="position:sticky; top:24px; z-index:11; cursor:pointer; background:${color}; color:${isOff ? '#475569' : 'var(--text-main)'}; border-top: 1px solid var(--border-color); height:28px; padding:0;"
                        onclick="app.showPersonNoteModal('${p.id}')"
                        title="${hasNote ? 'Not: ' + hasNote.replace(/"/g, '&quot;') : 'Not/Renk/Durum eklemek i\u00e7in t\u0131klay\u0131n'}"
                    >
                        <div style="line-height:1.1; padding-top:1px; font-size:10.5px;">${displayName}</div>
                    </th>`;
                }).join('')}
                <th style="background:var(--bg-nav); height:28px; position:sticky; top:24px; z-index:11;">GENEL</th>
            </tr>
        `;

        b.innerHTML = '';
        const totals = activeP.map(() => 0);
        const vatTotals = activeP.map(() => 0);
        const count = this.cache.settings.rowCount || 25;

        for (let i = 0; i < count; i++) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td class="sticky-col row-label">${(i + 1).toString().padStart(2, '0')}</td>`;
            activeP.forEach((p, idx) => {
                const currentD = new Date(this.currentDate);
                const dayNamesShort = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
                const currentDayName = dayNamesShort[currentD.getDay()];
                const isWeeklyLeaveMatch = p.weeklyLeaves && p.weeklyLeaves.includes(currentDayName);

                const td = document.createElement('td');
                td.className = 'excel-cell';
                const rec = (this.cache.records[this.currentDate] || []).find(r => r.personnelId == p.id && r.rowIndex === i);
                
                const isOff = isClosed 
                    ? (historicalLeaves.some(lid => lid == p.id)) 
                    : (p.status === 'izinli' && isWeeklyLeaveMatch);
                
                if (isOff) td.style.backgroundColor = '#f1f5f9';

                if (rec) {
                    const totalRate = (this.cache.settings.vat || 0) + (this.cache.settings.reklam || 0);
                    const net = rec.amount / (1 + totalRate / 100);
                    td.innerText = this.formatNum(net);
                    
                    if (rec.color && rec.color !== '#ffffff') {
                        td.style.backgroundColor = isOff ? '#f1f5f9' : `rgba(${this.hexToRgb(rec.color)}, 0.4)`;
                    } else if (isOff) {
                        td.style.backgroundColor = '#f1f5f9';
                    }

                    // Search Highlight (Turkish Locale Aware)
                    if (this.searchQuery && (rec.name.toLocaleLowerCase('tr-TR').includes(this.searchQuery) || (rec.desc && rec.desc.toLocaleLowerCase('tr-TR').includes(this.searchQuery)))) {
                        td.style.backgroundColor = '#fde68a'; // Light amber background
                        td.style.boxShadow = 'inset 0 0 0 1px #f59e0b'; // Amber border
                        td.style.fontWeight = 'bold';
                        td.style.color = '#000';
                    }

                    td.classList.add('has-comment');
                    td.title = `${rec.name}${rec.desc ? ' - ' + rec.desc : ''}`;
                    totals[idx] += rec.amount;
                    vatTotals[idx] += (rec.amount - net);
                }
                if (canEdit) {
                    td.onclick = () => this.showRecordModal(p.id, i, rec);
                    td.ondragover = (e) => e.preventDefault();
                    td.ondragenter = (e) => { e.preventDefault(); td.classList.add('drag-over'); };
                    td.ondragleave = () => td.classList.remove('drag-over');
                    td.ondrop = (e) => { td.classList.remove('drag-over'); this.onWaitingDrop(e, p.id, i); };
                }
                tr.appendChild(td);
            });
            tr.appendChild(document.createElement('td')); // Alignment cell for GENEL column
            b.appendChild(tr);
        }

        this.renderFooter(totals, vatTotals, activeP, canEdit);
        this.renderTodos();
    }

    openDailyNote(pid) {
        const isAdmin = this.user.role === 'admin';
        const isClosed = this.cache.closedDays.includes(this.currentDate);
        const isActive = this.cache.activeShift === this.currentDate;
        const canEdit = isAdmin || (isActive && !isClosed);
        if (!canEdit) return;

        const dayNotes = this.cache.dailyNotes[this.currentDate] || {};
        const currentNote = dayNotes[pid] || '';

        this.showInputModal('\u015eahsa \u00d6zel G\u00fcnl\u00fck Not / A\u00e7\u0131klama', currentNote, (val) => {
            const notes = this.cache.dailyNotes[this.currentDate] || {};
            if (val.trim()) {
                notes[pid] = val.trim().toLocaleUpperCase('tr-TR');
            } else {
                delete notes[pid];
            }
            this.cache.dailyNotes[this.currentDate] = notes;
            this.store.set('dailyNotes', this.cache.dailyNotes);
            this.renderGrid();
        }, true);
    }

    renderFooter(totals, vatTotals, activeP, canEdit) {
        const f = document.getElementById('fRow');
        if (!f) return;
        const totalSum = totals.reduce((a, b) => a + b, 0);

        // Commission Based on Fatura Kalan
        const vRate = this.cache.settings.vat;
        const cRate = this.cache.settings.commission;
        const rRate = this.cache.settings.reklam || 0;

        let totalVat = 0;
        let totalRek = 0;
        let totalFatura = 0;
        let totalComm = 0;

        totals.forEach(t => {
            const totalRate = (vRate || 0) + (rRate || 0);
            const fAmt = t / (1 + totalRate / 100); // Matrah (Fatura Kalan)
            const vAmt = t - fAmt; // Toplam Kesinti (KDV + Reklam)
            const cAmt = fAmt * cRate / 100;
            
            totalVat += vAmt;
            totalFatura += fAmt;
            totalComm += cAmt;
        });

        f.innerHTML = `
            <tr class="row-total">
                <td class="sticky-col">TOPLAM (BRÜT)</td>
                ${totals.map(t => `<td>${this.formatNum(t)}</td>`).join('')}
                <td style="background:var(--accent-color); color:white; font-weight:bold;">${this.formatNum(totalSum)}</td>
            </tr>
            <tr class="row-vat" style="background:rgba(245, 158, 11, 0.1);">
                <td class="sticky-col">KDV + REKLAM Kesintisi</td>
                ${totals.map(t => {
                    const totalRate = (vRate || 0) + (rRate || 0);
                    const matrah = t / (1 + totalRate / 100);
                    return `<td>${this.formatNum(t - matrah)}</td>`;
                }).join('')}
                <td style="font-weight:bold; background:var(--bg-input);">${this.formatNum(totalVat)}</td>
            </tr>
            <tr class="row-vat" style="background:rgba(16, 185, 129, 0.1);">
                <td class="sticky-col">FATURA (MATRAH)</td>
                ${totals.map(t => {
                    const totalRate = (vRate || 0) + (rRate || 0);
                    return `<td>${this.formatNum(t / (1 + totalRate / 100))}</td>`;
                }).join('')}
                <td style="font-weight:bold; background:var(--bg-input);">${this.formatNum(totalFatura)}</td>
            </tr>
            <tr class="row-commission" style="background:rgba(99, 102, 241, 0.1);">
                <td class="sticky-col">KOMİSYON (%${cRate})</td>
                ${totals.map(t => {
                    const totalRate = (vRate || 0) + (rRate || 0);
                    const matrah = t / (1 + totalRate / 100);
                    return `<td>${this.formatNum(matrah * cRate / 100)}</td>`;
                }).join('')}
                <td style="font-weight:bold; background:var(--bg-input);">${this.formatNum(totalComm)}</td>
            </tr>
            <tr class="row-lists" style="height:24px;">
                <td class="sticky-col" style="font-size:10px; color:var(--text-dim); text-align:right; padding-right:5px;">LİSTELER</td>
                ${activeP ? activeP.map(p => {
                    const state = this.cache.lists[this.currentDate]?.[p.id] || { c1: false, c2: false };
                    const os1 = canEdit ? `onclick="app.toggleListCheck('${p.id}', 1)"` : '';
                    const os2 = canEdit ? `onclick="app.toggleListCheck('${p.id}', 2)"` : '';
                    return `<td style="text-align:center; padding:0; vertical-align:middle; background:var(--bg-card); border-top:1px solid var(--border-color);">
                        <span class="list-check left-check ${state.c1 ? 'active' : ''} ${!canEdit ? 'disabled' : ''}" ${os1} title="Liste 1">✅</span>
                        <span style="display:inline-block; margin:0 2px; color:var(--text-dim); font-size:9px; opacity:0.4;">-</span>
                        <span class="list-check right-check ${state.c2 ? 'active' : ''} ${!canEdit ? 'disabled' : ''}" ${os2} title="Liste 2">✅</span>
                    </td>`;
                }).join('') : totals.map(() => `<td></td>`).join('')}
                <td style="background:var(--bg-nav); border-top:1px solid var(--border-color);"></td>
            </tr>
            <tr class="row-daily-notes" style="height:24px; line-height:24px; overflow:hidden;">
                <td class="sticky-col row-label" style="background:#f1f5f9; font-weight:900; font-size:9px; color:var(--primary-color);">NOT</td>
                ${activeP.map(p => {
                    const dayNotesObj = this.cache.dailyNotes[this.currentDate] || {};
                    const noteContent = dayNotesObj[p.id] || '';
                    return `<td class="excel-cell" style="background:#fdf2f2; cursor:pointer; padding:0; vertical-align:middle; width:40px; max-width:40px;" onclick="app.openDailyNote('${p.id}')">
                        <div style="font-size:10px; color:#475569; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; width:100%; height:24px; line-height:24px; padding:0 3px; font-weight:500;" title="${noteContent}">
                            ${noteContent}
                        </div>
                    </td>`;
                }).join('')}
                <td style="background:var(--bg-nav); border-top:1px solid var(--border-color);"></td>
            </tr>
        `;
    }

    toggleListCheck(pid, idx) {
        if (!this.cache.lists[this.currentDate]) this.cache.lists[this.currentDate] = {};
        if (!this.cache.lists[this.currentDate][pid]) this.cache.lists[this.currentDate][pid] = { c1: false, c2: false };
        
        const state = this.cache.lists[this.currentDate][pid];
        const key = 'c' + idx;
        state[key] = !state[key];
        
        this.store.set('lists', this.cache.lists);
        this.logAction(`Liste Onayı Güncellendi: Personel ID ${pid}, Liste ${idx}, ${state[key] ? 'İşaretlendi' : 'Kaldırıldı'}`);
        this.updateListCheckUI(pid, idx, state);
    }

    updateListCheckUI(pid, idx, state) {
        const row = document.querySelector('.row-lists');
        if (!row) return;
        const cells = row.querySelectorAll('td');
        const activeP = this.cache.personnel
            .filter(p => p.status === 'active' || p.status === 'izinli')
            .sort((a, b) => (a.alias || a.name).localeCompare(b.alias || b.name, 'tr-TR'));
        const pIdx = activeP.findIndex(p => p.id == pid);
        if (pIdx < 0) return;
        const cell = cells[pIdx + 1]; // +1 çünkü ilk td sticky-col
        if (!cell) return;
        const checks = cell.querySelectorAll('.list-check');
        const target = checks[idx - 1]; // idx 1 veya 2
        if (!target) return;
        if (state['c' + idx]) {
            target.classList.add('active');
        } else {
            target.classList.remove('active');
        }
    }

    renderPersonnel() {
        const activeCount = this.cache.personnel.filter(p => p.status === 'active').length;
        const izinliCount = this.cache.personnel.filter(p => p.status === 'izinli').length;
        const passiveCount = this.cache.personnel.filter(p => p.status === 'pasif').length;

        document.getElementById('mainContent').innerHTML = `
            <div class="admin-view">
                <div class="stats-grid" style="margin-bottom:20px;">
                    <div class="stat-card" style="border-bottom:4px solid var(--accent-color); padding:15px;">
                        <h3 style="font-size:13px; margin-bottom:5px;">Personel Toplam Bakiye</h3>
                        <p style="font-size:22px; margin:0;">
                            ${(() => {
                let totalBal = 0;
                this.cache.personnel.forEach(p => {
                    const ledger = this.cache.ledgers[p.id] || [];
                    const ear = ledger.filter(l => l.type === 'commission').reduce((s, l) => s + l.amount, 0);
                    const pay = ledger.filter(l => l.type === 'payment').reduce((s, l) => s + l.amount, 0);
                    totalBal += (ear - pay);
                });
                return this.formatNum(totalBal);
            })()} TL
                        </p>
                        <small style="color:var(--text-dim); font-size:11px;">(Tüm personellerin net alacağı)</small>
                    </div>
                </div>

                <div class="admin-header" style="flex-direction:column; align-items:flex-start; gap:15px;">
                    <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                        <h2>Personel Y\u00f6netimi</h2>
                        <div style="display:flex; gap:10px;">
                            <input type="text" id="pSearch" placeholder="Personel ara..." style="padding: 6px 12px; height: 32px; background: var(--bg-input); border: 1px solid var(--border-color); color: white; border-radius: 6px; font-size: 13px;">
                            <button class="btn-primary" onclick="app.showPersonnelModal()">+ Yeni Personel Ekle</button>
                        </div>
                    </div>
                    <div class="filter-bar" style="display:flex; gap:10px; margin-top:5px;">
                        <button class="btn-filter ${this.pFilter === 'active' ? 'active' : ''}" onclick="app.setPersonnelFilter('active')">
                            Aktifler (${activeCount})
                        </button>
                        <button class="btn-filter ${this.pFilter === 'izinli' ? 'active' : ''}" onclick="app.setPersonnelFilter('izinli')">
                            \u0130zinliler (${izinliCount})
                        </button>
                        <button class="btn-filter ${this.pFilter === 'pasif' ? 'active' : ''}" onclick="app.setPersonnelFilter('pasif')">
                            Pasifler (${passiveCount})
                        </button>
                    </div>
                </div>
                    <table class="excel-table" style="width:100%;">
                        <thead>
                            <tr>
                                <th style="text-align:left; padding-left:15px;">Ad Soyad</th>
                                <th>Kullan\u0131c\u0131 Ad\u0131</th>
                                <th>Bakiye</th>
                                <th>TC Kimlik No</th>
                                <th>Telefon</th>
                                <th>Durum</th>
                                <th style="width:160px;">\u0130\u015flem</th>
                            </tr>
                        </thead>
                        <tbody id="pTableBody">
                            ${this.cache.personnel
                .filter(p => p.status === this.pFilter)
                .sort((a, b) => (a.alias || a.name).localeCompare(b.alias || b.name, 'tr-TR'))
                .map(p => `
                                <tr>
                                    <td style="text-align:left; padding-left:15px; font-weight:500;">${p.name}</td>
                                    <td style="color:var(--primary-color); font-weight:600;">${p.alias || '-'}</td>
                                    <td style="font-weight:600; color:var(--accent-color);">
                                        ${(() => {
                        const ledger = this.cache.ledgers[p.id] || [];
                        const ear = ledger.filter(l => l.type === 'commission').reduce((s, l) => s + l.amount, 0);
                        const pay = ledger.filter(l => l.type === 'payment').reduce((s, l) => s + l.amount, 0);
                        return this.formatNum(ear - pay);
                    })()} TL
                                    </td>
                                    <td>${p.tc || '-'}</td>
                                    <td>${p.phone || '-'}</td>
                                    <td><span class="badge-${p.status}">${p.status.toUpperCase()}</span></td>
                                    <td>
                                        <button class="btn-mini" onclick="app.showLedgerModal(${p.id})">Cari</button>
                                        <button class="btn-mini" onclick="app.showPersonnelModal(${p.id})">D\u00fczenle</button>
                                    </td>
                                </tr>
                            `).join('')}
                            ${this.cache.personnel.filter(p => p.status === this.pFilter).length === 0 ? '<tr><td colspan="7" style="padding:40px; color:var(--text-dim);">Bu listede personel bulunamad\u0131.</td></tr>' : ''}
                        </tbody>
                    </table>
                </div>
            </div>`;

            const pSearch = document.getElementById('pSearch');
            if (pSearch) {
                pSearch.oninput = (e) => {
                    const q = e.target.value.toLocaleLowerCase('tr-TR');
                    const rows = document.querySelectorAll('#pTableBody tr');
                    rows.forEach(row => {
                        const text = row.innerText.toLocaleLowerCase('tr-TR');
                        row.style.display = text.includes(q) ? '' : 'none';
                    });
                };
            }
    }

    setPersonnelFilter(filter) {
        this.pFilter = filter;
        this.renderPersonnel();
    }

    // ============ CUSTOMERS MODULE ============
    renderCustomers() {
        const activeCount = this.cache.customers.filter(c => c.status === 'active').length;
        const passiveCount = this.cache.customers.filter(c => c.status === 'pasif').length;

        // Calculate total balance from all customer ledgers and daily records
        let totalBal = 0;
        const customerRecordCharges = {};
        Object.keys(this.cache.records).forEach(date => {
            (this.cache.records[date] || []).forEach(rec => {
                if (!rec.amount) return;
                const cid = rec.customerId;
                if (cid) {
                    customerRecordCharges[cid] = (customerRecordCharges[cid] || 0) + rec.amount;
                } else if (rec.name) {
                    const lowName = rec.name.toLocaleLowerCase('tr-TR');
                    const c = this.cache.customers.find(cx => cx.name.toLocaleLowerCase('tr-TR') === lowName);
                    if (c) customerRecordCharges[c.id] = (customerRecordCharges[c.id] || 0) + rec.amount;
                }
            });
        });

        const customerBalances = {};
        this.cache.customers.forEach(c => {
            let cBal = customerRecordCharges[c.id] || 0;
            const ledger = this.cache.customerLedgers[c.id] || [];
            const charges = ledger.filter(l => l.type === 'charge').reduce((s, l) => s + l.amount, 0);
            const payments = ledger.filter(l => l.type === 'payment').reduce((s, l) => s + l.amount, 0);
            const finalBal = (cBal + charges - payments);
            customerBalances[c.id] = finalBal;
            totalBal += finalBal;
        });

        // Get last record for each customer from daily records
        const getLastRecord = (customerId) => {
            const customer = this.cache.customers.find(c => c.id === customerId);
            if (!customer) return null;
            let lastRec = null;
            const allDates = Object.keys(this.cache.records).sort().reverse();
            for (const date of allDates) {
                const rec = this.cache.records[date].find(r => r.customerId === customerId || (r.name && r.name.toLocaleLowerCase('tr-TR') === customer.name.toLocaleLowerCase('tr-TR')));
                if (rec) { lastRec = { ...rec, date }; break; }
            }
            return lastRec;
        };

        document.getElementById('mainContent').innerHTML = `
            <div class="admin-view">
                <div class="stats-grid" style="margin-bottom:20px;">
                    <div class="stat-card" style="border-bottom:4px solid #3b82f6; padding:15px;">
                        <h3 style="font-size:13px; margin-bottom:5px;">M\u00fc\u015fteri Toplam Bakiye</h3>
                        <p style="font-size:22px; margin:0;">${this.formatNum(totalBal)} TL</p>
                        <small style="color:var(--text-dim); font-size:11px;">(T\u00fcm m\u00fc\u015fterilerin net bor\u00e7 / alacak)</small>
                    </div>
                </div>

                <div class="admin-header" style="flex-direction:column; align-items:flex-start; gap:15px;">
                    <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                        <h2>M\u00fc\u015fteri Y\u00f6netimi</h2>
                        <div style="display:flex; gap:10px;">
                            <input type="text" id="cSearch" placeholder="M\u00fc\u015fteri ara..." style="padding: 6px 12px; height: 32px; background: var(--bg-input); border: 1px solid var(--border-color); color: white; border-radius: 6px; font-size: 13px;">
                            <button class="btn-primary" style="background:#8b5cf6;" onclick="app.showCustomerReport()">\ud83c\udfc6 Hizmet Raporu</button>
                            <button class="btn-primary" onclick="app.showCustomerModal()">+ Yeni M\u00fc\u015fteri Ekle</button>
                        </div>
                    </div>
                    <div class="filter-bar" style="display:flex; gap:10px; margin-top:5px;">
                        <button class="btn-filter ${this.cFilter === 'active' ? 'active' : ''}" onclick="app.setCustomerFilter('active')">
                            Aktifler (${activeCount})
                        </button>
                        <button class="btn-filter ${this.cFilter === 'pasif' ? 'active' : ''}" onclick="app.setCustomerFilter('pasif')">
                            Pasifler (${passiveCount})
                        </button>
                    </div>
                </div>
                    <table class="excel-table" style="width:100%;">
                        <thead>
                            <tr>
                                <th style="text-align:left; padding-left:15px;">M\u00fc\u015fteri Ad\u0131</th>
                                <th>Telefon</th>
                                <th>Net Bakiye (T\u00fcm)</th>
                                <th>\u0130\u015flem Tarihi</th>
                                <th>\u0130lgili Personel (Takma Ad)</th>
                                <th>Banka</th>
                                <th style="width:160px;">\u0130\u015flem</th>
                            </tr>
                        </thead>
                        <tbody id="cTableBody">
                            ${this.cache.customers
                .filter(c => c.status === this.cFilter)
                .sort((a, b) => a.name.localeCompare(b.name, 'tr-TR'))
                .map(c => {
                    const lastRec = getLastRecord(c.id);
                    const p = lastRec ? this.cache.personnel.find(p => p.id === lastRec.personnelId) : null;
                    const pName = p ? (p.alias || p.name) : '-';
                    return `
                                <tr>
                                    <td style="text-align:left; padding-left:15px; font-weight:500;">${c.name}</td>
                                    <td>${c.phone || '-'}</td>
                                    <td style="font-weight:700; color:${customerBalances[c.id] > 0 ? 'var(--accent-color)' : customerBalances[c.id] < 0 ? 'var(--danger-color)' : 'var(--text-main)'};">
                                        ${this.formatNum(customerBalances[c.id])} TL
                                    </td>
                                    <td>${lastRec ? lastRec.date.split('-').reverse().join('.') : '-'}</td>
                                    <td>${pName}</td>
                                    <td>${lastRec ? (lastRec.bank || '-') : '-'}</td>
                                    <td>
                                        <button class="btn-mini" onclick="app.showCustomerLedger('${c.id}')">Cari</button>
                                        <button class="btn-mini" onclick="app.showCustomerModal('${c.id}')">Düzenle</button>
                                    </td>
                                </tr>
                            `;
                }).join('')}
                            ${this.cache.customers.filter(c => c.status === this.cFilter).length === 0 ? '<tr><td colspan="6" style="padding:40px; color:var(--text-dim);">Bu listede m\u00fc\u015fteri bulunamad\u0131.</td></tr>' : ''}
                        </tbody>
                    </table>
                </div>
            </div>`;

            const cSearch = document.getElementById('cSearch');
            if (cSearch) {
                cSearch.oninput = (e) => {
                    const q = e.target.value.toLocaleLowerCase('tr-TR');
                    const rows = document.querySelectorAll('#cTableBody tr');
                    rows.forEach(row => {
                        const text = row.innerText.toLocaleLowerCase('tr-TR');
                        row.style.display = text.includes(q) ? '' : 'none';
                    });
                };
            }
    }

    setCustomerFilter(filter) {
        this.cFilter = filter;
        this.renderCustomers();
    }

    showCustomerModal(id = null) {
        const c = id ? this.cache.customers.find(x => x.id == id) : null;
        const ov = document.getElementById('modalOverlay'); ov.classList.remove('hidden');
        ov.innerHTML = `
            <div class="modal-content" style="width:450px;">
                <h2>${id ? 'M\u00fc\u015fteri D\u00fczenle' : 'Yeni M\u00fc\u015fteri Ekle'}</h2>
                <form id="cForm">
                    <div class="form-group">
                        <label>Ad Soyad</label>
                        <input id="cn" value="${c?.name || ''}" required placeholder="\u00d6rn: Ay\u015fe Y\u0131ld\u0131z">
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Telefon</label>
                            <input id="cp" value="${c?.phone || ''}" placeholder="05XX XXX XX XX">
                        </div>
                        <div class="form-group">
                            <label>Durum</label>
                            <select id="cs">
                                <option value="active" ${c?.status === 'active' || !c ? 'selected' : ''}>Aktif</option>
                                <option value="pasif" ${c?.status === 'pasif' ? 'selected' : ''}>Pasif</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Başlangıç Saati</label>
                            <input type="time" id="cst" value="${c?.startTime || ''}">
                        </div>
                        <div class="form-group">
                            <label>Bitiş Saati</label>
                            <input type="time" id="cet" value="${c?.endTime || ''}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Adres</label>
                        <input id="ca" value="${c?.address || ''}" placeholder="Adres bilgisi">
                    </div>
                    <div class="form-group">
                        <label>Notlar</label>
                        <input id="cno" value="${c?.notes || ''}" placeholder="Ek notlar...">
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn-text" onclick="app.closeModal()">İptal</button>
                        <button type="submit" class="btn-primary">Kaydet</button>
                    </div>
                </form>
            </div>
        `;
        document.getElementById('cForm').onsubmit = (e) => {
            e.preventDefault();
            const data = {
                id: id || Date.now().toString(),
                name: document.getElementById('cn').value.trim(),
                phone: document.getElementById('cp').value.trim(),
                startTime: document.getElementById('cst').value,
                endTime: document.getElementById('cet').value,
                address: document.getElementById('ca').value.trim(),
                notes: document.getElementById('cno').value.trim(),
                status: document.getElementById('cs').value
            };
            if (id) {
                this.cache.customers = this.cache.customers.map(x => x.id == id ? { ...x, ...data } : x);
            } else {
                this.cache.customers.push(data);
            }
            this.store.set('customers', this.cache.customers);
            this.logAction(`${id ? 'Müşteri Güncellendi' : 'Yeni Müşteri Eklendi'}: ${data.name}`);
            this.closeModal();
            if (this.currentView === 'customers') this.renderCustomers();
            this.showToast(id ? 'Müşteri güncellendi.' : 'Yeni müşteri eklendi.', 'success');
        };
    }

    showCustomerLedger(cid) {
        const customer = this.cache.customers.find(c => c.id == cid);
        if (!customer) return;
        const ledger = this.cache.customerLedgers[cid] || [];

        // Collect auto entries from daily records
        const autoEntries = [];
        Object.keys(this.cache.records).forEach(date => {
            this.cache.records[date].forEach(rec => {
                if (rec.customerId == cid || (rec.name && rec.name.toLocaleLowerCase('tr-TR') === customer.name.toLocaleLowerCase('tr-TR'))) {
                    const pName = this.cache.personnel.find(p => p.id === rec.personnelId)?.name || '-';
                    autoEntries.push({
                        id: 'auto_' + date + '_' + rec.personnelId + '_' + rec.rowIndex,
                        date: date,
                        type: 'charge',
                        amount: rec.amount,
                        bank: rec.bank || '-',
                        desc: '\u0130\u015flem: ' + pName + (rec.desc ? ' - ' + rec.desc : ''),
                        user: rec.user || 'Sistem',
                        startTime: rec.startTime || '',
                        endTime: rec.endTime || '',
                        auto: true
                    });
                }
            });
        });

        const allEntries = [...autoEntries, ...ledger].sort((a, b) => b.date > a.date ? 1 : -1);
        
        // Calculate Net Bakiye (All time)
        const netCharge = allEntries.filter(l => l.type === 'charge').reduce((s, l) => s + l.amount, 0);
        const netPayment = allEntries.filter(l => l.type === 'payment').reduce((s, l) => s + l.amount, 0);
        const netBalance = netCharge - netPayment;

        // Apply Date Filter
        const filteredEntries = allEntries.filter(l => l.date >= this.lStart && l.date <= this.lEnd);
        const periodCharge = filteredEntries.filter(l => l.type === 'charge').reduce((s, l) => s + l.amount, 0);
        const periodPayment = filteredEntries.filter(l => l.type === 'payment').reduce((s, l) => s + l.amount, 0);
        const periodBalance = periodCharge - periodPayment;

        const ov = document.getElementById('modalOverlay'); ov.classList.remove('hidden');
        ov.innerHTML = `
            <div class="modal-content" style="width:750px; max-height:85vh; overflow-y:auto;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; background:var(--bg-nav); padding:15px; border-radius:10px; border:1px solid var(--border-color); position:relative;">
                    <div style="display:flex; align-items:center; gap:15px;">
                        <div>
                            <h2 style="margin:0; font-size:18px;">M\u00fc\u015fteri Cari - ${customer.name}</h2>
                            <small style="color:var(--text-dim);">${customer.phone || ''} ${customer.address ? '| ' + customer.address : ''}</small>
                        </div>
                        <button class="btn-primary" onclick="app.closeModal()" style="background:var(--danger-color); padding:6px 15px; font-size:12px; height:32px;">Kapat</button>
                    </div>
                    <div style="display:flex; gap:20px; text-align:right;">
                        <div>
                            <div style="font-size:16px; font-weight:bold; color:var(--primary-color);">${this.formatNum(periodBalance)} TL</div>
                            <small style="color:var(--text-dim); font-size:10px;">D\u00f6nem Fark\u0131</small>
                        </div>
                        <div>
                            <div style="font-size:18px; font-weight:bold; color:${netBalance > 0 ? 'var(--accent-color)' : netBalance < 0 ? 'var(--danger-color)' : 'var(--text-main)'};">${this.formatNum(netBalance)} TL</div>
                            <small style="color:var(--text-dim); font-size:10px;">Net Bakiye (T\u00fcm)</small>
                        </div>
                    </div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; gap:15px; background:var(--bg-card); padding:10px; border-radius:8px; border:1px solid var(--border-color);">
                    <div style="display:flex; gap:10px; align-items:center;">
                        <input type="date" id="ls" value="${this.lStart}" style="width:130px; padding:5px; font-size:12px;">
                        <span style="color:var(--text-dim)">\u27a4</span>
                        <input type="date" id="le" value="${this.lEnd}" style="width:130px; padding:5px; font-size:12px;">
                        <button class="btn-mini" onclick="app.setCustomerLedgerFilter('${cid}')">Filtrele</button>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button class="btn-primary" style="padding:6px 12px; font-size:11px; background:#10b981;" onclick="app.addCustomerLedgerEntry('${cid}', 'payment')">+ \u00d6deme Al</button>
                        <button class="btn-primary" style="padding:6px 12px; font-size:11px; background:#3b82f6;" onclick="app.addCustomerLedgerEntry('${cid}', 'charge')">+ Bor\u00e7 Yaz</button>
                    </div>
                </div>

                <table class="excel-table" style="width:100%;">
                    <thead>
                        <tr>
                            <th>Tarih</th>
                            <th>Başla</th>
                            <th>Bitiş</th>
                            <th style="text-align:left; padding-left:10px;">Açıklama</th>
                            <th>Banka</th>
                            <th>Tür</th>
                            <th>Tutar</th>
                            <th>Yapan</th>
                            <th style="width:60px;">İşlem</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredEntries.map(l => `
                            <tr style="${l.auto ? 'opacity:0.8;' : ''}">
                                <td>${l.date.split('-').reverse().join('.')}</td>
                                <td style="font-weight:600; color:var(--primary-color);">${l.startTime || '-'}</td>
                                <td style="font-weight:600; color:var(--primary-color);">${l.endTime || '-'}</td>
                                <td style="text-align:left; padding-left:10px; font-size:12px; white-space: normal; word-break: break-word;">${l.desc || '-'}${l.auto ? ' <span style="font-size:9px; color:var(--text-dim);">(Oto)</span>' : ''}</td>
                                <td style="font-size:12px;">${l.bank || '-'}</td>
                                <td><span class="badge-${l.type === 'charge' ? 'active' : 'pasif'}" style="font-size:9px;">${l.type === 'charge' ? 'BOR\u00c7' : '\u00d6DEME'}</span></td>
                                <td style="font-weight:bold; color:${l.type === 'charge' ? 'var(--accent-color)' : 'var(--danger-color)'};">${l.type === 'charge' ? '+' : '-'}${this.formatNum(l.amount)} TL</td>
                                <td style="font-size:10px; color:var(--text-dim);">${l.user || ''}</td>
                                <td>${!l.auto ? `<button class="btn-mini" style="background:var(--danger-color); font-size:10px; padding:2px 5px;" onclick="app.deleteCustomerLedgerEntry('${cid}', ${l.id})">Sil</button>` : ''}</td>
                            </tr>
                        `).join('') || `<tr><td colspan="7" style="padding:30px; color:var(--text-dim);">D\u00f6nem i\u00e7inde i\u015flem bulunamad\u0131.</td></tr>`}
                    </tbody>
                </table>
                <div class="modal-actions" style="margin-top:15px; border-top:1px solid var(--border-color); padding-top:10px;">
                    <button type="button" class="btn-text" onclick="app.closeModal()">Kapat</button>
                </div>
            </div>
        `;
    }

    setCustomerLedgerFilter(cid) {
        this.lStart = document.getElementById('ls').value;
        this.lEnd = document.getElementById('le').value;
        this.showCustomerLedger(cid);
    }

    addCustomerLedgerEntry(cid, type) {
        this.showInputModal(type === 'payment' ? '\u00d6deme Tutar\u0131 (TL)' : 'Bor\u00e7 Tutar\u0131 (TL)', '', (val) => {
            const amount = parseFloat(val);
            if (isNaN(amount) || amount <= 0) return this.showToast('Ge\u00e7erli bir tutar girin.', 'error');
            if (!this.cache.customerLedgers[cid]) this.cache.customerLedgers[cid] = [];
            this.cache.customerLedgers[cid].push({
                id: Date.now(),
                date: this.formatDate(new Date()),
                type: type,
                amount: amount,
                desc: type === 'payment' ? 'Manuel \u00d6deme' : 'Manuel Bor\u00e7',
                user: this.user.name
            });
            this.store.set('customerLedgers', this.cache.customerLedgers);
            this.showCustomerLedger(cid);
        });
    }

    deleteCustomerLedgerEntry(cid, entryId) {
        if (confirm('Bu kayd\u0131 silmek istedi\u011finize emin misiniz?')) {
            this.cache.customerLedgers[cid] = (this.cache.customerLedgers[cid] || []).filter(l => l.id !== entryId);
            this.store.set('customerLedgers', this.cache.customerLedgers);
            this.showCustomerLedger(cid);
        }
    }

    showCustomerReport() {
        const stats = []; // Flat list of transactions for the table
        const uniquePersonnel = new Set();
        const uniqueCustomers = new Set();
        let totalAmount = 0;
        let totalServices = 0;

        // Calculate all personnel for filter dropdown
        const reportPersonnel = [...this.cache.personnel].sort((a,b) => a.name.localeCompare(b.name, 'tr-TR'));

        // Process records
        Object.keys(this.cache.records)
            .filter(date => date >= this.rStart && date <= this.rEnd)
            .forEach(date => {
                this.cache.records[date].forEach(rec => {
                    const pid = rec.personnelId;
                    const cid = rec.customerId;
                    const cName = rec.name || 'Bilinmeyen M\u00fc\u015fteri';
                    const pName = this.cache.personnel.find(p => p.id === pid)?.name || 'Bilinmeyen';

                    // Apply filters
                    if (this.rPid !== 'all' && pid !== this.rPid) return;
                    if (this.rCid !== 'all' && cid !== this.rCid) return;

                    stats.push({
                        date: date,
                        pId: pid,
                        pName: pName,
                        cId: cid,
                        cName: cid ? (this.cache.customers.find(c => c.id === cid)?.name || cName) : cName,
                        amount: rec.amount,
                        bank: rec.bank || '-',
                        count: 1 // Each record in daily grid is 1 service
                    });

                    uniquePersonnel.add(pid);
                    if (cid) uniqueCustomers.add(cid); else uniqueCustomers.add(cName);
                    totalAmount += rec.amount;
                    totalServices += 1;
                });
            });

        // Sorted by date descending
        const sortedStats = stats.sort((a,b) => b.date.localeCompare(a.date));

        const ov = document.getElementById('modalOverlay'); ov.classList.remove('hidden');
        ov.innerHTML = `
            <div class="modal-content" style="width:950px; max-height:90vh; overflow-y:auto;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:2px solid var(--border-color); padding-bottom:15px;">
                    <div style="flex:1;">
                        <h2 style="margin:0; color:var(--primary-color);">Hizmet Raporu</h2>
                        <div style="font-size:12px; color:var(--text-dim);">${this.rStart.split('-').reverse().join('.')} - ${this.rEnd.split('-').reverse().join('.')}</div>
                    </div>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <button type="button" class="btn-primary" style="background:#10b981; padding:6px 15px; font-size:12px;" onclick="window.print()">\ud83d\udda8 Yazd\u0131r / PDF Kaydet</button>
                        <button type="button" class="btn-text" style="padding:6px 15px; font-size:12px;" onclick="app.closeModal()">Kapat</button>
                    </div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; background:var(--bg-card); padding:10px; border-radius:8px; border:1px solid var(--border-color);">
                    <div style="display:flex; gap:10px; align-items:center;">
                        <input type="date" id="rs_rep" value="${this.rStart}" style="width:125px; padding:5px; font-size:11px;">
                        <span style="color:var(--text-dim)">\u27a4</span>
                        <input type="date" id="re_rep" value="${this.rEnd}" style="width:125px; padding:5px; font-size:11px;">
                        <button class="btn-primary" style="padding:5px 12px; font-size:11px;" onclick="app.setCustomerReportFilter()">Uygula</button>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-bottom:20px; background:var(--bg-nav); padding:15px; border-radius:10px;">
                    <div class="form-group" style="margin:0;">
                        <label style="color:white; font-size:11px; margin-bottom:3px;">Personel Se\u00e7imi</label>
                        <div class="searchable-select" id="pid_dropdown">
                            <div class="search-input-wrapper">
                                <input type="text" class="search-input" id="pid_search" 
                                    placeholder="Personel ara..." 
                                    value="${this.rPid === 'all' ? 'T\u00fcm Personeller' : (this.cache.personnel.find(p => p.id === this.rPid)?.name || '')}"
                                    onfocus="this.select(); document.getElementById('pid_list').classList.add('show')"
                                    oninput="app.filterSearchableList('pid_list', this.value)"
                                >
                            </div>
                            <div class="select-dropdown" id="pid_list">
                                <div class="select-option ${this.rPid === 'all' ? 'selected' : ''}" onclick="app.selectSearchableOption('rp_rep', 'all', 'T\u00fcm Personeller', 'pid_search', 'pid_list')">T\u00fcm Personeller</div>
                                ${reportPersonnel.map(p => {
                                    const dName = p.alias || p.name;
                                    return `
                                    <div class="select-option ${this.rPid === p.id ? 'selected' : ''}" 
                                        onclick="app.selectSearchableOption('rp_rep', '${p.id}', '${dName}', 'pid_search', 'pid_list')">
                                        ${dName}
                                    </div>
                                `;}).join('')}
                            </div>
                            <input type="hidden" id="rp_rep" value="${this.rPid}">
                        </div>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label style="color:white; font-size:11px; margin-bottom:3px;">M\u00fc\u015fteri Se\u00e7imi</label>
                        <div class="searchable-select" id="cid_dropdown">
                            <div class="search-input-wrapper">
                                <input type="text" class="search-input" id="cid_search" 
                                    placeholder="M\u00fc\u015fteri ara..." 
                                    value="${this.rCid === 'all' ? 'T\u00fcm M\u00fc\u015fteriler' : (this.cache.customers.find(c => c.id === this.rCid)?.name || '')}"
                                    onfocus="this.select(); document.getElementById('cid_list').classList.add('show')"
                                    oninput="app.filterSearchableList('cid_list', this.value)"
                                >
                            </div>
                            <div class="select-dropdown" id="cid_list">
                                <div class="select-option ${this.rCid === 'all' ? 'selected' : ''}" onclick="app.selectSearchableOption('rc_rep', 'all', 'T\u00fcm M\u00fc\u015fteriler', 'cid_search', 'cid_list')">T\u00fcm M\u00fc\u015fteriler</div>
                                ${this.cache.customers.filter(c => c.status === 'active').sort((a,b)=>a.name.localeCompare(b.name, 'tr-TR')).map(c => `
                                    <div class="select-option ${this.rCid === c.id ? 'selected' : ''}" 
                                        onclick="app.selectSearchableOption('rc_rep', '${c.id}', '${c.name}', 'cid_search', 'cid_list')">
                                        ${c.name}
                                    </div>
                                `).join('')}
                            </div>
                            <input type="hidden" id="rc_rep" value="${this.rCid}">
                        </div>
                    </div>
                </div>

                <div class="stats-grid" style="grid-template-columns: repeat(4, 1fr); gap:15px; margin-bottom:20px;">
                    <div class="stat-card" style="border-bottom:4px solid #3b82f6;">
                        <h3 style="font-size:10px;">M\u00fc\u015fteri Say\u0131s\u0131</h3>
                        <p style="font-size:18px;">${this.rCid !== 'all' ? 1 : uniqueCustomers.size}</p>
                    </div>
                    <div class="stat-card" style="border-bottom:4px solid #8b5cf6;">
                        <h3 style="font-size:10px;">Hizmet Say\u0131s\u0131</h3>
                        <p style="font-size:18px;">${totalServices}</p>
                    </div>
                    <div class="stat-card" style="border-bottom:4px solid var(--accent-color);">
                        <h3 style="font-size:10px;">Hizmet Tutar\u0131</h3>
                        <p style="font-size:18px;">${this.formatNum(totalAmount)} TL</p>
                    </div>
                    <div class="stat-card" style="border-bottom:4px solid var(--primary-color);">
                        <h3 style="font-size:10px;">Personel Say\u0131s\u0131</h3>
                        <p style="font-size:18px;">${this.rPid !== 'all' ? 1 : uniquePersonnel.size}</p>
                    </div>
                </div>

                <div class="excel-wrapper" style="border:1px solid var(--border-color); border-radius:8px;">
                    <table class="excel-table" style="width:100%;">
                        <thead>
                            <tr>
                                <th style="text-align:left; padding-left:15px;">M\u00fc\u015fteri</th>
                                <th style="text-align:left;">Personel</th>
                                <th>Tarih</th>
                                <th>Banka</th>
                                <th style="width:100px;">Tutar</th>
                                <th style="width:60px;">Adet</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sortedStats.map(s => `
                                <tr>
                                    <td style="text-align:left; padding-left:15px; font-weight:500;">${s.cName}</td>
                                    <td style="text-align:left; font-weight:500;">${(() => {
                                        const p = this.cache.personnel.find(px => px.id === s.pId);
                                        return p ? (p.alias || p.name) : s.pName;
                                    })()}</td>
                                    <td style="font-size:12px; color:var(--text-dim);">${s.date.split('-').reverse().join('.')}</td>
                                    <td style="font-size:12px;">${s.bank}</td>
                                    <td style="font-weight:600; color:var(--accent-color);">${this.formatNum(s.amount)} TL</td>
                                    <td style="font-size:12px;">${s.count}</td>
                                </tr>
                            `).join('') || '<tr><td colspan="6" style="padding:40px; color:var(--text-dim);">Sonu\u00e7 bulunamad\u0131.</td></tr>'}
                        </tbody>
                        ${sortedStats.length > 0 ? `
                            <tfoot style="background:var(--bg-nav); color:white; font-weight:bold;">
                                <tr>
                                    <td colspan="3" style="text-align:right; padding:10px 15px;">GENEL TOPLAM:</td>
                                    <td style="padding:10px 5px; color:var(--accent-color);">${this.formatNum(totalAmount)} TL</td>
                                    <td style="padding:10px 5px;">${totalServices}</td>
                                </tr>
                            </tfoot>
                        ` : ''}
                    </table>
                </div>

                ${this.rCid !== 'all' && this.rPid === 'all' ? (() => {
                    const servedPidSet = new Set(stats.map(s => s.pId));
                    const notServed = this.cache.personnel.filter(p => !servedPidSet.has(p.id) && p.status !== 'pasif').sort((a,b) => a.name.localeCompare(b.name, 'tr-TR'));
                    if (notServed.length === 0) return '';
                    return `
                        <div style="margin-top:20px; padding:15px; background:rgba(239, 68, 68, 0.05); border:1px solid rgba(239, 68, 68, 0.2); border-radius:10px;">
                            <h3 style="font-size:13px; color:var(--danger-color); margin-top:0; margin-bottom:10px; border-left:4px solid var(--danger-color); padding-left:10px;">Bu M\u00fc\u015fteriye Hizmet Vermeyen Personeller</h3>
                            <div style="display:flex; flex-wrap:wrap; gap:8px;">
                                ${notServed.map(p => `
                                    <div style="background:var(--bg-input); padding:4px 10px; border-radius:12px; font-size:11px; border:1px solid var(--border-color); color:var(--text-dim);">
                                        ${p.alias || p.name}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                })() : ''}

                <div style="height:20px;"></div>
            </div>
        `;
    }

    setCustomerReportFilter() {
        this.rStart = document.getElementById('rs_rep').value;
        this.rEnd = document.getElementById('re_rep').value;
        this.rPid = document.getElementById('rp_rep').value;
        this.rCid = document.getElementById('rc_rep').value;
        this.showCustomerReport();
    }

    filterSearchableList(listId, query) {
        const list = document.getElementById(listId);
        const options = list.querySelectorAll('.select-option');
        const q = query.toLocaleLowerCase('tr-TR');
        let hasVisible = false;

        options.forEach(opt => {
            const text = opt.innerText.toLocaleLowerCase('tr-TR');
            if (text.includes(q)) {
                opt.style.display = 'block';
                hasVisible = true;
            } else {
                opt.style.display = 'none';
            }
        });

        // Search for existing no-results message and remove
        const existingNoResults = list.querySelector('.no-results');
        if (existingNoResults) existingNoResults.remove();
    }

    selectSearchableOption(hiddenId, value, label, searchInputId, listId) {
        document.getElementById(hiddenId).value = value;
        document.getElementById(searchInputId).value = label;
        document.getElementById(listId).classList.remove('show');
    }

    selectSearchableOptionMain(cid, label, searchInputId, listId) {
        document.getElementById('rn_cid').value = cid;
        document.getElementById(searchInputId).value = label;
        document.getElementById(listId).classList.remove('show');
    }
    // ============ END CUSTOMERS MODULE ============

    // ============ LOG MODULE ============
    renderActionLogs() {
        // Collect unique users for dropdown
        const uniqueUsers = new Set(this.cache.actionLogs.map(l => l.user));
        
        // Filter Logs
        let filteredLogs = this.cache.actionLogs.filter(l => l.date >= this.logStart && l.date <= this.logEnd);
        if (this.logUser !== 'all') {
            filteredLogs = filteredLogs.filter(l => l.user === this.logUser);
        }
        
        // Sort descending (newest first)
        filteredLogs.sort((a,b) => b.id.localeCompare(a.id));

        document.getElementById('mainContent').innerHTML = `
            <div class="admin-view" style="padding:20px;">
                <h2 style="margin-bottom:20px; font-family:'Outfit';">İşlem Kayıtları (Loglar)</h2>
                
                <div class="filter-bar" style="display:flex; gap:15px; margin-bottom:20px; align-items:flex-end; background:var(--bg-card); padding:15px; border-radius:10px; border:1px solid var(--border-color);">
                    <div class="form-group" style="margin:0;">
                        <label>Başlangıç</label>
                        <input type="date" id="ls_log" value="${this.logStart}">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label>Bitiş</label>
                        <input type="date" id="le_log" value="${this.logEnd}">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label>Kullanıcı</label>
                        <select id="lu_log">
                            <option value="all" ${this.logUser === 'all' ? 'selected' : ''}>Tüm Kullanıcılar</option>
                            ${Array.from(uniqueUsers).map(u => `<option value="${u}" ${this.logUser === u ? 'selected' : ''}>${u}</option>`).join('')}
                        </select>
                    </div>
                    <button class="btn-primary" onclick="app.setActionLogFilter()">Filtrele</button>
                    <button class="btn-text" style="color:var(--text-dim);" onclick="document.getElementById('ls_log').value='${this.today}'; document.getElementById('le_log').value='${this.today}'; document.getElementById('lu_log').value='all'; app.setActionLogFilter();">Temizle</button>
                </div>

                <div class="excel-wrapper" style="border:1px solid var(--border-color); border-radius:8px;">
                    <table class="excel-table log-table" style="width:100%;">
                        <thead>
                            <tr>
                                <th style="width:120px; text-align:left; padding-left:15px;">Tarih</th>
                                <th style="width:100px; text-align:left;">Saat</th>
                                <th style="width:150px; text-align:left;">Kullanıcı</th>
                                <th style="text-align:left;">İşlem Özeti</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filteredLogs.map(l => `
                                <tr>
                                    <td style="text-align:left; padding-left:15px; font-weight:500;">${l.date.split('-').reverse().join('.')}</td>
                                    <td style="text-align:left; font-size:12px; color:var(--text-dim);">${l.time}</td>
                                    <td style="text-align:left;">
                                        <span style="background:#6366f1; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:600; color:white;">
                                            ${l.user || 'Bilinmeyen'}
                                        </span>
                                    </td>
                                    <td style="text-align:left;">
                                        <span style="color:var(--text-main); font-size:13px;">${l.action}</span>
                                    </td>
                                </tr>
                            `).join('') || '<tr><td colspan="4" style="padding:40px; text-align:center; color:var(--text-dim);">Bu aralıkta kayıt bulunamadı.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    setActionLogFilter() {
        this.logStart = document.getElementById('ls_log').value;
        this.logEnd = document.getElementById('le_log').value;
        this.logUser = document.getElementById('lu_log').value;
        this.showView('actionLogs');
    }
    // ============ END LOG MODULE ============

    renderFinance() {
        // Filter Transactions
        const filteredTrans = this.cache.transactions.filter(t => t.date >= this.finStart && t.date <= this.finEnd);

        // Filter Records (Daily Grids) - Only include if date in range AND it's NOT already in transactions as "Günlük Ciro"
        // To avoid double counting, we'll only count records from days that DON'T have a 'Günlük Ciro' transaction in the filteredTrans
        const dailyGridsIncome = Object.keys(this.cache.records)
            .filter(d => d >= this.finStart && d <= this.finEnd)
            .filter(d => !filteredTrans.some(t => t.date === d && t.category === 'Günlük Ciro'))
            .reduce((sum, date) => sum + (this.cache.records[date] || []).reduce((a, b) => a + b.amount, 0), 0);

        const otherIncome = filteredTrans.filter(t => t.type === 'income').reduce((a, b) => a + b.amount, 0);
        const totalExpense = filteredTrans.filter(t => t.type === 'expense').reduce((a, b) => a + b.amount, 0);
        const totalIncome = dailyGridsIncome + otherIncome;
        const balance = totalIncome - totalExpense;

        // Calculate KDV and Commission from daily records in range
        const vatRate = this.cache.settings.vat;
        const commRate = this.cache.settings.commission;
        let totalVat = 0;
        let totalComm = 0;
        let totalFatura = 0;
        const bankTotals = {};
        Object.keys(this.cache.records)
            .filter(d => d >= this.finStart && d <= this.finEnd)
            .forEach(date => {
                (this.cache.records[date] || []).forEach(rec => {
                    const totalRate = (this.cache.settings.vat || 0) + (this.cache.settings.reklam || 0);
                    const net = rec.amount / (1 + totalRate / 100);
                    const vat = rec.amount - net;
                    totalVat += vat;
                    totalComm += (net * commRate / 100);
                    totalFatura += net;
                    if (rec.bank && rec.bank !== '-') {
                        const bName = rec.bank.trim().toLocaleUpperCase('tr-TR');
                        bankTotals[bName] = (bankTotals[bName] || 0) + net;
                    }
                });
            });

        document.getElementById('mainContent').innerHTML = `
            <div class="admin-view">
                <div class="admin-header" style="margin-bottom:20px; flex-wrap:wrap; gap:15px;">
                    <div>
                        <h2 style="margin:0">Finansal Özet</h2>
                        <div style="font-size:12px; color:var(--text-dim); margin-top:4px;">${this.finStart.split('-').reverse().join('.')} - ${this.finEnd.split('-').reverse().join('.')} Arası</div>
                    </div>
                    <div style="display:flex; gap:10px; align-items:center; background:var(--bg-nav); padding:10px; border-radius:8px; border:1px solid var(--border-color);">
                        <input type="date" id="fs" value="${this.finStart}" style="background:var(--bg-input); border:1px solid var(--border-color); color:white; padding:5px 10px; border-radius:4px; font-size:13px;">
                        <span style="color:var(--text-dim)">➔</span>
                        <input type="date" id="fe" value="${this.finEnd}" style="background:var(--bg-input); border:1px solid var(--border-color); color:white; padding:5px 10px; border-radius:4px; font-size:13px;">
                        <button class="btn-primary" onclick="app.setFinanceFilter()" style="padding:5px 15px;">Filtrele</button>
                    </div>
                </div>

                <div class="stats-grid" style="grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));">
                    <div class="stat-card" style="border-bottom:4px solid var(--accent-color)">
                        <h3>Net Kasa (Bakiye)</h3>
                        <p>${this.formatNum(balance)} TL</p>
                    </div>
                    <div class="stat-card" style="border-bottom:4px solid #3b82f6">
                        <h3>Toplam Gelir</h3>
                        <p style="color:#3b82f6">${this.formatNum(totalIncome)} TL</p>
                        <small style="color:var(--text-dim); font-size:10px;">(Ciro: ${this.formatNum(otherIncome)} + Bekleyen: ${this.formatNum(dailyGridsIncome)})</small>
                    </div>
                    <div class="stat-card" style="border-bottom:4px solid var(--danger-color)">
                        <h3>Toplam Gider</h3>
                        <p style="color:var(--danger-color)">${this.formatNum(totalExpense)} TL</p>
                    </div>
                    <div class="stat-card" style="border-bottom:4px solid #f59e0b">
                        <h3>Toplam KDV (%${vatRate})</h3>
                        <p style="color:#f59e0b">${this.formatNum(totalVat)} TL</p>
                    </div>
                    <div class="stat-card" style="border-bottom:4px solid #8b5cf6">
                        <h3>Reklam Komisyon (%${commRate})</h3>
                        <p style="color:#8b5cf6">${this.formatNum(totalComm)} TL</p>
                    </div>
                    <div class="stat-card" style="border-bottom:4px solid #06b6d4">
                        <h3>Fatura Toplam</h3>
                        <p style="color:#06b6d4">${this.formatNum(totalFatura)} TL</p>
                    </div>
                    ${Object.entries(bankTotals).map(([name, total]) => `
                        <div class="stat-card" style="border-bottom:4px solid #10b981; background: #f0fdf4;">
                            <h3 style="color:#166534">${name} Toplam</h3>
                            <p style="color:#10b981">${this.formatNum(total)} TL</p>
                        </div>
                    `).join('')}
                </div>

                <div class="admin-header" style="margin-top:30px;">
                    <h2>İşlem Geçmişi</h2>
                    <button class="btn-primary" onclick="app.showTransactionModal()">+ Yeni İşlem Kaydı</button>
                </div>

                <div class="excel-wrapper">
                    <table class="excel-table" style="width:100%;">
                        <thead>
                            <tr>
                                <th>Tarih</th>
                                <th style="text-align:left; padding-left:15px;">Açıklama / Tip</th>
                                <th>Tür</th>
                                <th>Tutar</th>
                                <th>Yapan</th>
                                <th style="width:100px;">İşlem</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filteredTrans.sort((a, b) => b.id - a.id).map(t => `
                                <tr>
                                    <td>${t.date.split('-').reverse().join('.')}</td>
                                    <td style="text-align:left; padding-left:15px;">
                                        <div style="font-weight:bold">${t.category}</div>
                                        <div style="font-size:11px; color:var(--text-dim)">${t.desc || ''}</div>
                                    </td>
                                    <td><span class="badge-${t.type === 'income' ? 'active' : 'pasif'}">${t.type === 'income' ? 'GELİR' : 'GİDER'}</span></td>
                                    <td style="font-weight:bold; color:${t.type === 'income' ? 'var(--accent-color)' : 'var(--danger-color)'}">
                                        ${t.type === 'income' ? '+' : '-'}${this.formatNum(t.amount)} TL
                                    </td>
                                    <td style="font-size:11px; color:var(--text-dim);">${t.user || 'Sistem'}</td>
                                    <td>
                                        <button class="btn-mini" style="background:var(--danger-color)" onclick="app.deleteTransaction(${t.id})">Sil</button>
                                    </td>
                                </tr>
                            `).join('') || '<tr><td colspan="6" style="padding:20px; color:var(--text-dim)">Belirtilen tarihlerde işlem kaydı yok.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>`;
    }

    setFinanceFilter() {
        this.finStart = document.getElementById('fs').value;
        this.finEnd = document.getElementById('fe').value;
        this.renderFinance();
    }

    showTransactionModal() {
        const ov = document.getElementById('modalOverlay');
        ov.classList.remove('hidden');
        ov.innerHTML = `
            <div class="modal-content">
                <h2>Yeni İşlem Kaydı</h2>
                <form id="tForm">
                    <div class="form-row">
                        <div class="form-group">
                            <label>İşlem Türü</label>
                            <select id="tt" onchange="app.updateCategoryOptions()">
                                <option value="expense">Gider (-)</option>
                                <option value="income">Gelir (+)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Tarih</label>
                            <input type="date" id="td" value="${this.today}" required>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Tanımlı Kalem / Kategori</label>
                        <select id="tc" required></select>
                    </div>
                    <div class="form-group">
                        <label>Tutar</label>
                        <input type="number" step="0.01" id="ta" required placeholder="0.00">
                    </div>
                    <div class="form-group">
                        <label>Açıklama (Opsiyonel)</label>
                        <textarea id="tx" rows="2" style="width:100%; border-radius:6px; padding:8px;"></textarea>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn-text" onclick="app.closeModal()">İptal</button>
                        <button type="submit" class="btn-primary">Kaydet</button>
                    </div>
                </form>
            </div>`;
        this.updateCategoryOptions();
        document.getElementById('tForm').onsubmit = (e) => {
            e.preventDefault();
            this.saveTransaction();
        };
    }

    updateCategoryOptions() {
        const type = document.getElementById('tt').value;
        const sel = document.getElementById('tc');
        const list = this.cache.definitions[type];
        sel.innerHTML = list.map(c => `<option value="${c}">${c}</option>`).join('') || '<option value="">Önce kategori tanımlayın</option>';
    }

    saveTransaction() {
        const data = {
            id: Date.now(),
            type: document.getElementById('tt').value,
            date: document.getElementById('td').value,
            category: document.getElementById('tc').value.toLocaleUpperCase('tr-TR'),
            amount: parseFloat(document.getElementById('ta').value),
            desc: document.getElementById('tx').value.toLocaleUpperCase('tr-TR'),
            user: this.user.name
        };
        if (!data.category) return this.showToast('Lütfen bir kategori seçin.', 'error');
        this.cache.transactions.push(data);
        this.store.set('transactions', this.cache.transactions);
        this.logAction(`Yeni Finans Kaydı: ${data.type.toUpperCase()} - ${data.category} (${data.amount} TL)`);
        this.closeModal();
        this.renderFinance();
    }

    deleteTransaction(id) {
        if (confirm('İşlemi silmek istediğinize emin misiniz?')) {
            this.cache.transactions = this.cache.transactions.filter(t => t.id !== id);
            this.store.set('transactions', this.cache.transactions);
            this.logAction(`Finans Kaydı Silindi: ID ${id}`);
            this.renderFinance();
        }
    }

    renderDefinitions() {
        document.getElementById('mainContent').innerHTML = `
            <div class="admin-view" style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:20px;">
                <div class="def-column">
                    <h3>Gider Tan\u0131mlar\u0131</h3>
                    <div class="form-group">
                        <div style="display:flex; gap:10px;">
                            <input id="newExp" placeholder="\u00d6rn: Kira, Elektrik...">
                            <button class="btn-primary" onclick="app.addDef('expense')">Ekle</button>
                        </div>
                    </div>
                    <div class="def-list" style="margin-top:20px;">
                        ${this.cache.definitions.expense.map((d, i) => `
                            <div class="todo-item" style="background:var(--bg-input); padding:10px;">
                                <span style="flex:1;">${d}</span>
                                <button class="btn-item-del" onclick="app.remDef('expense', ${i})">\u00d7</button>
                            </div>
                        `).join('') || '<div style="color:var(--text-dim)">Tan\u0131m yok.</div>'}
                    </div>
                </div>
                <div class="def-column">
                    <h3>Gelir Tan\u0131mlar\u0131 (Ek)</h3>
                    <div class="form-group">
                        <div style="display:flex; gap:10px;">
                            <input id="newInc" placeholder="\u00d6rn: Ek Sat\u0131\u015f, Faiz...">
                            <button class="btn-primary" onclick="app.addDef('income')">Ekle</button>
                        </div>
                    </div>
                    <div class="def-list" style="margin-top:20px;">
                        ${this.cache.definitions.income.map((d, i) => `
                            <div class="todo-item" style="background:var(--bg-input); padding:10px;">
                                <span style="flex:1;">${d}</span>
                                <button class="btn-item-del" onclick="app.remDef('income', ${i})">\u00d7</button>
                            </div>
                        `).join('') || '<div style="color:var(--text-dim)">Tan\u0131m yok.</div>'}
                    </div>
                </div>
                <div class="def-column">
                    <h3>Banka Tan\u0131mlar\u0131</h3>
                    <div class="form-group">
                        <div style="display:flex; gap:10px;">
                            <input id="newBank" placeholder="\u00d6rn: Ziraat, Garanti...">
                            <button class="btn-primary" onclick="app.addDef('bank')">Ekle</button>
                        </div>
                    </div>
                    <div class="def-list" style="margin-top:20px;">
                        ${(this.cache.definitions.bank || []).map((d, i) => `
                            <div class="todo-item" style="background:var(--bg-input); padding:10px;">
                                <span style="flex:1;">${d}</span>
                                <button class="btn-item-del" onclick="app.remDef('bank', ${i})">\u00d7</button>
                            </div>
                        `).join('') || '<div style="color:var(--text-dim)">Tan\u0131m yok.</div>'}
                    </div>
                </div>
            </div>`;
    }

    addDef(type) {
        let idMapping = { expense: 'newExp', income: 'newInc', bank: 'newBank' };
        const inp = document.getElementById(idMapping[type]);
        const val = inp.value.trim();
        if (val) {
            const finalVal = val.toLocaleUpperCase('tr-TR');
            if (!this.cache.definitions[type]) this.cache.definitions[type] = [];
            this.cache.definitions[type].push(finalVal);
            this.store.set('definitions', this.cache.definitions);
            inp.value = ''; // Clear input
            this.renderDefinitions();
            this.showToast('Tanım kaydedildi.', 'success');
        }
    }

    remDef(type, i) {
        if (confirm('Bu tanımı silmek istediğinize emin misiniz?')) {
            this.cache.definitions[type].splice(i, 1);
            this.store.set('definitions', this.cache.definitions);
            this.renderDefinitions();
            this.showToast('Tanım silindi.');
        }
    }

    renderSettings() {
        document.getElementById('mainContent').innerHTML = `
            <div class="admin-view" style="display:grid; grid-template-columns: 1fr 1fr; gap:30px;">
                <div class="settings-form">
                    <h3>Genel Ayarlar</h3>
                    <div class="form-group"><label>KDV (%)</label><input type="number" id="sV" value="${this.cache.settings.vat}"></div>
                    <div class="form-group"><label>Reklam (%)</label><input type="number" id="sRek" value="${this.cache.settings.reklam || 0}"></div>
                    <div class="form-group"><label>Komisyon (%)</label><input type="number" id="sC" value="${this.cache.settings.commission}"></div>
                    <div class="form-group"><label>Ana Panel Satır Sayısı</label><input type="number" id="sR" value="${this.cache.settings.rowCount || 25}"></div>
                    <button class="btn-primary" onclick="app.saveS()">Kaydet</button>
                    
                    <div style="margin-top:25px; padding-top:20px; border-top:1px solid var(--border-color);">
                        <label style="display:block; margin-bottom:10px; font-weight:bold; color:var(--text-dim); font-size:12px;">VERİ YÖNETİMİ</label>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                            <button type="button" class="btn-text" onclick="app.openBackups()">📂 Yedek Klasörü</button>
                            <button type="button" class="btn-text" onclick="app.downloadBackup()">📥 Yedeği İndir</button>
                        </div>
                        <p style="margin-top:10px; font-size:11px; color:var(--text-dim);">* Yedek Klasörü ve Saatlik Otomatik Yedekleme sadece Masaüstü sürümünde (Uygulama olarak açıldığında) çalışır.</p>
                        
                        ${this.user.role === 'admin' ? `
                        <div style="margin-top:20px; padding-top:15px; border-top:1px dashed var(--border-color);">
                            <button type="button" class="btn-text" style="color:var(--danger-color); border-color:rgba(239, 68, 68, 0.2);" onclick="app.resetLicense()">🔐 Lisansı Sıfırla (Re-Act)</button>
                        </div>
                        ` : ''}
                    </div>
                </div>
                <div class="announcement-mgmt">
                    <h3>Duyuru Yönetimi</h3>
                    <div class="form-group">
                        <label>Yeni Duyuru Ekle</label>
                        <div style="display:flex; gap:10px;">
                            <input type="text" id="newAnn" placeholder="Duyuru metni...">
                            <button class="btn-primary" onclick="app.addAnn()">Ekle</button>
                        </div>
                    </div>
                    <div class="ann-list" style="margin-top:20px;">
                        <label>Mevcut Duyurular</label>
                        ${this.cache.announcements.map((a, i) => `
                            <div class="todo-item" style="background:var(--bg-input); padding:10px;">
                                <span style="flex:1; font-size:12px;">${a}</span>
                                <button class="btn-item-del" onclick="app.remAnn(${i})">×</button>
                            </div>
                        `).join('') || '<div style="color:var(--text-dim); font-size:12px;">Duyuru bulunamadı.</div>'}
                    </div>
                </div>
            </div>`;
    }

    addAnn() {
        const val = document.getElementById('newAnn').value;
        if (val && val.trim()) {
            this.cache.announcements.push(val.trim().toLocaleUpperCase('tr-TR'));
            this.store.set('announcements', this.cache.announcements);
            this.renderSettings();
            this.renderBase(); // Update marquee
            this.showView('settings');
        }
    }

    remAnn(i) {
        if (confirm('Duyuruyu sil?')) {
            this.cache.announcements.splice(i, 1);
            this.store.set('announcements', this.cache.announcements);
            this.renderSettings();
            this.renderBase(); // Update marquee
            this.showView('settings');
        }
    }

    saveS() {
        this.cache.settings.vat = parseInt(document.getElementById('sV').value);
        this.cache.settings.reklam = parseInt(document.getElementById('sRek').value) || 0;
        this.cache.settings.commission = parseInt(document.getElementById('sC').value);
        this.cache.settings.rowCount = parseInt(document.getElementById('sR').value) || 25;
        this.store.set('settings', this.cache.settings);
        this.showToast('Ayarlar kaydedildi.', 'success');
        this.renderMain();
    }

    renderUsers() {
        const users = this.store.get('users') || [];
        document.getElementById('mainContent').innerHTML = `
            <div class="admin-view">
                <div class="admin-header">
                    <h2>Kullanıcı Yönetimi</h2>
                    <button class="btn-primary" onclick="app.showUserModal()">+ Yeni Kullanıcı Ekle</button>
                </div>
                <div class="excel-wrapper">
                    <table class="excel-table" style="width:100%;">
                        <thead>
                            <tr>
                                <th style="text-align:left; padding-left:15px; width:200px;">Kullanıcı Adı</th>
                                <th>Rol</th>
                                <th>Şifre</th>
                                <th style="width:150px;">İşlem</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${users.map(u => `
                                <tr>
                                    <td style="text-align:left; padding-left:15px;">${u.name}</td>
                                    <td><span class="badge-${u.role}">${u.role.toUpperCase()}</span></td>
                                    <td>****</td>
                                    <td>
                                        <button class="btn-mini" onclick="app.showUserModal(${u.id})">Düzenle</button>
                                        <button class="btn-mini" style="background:var(--danger-color)" onclick="app.deleteUser(${u.id})">Sil</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
    }

    showUserModal(id = null) {
        const users = this.store.get('users') || [];
        const u = id ? users.find(x => x.id === id) : null;
        const ov = document.getElementById('modalOverlay');
        ov.classList.remove('hidden');
        ov.innerHTML = `
            <div class="modal-content">
                <h2>${id ? 'Kullanıcı Düzenle' : 'Yeni Kullanıcı'}</h2>
                <form id="userForm">
                    <div class="form-group">
                        <label>Kullanıcı Adı</label>
                        <input id="un" value="${u?.name || ''}" required>
                    </div>
                    <div class="form-group">
                        <label>Şifre</label>
                        <input type="password" id="up" value="${u?.pass || ''}" required>
                    </div>
                    <div class="form-group">
                        <label>Rol</label>
                        <select id="ur">
                            <option value="user" ${u?.role === 'user' ? 'selected' : ''}>Kullanıcı (Standart)</option>
                            <option value="admin" ${u?.role === 'admin' ? 'selected' : ''}>Yönetici (Admin)</option>
                        </select>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn-text" onclick="app.closeModal()">İptal</button>
                        <button type="submit" class="btn-primary">Kaydet</button>
                    </div>
                </form>
            </div>`;
        document.getElementById('userForm').onsubmit = (e) => {
            e.preventDefault();
            this.saveUser(id);
        };
    }

    saveUser(id) {
        let users = this.store.get('users') || [];
        const data = {
            id: id || Date.now(),
            name: document.getElementById('un').value.toLocaleUpperCase('tr-TR'),
            pass: document.getElementById('up').value,
            role: document.getElementById('ur').value
        };

        if (id) {
            users = users.map(x => x.id === id ? data : x);
        } else {
            users.push(data);
        }

        this.store.set('users', users);
        this.logAction(`${id ? 'Kullanıcı Güncellendi' : 'Yeni Kullanıcı Eklendi'}: ${data.name} (${data.role})`);
        this.closeModal();
        this.renderUsers();
    }

    deleteUser(id) {
        if (id === this.user.id) return this.showToast('Kendi kullanıcınızı silemezsiniz!', 'error');
        if (confirm('Kullanıcıyı silmek istediğinize emin misiniz?')) {
            let users = this.store.get('users') || [];
            users = users.filter(x => x.id !== id);
            this.store.set('users', users);
            this.logAction(`Kullanıcı Silindi: ID ${id}`);
            this.renderUsers();
        }
    }

    // --- HELPERS ---
    changeDate(n) { const d = new Date(this.currentDate); d.setDate(d.getDate() + n); this.currentDate = this.formatDate(d); this.renderMain(); }
    hexToRgb(h) { const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h); return r ? `${parseInt(r[1], 16)},${parseInt(r[2], 16)},${parseInt(r[3], 16)}` : '79,70,229'; }
    startDay() { if (confirm(`${this.currentDate} tarihli günü başlatmak istiyor musunuz?`)) { this.cache.activeShift = this.currentDate; this.store.set('activeShift', this.cache.activeShift); this.logAction(`İş Günü Başlatıldı: ${this.currentDate}`); this.renderMain(); } }
    closeDay() {
        if (confirm('Günü kapatmak istediğinize emin misiniz? Kapattığınızda bu günün cirosu otomatik olarak Hesap Detay sayfasına işlenecektir.')) {
            const dayRecords = this.cache.records[this.currentDate] || [];
            const totalCiro = dayRecords.reduce((a, b) => a + b.amount, 0);

            if (totalCiro > 0) {
                const totalRate = (this.cache.settings.vat || 0) + (this.cache.settings.reklam || 0);
                const matrahTotal = dayRecords.reduce((a, b) => a + (b.amount / (1 + totalRate / 100)), 0);
                const vatTotal = totalCiro - matrahTotal;

                const exists = this.cache.transactions.some(t => t.date === this.currentDate && t.category === 'Günlük Ciro');
                if (!exists) {
                    this.cache.transactions.push({ id: Date.now(), type: 'income', date: this.currentDate, category: 'Günlük Ciro', amount: totalCiro, desc: 'Ön Panelden otomatik aktarıldı.', user: 'SİSTEM' });
                }

                if (vatTotal > 0) {
                    const vatExists = this.cache.transactions.some(t => t.date === this.currentDate && t.category === 'Günlük KDV+Reklam');
                    if (!vatExists) {
                        this.cache.transactions.push({ id: Date.now() + 1, type: 'expense', date: this.currentDate, category: 'Günlük KDV+Reklam', amount: vatTotal, desc: 'Matrah üzerinden otomatik hesaplandı.', user: 'SİSTEM' });
                    }
                }
                this.store.set('transactions', this.cache.transactions);
                this.logAction(`Günlük Ciro Aktarıldı: ${this.currentDate} (${totalCiro} TL)`);
                if (vatTotal > 0) {
                    this.logAction(`G\u00fcnl\u00fck KDV+Reklam Aktar\u0131ld\u0131: ${this.currentDate} (${this.formatNum(vatTotal)} TL)`);
                }

                // Snapshot Leaves for history
                const leaveIds = this.cache.personnel.filter(p => p.status === 'izinli').map(p => p.id);
                this.cache.leaves[this.currentDate] = leaveIds;
                this.store.set('leaves', this.cache.leaves);

                // Personnel Commission Auto-Ledger
                const commRate = this.cache.settings.commission;
                const vatRate = this.cache.settings.vat;
                const rRate = this.cache.settings.reklam || 0;
                const activeP = this.cache.personnel.filter(p => p.status === 'active');
                activeP.forEach(p => {
                    const totalRateP = (vatRate || 0) + (rRate || 0);
                    const pTotalMatrah = dayRecords.filter(r => r.personnelId == p.id).reduce((sum, r) => sum + (r.amount / (1 + totalRateP / 100)), 0);
                    if (pTotalMatrah > 0) {
                        const commAmount = pTotalMatrah * commRate / 100;
                        if (!this.cache.ledgers[p.id]) this.cache.ledgers[p.id] = [];

                        // Prevent duplicate commission for same day
                        const dayExists = this.cache.ledgers[p.id].some(l => l.date === this.currentDate && l.type === 'commission');
                        if (!dayExists) {
                            this.cache.ledgers[p.id].push({
                                id: Date.now() + p.id,
                                date: this.currentDate,
                                type: 'commission',
                                amount: commAmount,
                                desc: `Otomatik Komisyon (%${commRate})`,
                                user: 'SİSTEM'
                            });
                        }
                    }
                });
                this.store.set('ledgers', this.cache.ledgers);
            }

            this.cache.closedDays.push(this.currentDate);
            this.store.set('closedDays', this.cache.closedDays);
            this.logAction(`İş Günü Kapatıldı: ${this.currentDate}`);
            this.cache.activeShift = null;
            this.store.set('activeShift', null);
            this.backupData(true);
            this.renderMain();
        }
    }
    reOpenDay() {
        if (confirm('Bu günü yeniden açmak istediğinize emin misiniz?')) {
            this.cache.closedDays = this.cache.closedDays.filter(d => d !== this.currentDate);
            this.store.set('closedDays', this.cache.closedDays);
            this.cache.activeShift = this.currentDate;
            this.store.set('activeShift', this.cache.activeShift);
            this.renderMain();
        }
    }
    backupData(auto = false) {
        const data = { records: this.cache.records, personnel: this.cache.personnel, settings: this.cache.settings, todo: this.cache.todo, closedDays: this.cache.closedDays, panelTitles: this.cache.panelTitles, transactions: this.cache.transactions, leaves: this.cache.leaves };

        // Auto-save to local disk via Electron
        if (window.electronAPI && window.electronAPI.autoBackup) {
            window.electronAPI.autoBackup(data);
        }

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `yedek_${this.currentDate}.json`; a.click();
        if (!auto) this.showToast('Yedek alındı.', 'success');
    }

    restoreData() {
        if (!confirm('DİKKAT: Yeni veri yüklemek mevcut tüm verilerinizin üzerine yazacaktır. Devam etmek istiyor musunuz?')) return;

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    // Basic validation
                    if (!data.personnel || !data.records) throw new Error('Geçersiz yedek dosyası!');

                    if (confirm('Veriler doğrulandı. Şimdi sistemi geri yüklüyoruz?')) {
                        this.store.set('personnel', data.personnel);
                        this.store.set('records', data.records);
                        this.store.set('settings', data.settings || this.cache.settings);
                        this.store.set('transactions', data.transactions || []);
                        this.store.set('todo', data.todo || { pending: [], extra: [], remaining: [] });
                        this.store.set('closedDays', data.closedDays || []);
                        this.store.set('panelTitles', data.panelTitles || { pending: 'Müşteri Bekleyenler', extra: 'Extra Panel', remaining: 'Müşteri Kalanlar' });

                        alert('Veriler başarıyla yüklendi! Sistem yeniden başlatılıyor...');
                        location.reload();
                    }
                } catch (err) {
                    alert('Hata: ' + err.message);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    editPanelTitle(type) {
        let titleLabel = '';
        if (type === 'pending') titleLabel = 'Bekleyen Kayıtlar';
        else if (type === 'extra') titleLabel = 'Extra';
        else titleLabel = 'Kalanlar';

        this.showInputModal(
            `${titleLabel} Panel Başlığı`,
            this.cache.panelTitles[type],
            (newTitle) => {
                this.cache.panelTitles[type] = newTitle;
                this.store.set('panelTitles', this.cache.panelTitles);
                this.renderMain();
            }
        );
    }

    addTodo(t) {
        this.showInputModal('Yeni Not', '', (v) => {
            this.cache.todo[t].push(v.toLocaleUpperCase('tr-TR'));
            this.store.set('todo', this.cache.todo);
            this.renderTodos();
        });
    }
    showPersonNoteModal(pid) {
        const isAdmin = this.user.role === 'admin';
        const isClosed = this.cache.closedDays.includes(this.currentDate);
        const canEdit = isAdmin || (!isClosed && this.cache.activeShift === this.currentDate);

        const p = this.cache.personnel.find(x => x.id == pid);
        if (!p) return;
        const currentNote = this.cache.personNotes[pid] || '';

        const ov = document.getElementById('modalOverlay');
        ov.classList.remove('hidden');
        ov.innerHTML = `
            <div class="modal-content" style="max-width:400px;">
                <h2 style="margin-bottom:10px;">${p.name} - Durum Indikatörü</h2>
                <p style="font-size:12px; color:var(--text-dim); margin-bottom:15px;">Üst satırdaki renk ve not tüm günlerde kalıcıdır.</p>
                <div class="form-row">
                    <div class="form-group">
                        <label>Başlık Rengi</label>
                        <input type="color" id="pnColor" value="${p.color || '#000000'}" style="height:40px; padding:2px;">
                    </div>
                    <div class="form-group">
                        <label>Durum</label>
                        <select id="pnStatus" style="padding:8px;">
                            <option value="active" ${p.status === 'active' ? 'selected' : ''}>Aktif</option>
                            <option value="izinli" ${p.status === 'izinli' ? 'selected' : ''}>İzinli</option>
                            <option value="pasif" ${p.status === 'pasif' ? 'selected' : ''}>Pasif</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Mesai 1 (Başla - Bitir)</label>
                        <div style="display:flex; gap:5px;">
                            <input type="time" id="pnShiftStart" value="${p.shiftStart || ''}" style="flex:1;">
                            <input type="time" id="pnShiftEnd" value="${p.shiftEnd || ''}" style="flex:1;">
                        </div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Mesai 2 (Başla - Bitir)</label>
                        <div style="display:flex; gap:5px;">
                            <input type="time" id="pnShiftStart2" value="${p.shiftStart2 || ''}" style="flex:1;">
                            <input type="time" id="pnShiftEnd2" value="${p.shiftEnd2 || ''}" style="flex:1;">
                        </div>
                    </div>
                </div>
                <div class="form-group">
                    <label>Haftalık İzin Günleri</label>
                    <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:5px; background:var(--bg-nav); padding:8px; border-radius:6px; font-size:10px;">
                        ${['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'].map(day => `
                            <label style="display:flex; align-items:center; gap:3px; cursor:pointer; color:var(--text-main); font-weight:500;">
                                <input type="checkbox" name="weeklyLeave" value="${day}" ${p.weeklyLeaves?.includes(day) ? 'checked' : ''}> ${day.slice(0,3)}
                            </label>
                        `).join('')}
                    </div>
                </div>
                <div class="form-group">
                    <label>Persistent Mesaj / Not</label>
                    <textarea id="pnContent" rows="3" style="width:100%; padding:10px; resize:none;">${currentNote}</textarea>
                </div>
                <div style="display:flex; gap:10px; margin-top:20px;">
                    <button class="btn-primary" onclick="app.savePersonNote('${pid}')" style="flex:1;">Kaydet</button>
                    ${currentNote ? `<button class="btn-text" onclick="app.deletePersonNote('${pid}')" style="color:var(--danger-color);">Notu Sil</button>` : ''}
                    <button class="btn-text" onclick="app.closeModal()">Vazgeç</button>
                </div>
            </div>
        `;
    }

    savePersonNote(pid) {
        const v = document.getElementById('pnContent').value.trim();
        const c = document.getElementById('pnColor').value;
        const s = document.getElementById('pnStatus').value;
        const shiftStart = document.getElementById('pnShiftStart').value;
        const shiftEnd = document.getElementById('pnShiftEnd').value;

        // Update Note
        this.cache.personNotes[pid] = v;
        if (!v) delete this.cache.personNotes[pid];
        this.store.set('personNotes', this.cache.personNotes);

        // Update Personnel Details (Color, Status, Shift Times, Weekly Leaves)
        const pIdx = this.cache.personnel.findIndex(x => x.id == pid);
        if (pIdx !== -1) {
            const weeklyLeaves = Array.from(document.querySelectorAll('input[name="weeklyLeave"]:checked')).map(cb => cb.value);
            const sanitize = (v) => (!v || v === 'undefined') ? '' : v;
            this.cache.personnel[pIdx] = {
                ...this.cache.personnel[pIdx],
                color: c,
                status: s,
                shiftStart: sanitize(document.getElementById('pnShiftStart').value),
                shiftEnd: sanitize(document.getElementById('pnShiftEnd').value),
                shiftStart2: sanitize(document.getElementById('pnShiftStart2').value),
                shiftEnd2: sanitize(document.getElementById('pnShiftEnd2').value),
                weeklyLeaves: weeklyLeaves
            };
            this.store.set('personnel', this.cache.personnel);
        }

        this.logAction(`Personel Bilgileri ve Not Güncellendi: ID ${pid}`);
        this.closeModal();
        this.renderMain();
        this.showToast('Personel bilgileri güncellendi.');
    }

    deletePersonNote(pid) {
        if (confirm('Bu notu silmek istediğinize emin misiniz?')) {
            delete this.cache.personNotes[pid];
            this.store.set('personNotes', this.cache.personNotes);
            this.logAction(`Personel Notu Silindi: ID ${pid}`);
            this.closeModal();
            this.renderMain();
            this.showToast('Not silindi.');
        }
    }

    renderWaitingRecords() {
        const el = document.getElementById('wList');
        if (!el) return;
        el.innerHTML = this.cache.waitingRecords.map((r, i) => {
            const p = r.personnelId ? this.cache.personnel.find(px => px.id == r.personnelId) : null;
            const pBadge = p ? `<div style="font-size:9px; color:#6366f1; font-weight:bold; background:rgba(99, 102, 241, 0.1); padding:1px 4px; border-radius:3px; border:1px solid rgba(99, 102, 241, 0.1); white-space:nowrap;">👤 ${p.alias || p.name}</div>` : '';
            return `
            <div class="todo-item" draggable="true" ondragstart="app.onWaitingDragStart(event, ${i})" onclick="app.editWaitingRecord(${i})" style="cursor:move; flex-direction:column; gap:4px; height:auto; padding:6px 8px; background:rgba(245, 158, 11, 0.05); border-color:rgba(245, 158, 11, 0.1); position:relative; min-height:45px; border-radius:6px; margin-bottom:4px;">
                <div style="display:flex; align-items:center; justify-content:space-between; width:100%; gap:8px;">
                    <div style="font-weight:700; font-size:11px; color:#1e293b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:110px;">${r.name}</div>
                    <div style="display:flex; align-items:center; gap:5px;">
                        <span style="font-size:10px; color:#b45309; font-weight:700;">${this.formatNum(r.amount)} TL</span>
                        ${pBadge}
                        <button class="btn-item-del" onclick="event.stopPropagation(); app.remWaitingRecord(${i})" style="padding:0 2px; font-size:14px; background:transparent; border:none; opacity:0.6;">\u00d7</button>
                    </div>
                </div>
                <div style="font-size:10px; color:#64748b; width:100%; line-height:1.2; white-space:normal; overflow:hidden; display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical;" title="${r.desc || ''}">
                    ${r.desc || ''}
                </div>
            </div>`;
        }).join('') || '<div style="color:#475569; font-size:10px; padding:5px;">Bekleyen kay\u0131t yok.</div>';
    }

    editWaitingRecord(i) {
        const r = this.cache.waitingRecords[i];
        this.showRecordModal(null, null, { ...r, _isWaiting: true, _waitIdx: i });
    }

    remWaitingRecord(i) {
        if (confirm('Bu bekleyen kaydı silmek istediğinize emin misiniz?')) {
            this.cache.waitingRecords.splice(i, 1);
            this.store.set('waitingRecords', this.cache.waitingRecords);
            this.renderWaitingRecords();
        }
    }

    onWaitingDragStart(e, i) {
        e.dataTransfer.setData('text/plain', i);
        e.dataTransfer.effectAllowed = 'move';
    }

    onWaitingDrop(e, pid, idx) {
        e.preventDefault();
        const isAdmin = this.user.role === 'admin';
        const isClosed = this.cache.closedDays.includes(this.currentDate);
        const isActive = this.cache.activeShift === this.currentDate;
        if (!(isActive && !isClosed)) {
            this.showToast('Kayıt atamak için önce günü başlatmalı veya (geçmişse) yeniden açmalısınız!', 'error');
            return;
        }

        const waitIdx = parseInt(e.dataTransfer.getData('text/plain'));
        const r = this.cache.waitingRecords[waitIdx];
        if (!r) return;

        const data = {
            ...r,
            personnelId: pid,
            rowIndex: idx,
            user: this.user.name,
            updatedBy: null
        };

        let day = this.cache.records[this.currentDate] || [];
        day = day.filter(x => !(x.personnelId == pid && x.rowIndex === idx));
        day.push(data);
        this.cache.records[this.currentDate] = day;
        this.store.set('records', this.cache.records);

        this.cache.waitingRecords.splice(waitIdx, 1);
        this.store.set('waitingRecords', this.cache.waitingRecords);

        // Remember the last chosen personnel
        this.cache.lastPersonnelId = pid;
        this.store.set('lastPersonnelId', pid);

        this.renderMain();
        this.showToast('Kayıt personele atandı.', 'success');
    }

    renderTodos() {
        this.renderWaitingRecords();
        ['extra', 'remaining'].forEach(t => {
            const el = document.getElementById(t[0] + 'List');
            if (el) el.innerHTML = (this.cache.todo[t] || []).map((x, i) => `
                <div class="todo-item">
                    <div class="todo-controls-left">
                        <div style="display:flex; flex-direction:column; width:14px; height:100%; justify-content:center;">
                            <button class="btn-move" onclick="app.moveTodo('${t}', ${i}, -1)" ${i === 0 ? 'disabled style="opacity:0.05"' : ''}>▲</button>
                            <button class="btn-move" onclick="app.moveTodo('${t}', ${i}, 1)" ${i === this.cache.todo[t].length - 1 ? 'disabled style="opacity:0.05"' : ''}>▼</button>
                        </div>
                        <button class="btn-move" onclick="app.copyTodo('${t}', ${i})" style="font-size:9px; height:100%; padding:0 2px;" title="Kopyala">📋</button>
                    </div>
                    <span class="todo-text" title="${x.replace(/"/g, '&quot;')}" onclick="app.editTodo('${t}',${i})">${x.length > 50 ? x.substring(0, 50) + '...' : x}</span>
                    <button class="btn-item-del" onclick="app.remTodo('${t}',${i})">×</button>
                </div>`).join('') || '<div style="color:#475569; font-size:10px; padding:5px;">Boş</div>';
        });
    }

    copyTodo(type, index) {
        const text = this.cache.todo[type][index];
        navigator.clipboard.writeText(text).then(() => {
            this.showToast('Kopyalandı', 'success');
        }).catch(() => {
            this.showToast('Kopyalama başarısız!', 'error');
        });
    }

    moveTodo(type, index, dir) {
        const list = this.cache.todo[type];
        const target = index + dir;
        if (target < 0 || target >= list.length) return;

        [list[index], list[target]] = [list[target], list[index]];
        this.store.set('todo', this.cache.todo);
        this.renderTodos();
    }
    editTodo(t, i) {
        const current = this.cache.todo[t][i];
        this.showInputModal('Notu D\u00fczenle', current, (val) => {
            this.cache.todo[t][i] = val;
            this.store.set('todo', this.cache.todo);
            this.renderTodos();
        });
    }
    remTodo(t, i) { if (confirm('Silmek istedi\u011finize emin misiniz?')) { this.cache.todo[t].splice(i, 1); this.store.set('todo', this.cache.todo); this.renderTodos(); } }

    showRecordModal(pid, idx, rec) {
        const isAdmin = this.user.role === 'admin';
        const isClosed = this.cache.closedDays.includes(this.currentDate);
        const isActive = this.cache.activeShift === this.currentDate;

        if (!(isActive && !isClosed)) {
            this.showToast('Kayıt yapmak için önce günü başlatmalı veya (geçmişse) yeniden açmalısınız!', 'error');
            return;
        }

        const ov = document.getElementById('modalOverlay'); ov.classList.remove('hidden');
        ov.innerHTML = `
            <div class="modal-content">
                <h2>Kay\u0131t Formu</h2>
                <form id="rForm">
                    <div style="margin-bottom:15px; background:rgba(245, 158, 11, 0.1); padding:10px; border-radius:6px; border:1px solid rgba(245, 158, 11, 0.3);">
                        <label style="display:flex; align-items:center; gap:10px; cursor:pointer; color:#f59e0b; font-weight:bold;">
                            <input type="checkbox" id="isWaiting" ${rec?._isWaiting ? 'checked' : ''} style="width:18px; height:18px;">
                            BEKLEYENLERE EKLE
                        </label>
                    </div>
                    <div class="form-group">
                        <label>M\u00fc\u015fteri</label>
                        <div style="display:flex; gap:5px; margin-bottom:5px;">
                            <div class="searchable-select" id="rn_dropdown" style="flex:1;">
                                <div class="search-input-wrapper">
                                    <input type="text" class="search-input" id="rn" 
                                        placeholder="M\u00fc\u015fteri ara veya yaz..." 
                                        value="${rec?.name || ''}"
                                        onfocus="this.select(); document.getElementById('rn_list').classList.add('show')"
                                        oninput="app.filterSearchableList('rn_list', this.value)"
                                        required autocomplete="off"
                                    >
                                </div>
                                <div class="select-dropdown" id="rn_list">
                                    ${this.cache.customers.filter(c => c.status === 'active').sort((a,b)=>a.name.localeCompare(b.name, 'tr-TR')).map(c => `
                                        <div class="select-option ${rec?.customerId === c.id ? 'selected' : ''}" 
                                            onclick="app.selectSearchableOptionMain('${c.id}', '${c.name.replace(/'/g, "\\'")}', 'rn', 'rn_list')">
                                            ${c.name}
                                        </div>
                                    `).join('')}
                                </div>
                            <input type="hidden" id="rn_cid" value="${rec?.customerId || ''}">
                        </div>
                    </div>
                    <div class="form-group"><label>A\u00e7\u0131klama</label><input id="rd" value="${rec?.desc || ''}"></div>
                    <div class="form-row">
                        <div class="form-group"><label>Ba\u015flang\u0131\u00e7 Saati</label><input type="time" id="rs" value="${rec?.startTime || ''}"></div>
                        <div class="form-group"><label>Biti\u015f Saati</label><input type="time" id="re" value="${rec?.endTime || ''}"></div>
                    </div>
                    <div class="form-row">
                        <div class="form-group"><label>Renk Vurgusu</label><input type="color" id="rc" value="${rec?.color || '#ffffff'}"></div>
                        <div class="form-group">
                            <label>Tutar</label>
                            <input type="number" step="0.01" id="ra" value="${rec?.amount || ''}" required>
                            <div id="netPreview" style="font-size:11px; color:var(--text-dim); margin-top:8px; background:rgba(0,0,0,0.02); padding:8px; border-radius:6px; border:1px dashed var(--border-color); min-height:85px;">
                                ${(() => {
                                    const val = rec?.amount || 0;
                                    const totalRate = (this.cache.settings.vat || 0) + (this.cache.settings.reklam || 0);
                                    const cRate = this.cache.settings.commission;
                                    
                                    const net = val / (1 + totalRate / 100);
                                    const vatAndRek = val - net;
                                    const comm = net * cRate / 100;

                                    return `
                                        <div style="display:flex; justify-content:space-between;"><span>Br\u00fct Tutar:</span> <span>${this.formatNum(val)} TL</span></div>
                                        <div style="display:flex; justify-content:space-between; color:#ef4444;"><span>KDV+Reklam Kesintisi:</span> <span>-${this.formatNum(vatAndRek)} TL</span></div>
                                        <div style="display:flex; justify-content:space-between; font-weight:bold; color:var(--accent-color); margin-top:5px; border-top:1px solid var(--border-color); padding-top:5px;">
                                            <span>FATURA (MATRAH):</span> <span>${this.formatNum(net)} TL</span>
                                        </div>
                                        <div style="display:flex; justify-content:space-between; color:#6366f1; margin-top:3px;">
                                            <span>Personel Komisyon (%${cRate}):</span> <span>${this.formatNum(comm)} TL</span>
                                        </div>
                                    `;
                                })()}
                            </div>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Banka</label>
                            <select id="rbank">
                                <option value="">Se\u00e7iniz...</option>
                                ${(this.cache.definitions.bank || []).map(b => `<option value="${b}" ${rec?.bank === b ? 'selected' : ''}>${b}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Personel Kullan\u0131c\u0131 Ad\u0131</label>
                            <select id="run">
                                <option value="" ${(!pid && !rec?.personnelId) ? 'selected' : ''}>-- Personel Se\u00e7ilmedi --</option>
                                ${[...this.cache.personnel].filter(p => p.status === 'active' || p.status === 'izinli').sort((a,b) => {
                                    const s1 = String(a.alias || a.name || "").trim();
                                    const s2 = String(b.alias || b.name || "").trim();
                                    return s1.localeCompare(s2, 'tr-TR');
                                }).map(p => {
                                    const isSelected = (pid ? pid == p.id : (rec?.personnelId ? rec.personnelId == p.id : false));
                                    return `<option value="${p.id}" ${isSelected ? 'selected' : ''}>${p.alias || p.name}</option>`;
                                }).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="modal-actions" style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            ${rec ? `<button type="button" style="background:#fee2e2; color:#ef4444; border:1px solid #fecaca; padding:8px 16px; border-radius:8px; cursor:pointer; font-weight:600; font-size:13px;" onclick="app.deleteCurrentRecord(${pid ? "'" + pid + "'" : "null"}, ${idx !== null ? idx : "null"}, ${rec?._isWaiting ? 'true' : 'false'}, ${rec?._waitIdx !== undefined ? rec._waitIdx : 'null'})">🗑 Sil</button>` : ''}
                        </div>
                        <div style="display:flex; gap:8px;">
                            <button type="button" class="btn-text" onclick="app.closeModal()">\u0130ptal</button>
                            <button type="submit" class="btn-primary">Kaydet</button>
                        </div>
                    </div>
                </form>
            </div>`;

        const raIn = document.getElementById('ra');
        const np = document.getElementById('netPreview');
        raIn.oninput = () => {
            const val = parseFloat(raIn.value) || 0;
            const totalRate = (this.cache.settings.vat || 0) + (this.cache.settings.reklam || 0);
            const cRate = this.cache.settings.commission;
            
            const net = val / (1 + totalRate / 100);
            const vatAndRek = val - net;
            const comm = net * cRate / 100;
            
            np.innerHTML = `
                <div style="display:flex; justify-content:space-between;"><span>Br\u00fct Tutar:</span> <span>${this.formatNum(val)} TL</span></div>
                <div style="display:flex; justify-content:space-between; color:#ef4444;"><span>KDV+Reklam Kesintisi:</span> <span>-${this.formatNum(vatAndRek)} TL</span></div>
                <div style="display:flex; justify-content:space-between; font-weight:bold; color:var(--accent-color); margin-top:5px; border-top:1px solid var(--border-color); padding-top:5px;">
                    <span>FATURA (MATRAH):</span> <span>${this.formatNum(net)} TL</span>
                </div>
                <div style="display:flex; justify-content:space-between; color:#6366f1; margin-top:3px;">
                    <span>Personel Komisyon (%${cRate}):</span> <span>${this.formatNum(comm)} TL</span>
                </div>
            `;
        };

        document.getElementById('rForm').onsubmit = (e) => {
            e.preventDefault();
            const customerName = document.getElementById('rn').value.trim().toLocaleUpperCase('tr-TR');
            let customerId = document.getElementById('rn_cid').value || null;

            if (!customerName) return this.showToast('Lütfen bir müşteri ismi girin.', 'error');

            // Security: Verify if the existing ID still matches the typed name
            if (customerId) {
                const check = this.cache.customers.find(c => c.id === customerId);
                if (!check || check.name.toLocaleUpperCase('tr-TR') !== customerName) {
                    customerId = null; // Name changed, reset ID to search or create new
                }
            }

            // Auto-create or find customer if no valid ID
            if (!customerId) {
                const existing = this.cache.customers.find(c => c.name.toLocaleUpperCase('tr-TR') === customerName);
                if (existing) {
                    customerId = existing.id;
                } else {
                    customerId = Date.now().toString();
                    this.cache.customers.push({ id: customerId, name: customerName, phone: '', address: '', notes: '', status: 'active' });
                    this.store.set('customers', this.cache.customers);
                    this.logAction(`Yeni Müşteri Otomatik Oluşturuldu: ${customerName}`);
                }
            }

            const isWait = document.getElementById('isWaiting').checked;

            const data = {
                name: customerName,
                customerId: customerId,
                desc: document.getElementById('rd').value.toLocaleUpperCase('tr-TR'),
                color: document.getElementById('rc').value,
                amount: parseFloat(document.getElementById('ra').value),
                startTime: document.getElementById('rs').value,
                endTime: document.getElementById('re').value,
                bank: document.getElementById('rbank').value,
                personnelId: document.getElementById('run').value || null,
                user: rec?.user || this.user.name,
                updatedBy: rec ? this.user.name : null
            };

            if (isWait) {
                // Remove from grid if it was there
                if (pid !== null && idx !== null) {
                    let day = this.cache.records[this.currentDate] || [];
                    day = day.filter(x => !(x.personnelId == pid && x.rowIndex === idx));
                    this.cache.records[this.currentDate] = day;
                }
                
                // If editing an existing waiting record
                if (rec?._isWaiting && rec?._waitIdx !== undefined) {
                    this.cache.waitingRecords[rec._waitIdx] = data;
                } else {
                    this.cache.waitingRecords.push(data);
                }
                this.store.set('waitingRecords', this.cache.waitingRecords);
            } else {
                const newPid = document.getElementById('run').value;
                let targetIdx = idx || 0;

                // Collision check
                let day = this.cache.records[this.currentDate] || [];
                if (newPid != pid || idx === null) {
                    const collision = day.find(x => x.personnelId == newPid && x.rowIndex === targetIdx);
                    if (collision || idx === null) {
                        const targetPersonnelRecords = day.filter(x => x.personnelId == newPid);
                        const maxRow = targetPersonnelRecords.reduce((max, r) => Math.max(max, r.rowIndex), -1);
                        targetIdx = maxRow + 1;
                    }
                }

                // Remove from waiting records if it was there
                if (rec?._isWaiting && rec?._waitIdx !== undefined) {
                    this.cache.waitingRecords.splice(rec._waitIdx, 1);
                    this.store.set('waitingRecords', this.cache.waitingRecords);
                }

                const recordData = {
                    ...data,
                    personnelId: newPid,
                    rowIndex: targetIdx,
                    customerUsername: document.getElementById('run').options[document.getElementById('run').selectedIndex].text
                };

                if (pid !== null && idx !== null) {
                    day = day.filter(x => !(x.personnelId == pid && x.rowIndex === idx));
                }
                day.push(recordData);
                this.cache.records[this.currentDate] = day;
                this.store.set('records', this.cache.records);
            }

            // Remember the last chosen personnel regardless of waiting state
            const finalPid = document.getElementById('run').value;
            if (finalPid) {
                this.cache.lastPersonnelId = finalPid;
                this.store.set('lastPersonnelId', finalPid);
            }

            this.closeModal();
            this.renderMain();
        };
    }

    deleteCurrentRecord(pid, idx, isWaiting, waitIdx) {
        if (!confirm('Bu kayd\u0131 silmek istedi\u011finize emin misiniz?')) return;

        if (isWaiting && waitIdx !== null && waitIdx !== undefined) {
            this.cache.waitingRecords.splice(waitIdx, 1);
            this.store.set('waitingRecords', this.cache.waitingRecords);
            this.logAction('Bekleyen Kay\u0131t Silindi');
        } else if (pid !== null && idx !== null) {
            let day = this.cache.records[this.currentDate] || [];
            day = day.filter(x => !(x.personnelId == pid && x.rowIndex === idx));
            this.cache.records[this.currentDate] = day;
            this.store.set('records', this.cache.records);
            this.logAction(`Grid Kay\u0131t Silindi: Personel ID ${pid}`);
        }
        
        this.closeModal();
        this.renderMain();
        this.showToast('Kay\u0131t ba\u015far\u0131yla silindi.', 'success');
    }

    quickAddCustomer() {
        this.showInputModal('Yeni M\u00fc\u015fteri Ad\u0131', '', (name) => {
            if (!name.trim()) return;
            const upName = name.trim().toLocaleUpperCase('tr-TR');
            const id = Date.now().toString();
            this.cache.customers.push({ id, name: upName, phone: '', startTime: '', endTime: '', address: '', notes: '', status: 'active' });
            this.store.set('customers', this.cache.customers);
            const rnInput = document.getElementById('rn');
            if (rnInput) {
                rnInput.value = upName;
                rnInput.dataset.customerId = id;
            }
            this.showToast('M\u00fc\u015fteri eklendi: ' + upName, 'success');
        });
    }

    showPersonnelModal(id = null) {
        const p = id ? this.cache.personnel.find(x => x.id == id) : null;
        const ov = document.getElementById('modalOverlay'); ov.classList.remove('hidden');
        ov.innerHTML = `
            <div class="modal-content" style="width:450px;">
                <h2>${id ? 'Personel Düzenle' : 'Yeni Personel Ekle'}</h2>
                <form id="pForm">
                    <div class="form-row">
                        <div class="form-group">
                            <label>Ad Soyad</label>
                            <input id="pn" value="${p?.name || ''}" required placeholder="Örn: Ahmet Yılmaz">
                        </div>
                        <div class="form-group">
                            <label>Kullanıcı Adı (Tabloda Gösterilecek)</label>
                            <input id="pa" value="${p?.alias || ''}" placeholder="Örn: Ahmet">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>TC Kimlik No</label>
                            <input id="pt" value="${p?.tc || ''}" maxlength="11" placeholder="11 haneli">
                        </div>
                        <div class="form-group">
                            <label>Telefon</label>
                            <input id="pp" value="${p?.phone || ''}" placeholder="05XX XXX XX XX">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Mesai 1 (Ba\u015fla - Bitir)</label>
                            <div style="display:flex; gap:5px;">
                                <input type="time" id="shS" value="${p?.shiftStart || ''}" style="flex:1;">
                                <input type="time" id="shE" value="${p?.shiftEnd || ''}" style="flex:1;">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Mesai 2 (Ba\u015fla - Bitir)</label>
                            <div style="display:flex; gap:5px;">
                                <input type="time" id="shS2" value="${p?.shiftStart2 || ''}" style="flex:1;">
                                <input type="time" id="shE2" value="${p?.shiftEnd2 || ''}" style="flex:1;">
                            </div>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>\u0130\u015fe Giri\u015f Tarihi</label>
                            <input type="date" id="ph" value="${p?.hireDate || ''}">
                        </div>
                        <div class="form-group">
                            <label>Durum</label>
                            <select id="ps">
                                <option value="active" ${p?.status === 'active' ? 'selected' : ''}>Aktif</option>
                                <option value="izinli" ${p?.status === 'izinli' ? 'selected' : ''}>\u0130zinli</option>
                                <option value="pasif" ${p?.status === 'pasif' ? 'selected' : ''}>Pasif</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Haftal\u0131k \u0130zin G\u00fcnleri</label>
                        <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:6px; background:var(--bg-nav); padding:8px; border-radius:6px; font-size:11px; margin-top:5px;">
                            ${['Pazartesi', 'Sal\u0131', '\u00c7ar\u015famba', 'Per\u015fembe', 'Cuma', 'Cumartesi', 'Pazar'].map(day => `
                                <label style="display:flex; align-items:center; gap:4px; cursor:pointer; color:var(--text-main); font-weight:500;">
                                    <input type="checkbox" name="adminWeeklyLeave" value="${day}" ${p?.weeklyLeaves?.includes(day) ? 'checked' : ''}> ${day.slice(0,3)}
                                </label>
                            `).join('')}
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn-text" onclick="app.closeModal()">İptal</button>
                        <button type="submit" class="btn-primary">Kaydet</button>
                    </div>
                </form>
            </div>
        `;
        document.getElementById('pForm').onsubmit = (e) => {
            e.preventDefault();
            const newData = {
                id: id || Date.now(),
                name: document.getElementById('pn').value.toLocaleUpperCase('tr-TR'),
                alias: document.getElementById('pa').value.trim().toLocaleUpperCase('tr-TR'),
                tc: document.getElementById('pt').value,
                phone: document.getElementById('pp').value,
                hireDate: document.getElementById('ph').value,
                shiftStart: document.getElementById('shS').value,
                shiftEnd: document.getElementById('shE').value,
                shiftStart2: document.getElementById('shS2').value,
                shiftEnd2: document.getElementById('shE2').value,
                color: p?.color || '#ffffff',
                status: document.getElementById('ps').value,
                weeklyLeaves: Array.from(document.querySelectorAll('input[name="adminWeeklyLeave"]:checked')).map(cb => cb.value)
            };
            
            if (id) {
                // Merge to avoid destroying shiftStart, shiftEnd, and other dynamic data
                this.cache.personnel = this.cache.personnel.map(x => x.id == id ? { ...x, ...newData } : x);
            } else {
                this.cache.personnel.push(newData);
            }
            this.store.set('personnel', this.cache.personnel);
            this.logAction(`${id ? 'Personel Güncellendi' : 'Yeni Personel Eklendi'}: ${newData.name}`);
            this.closeModal();
            this.renderPersonnel();
        };
    }


    renderPermissions() {
        const pages = [
            { id: 'main', name: 'Ön Panel' },
            { id: 'finance', name: 'Hesap Detay' },
            { id: 'personnel', name: 'Personeller' },
            { id: 'customers', name: 'Müşteriler' },
            { id: 'users', name: 'Kullanıcılar' },
            { id: 'definitions', name: 'Tanımlamalar' },
            { id: 'permissions', name: 'Yetkiler' },
            { id: 'actionLogs', name: 'İşlem Kayıtları' },
            { id: 'settings', name: 'Ayarlar' }
        ];
        const roles = ['admin', 'user'];

        document.getElementById('mainContent').innerHTML = `
            <div class="admin-view">
                <div class="admin-header">
                    <h2>Sayfa Erişim Yetkileri</h2>
                </div>
                <div class="excel-wrapper">
                    <table class="excel-table" style="width:100%;">
                        <thead>
                            <tr>
                                <th style="text-align:left; padding-left:15px;">Sayfa / Menü</th>
                                <th>Admin Yetkisi</th>
                                <th>User Yetkisi</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${pages.map(p => `
                                <tr>
                                    <td style="text-align:left; padding-left:15px; font-weight:bold;">${p.name}</td>
                                    ${roles.map(r => `
                                        <td>
                                            <input type="checkbox" 
                                                ${this.cache.permissions[r]?.includes(p.id) ? 'checked' : ''}
                                                onchange="app.togglePerm('${r}', '${p.id}')"
                                                ${r === 'admin' && p.id === 'permissions' ? 'disabled' : ''}>
                                        </td>
                                    `).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <p style="margin-top:20px; font-size:12px; color:var(--text-dim);">
                    * Değişiklikler anında kaydedilir ve bir sonraki sayfa yüklemesinde veya menü geçişinde aktif olur.
                </p>
            </div>`;
    }

    togglePerm(role, pageId) {
        let perms = this.cache.permissions[role] || [];
        if (perms.includes(pageId)) {
            perms = perms.filter(x => x !== pageId);
        } else {
            perms.push(pageId);
        }
        this.cache.permissions[role] = perms;
        this.store.set('permissions', this.cache.permissions);
        this.renderBase(); // Refresh nav
        this.renderPermissions();
    }

    showLedgerModal(pid, filterStart = null, filterEnd = null) {
        const p = this.cache.personnel.find(x => x.id == pid);
        if (!p) return;

        let ledger = this.cache.ledgers[pid] || [];

        // Defaults for date range (last 30 days)
        if (!filterStart) {
            const d = new Date();
            d.setDate(d.getDate() - 30);
            filterStart = d.toISOString().split('T')[0];
        }
        if (!filterEnd) filterEnd = this.today;

        // Apply filters
        const filtered = ledger.filter(l => l.date >= filterStart && l.date <= filterEnd);

        const ear = ledger.filter(l => l.type === 'commission').reduce((s, l) => s + l.amount, 0);
        const pay = ledger.filter(l => l.type === 'payment').reduce((s, l) => s + l.amount, 0);
        const bal = ear - pay;

        // Subtotals for movements view
        const subEar = filtered.filter(l => l.type === 'commission').reduce((s, l) => s + l.amount, 0);
        const subPay = filtered.filter(l => l.type === 'payment').reduce((s, l) => s + l.amount, 0);

        const ov = document.getElementById('modalOverlay');
        ov.classList.remove('hidden');
        ov.innerHTML = `
            <div class="modal-ledger">
                <div class="modal-header" style="padding: 20px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; background: #fff;">
                    <h3 style="margin:0; font-family: 'Outfit', sans-serif; color: var(--primary-color);">Cari Hesap & Hareketler: ${p.name}</h3>
                    <button class="btn-close" onclick="app.closeModal()" style="background:none; border:none; font-size:24px; cursor:pointer; color:var(--text-dim);">×</button>
                </div>
                
                <div style="padding:25px; background: #fdfdfd;">
                    <!-- Özet Kartları -->
                    <div class="ledger-stats">
                        <div class="stat-card">
                            <label style="font-size:12px; color:var(--text-dim); display:block; margin-bottom:5px;">Toplam Hakediş</label>
                            <div style="font-size:20px; font-weight:700; color:var(--accent-color);">${this.formatNum(ear)} TL</div>
                        </div>
                        <div class="stat-card">
                            <label style="font-size:12px; color:var(--text-dim); display:block; margin-bottom:5px;">Toplam Ödeme</label>
                            <div style="font-size:20px; font-weight:700; color:var(--danger-color);">${this.formatNum(pay)} TL</div>
                        </div>
                        <div class="stat-card" style="background: ${bal > 0 ? '#f0fdf4' : '#fff'}; border-color: ${bal > 0 ? '#bbf7d0' : 'var(--border-color)'};">
                            <label style="font-size:12px; color:var(--text-dim); display:block; margin-bottom:5px;">Kalan Bakiye</label>
                            <div style="font-size:20px; font-weight:700; color: ${bal > 0 ? '#166534' : 'var(--text-main)'};">${this.formatNum(bal)} TL</div>
                        </div>
                    </div>

                    <!-- Hareketler Filtre Bar -->
                    <div class="ledger-filter-bar">
                        <div style="display:flex; align-items:center; gap:10px; flex:1;">
                            <span style="font-weight:600; font-size:13px; color:var(--text-main);">Hareket Filtresi:</span>
                            <input type="date" id="lfs" value="${filterStart}" class="btn-text" style="padding:5px 10px; background:#fff;">
                            <span style="color:var(--text-dim)">-</span>
                            <input type="date" id="lfe" value="${filterEnd}" class="btn-text" style="padding:5px 10px; background:#fff;">
                            <button class="btn-primary" style="padding:6px 15px; font-size:12px;" onclick="app.applyLedgerFilter(${pid})">Filtrele</button>
                        </div>
                        <div style="text-align:right;">
                            <span style="font-size:12px; color:var(--text-dim);">Dönem Hakediş: <strong style="color:var(--accent-color)">+${this.formatNum(subEar)} TL</strong></span>
                        </div>
                    </div>

                    <!-- Yeni Kayıt Formu (Admin/Edit yetkisi varsa) -->
                    <div style="background: #fff; padding: 15px; border-radius: 12px; border: 1px solid var(--border-color); margin-bottom: 25px;">
                        <h4 style="margin:0 0 15px 0; font-size:14px; color:var(--text-main);">Yeni Ödeme Ekle</h4>
                        <form id="payForm" style="display:flex; gap:12px; align-items: flex-end;">
                            <div style="flex:1;">
                                <label style="font-size:11px; color:var(--text-dim); margin-bottom:4px; display:block;">Tarih</label>
                                <input type="date" id="pd" value="${this.today}" required>
                            </div>
                            <div style="flex:1;">
                                <label style="font-size:11px; color:var(--text-dim); margin-bottom:4px; display:block;">Tutar</label>
                                <input type="number" id="pa" placeholder="0.00" step="0.01" required>
                            </div>
                            <div style="flex:2;">
                                <label style="font-size:11px; color:var(--text-dim); margin-bottom:4px; display:block;">Açıklama</label>
                                <input type="text" id="px" placeholder="Örn: Haftalık ödeme">
                            </div>
                            <button type="submit" class="btn-primary" style="height:42px; padding:0 25px;">Ödeme Yap</button>
                        </form>
                    </div>

                    <!-- Tablo -->
                    <div style="background:#fff; border-radius:12px; border:1px solid var(--border-color); overflow:hidden;">
                        <table class="excel-table" style="width:100%; margin:0; border:none;">
                            <thead style="background:#f8fafc;">
                                <tr>
                                    <th style="padding:12px;">Tarih</th>
                                    <th style="text-align:left; padding:12px;">Açıklama</th>
                                    <th>Tür</th>
                                    <th style="text-align:right; padding:12px;">Tutar</th>
                                    <th>İşlem</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${filtered.sort((a, b) => b.id - a.id).map(l => `
                                    <tr style="border-bottom: 1px solid #f1f5f9;">
                                        <td style="padding:10px;">${l.date.split('-').reverse().join('.')}</td>
                                        <td style="text-align:left; padding:10px; color:var(--text-main);">${l.desc || '-'}</td>
                                        <td style="padding:10px;">
                                            <span class="badge-${l.type === 'commission' ? 'active' : 'pasif'}" style="font-size:9px; padding:2px 6px;">
                                                ${l.type === 'commission' ? 'HAKEDİŞ' : 'ÖDEME'}
                                            </span>
                                        </td>
                                        <td style="text-align:right; padding:10px; font-weight:700; color:${l.type === 'commission' ? 'var(--accent-color)' : 'var(--danger-color)'}">
                                            ${l.type === 'commission' ? '+' : '-'}${this.formatNum(l.amount)} TL
                                        </td>
                                        <td style="padding:10px;">
                                            <button class="btn-mini" style="background:#fee2e2; color:#ef4444; border:none; width:24px; height:24px; border-radius:4px; display:inline-flex; align-items:center; justify-content:center;" onclick="app.deleteLedgerEntry(${pid}, ${l.id})">×</button>
                                        </td>
                                    </tr>
                                `).join('') || '<tr><td colspan="5" style="padding:40px; text-align:center; color:var(--text-dim)">Bu tarih aralığında hareket bulunamadı.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('payForm').onsubmit = (e) => {
            e.preventDefault();
            this.savePayment(pid);
        };
    }

    applyLedgerFilter(pid) {
        const start = document.getElementById('lfs').value;
        const end = document.getElementById('lfe').value;
        this.showLedgerModal(pid, start, end);
    }

    savePayment(pid) {
        const amt = parseFloat(document.getElementById('pa').value);
        if (amt <= 0) return;

        if (!this.cache.ledgers[pid]) this.cache.ledgers[pid] = [];
        this.cache.ledgers[pid].push({
            id: Date.now(),
            date: document.getElementById('pd').value,
            type: 'payment',
            amount: amt,
            desc: (document.getElementById('px').value || 'Personel ödemesi').toLocaleUpperCase('tr-TR'),
            user: this.user.name
        });

        this.store.set('ledgers', this.cache.ledgers);
        this.logAction(`Personel Ödemesi Kaydedildi: ID ${pid} (${amt} TL)`);
        this.showLedgerModal(pid); // Refresh
        this.renderPersonnel(); // Refresh bakiye
    }

    deleteLedgerEntry(pid, id) {
        if (confirm('Bu işlemi silmek istediğinize emin misiniz?')) {
            this.cache.ledgers[pid] = this.cache.ledgers[pid].filter(l => l.id !== id);
            this.store.set('ledgers', this.cache.ledgers);
            this.logAction(`Personel Cari Kaydı Silindi: ID ${pid}, İşlem ID ${id}`);
            this.showLedgerModal(pid);
            this.renderPersonnel();
        }
    }

    closeModal() { document.getElementById('modalOverlay').classList.add('hidden'); }

    openBackups() {
        if (window.electronAPI && window.electronAPI.READY) {
            window.electronAPI.openBackupFolder();
        } else {
            console.error("Electron API bridge not ready.");
            alert("⚠️ Sistem klasörü sadece Masaüstü Uygulaması sürümünde açılabilir.\n\nSiz şu an 'index.html' üzerinden Web Tarayıcıda açmışsınız. Bunun yerine lütfen 'Yedeği İndir' butonunu kullanarak verilerinizi dosya olarak kaydedin.");
        }
    }

    downloadBackup() {
        const data = {
            timestamp: new Date().toLocaleString(),
            personnel: this.cache.personnel,
            settings: this.cache.settings,
            records: this.cache.records,
            transactions: this.cache.transactions,
            ledgers: this.cache.ledgers,
            todo: this.cache.todo,
            announcements: this.cache.announcements
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `yedek_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

// Global initialization
window.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
