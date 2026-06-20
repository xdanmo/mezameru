// ==========================================
// GOOGLE DRIVE API SYNC LOGIC
// ==========================================

const CLIENT_ID = '1057081070342-87s2apeim9b3qn1a4kol0p7l2gbttp3k.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';

let localToken = localStorage.getItem('mezameru_drive_token');
let driveToken = (localToken === 'null' || localToken === 'undefined' || !localToken) ? null : localToken;

const FILE_NAME = 'mezameru_data.json';
let driveFileId = null;

const DEFAULT_STATE = {
    selectedDate: '', currentFilter: 'TODO', analyticsRange: '7days', customDays: 14, habits: []
};

let APP_STATE = JSON.parse(localStorage.getItem('mezameru_local_state')) || DEFAULT_STATE;

function logoutUser() {
    driveToken = null;
    localStorage.removeItem('mezameru_drive_token');
    
    const btnLogin = document.getElementById('btn-google-login');
    if (btnLogin) btnLogin.style.display = 'block';
    
    const loginStatus = document.getElementById('login-status');
    if (loginStatus) loginStatus.style.display = 'none';

    const loginScreen = document.getElementById('login-screen');
    if(loginScreen) loginScreen.classList.add('active');
}

async function syncWithDrive() {
    if (!driveToken) return;
    try {
        const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${FILE_NAME}'`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${driveToken}` }
        });
        
        if (searchRes.status === 401) throw new Error("TOKEN_EXPIRED");
        if (!searchRes.ok) throw new Error("API ERROR");
        
        const searchData = await searchRes.json();

        if (searchData.files && searchData.files.length > 0) {
            driveFileId = searchData.files[0].id;
            const contentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${driveToken}` }
            });
            const cloudData = await contentRes.json();
            APP_STATE = cloudData;
        } else {
            await uploadToDrive(true);
        }

        const loginScreen = document.getElementById('login-screen');
        if(loginScreen) loginScreen.classList.remove('active');

        saveLocal(); 
        reRenderAll();
    } catch (error) {
        console.error('SYNC_FAIL:', error);
        if (error.message === "TOKEN_EXPIRED") logoutUser();
        reRenderAll();
    }
}

async function uploadToDrive(isNew = false) {
    if (!driveToken) return;
    try {
        const metadata = { name: FILE_NAME, parents: ['appDataFolder'] };
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([JSON.stringify(APP_STATE)], { type: 'application/json' }));

        let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
        let method = 'POST';

        if (!isNew && driveFileId) {
            url = `https://www.googleapis.com/upload/drive/v3/files/${driveFileId}?uploadType=multipart`;
            method = 'PATCH';
        }
        const res = await fetch(url, { method: method, headers: { 'Authorization': `Bearer ${driveToken}` }, body: form });
        
        if (res.status === 401) {
            logoutUser();
            return;
        }
        
        const data = await res.json();
        if (isNew) driveFileId = data.id;
    } catch (error) { console.error("UPLOAD_FAIL:", error); }
}

function pruneOldData() {
    const today = new Date();
    const cutoffDate = new Date(today);
    cutoffDate.setDate(today.getDate() - 99);
    
    const cutoffKey = formatDateKey(cutoffDate); 

    APP_STATE.habits.forEach(habit => {
        Object.keys(habit.history).forEach(dateKey => {
            if (dateKey < cutoffKey) {
                delete habit.history[dateKey];
            }
        });
    });
}

function saveState() {
    pruneOldData(); 
    saveLocal();
    if (driveToken) uploadToDrive(false);
}

function saveLocal() {
    localStorage.setItem('mezameru_local_state', JSON.stringify(APP_STATE));
}

// ==========================================
// APP LOGIC & RENDERING
// ==========================================

