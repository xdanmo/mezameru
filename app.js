document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 1. STATE MANAGEMENT & LOCAL STORAGE
    // ==========================================
    
    // Default state if the user has no saved data
    const DEFAULT_STATE = {
        selectedDate: '', 
        currentFilter: 'TODO', 
        analyticsRange: '7days', 
        customDays: 14,
        habits: [] // Starts completely empty for new users
    };

    // Load from Local Storage, or use Default State
    let APP_STATE = JSON.parse(localStorage.getItem('hm_habit_state')) || DEFAULT_STATE;

    // Helper Function: Save current state to Local Storage
    const saveState = () => {
        localStorage.setItem('hm_habit_state', JSON.stringify(APP_STATE));
    };

    const formatDateKey = (dateObj) => {
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    const getHabitRecord = (habitId, dateKey) => {
        const habit = APP_STATE.habits.find(h => h.id === habitId);
        if (!habit) return null;
        
        if (!habit.history[dateKey]) {
            habit.history[dateKey] = { current: 0, status: 'TODO' };
        }
        return habit.history[dateKey];
    };


    // ==========================================
    // 2. RENDER FUNCTIONS (HOME, EDIT, ANALYTICS)
    // ==========================================
    
    const homeListContainer = document.getElementById('home-habit-list');
    const editListContainer = document.getElementById('edit-habit-list');
    const analyticsListContainer = document.getElementById('analytics-habit-list');

    const renderHomeTab = () => {
        homeListContainer.innerHTML = '';
        let visibleCount = 0;

        APP_STATE.habits.forEach(habit => {
            const record = getHabitRecord(habit.id, APP_STATE.selectedDate);
            
            if (record.status !== APP_STATE.currentFilter) {
                if (!(APP_STATE.currentFilter === 'TODO' && record.status === 'TODO')) {
                    return; 
                }
            }

            visibleCount++;
            const card = document.createElement('div');
            card.className = 'habit-card';
            card.setAttribute('data-id', habit.id);
            
            const statusClass = record.status !== 'TODO' ? record.status : '';
            let btnText = `${record.current}/${habit.max} ${habit.unit}`;
            if (record.status === 'SKIPPED') btnText = 'SKIPPED';

            card.innerHTML = `
                <div class="habit-info">
                    <h3>${habit.name}</h3>
                </div>
                <button class="status-btn ${statusClass}">${btnText}</button>
            `;
            homeListContainer.appendChild(card);
        });

        if (visibleCount === 0) {
            homeListContainer.innerHTML = `<div class="empty-state">NO HABITS HERE.</div>`;
        }
    };

    const renderEditTab = () => {
        editListContainer.innerHTML = '';
        
        if (APP_STATE.habits.length === 0) {
            editListContainer.innerHTML = `<div class="empty-state">NO HABITS YET. ADD ONE TO GET STARTED.</div>`;
            return;
        }

        APP_STATE.habits.forEach(habit => {
            const card = document.createElement('div');
            card.className = 'edit-habit-card';
            card.setAttribute('data-id', habit.id);
            
            card.innerHTML = `
                <div class="edit-info">
                    <h3>${habit.name}</h3>
                    <p>GOAL: ${habit.max} ${habit.unit} | EVERY DAY</p>
                </div>
                <i class="ph-thin ph-caret-right edit-indicator"></i>
            `;
            editListContainer.appendChild(card);
        });
    };

    const renderAnalyticsTab = () => {
        analyticsListContainer.innerHTML = '';
        
        if (APP_STATE.habits.length === 0) {
            analyticsListContainer.innerHTML = `<div class="empty-state">NO HABITS TO ANALYZE.</div>`;
            return;
        }

        APP_STATE.habits.forEach(habit => {
            const card = document.createElement('div');
            card.className = 'edit-habit-card';
            card.setAttribute('data-id', habit.id);
            
            card.innerHTML = `
                <div class="edit-info">
                    <h3>${habit.name}</h3>
                    <p>CLICK TO VIEW DATA</p>
                </div>
                <i class="ph-thin ph-chart-line-up edit-indicator"></i>
            `;
            analyticsListContainer.appendChild(card);
        });
    };

    const reRenderAll = () => {
        renderHomeTab();
        renderEditTab();
        renderAnalyticsTab();
    };


    // ==========================================
    // 3. HORIZONTAL DATE SCROLLER
    // ==========================================
    
    const dateScroller = document.getElementById('date-scroller');
    const subtitle = document.getElementById('home-subtitle');
    const today = new Date(); 
    const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    
    const clickablePastDays = 15;
    const paddingDays = 4;
    let activeDateElement = null;

    const startOffset = -(clickablePastDays + paddingDays);
    const endOffset = paddingDays;

    for (let i = startOffset; i <= endOffset; i++) {
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + i);
        
        const isToday = i === 0;
        const isClickable = i >= -clickablePastDays && i <= 0;
        const targetDateKey = formatDateKey(targetDate);
        
        const dateItem = document.createElement('div');
        dateItem.className = `date-item ${isToday ? 'active' : ''} ${!isClickable ? 'disabled' : ''}`;
        dateItem.setAttribute('data-datekey', targetDateKey);
        
        dateItem.innerHTML = `
            <span class="date-item-day">${dayNames[targetDate.getDay()]}</span>
            <span class="date-item-num">${targetDate.getDate()}</span>
        `;
        
        dateScroller.appendChild(dateItem);
        
        if (isToday) {
            activeDateElement = dateItem;
            // Only override selectedDate if it's not already set
            if (!APP_STATE.selectedDate) {
                APP_STATE.selectedDate = targetDateKey; 
            }
            subtitle.innerText = `DAILY HABITS: TODAY`;
        }

        if (isClickable) {
            dateItem.addEventListener('click', () => {
                document.querySelectorAll('.date-item').forEach(el => el.classList.remove('active'));
                dateItem.classList.add('active');
                dateItem.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                
                APP_STATE.selectedDate = targetDateKey;
                subtitle.innerText = i === 0 ? `DAILY HABITS: TODAY` : `DAILY HABITS: ${targetDateKey}`;
                renderHomeTab();
                saveState(); // Save state when date changes
            });
        }
    }

    if (activeDateElement) {
        setTimeout(() => activeDateElement.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }), 100); 
    }


    // ==========================================
    // 4. CHART.JS LOGIC FOR SPECIFIC HABIT
    // ==========================================
    
    let analyticsChart = null;
    let currentAnalyticsHabitId = null;

    const getDatesForRange = (rangeType) => {
        const dates = [];
        const current = new Date();
        current.setHours(0, 0, 0, 0);

        if (rangeType === '7days') {
            for (let i = 6; i >= 0; i--) {
                const d = new Date(current);
                d.setDate(d.getDate() - i);
                dates.push(d);
            }
        } else if (rangeType === 'week') {
            const dayOfWeek = current.getDay() === 0 ? 6 : current.getDay() - 1; 
            for (let i = dayOfWeek; i >= 0; i--) {
                const d = new Date(current);
                d.setDate(d.getDate() - i);
                dates.push(d);
            }
        } else if (rangeType === 'month') {
            const dayOfMonth = current.getDate();
            for (let i = dayOfMonth - 1; i >= 0; i--) {
                const d = new Date(current);
                d.setDate(d.getDate() - i);
                dates.push(d);
            }
        } else if (rangeType === 'custom') {
            const days = APP_STATE.customDays - 1;
            for (let i = days; i >= 0; i--) {
                const d = new Date(current);
                d.setDate(d.getDate() - i);
                dates.push(d);
            }
        }
        return dates;
    };

    const calculateCompletionData = (datesArray) => {
        const labels = [];
        const dataPoints = [];
        const shortMonths = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const habit = APP_STATE.habits.find(h => h.id === currentAnalyticsHabitId);

        datesArray.forEach(dateObj => {
            const dateKey = formatDateKey(dateObj);
            labels.push(`${shortMonths[dateObj.getMonth()]} ${dateObj.getDate()}`);

            if (!habit) {
                dataPoints.push(0);
                return;
            }

            const record = habit.history[dateKey];
            let percentage = 0;
            
            if (record && record.status === 'COMPLETED') {
                percentage = 100;
            } else if (record && record.current > 0) {
                percentage = Math.round((record.current / habit.max) * 100);
            }

            dataPoints.push(percentage);
        });

        return { labels, dataPoints };
    };

    const renderChart = () => {
        if (!currentAnalyticsHabitId) return;

        const datesArray = getDatesForRange(APP_STATE.analyticsRange);
        const { labels, dataPoints } = calculateCompletionData(datesArray);

        const ctx = document.getElementById('analytics-chart').getContext('2d');
        
        if (analyticsChart) {
            analyticsChart.destroy();
        }

        analyticsChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'PROGRESS %',
                    data: dataPoints,
                    borderColor: '#000000',
                    borderWidth: 2,
                    tension: 0, 
                    pointBackgroundColor: '#000000',
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { family: 'Helvetica Neue', size: 9 }, color: '#767676' }
                    },
                    y: {
                        min: 0,
                        max: 100,
                        grid: { color: '#e0e0e0', drawBorder: false },
                        ticks: { stepSize: 25, font: { family: 'Helvetica Neue', size: 9 }, color: '#767676' }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#000000',
                        titleFont: { family: 'Helvetica Neue', size: 10 },
                        bodyFont: { family: 'Helvetica Neue', size: 12, weight: 'bold' },
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return context.parsed.y + '% DONE';
                            }
                        }
                    }
                }
            }
        });
    };


    // ==========================================
    // 5. NAVIGATION & FILTERS
    // ==========================================
    
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetId = item.getAttribute('data-target');
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            tabContents.forEach(tab => tab.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');
        });
    });

    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            APP_STATE.currentFilter = btn.getAttribute('data-filter');
            renderHomeTab();
            saveState(); // Save filter preference
        });
    });


    // ==========================================
    // 6. BOTTOM SHEETS & OVERLAY LOGIC
    // ==========================================
    
    const overlay = document.getElementById('sheet-overlay');
    const closeAllSheets = () => {
        overlay.classList.remove('active');
        document.querySelectorAll('.bottom-sheet').forEach(s => s.classList.remove('active'));
        currentAnalyticsHabitId = null; 
    };
    overlay.addEventListener('click', closeAllSheets);


    // --- SHEET 1: HOME STATUS TRACKING ---
    const statusSheet = document.getElementById('status-sheet');
    const sheetTitle = document.getElementById('sheet-title');
    const sheetTarget = document.getElementById('sheet-target');
    const sheetCurrentProgress = document.getElementById('sheet-current-progress');
    const progressSlider = document.getElementById('progress-slider');
    
    const btnSaveProgress = document.getElementById('btn-save-progress');
    const btnMarkDone = document.getElementById('btn-mark-done');
    const btnMarkSkip = document.getElementById('btn-mark-skip');

    let trackingHabitId = null;
    let tempCurrentVal = 0;

    homeListContainer.addEventListener('click', (e) => {
        const card = e.target.closest('.habit-card');
        if (!card) return;

        trackingHabitId = card.getAttribute('data-id');
        const habit = APP_STATE.habits.find(h => h.id === trackingHabitId);
        const record = getHabitRecord(trackingHabitId, APP_STATE.selectedDate);

        tempCurrentVal = record.current;

        sheetTitle.innerText = habit.name;
        sheetTarget.innerText = `GOAL: ${habit.max} ${habit.unit}`;
        sheetCurrentProgress.innerText = `${tempCurrentVal}/${habit.max}`;
        
        progressSlider.min = 0;
        progressSlider.max = habit.max;
        progressSlider.value = tempCurrentVal;

        btnMarkDone.innerText = record.status === 'COMPLETED' ? 'MARK NOT DONE' : 'MARK DONE';
        btnMarkSkip.innerText = record.status === 'SKIPPED' ? 'UNSKIP' : 'MARK SKIPPED';

        overlay.classList.add('active');
        statusSheet.classList.add('active');
    });

    document.getElementById('btn-close-status').addEventListener('click', closeAllSheets);

    progressSlider.addEventListener('input', (e) => {
        const habit = APP_STATE.habits.find(h => h.id === trackingHabitId);
        tempCurrentVal = parseInt(e.target.value);
        sheetCurrentProgress.innerText = `${tempCurrentVal}/${habit.max}`;
    });

    btnSaveProgress.addEventListener('click', () => {
        const habit = APP_STATE.habits.find(h => h.id === trackingHabitId);
        const record = getHabitRecord(trackingHabitId, APP_STATE.selectedDate);
        
        record.current = tempCurrentVal;
        record.status = tempCurrentVal >= habit.max ? 'COMPLETED' : 'TODO';
        
        closeAllSheets();
        renderHomeTab();
        saveState(); // Save after updating progress
    });

    btnMarkDone.addEventListener('click', () => {
        const habit = APP_STATE.habits.find(h => h.id === trackingHabitId);
        const record = getHabitRecord(trackingHabitId, APP_STATE.selectedDate);
        
        if (record.status === 'COMPLETED') {
            record.current = 0;
            record.status = 'TODO';
        } else {
            record.current = habit.max;
            record.status = 'COMPLETED';
        }
        
        closeAllSheets();
        renderHomeTab();
        saveState(); // Save after marking done
    });

    btnMarkSkip.addEventListener('click', () => {
        const record = getHabitRecord(trackingHabitId, APP_STATE.selectedDate);
        
        if (record.status === 'SKIPPED') {
            record.status = 'TODO';
        } else {
            record.status = 'SKIPPED';
        }
        
        closeAllSheets();
        renderHomeTab();
        saveState(); // Save after skipping
    });


    // --- SHEET 2: ADD / EDIT HABIT CONFIGURATION ---
    const editSheet = document.getElementById('edit-sheet');
    const editSheetTitle = document.getElementById('edit-sheet-title');
    const inputName = document.getElementById('edit-name-input');
    const inputTarget = document.getElementById('edit-target-input');
    const inputUnit = document.getElementById('edit-unit-input');
    const btnSaveHabit = document.getElementById('btn-save-habit');

    let editingHabitId = null;

    document.getElementById('btn-fab-add').addEventListener('click', () => {
        editingHabitId = null;
        editSheetTitle.innerText = "ADD NEW HABIT";
        inputName.value = '';
        inputTarget.value = '';
        inputUnit.value = '';

        overlay.classList.add('active');
        editSheet.classList.add('active');
    });

    editListContainer.addEventListener('click', (e) => {
        const card = e.target.closest('.edit-habit-card');
        if (!card) return;

        editingHabitId = card.getAttribute('data-id');
        const habit = APP_STATE.habits.find(h => h.id === editingHabitId);

        editSheetTitle.innerText = "EDIT HABIT";
        inputName.value = habit.name;
        inputTarget.value = habit.max;
        inputUnit.value = habit.unit;

        overlay.classList.add('active');
        editSheet.classList.add('active');
    });

    document.getElementById('btn-close-edit').addEventListener('click', closeAllSheets);

    btnSaveHabit.addEventListener('click', () => {
        const newName = inputName.value.trim().toUpperCase() || "NEW HABIT";
        const newMax = parseInt(inputTarget.value) || 1;
        const newUnit = inputUnit.value.trim().toUpperCase() || "UNITS";

        if (editingHabitId) {
            const habit = APP_STATE.habits.find(h => h.id === editingHabitId);
            habit.name = newName;
            habit.max = newMax;
            habit.unit = newUnit;

            Object.keys(habit.history).forEach(date => {
                if (habit.history[date].current > newMax) {
                    habit.history[date].current = newMax;
                }
            });
        } else {
            APP_STATE.habits.push({
                id: 'h_' + Date.now(),
                name: newName,
                max: newMax,
                unit: newUnit,
                history: {}
            });
        }

        closeAllSheets();
        reRenderAll();
        saveState(); // Save after adding/editing habit
    });

    
    // --- SHEET 3: ANALYTICS GRAPH ---
    const analyticsSheet = document.getElementById('analytics-sheet');
    const analyticsSheetTitle = document.getElementById('analytics-sheet-title');
    
    analyticsListContainer.addEventListener('click', (e) => {
        const card = e.target.closest('.edit-habit-card');
        if (!card) return;

        currentAnalyticsHabitId = card.getAttribute('data-id');
        const habit = APP_STATE.habits.find(h => h.id === currentAnalyticsHabitId);

        analyticsSheetTitle.innerText = habit.name;
        
        overlay.classList.add('active');
        analyticsSheet.classList.add('active');
        
        setTimeout(() => {
            renderChart();
        }, 50);
    });

    document.getElementById('btn-close-analytics').addEventListener('click', closeAllSheets);

    const analyticsFilters = document.querySelectorAll('.analytics-filter');
    const customRangeContainer = document.getElementById('custom-range-container');
    const customInput = document.getElementById('custom-days-input');
    const btnApplyCustom = document.getElementById('btn-apply-custom');

    // Initialize custom days input value
    customInput.value = APP_STATE.customDays;

    analyticsFilters.forEach(btn => {
        // Set active class based on saved state
        if (btn.getAttribute('data-range') === APP_STATE.analyticsRange) {
            analyticsFilters.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (APP_STATE.analyticsRange === 'custom') {
                customRangeContainer.classList.add('active');
            }
        }

        btn.addEventListener('click', () => {
            analyticsFilters.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            APP_STATE.analyticsRange = btn.getAttribute('data-range');
            
            if (APP_STATE.analyticsRange === 'custom') {
                customRangeContainer.classList.add('active');
            } else {
                customRangeContainer.classList.remove('active');
                renderChart();
                saveState(); // Save range preference
            }
        });
    });

    btnApplyCustom.addEventListener('click', () => {
        const val = parseInt(customInput.value);
        if (val > 0) {
            APP_STATE.customDays = val;
            renderChart();
            saveState(); // Save custom days preference
        }
    });

    // ==========================================
    // INITIALIZATION
    // ==========================================
    reRenderAll();

});
