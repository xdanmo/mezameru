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
    selectedDate: '', currentFilter: 'TODO', analyticsRange: '7days', customDays: 14, 
    userName: 'PROFILE', profilePicBase64: null, habits: []
};

// Merge loaded state with defaults in case of missing keys
let APP_STATE = { ...DEFAULT_STATE, ...(JSON.parse(localStorage.getItem('mezameru_local_state')) || {}) };

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
            
            APP_STATE = { ...DEFAULT_STATE, ...cloudData };
        } else {
            await uploadToDrive(true);
        }

        const loginScreen = document.getElementById('login-screen');
        if(loginScreen) loginScreen.classList.remove('active');

        saveLocal(); 
        reRenderAll();

        if (APP_STATE.profilePicBase64) {
            document.getElementById('profile-avatar-img').src = APP_STATE.profilePicBase64;
            document.getElementById('profile-avatar-img').style.display = 'block';
            document.getElementById('profile-avatar-icon').style.display = 'none';
        }

    } catch (error) {
        console.error('SYNC_FAIL:', error);
        if (error.message === "TOKEN_EXPIRED") logoutUser();
        reRenderAll();
    }
}

async function uploadToDrive(isNew = false) {
    if (!driveToken) return;
    try {
        const boundary = '-------314159265358979323846';
        const delimiter = "\r\n--" + boundary + "\r\n";
        const close_delim = "\r\n--" + boundary + "--";

        const metadata = { name: FILE_NAME };
        if (isNew) metadata.parents = ['appDataFolder'];

        const multipartRequestBody =
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(APP_STATE) +
            close_delim;

        let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
        let method = 'POST';

        if (!isNew && driveFileId) {
            url = `https://www.googleapis.com/upload/drive/v3/files/${driveFileId}?uploadType=multipart`;
            method = 'PATCH';
        }

        const res = await fetch(url, {
            method: method,
            headers: {
                'Authorization': `Bearer ${driveToken}`,
                'Content-Type': `multipart/related; boundary=${boundary}`
            },
            body: multipartRequestBody
        });
        
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
    
    // Track counts for the filter tabs
    let counts = { TODO: 0, COMPLETED: 0, SKIPPED: 0 };

    const [sy, sm, sd] = APP_STATE.selectedDate.split('-');
    const currentDayOfWeek = new Date(sy, sm - 1, sd).getDay();

    APP_STATE.habits.forEach(habit => {
        const activeDays = habit.days || [0, 1, 2, 3, 4, 5, 6];
        if (!activeDays.includes(currentDayOfWeek)) return;

        const record = getHabitRecord(habit.id, APP_STATE.selectedDate);
        
        // Tally up counts for the daily status
        if (record.status === 'COMPLETED') counts.COMPLETED++;
        else if (record.status === 'SKIPPED') counts.SKIPPED++;
        else counts.TODO++;

        // Render card based on current filter
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
    
    // Update the UI counts in the brackets
    document.getElementById('count-todo').innerText = `(${counts.TODO})`;
    document.getElementById('count-done').innerText = `(${counts.COMPLETED})`;
    document.getElementById('count-skipped').innerText = `(${counts.SKIPPED})`;

    if (visibleCount === 0) homeListContainer.innerHTML = `<div class="empty-state">NO HABITS SCHEDULED FOR TODAY</div>`;
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
        
        const activeDays = habit.days || [0, 1, 2, 3, 4, 5, 6];
        const daysLabel = activeDays.length === 7 ? 'EVERYDAY' : `${activeDays.length} DAYS/WK`;

        card.innerHTML = `<div class="edit-info"><h3>${habit.name}</h3><p>GOAL: ${habit.max} ${habit.unit} • ${daysLabel}</p></div><i class="ph-bold ph-arrow-right edit-indicator"></i>`;
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

const renderAccountTab = () => {
    const nameInput = document.getElementById('profile-name-input');
    if (nameInput) {
        nameInput.value = APP_STATE.userName || 'PROFILE';
    }
    
    if (APP_STATE.profilePicBase64) {
        document.getElementById('profile-avatar-img').src = APP_STATE.profilePicBase64;
        document.getElementById('profile-avatar-img').style.display = 'block';
        document.getElementById('profile-avatar-icon').style.display = 'none';
    }
};

const reRenderAll = () => {
    renderHomeTab(); renderEditTab(); renderAnalyticsTab(); renderAccountTab();
};

document.addEventListener('DOMContentLoaded', () => {

    let imageCropper = null; 

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

    // --- ACCOUNT TAB LOGIC ---
    
    // Data Export
    const btnExport = document.getElementById('btn-export-data');
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            const dataStr = JSON.stringify(APP_STATE, null, 2);
            const blob = new Blob([dataStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `mezameru_backup_${formatDateKey(new Date())}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    // Data Import Logic & Warning Modal
    const btnImport = document.getElementById('btn-import-data');
    const dataUpload = document.getElementById('data-upload');
    const importConfirmSheet = document.getElementById('import-confirm-sheet');
    const btnCancelImport = document.getElementById('btn-cancel-import');
    const btnConfirmImport = document.getElementById('btn-confirm-import');
    const overlay = document.getElementById('sheet-overlay');

    if (btnImport) {
        btnImport.addEventListener('click', () => {
            overlay.classList.add('active');
            importConfirmSheet.classList.add('active');
        });
    }

    if (btnCancelImport) {
        btnCancelImport.addEventListener('click', () => {
            closeAllSheets();
        });
    }

    if (btnConfirmImport && dataUpload) {
        btnConfirmImport.addEventListener('click', () => {
            dataUpload.click();
        });
        
        dataUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const importedState = JSON.parse(event.target.result);
                    if (importedState && importedState.habits) {
                        APP_STATE = { ...DEFAULT_STATE, ...importedState };
                        saveState(); 
                        reRenderAll();
                        closeAllSheets();
                        alert("DATA IMPORTED SUCCESSFULLY!");
                    } else {
                        alert("INVALID BACKUP FILE: Missing habit data.");
                        closeAllSheets();
                    }
                } catch (err) {
                    alert("ERROR PARSING FILE: Ensure it is a valid JSON backup.");
                    closeAllSheets();
                }
            };
            reader.readAsText(file);
            e.target.value = ''; // Reset input
        });
    }

    // Profile Settings
    const profileNameInput = document.getElementById('profile-name-input');
    if (profileNameInput) {
        profileNameInput.addEventListener('change', (e) => {
            APP_STATE.userName = e.target.value.trim().toUpperCase() || 'PROFILE';
            saveState();
        });
    }

    const avatarContainer = document.getElementById('avatar-container');
    const pfpUpload = document.getElementById('pfp-upload');
    const cropSheet = document.getElementById('crop-sheet');
    const cropImageSource = document.getElementById('crop-image-source');
    
    if (avatarContainer && pfpUpload) {
        avatarContainer.addEventListener('click', () => pfpUpload.click());
        
        pfpUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const url = URL.createObjectURL(file);
            cropImageSource.src = url;
            
            overlay.classList.add('active');
            cropSheet.classList.add('active');

            if (imageCropper) imageCropper.destroy();

            imageCropper = new Cropper(cropImageSource, {
                aspectRatio: 1, 
                viewMode: 1,    
                background: false
            });

            e.target.value = '';
        });
    }

    const btnSaveCrop = document.getElementById('btn-save-crop');
    if (btnSaveCrop) {
        btnSaveCrop.addEventListener('click', () => {
            if (!imageCropper) return;

            imageCropper.getCroppedCanvas({
                width: 400,
                height: 400
            }).toBlob((blob) => {
                if (!blob) return;

                const reader = new FileReader();
                reader.readAsDataURL(blob);
                reader.onloadend = () => {
                    const base64data = reader.result;
                    
                    APP_STATE.profilePicBase64 = base64data;
                    document.getElementById('profile-avatar-img').src = base64data;
                    document.getElementById('profile-avatar-img').style.display = 'block';
                    document.getElementById('profile-avatar-icon').style.display = 'none';
                    
                    closeAllSheets();
                    saveState(); 
                }
            }, 'image/jpeg', 0.8);
        });
    }

    const logoutBtn = document.getElementById('btn-logout');
    if(logoutBtn) logoutBtn.addEventListener('click', logoutUser);

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
        
        const fgColor = '#000000';
        const bgColor = '#ffffff';

        const datesArray = getDatesForRange(APP_STATE.analyticsRange);
        const labels = [], dataPoints = [];
        const shortMonths = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const habit = APP_STATE.habits.find(h => h.id === currentAnalyticsHabitId);
        const activeDays = habit.days || [0, 1, 2, 3, 4, 5, 6];

        let totalPossible = 0;
        let totalAchieved = 0;

        datesArray.forEach(dateObj => {
            if (habit && activeDays.includes(dateObj.getDay())) {
                labels.push(`${shortMonths[dateObj.getMonth()]} ${dateObj.getDate()}`);
                
                const record = habit.history[formatDateKey(dateObj)];
                let pct = 0;
                if (record && record.status === 'COMPLETED') pct = 100;
                else if (record && record.current > 0) pct = Math.round((record.current / habit.max) * 100);
                
                dataPoints.push(pct);
                totalPossible += 100;
                totalAchieved += pct;
            } else {
                labels.push(`${shortMonths[dateObj.getMonth()]} ${dateObj.getDate()}`);
                dataPoints.push(null); // Return null for inactive days
            }
        });

        const avgDisplay = document.getElementById('analytics-average-display');
        if (avgDisplay) {
            if (totalPossible === 0) {
                avgDisplay.innerText = `COMPLETION RATE: N/A`;
            } else {
                const avgPct = Math.round((totalAchieved / totalPossible) * 100);
                avgDisplay.innerText = `COMPLETION RATE: ${avgPct}%`;
            }
        }

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
                    borderColor: fgColor, 
                    borderWidth: 4, 
                    tension: 0.4, // ADDS THE CURVE TO THE LINE
                    backgroundColor: bgColor,
                    pointRadius: 0, // REMOVES DOTS
                    pointHoverRadius: 0, // REMOVES HOVER DOTS
                    fill: false,
                    spanGaps: true 
                }] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                interaction: { // Mode 'index' allows hover tooltips to work without dots
                    mode: 'index',
                    intersect: false,
                },
                scales: { 
                    x: { grid: { color: fgColor, lineWidth: 2 }, border: { color: fgColor, width: 4 }, ticks: { color: fgColor } }, 
                    y: { min: 0, max: 100, grid: { color: fgColor, lineWidth: 2 }, border: { color: fgColor, width: 4 }, ticks: { stepSize: 25, color: fgColor } } 
                }, 
                plugins: { 
                    legend: { display: false }, 
                    tooltip: { backgroundColor: '#ccff00', titleColor: '#000000', bodyColor: '#000000', borderColor: fgColor, borderWidth: 3, cornerRadius: 0, callbacks: { label: (ctx) => `${ctx.parsed.y}%` } } 
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

    const closeAllSheets = () => { 
        if(overlay) overlay.classList.remove('active'); 
        document.querySelectorAll('.bottom-sheet').forEach(s => s.classList.remove('active')); 
        currentAnalyticsHabitId = null; 
        
        if (imageCropper) {
            imageCropper.destroy();
            imageCropper = null;
        }
    };
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

    if (progressSlider) {
        progressSlider.addEventListener('input', (e) => {
            tempCurrentVal = parseInt(e.target.value);
            if (progressInput) progressInput.value = tempCurrentVal;
        });
    }

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

    // --- Day Selector Toggle Logic ---
    const editDaysContainer = document.getElementById('edit-days-container');
    if (editDaysContainer) {
        editDaysContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('day-btn')) {
                e.target.classList.toggle('active');
            }
        });
    }

    // --- Sheet logic (Edit/Add/Delete) ---
    let editingHabitId = null;
    const btnFabAdd = document.getElementById('btn-fab-add');
    if (btnFabAdd) {
        btnFabAdd.addEventListener('click', () => {
            editingHabitId = null; 
            document.getElementById('edit-sheet-title').innerText = "ADD NEW HABIT";
            document.getElementById('edit-name-input').value = ''; 
            document.getElementById('edit-target-input').value = ''; 
            document.getElementById('edit-unit-input').value = '';
            
            document.getElementById('btn-delete-habit').style.display = 'none';

            document.querySelectorAll('.day-btn').forEach(btn => btn.classList.remove('active'));

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
            document.getElementById('edit-name-input').value = habit.name; 
            document.getElementById('edit-target-input').value = habit.max; 
            document.getElementById('edit-unit-input').value = habit.unit;
            
            document.getElementById('btn-delete-habit').style.display = 'block';

            const activeDays = habit.days || [0, 1, 2, 3, 4, 5, 6];
            document.querySelectorAll('.day-btn').forEach(btn => {
                const dayNum = parseInt(btn.getAttribute('data-day'));
                if (activeDays.includes(dayNum)) btn.classList.add('active');
                else btn.classList.remove('active');
            });

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
            
            const selectedDays = Array.from(document.querySelectorAll('.day-btn.active')).map(btn => parseInt(btn.getAttribute('data-day')));

            if (editingHabitId) {
                const habit = APP_STATE.habits.find(h => h.id === editingHabitId);
                habit.name = newName; 
                habit.max = newMax; 
                habit.unit = newUnit;
                habit.days = selectedDays;
                Object.keys(habit.history).forEach(date => { if (habit.history[date].current > newMax) habit.history[date].current = newMax; });
            } else {
                APP_STATE.habits.push({ 
                    id: 'h_' + Date.now(), 
                    name: newName, 
                    max: newMax, 
                    unit: newUnit, 
                    days: selectedDays, 
                    history: {} 
                });
            }
            closeAllSheets(); reRenderAll(); saveState();
        });
    }
    
    // CUSTOM DELETE CONFIRMATION UI LOGIC
    const btnDeleteHabit = document.getElementById('btn-delete-habit');
    if (btnDeleteHabit) {
        btnDeleteHabit.addEventListener('click', () => {
            if (editingHabitId) {
                document.getElementById('edit-sheet').classList.remove('active');
                document.getElementById('delete-confirm-sheet').classList.add('active');
            }
        });
    }

    const btnConfirmDelete = document.getElementById('btn-confirm-delete');
    if (btnConfirmDelete) {
        btnConfirmDelete.addEventListener('click', () => {
            if (editingHabitId) {
                APP_STATE.habits = APP_STATE.habits.filter(h => h.id !== editingHabitId);
                closeAllSheets(); 
                reRenderAll(); 
                saveState();
            }
        });
    }

    const btnCancelDelete = document.getElementById('btn-cancel-delete');
    if (btnCancelDelete) {
        btnCancelDelete.addEventListener('click', () => {
            document.getElementById('delete-confirm-sheet').classList.remove('active');
            document.getElementById('edit-sheet').classList.add('active');
        });
    }

    // --- ANALYTICS SHEET: VOLUME BAR ---
    if (analyticsListContainer) {
        analyticsListContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.edit-habit-card');
            if (!card) return;
            currentAnalyticsHabitId = card.getAttribute('data-id');
            document.getElementById('analytics-sheet-title').innerText = APP_STATE.habits.find(h => h.id === currentAnalyticsHabitId).name;
            
            const avgDisplay = document.getElementById('analytics-average-display');
            if(avgDisplay) avgDisplay.innerText = 'CALCULATING...';

            if(overlay) overlay.classList.add('active'); 
            document.getElementById('analytics-sheet').classList.add('active');
            
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

    const customDaysSlider = document.getElementById('custom-days-slider');
    const customDaysDisplay = document.getElementById('custom-days-display');

    if (customDaysSlider && customDaysDisplay) {
        customDaysSlider.addEventListener('input', (e) => {
            customDaysDisplay.innerText = `${e.target.value} DAYS`;
        });
        
        customDaysSlider.addEventListener('change', (e) => {
            APP_STATE.customDays = parseInt(e.target.value);
            renderChart();
            saveState();
        });
    }

    reRenderAll();
});