const formatDateKey = (dateObj) => {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const formatDisplayDate = (dateKey) => {
    const [y, m, d] = dateKey.split('-');
    const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
    return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
};

const getHabitRecord = (habitId, dateKey) => {
    const habit = APP_STATE.habits.find(h => h.id === habitId);
    if (!habit) return null;
    if (!habit.history[dateKey]) habit.history[dateKey] = { current: 0, status: 'TODO' };
    return habit.history[dateKey];
};

const homeListContainer = document.getElementById('home-habit-list');
const editListContainer = document.getElementById('edit-habit-list');
const analyticsListContainer = document.getElementById('analytics-habit-list');

const renderHomeTab = () => {
    homeListContainer.innerHTML = '';
    let visibleCount = 0;

    APP_STATE.habits.forEach(habit => {
        const record = getHabitRecord(habit.id, APP_STATE.selectedDate);
        if (record.status !== APP_STATE.currentFilter && !(APP_STATE.currentFilter === 'TODO' && record.status === 'TODO')) return;

        visibleCount++;
        const card = document.createElement('div');
        card.className = 'habit-card';
        card.setAttribute('data-id', habit.id);
        
        const statusClass = record.status !== 'TODO' ? record.status : '';
        let btnText = `${record.current}/${habit.max} ${habit.unit}`;
        if (record.status === 'SKIPPED') btnText = 'SKIPPED';

        card.innerHTML = `<div class="habit-info"><h3>${habit.name}</h3></div><button class="status-btn ${statusClass}">${btnText}</button>`;
        homeListContainer.appendChild(card);
    });

    if (visibleCount === 0) homeListContainer.innerHTML = `<div class="empty-state">NO HABITS FOUND</div>`;
};

const renderEditTab = () => {
    editListContainer.innerHTML = '';
    if (APP_STATE.habits.length === 0) {
        editListContainer.innerHTML = `<div class="empty-state">NO HABITS YET<br>ADD ONE TO GET STARTED</div>`;
        return;
    }

    APP_STATE.habits.forEach(habit => {
        const card = document.createElement('div');
        card.className = 'edit-habit-card';
        card.setAttribute('data-id', habit.id);
        card.innerHTML = `<div class="edit-info"><h3>${habit.name}</h3><p>GOAL: ${habit.max} ${habit.unit}</p></div><i class="ph-bold ph-arrow-right edit-indicator"></i>`;
        editListContainer.appendChild(card);
    });
};

const renderAnalyticsTab = () => {
    analyticsListContainer.innerHTML = '';
    if (APP_STATE.habits.length === 0) {
        analyticsListContainer.innerHTML = `<div class="empty-state">NO HABITS FOUND</div>`;
        return;
    }

    APP_STATE.habits.forEach(habit => {
        const card = document.createElement('div');
        card.className = 'edit-habit-card';
        card.setAttribute('data-id', habit.id);
        card.innerHTML = `<div class="edit-info"><h3>${habit.name}</h3><p>CLICK TO VIEW DATA</p></div><i class="ph-bold ph-chart-bar edit-indicator"></i>`;
        analyticsListContainer.appendChild(card);
    });
};

const reRenderAll = () => {
    renderHomeTab(); renderEditTab(); renderAnalyticsTab();
};

document.addEventListener('DOMContentLoaded', () => {

    // --- OAUTH2 LOGIN INITIALIZATION ---
    const btnLogin = document.getElementById('btn-google-login');
    if (btnLogin) {
        btnLogin.addEventListener('click', () => {
            const tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: (tokenResponse) => {
                    if (tokenResponse && tokenResponse.access_token) {
                        driveToken = tokenResponse.access_token;
                        localStorage.setItem('mezameru_drive_token', driveToken);
                        
                        btnLogin.style.display = 'none';
                        const loginStatus = document.getElementById('login-status');
                        if (loginStatus) loginStatus.style.display = 'block';
                        
                        syncWithDrive();
                    }
                }
            });
            tokenClient.requestAccessToken();
        });
    }

    // --- CHECK LOGIN ON LOAD ---
    const loginScreen = document.getElementById('login-screen');
    if (driveToken) {
        if(loginScreen) loginScreen.classList.remove('active');
        syncWithDrive();
    } else {
        if(loginScreen) loginScreen.classList.add('active');
    }

    // --- ACCOUNT LOGOUT BUTTON ---
    const logoutBtn = document.getElementById('btn-logout');
    if(logoutBtn) {
        logoutBtn.addEventListener('click', logoutUser);
    }

    // --- HARD-STOP DATE SCOLLER ---
    const dateScroller = document.getElementById('date-scroller');
    if (dateScroller) dateScroller.innerHTML = ''; 
    
    const subtitle = document.getElementById('home-subtitle');
    const today = new Date(); 
    const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    let activeDateElement = null;

    for (let i = -15; i <= 0; i++) {
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + i);
        const isToday = i === 0;
        const targetDateKey = formatDateKey(targetDate);
        
        const dateItem = document.createElement('div');
        dateItem.className = `date-item ${isToday ? 'active' : ''}`; 
        dateItem.innerHTML = `<span class="date-item-day">${dayNames[targetDate.getDay()]}</span><span class="date-item-num">${targetDate.getDate()}</span>`;
        
        if (i === -15) {
            for (let k = 1; k <= 3; k++) {
                const d = new Date(targetDate);
                d.setDate(d.getDate() - k);
                const dummy = document.createElement('div');
                dummy.className = 'dummy-item';
                dummy.style.left = `calc(${k * -82}px - 4px)`; 
                dummy.style.top = '-4px';
                dummy.innerHTML = `<span class="date-item-day">${dayNames[d.getDay()]}</span><span class="date-item-num">${d.getDate()}</span>`;
                dateItem.appendChild(dummy);
            }
        }

        if (i === 0) {
            for (let k = 1; k <= 3; k++) {
                const d = new Date(targetDate);
                d.setDate(d.getDate() + k);
                const dummy = document.createElement('div');
                dummy.className = 'dummy-item';
                dummy.style.right = `calc(${k * -82}px - 4px)`; 
                dummy.style.top = '-4px';
                dummy.innerHTML = `<span class="date-item-day">${dayNames[d.getDay()]}</span><span class="date-item-num">${d.getDate()}</span>`;
                dateItem.appendChild(dummy);
            }
        }

        if (dateScroller) dateScroller.appendChild(dateItem);
        
        if (isToday) {
            activeDateElement = dateItem;
            if (!APP_STATE.selectedDate) APP_STATE.selectedDate = targetDateKey; 
            if (subtitle) subtitle.innerText = `HABITS: TODAY`;
        }

        dateItem.addEventListener('click', () => {
            document.querySelectorAll('.date-item').forEach(el => el.classList.remove('active'));
            dateItem.classList.add('active');
            dateItem.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            APP_STATE.selectedDate = targetDateKey;
            
            if (subtitle) subtitle.innerText = i === 0 ? `HABITS: TODAY` : `HABITS: ${formatDisplayDate(targetDateKey)}`;
            renderHomeTab(); saveState();
        });
    }

    if (activeDateElement) setTimeout(() => activeDateElement.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }), 100); 

    // --- BRUTALIST CHART LOGIC ---
    let analyticsChart = null;
    let currentAnalyticsHabitId = null;

    const getDatesForRange = (rangeType) => {
        const dates = [];
        const current = new Date();
        current.setHours(0, 0, 0, 0);
        const loopCount = rangeType === '7days' ? 6 : rangeType === 'week' ? (current.getDay() === 0 ? 6 : current.getDay() - 1) : rangeType === 'month' ? current.getDate() - 1 : APP_STATE.customDays - 1;
        
        for (let i = loopCount; i >= 0; i--) {
            const d = new Date(current);
            d.setDate(d.getDate() - i);
            dates.push(d);
        }
        return dates;
    };

    const renderChart = () => {
        if (!currentAnalyticsHabitId) return;
        const datesArray = getDatesForRange(APP_STATE.analyticsRange);
        const labels = [], dataPoints = [];
        const shortMonths = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const habit = APP_STATE.habits.find(h => h.id === currentAnalyticsHabitId);

        datesArray.forEach(dateObj => {
            labels.push(`${shortMonths[dateObj.getMonth()]} ${dateObj.getDate()}`);
            if (!habit) { dataPoints.push(0); return; }
            const record = habit.history[formatDateKey(dateObj)];
            let pct = 0;
            if (record && record.status === 'COMPLETED') pct = 100;
            else if (record && record.current > 0) pct = Math.round((record.current / habit.max) * 100);
            dataPoints.push(pct);
        });

        if (analyticsChart) analyticsChart.destroy();
        
        const chartCanvas = document.getElementById('analytics-chart');
        if (!chartCanvas) return;

        Chart.defaults.font.family = '"Courier New", Courier, monospace';
        Chart.defaults.font.weight = 'bold';
        
        analyticsChart = new Chart(chartCanvas.getContext('2d'), {
            type: 'line',
            data: { 
                labels: labels, 
                datasets: [{ 
                    data: dataPoints, 
                    borderColor: '#000000', 
                    borderWidth: 4, 
                    stepped: true,
                    backgroundColor: '#ffffff',
                    pointBackgroundColor: '#000000', 
                    pointBorderColor: '#000000',
                    pointBorderWidth: 3,
                    pointRadius: 5, 
                    pointHoverRadius: 8,
                    fill: false 
                }] 
            },
            options: { 
                responsive: true, maintainAspectRatio: false, 
                scales: { 
                    x: { grid: { color: '#000000', lineWidth: 2 }, border: { color: '#000000', width: 4 }, ticks: { color: '#000000' } }, 
                    y: { min: 0, max: 100, grid: { color: '#000000', lineWidth: 2 }, border: { color: '#000000', width: 4 }, ticks: { stepSize: 25, color: '#000000' } } 
                }, 
                plugins: { 
                    legend: { display: false }, 
                    tooltip: { backgroundColor: '#ccff00', titleColor: '#000000', bodyColor: '#000000', borderColor: '#000000', borderWidth: 3, cornerRadius: 0, callbacks: { label: (ctx) => `${ctx.parsed.y}%` } } 
                } 
            }
        });
    };

    // --- Navigation & Overlays ---
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.nav-item, .tab-content').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            document.getElementById(item.getAttribute('data-target')).classList.add('active');
        });
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            APP_STATE.currentFilter = btn.getAttribute('data-filter');
            renderHomeTab(); saveState();
        });
    });

    const overlay = document.getElementById('sheet-overlay');
    const closeAllSheets = () => { if(overlay) overlay.classList.remove('active'); document.querySelectorAll('.bottom-sheet').forEach(s => s.classList.remove('active')); currentAnalyticsHabitId = null; };
    if(overlay) overlay.addEventListener('click', closeAllSheets);
    document.querySelectorAll('.btn-close-sheet').forEach(btn => btn.addEventListener('click', closeAllSheets));

    // --- HOME SHEET: SMART PRECISION PROGRESS ---
    let trackingHabitId = null;
    let tempCurrentVal = 0;
    const progressSlider = document.getElementById('progress-slider');
    const progressInput = document.getElementById('sheet-current-input');
    const progressMaxDisplay = document.getElementById('sheet-max-display');

    if (homeListContainer) {
        homeListContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.habit-card');
            if (!card) return;
            trackingHabitId = card.getAttribute('data-id');
            const habit = APP_STATE.habits.find(h => h.id === trackingHabitId);
            const record = getHabitRecord(trackingHabitId, APP_STATE.selectedDate);
            tempCurrentVal = record.current;

            document.getElementById('sheet-title').innerText = habit.name;
            document.getElementById('sheet-target').innerText = `GOAL: ${habit.max} ${habit.unit}`;
            
            // Set up our smart precision group
            if(progressInput) progressInput.value = tempCurrentVal;
            if(progressMaxDisplay) progressMaxDisplay.innerText = `/${habit.max}`;
            if(progressSlider) { 
                progressSlider.min = 0; 
                progressSlider.max = habit.max; 
                progressSlider.value = tempCurrentVal; 
            }
            
            document.getElementById('btn-mark-done').innerText = record.status === 'COMPLETED' ? 'MARK NOT DONE' : 'MARK DONE';
            document.getElementById('btn-mark-skip').innerText = record.status === 'SKIPPED' ? 'UNSKIP' : 'MARK SKIPPED';
            
            if(overlay) overlay.classList.add('active'); 
            document.getElementById('status-sheet').classList.add('active');
        });
    }

    // Slider updates text box
    if (progressSlider) {
        progressSlider.addEventListener('input', (e) => {
            tempCurrentVal = parseInt(e.target.value);
            if (progressInput) progressInput.value = tempCurrentVal;
        });
    }

    // Text box updates slider (and clamps to max)
    if (progressInput) {
        progressInput.addEventListener('input', (e) => {
            const habit = APP_STATE.habits.find(h => h.id === trackingHabitId);
            let val = parseInt(e.target.value) || 0;
            if (val > habit.max) val = habit.max;
            if (val < 0) val = 0;
            
            tempCurrentVal = val;
            if (progressSlider) progressSlider.value = tempCurrentVal;
        });
    }

    const btnSaveProgress = document.getElementById('btn-save-progress');
    if (btnSaveProgress) {
        btnSaveProgress.addEventListener('click', () => {
            const habit = APP_STATE.habits.find(h => h.id === trackingHabitId);
            const record = getHabitRecord(trackingHabitId, APP_STATE.selectedDate);
            record.current = tempCurrentVal;
            record.status = tempCurrentVal >= habit.max ? 'COMPLETED' : 'TODO';
            closeAllSheets(); renderHomeTab(); saveState();
        });
    }

    const btnMarkDone = document.getElementById('btn-mark-done');
    if (btnMarkDone) {
        btnMarkDone.addEventListener('click', () => {
            const habit = APP_STATE.habits.find(h => h.id === trackingHabitId);
            const record = getHabitRecord(trackingHabitId, APP_STATE.selectedDate);
            if (record.status === 'COMPLETED') { record.current = 0; record.status = 'TODO'; } 
            else { record.current = habit.max; record.status = 'COMPLETED'; }
            closeAllSheets(); renderHomeTab(); saveState();
        });
    }

    const btnMarkSkip = document.getElementById('btn-mark-skip');
    if (btnMarkSkip) {
        btnMarkSkip.addEventListener('click', () => {
            const record = getHabitRecord(trackingHabitId, APP_STATE.selectedDate);
            record.status = record.status === 'SKIPPED' ? 'TODO' : 'SKIPPED';
            closeAllSheets(); renderHomeTab(); saveState();
        });
    }

    // --- Sheet logic (Edit/Add) ---
    let editingHabitId = null;
    const btnFabAdd = document.getElementById('btn-fab-add');
    if (btnFabAdd) {
        btnFabAdd.addEventListener('click', () => {
            editingHabitId = null; document.getElementById('edit-sheet-title').innerText = "ADD NEW HABIT";
            document.getElementById('edit-name-input').value = ''; document.getElementById('edit-target-input').value = ''; document.getElementById('edit-unit-input').value = '';
            if(overlay) overlay.classList.add('active'); 
            document.getElementById('edit-sheet').classList.add('active');
        });
    }

    if (editListContainer) {
        editListContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.edit-habit-card');
            if (!card) return;
            editingHabitId = card.getAttribute('data-id');
            const habit = APP_STATE.habits.find(h => h.id === editingHabitId);
            document.getElementById('edit-sheet-title').innerText = "EDIT HABIT";
            document.getElementById('edit-name-input').value = habit.name; document.getElementById('edit-target-input').value = habit.max; document.getElementById('edit-unit-input').value = habit.unit;
            if(overlay) overlay.classList.add('active'); 
            document.getElementById('edit-sheet').classList.add('active');
        });
    }

    const btnSaveHabit = document.getElementById('btn-save-habit');
    if (btnSaveHabit) {
        btnSaveHabit.addEventListener('click', () => {
            const newName = document.getElementById('edit-name-input').value.trim().toUpperCase() || "NEW HABIT";
            const newMax = parseInt(document.getElementById('edit-target-input').value) || 1;
            const newUnit = document.getElementById('edit-unit-input').value.trim().toUpperCase() || "UNITS";

            if (editingHabitId) {
                const habit = APP_STATE.habits.find(h => h.id === editingHabitId);
                habit.name = newName; habit.max = newMax; habit.unit = newUnit;
                Object.keys(habit.history).forEach(date => { if (habit.history[date].current > newMax) habit.history[date].current = newMax; });
            } else {
                APP_STATE.habits.push({ id: 'h_' + Date.now(), name: newName, max: newMax, unit: newUnit, history: {} });
            }
            closeAllSheets(); reRenderAll(); saveState();
        });
    }

    // --- ANALYTICS SHEET: VOLUME BAR ---
    if (analyticsListContainer) {
        analyticsListContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.edit-habit-card');
            if (!card) return;
            currentAnalyticsHabitId = card.getAttribute('data-id');
            document.getElementById('analytics-sheet-title').innerText = APP_STATE.habits.find(h => h.id === currentAnalyticsHabitId).name;
            if(overlay) overlay.classList.add('active'); 
            document.getElementById('analytics-sheet').classList.add('active');
            
            // Sync slider position on open
            const cSlider = document.getElementById('custom-days-slider');
            const cDisplay = document.getElementById('custom-days-display');
            if(cSlider) cSlider.value = APP_STATE.customDays;
            if(cDisplay) cDisplay.innerText = `${APP_STATE.customDays} DAYS`;

            setTimeout(renderChart, 50);
        });
    }

    document.querySelectorAll('.filter-btn-small').forEach(btn => {
        if (btn.getAttribute('data-range') === APP_STATE.analyticsRange) {
            document.querySelectorAll('.filter-btn-small').forEach(b => b.classList.remove('active')); btn.classList.add('active');
            const customRange = document.getElementById('custom-range-container');
            if (APP_STATE.analyticsRange === 'custom' && customRange) customRange.classList.add('active');
        }
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn-small').forEach(b => b.classList.remove('active')); btn.classList.add('active');
            APP_STATE.analyticsRange = btn.getAttribute('data-range');
            const customRange = document.getElementById('custom-range-container');
            if (APP_STATE.analyticsRange === 'custom') {
                if(customRange) customRange.classList.add('active');
            } else { 
                if(customRange) customRange.classList.remove('active'); 
                renderChart(); saveState(); 
            }
        });
    });

    // Handle new Volume Bar drag events
    const customDaysSlider = document.getElementById('custom-days-slider');
    const customDaysDisplay = document.getElementById('custom-days-display');

    if (customDaysSlider && customDaysDisplay) {
        // Live update text while dragging
        customDaysSlider.addEventListener('input', (e) => {
            customDaysDisplay.innerText = `${e.target.value} DAYS`;
        });
        
        // Save and re-draw ONLY when the user lets go of the slider
        customDaysSlider.addEventListener('change', (e) => {
            APP_STATE.customDays = parseInt(e.target.value);
            renderChart();
            saveState();
        });
    }

    reRenderAll();
});
