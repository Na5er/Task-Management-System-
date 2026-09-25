
let tasks = [];
let users = [];
let groups = [];
const editingGroupMembers = new Set();
let currentView = 'all';
let currentEditingTask = null;


document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ Dashboard initialized');
    
    // Initialize dark mode
    initDarkMode();
    
    loadUsers();
    loadGroups();
    loadTasks();
    loadStats();
    loadAnalytics();
    loadNotifications(); // Load notifications from server
    setupEventListeners();
    renderInbox(); // Initialize inbox display

    // Check if there's an edit parameter in the URL
    const urlParams = new URLSearchParams(window.location.search);
    const editTaskId = urlParams.get('edit');
    if (editTaskId) {
        // Wait for tasks to load, then open the modal
        setTimeout(() => {
            const taskToEdit = tasks.find(t => t.id == editTaskId);
            console.log('[Dashboard] Edit mode detected. TaskID:', editTaskId, 'Task found:', !!taskToEdit, 'Available tasks:', tasks.length);
            if (taskToEdit) {
                console.log('[Dashboard] Opening modal for task:', taskToEdit.title);
                openTaskModal(taskToEdit);
                // Remove the edit parameter from the URL
                window.history.replaceState({}, document.title, window.location.pathname);
            } else {
                console.warn('[Dashboard] Task not found in loaded tasks. TaskID:', editTaskId);
            }
        }, 1000);  // Increased delay to 1 second
    }

    // Periodically refresh tasks, stats, and notifications
    setInterval(() => {
        loadTasks();
        loadStats();
        loadAnalytics();
        loadNotifications(); // Refresh notifications from server
    }, 30000);

    // Show deadline alert on a dedicated 60s interval
    setInterval(() => showDeadlineAlert(), 60000);
});

// ========== DARK MODE FUNCTIONALITY ==========

function initDarkMode() {
    // Check localStorage for saved preference
    const darkMode = localStorage.getItem('darkMode');
    
    if (darkMode === 'enabled') {
        document.body.classList.add('dark-mode');
    }
    
    // Setup toggle button
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', toggleDarkMode);
    }
}

function toggleDarkMode() {
    const body = document.body;
    body.classList.toggle('dark-mode');
    
    // Save preference
    if (body.classList.contains('dark-mode')) {
        localStorage.setItem('darkMode', 'enabled');
    } else {
        localStorage.setItem('darkMode', 'disabled');
    }
}


function setupEventListeners() {
    const taskForm = document.getElementById('taskForm');
    if (taskForm) taskForm.addEventListener('submit', handleTaskSubmit);

    const newTaskBtn = document.getElementById('newTaskBtn');
    if (newTaskBtn)
        newTaskBtn.addEventListener('click', () => openTaskModal());

    const searchInput = document.getElementById('searchInput');
    if (searchInput)
        searchInput.addEventListener('input', filterTasks);

    const priorityFilter = document.getElementById('priorityFilter');
    if (priorityFilter)
        priorityFilter.addEventListener('change', filterTasks);

    const sortBy = document.getElementById('sortBy');
    if (sortBy)
        sortBy.addEventListener('change', filterTasks);

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', e => {
            e.preventDefault();
            const view = item.getAttribute('data-view');
            switchView(view);
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
        });
    });

    // NOTE: overlay click-to-close is intentionally disabled to avoid accidental
    // closes caused by focus/click races. Users can close the modal via the
    // close (×) button or the Cancel button in the form.
    // If you want overlay-click-to-close, re-add a handler here that calls closeTaskModal().
    
    // Inbox toggle
    const inboxBtn = document.getElementById('inboxBtn');
    const inboxDropdown = document.getElementById('inboxDropdown');
    if (inboxBtn && inboxDropdown) {
        inboxBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            inboxDropdown.style.display = inboxDropdown.style.display === 'block' ? 'none' : 'block';
        });

        // close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!inboxDropdown.contains(e.target) && e.target !== inboxBtn) {
                inboxDropdown.style.display = 'none';
            }
        });
    }

    // FAB (floating action button) — if present, forward to existing New Task button
    const fab = document.getElementById('fabNewTask');
    if (fab) {
        fab.addEventListener('click', () => {
            const newTaskBtn = document.getElementById('newTaskBtn');
            if (newTaskBtn) newTaskBtn.click();
            else openTaskModal();
        });
    }
}

// Notifications array - will be populated from server
let notifications = [];

async function loadNotifications() {
    // Fetch notifications from server API
    try {
        const response = await fetch('/api/notifications');
        if (!response.ok) {
            console.warn('Failed to load notifications');
            return;
        }
        notifications = await response.json();
        renderInbox();
    } catch (err) {
        console.warn('Failed to load notifications from server:', err);
    }
}

// Remove saveNotifications function - no longer needed
// Notifications are now stored server-side in the database

// Remove addNotification function - notifications are created server-side
// The server creates notifications when:
// - A task is assigned to a user
// - A task assignment changes
// - A task is completed by an assignee

function renderInbox() {
    const badge = document.getElementById('inboxBadge');
    const dropdown = document.getElementById('inboxDropdown');
    if (!dropdown || !badge) return;

    const unreadCount = notifications.filter(n => !n.read_at).length;
    if (unreadCount > 0) {
        badge.style.display = '';
        badge.textContent = String(unreadCount);
    } else {
        badge.style.display = 'none';
    }

    if (notifications.length === 0) {
        dropdown.innerHTML = '<div class="inbox-empty">There is no message</div>';
        return;
    }

    dropdown.innerHTML = '';
    
    // Add "Clear All" button at the top
    const clearAllBtn = document.createElement('div');
    clearAllBtn.className = 'inbox-clear-all';
    clearAllBtn.innerHTML = '🗑️ Clear All';
    clearAllBtn.style.cssText = 'padding: 10px; text-align: center; cursor: pointer; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #ef4444; font-weight: 600;';
    clearAllBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Clear all notifications?')) {
            // Delete all notifications from server
            try {
                for (const n of notifications) {
                    await fetch(`/api/notifications/${n.id}`, { method: 'DELETE' });
                }
                await loadNotifications(); // Refresh from server
            } catch (err) {
                console.error('Failed to clear notifications:', err);
            }
        }
    });
    dropdown.appendChild(clearAllBtn);
    
    notifications.forEach(n => {
        const item = document.createElement('div');
        item.className = 'inbox-item' + (n.read_at ? '' : ' unread');
        item.innerHTML = `
            <div style="flex:1">
                <div class="msg">${escapeHtml(n.message)}</div>
                <div class="meta">${new Date(n.created_at).toLocaleString()}</div>
            </div>
        `;
        item.addEventListener('click', async () => {
            console.log('Notification clicked:', n);
            console.log('Task ID:', n.task_id);
            
            // Delete notification from server
            try {
                await fetch(`/api/notifications/${n.id}`, { method: 'DELETE' });
            } catch (err) {
                console.error('Failed to delete notification:', err);
            }
            
            // Refresh notifications from server
            await loadNotifications();
            
            // Close dropdown
            dropdown.style.display = 'none';
            
            // If linked to a task, navigate to task detail page
            if (n.task_id) {
                console.log('Navigating to task detail page:', n.task_id);
                window.location.href = `/task/${n.task_id}`;
            }
        });
        dropdown.appendChild(item);
    });
}


async function loadTasks() {
    try {
        const response = await fetch('/api/tasks');
        if (!response.ok) throw new Error('Failed to load tasks');
        tasks = await response.json();
        filterTasks();
        // After tasks are refreshed/loaded, check immediately for approaching deadlines
        showDeadlineAlert();
    } catch (error) {
        console.error('Error loading tasks:', error);
    }
}

async function loadStats() {
    try {
        const response = await fetch('/api/stats');
        if (!response.ok) return;
        const stats = await response.json();
        updateStatsDisplay(stats);
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function loadUsers() {
    try {
        const response = await fetch('/api/users');
        if (!response.ok) return;
        users = await response.json();
        updateUserSelect();
        renderGroups();
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

async function loadGroups() {
    try {
        const response = await fetch('/api/groups');
        if (!response.ok) return;
        groups = await response.json();
        updateUserSelect();
        renderGroups();
    } catch (error) {
        console.error('Error loading groups:', error);
    }
}

async function loadAnalytics() {
    try {
        const response = await fetch('/api/analytics');
        if (!response.ok) return;
        renderAnalytics(await response.json());
    } catch (error) {
        console.error('Error loading analytics:', error);
    }
}


function updateStatsDisplay(stats) {
    // animate numbers for a clean effect
    function animateCount(id, to, duration = 600) {
        const el = document.getElementById(id);
        if (!el) return;
        const from = parseInt(el.textContent.replace(/[^0-9]/g, '') || '0', 10);
        const start = performance.now();
        if (from === to) { el.textContent = String(to); return; }
        function step(now) {
            const t = Math.min(1, (now - start) / duration);
            const eased = t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t; // easeInOutQuad approx
            const current = Math.round(from + (to - from) * eased);
            el.textContent = String(current);
            if (t < 1) requestAnimationFrame(step);
            else el.textContent = String(to);
        }
        requestAnimationFrame(step);
    }

    animateCount('totalTasks', stats.total);
    animateCount('inProgressTasks', stats.in_progress);
    animateCount('completedTasks', stats.completed);
    animateCount('overdueTasks', stats.overdue);
}

function updateUserSelect() {
    const select = document.getElementById('taskAssignee');
    if (!select) return;
    select.innerHTML = '<option value="">Myself</option><optgroup label="People"></optgroup><optgroup label="Groups"></optgroup>';
    const people = select.querySelector('optgroup[label="People"]');
    const groupOptions = select.querySelector('optgroup[label="Groups"]');
    users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = `user:${u.id}`;
        opt.textContent = u.username;
        opt.dataset.assignmentType = 'user';
        people.appendChild(opt);
    });
    groups.forEach(group => {
        const opt = document.createElement('option');
        opt.value = `group:${group.id}`;
        opt.textContent = `Team: ${group.name}`;
        opt.dataset.assignmentType = 'group';
        groupOptions.appendChild(opt);
    });
}

function switchView(view) {
    currentView = view;
    const titles = {
        all: 'All Tasks',
        todo: 'To Do Tasks',
        in_progress: 'In Progress Tasks',
        completed: 'Completed Tasks',
        high: 'High Priority Tasks',
        overdue: 'Overdue Tasks'
    };
    if (view === 'analytics') {
        document.getElementById('serverDeadlineAlert')?.style.setProperty('display', 'none');
        document.getElementById('deadlineAlert')?.style.setProperty('display', 'none');
        document.getElementById('tasksContainer').style.display = 'none';
        document.querySelector('.filters-bar').style.display = 'none';
        document.querySelector('.stats-grid').style.display = 'none';
        document.getElementById('emptyState').style.display = 'none';
        document.getElementById('analyticsPanel').style.display = 'block';
        document.getElementById('groupsPanel').style.display = 'none';
        document.getElementById('viewTitle').textContent = 'Analytics & Insights';
        loadAnalytics();
        return;
    }
    if (view === 'groups') {
        document.getElementById('serverDeadlineAlert')?.style.setProperty('display', 'none');
        document.getElementById('deadlineAlert')?.style.setProperty('display', 'none');
        document.getElementById('tasksContainer').style.display = 'none';
        document.querySelector('.filters-bar').style.display = 'none';
        document.querySelector('.stats-grid').style.display = 'none';
        document.getElementById('emptyState').style.display = 'none';
        document.getElementById('analyticsPanel').style.display = 'none';
        document.getElementById('groupsPanel').style.display = 'block';
        document.getElementById('viewTitle').textContent = 'Groups & Teams';
        loadGroups();
        return;
    }
    document.querySelector('.filters-bar').style.display = 'flex';
    document.getElementById('serverDeadlineAlert')?.style.removeProperty('display');
    document.getElementById('deadlineAlert')?.style.removeProperty('display');
    document.querySelector('.stats-grid').style.display = view === 'all' ? 'grid' : 'none';
    document.getElementById('analyticsPanel').style.display = 'none';
    document.getElementById('groupsPanel').style.display = 'none';
    document.getElementById('viewTitle').textContent = titles[view] || 'All Tasks';
    
    // Hide stat cards when viewing filtered views (not 'all')
    const statsGrid = document.querySelector('.stats-grid');
    if (statsGrid) {
        statsGrid.style.display = view === 'all' ? 'grid' : 'none';
    }
    
    filterTasks();
}


function filterTasks() {
    let filtered = [...tasks];

    if (currentView === 'overdue') {
        const now = new Date();
        filtered = filtered.filter(t => t.deadline && new Date(t.deadline) < now && t.status !== 'completed');
    } else if (['todo', 'in_progress', 'completed'].includes(currentView)) {
        filtered = filtered.filter(t => t.status === currentView);
    } else if (currentView === 'high') {
        filtered = filtered.filter(t => t.priority === 'high');
    }

    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase();
    if (searchTerm)
        filtered = filtered.filter(t =>
            t.title.toLowerCase().includes(searchTerm) || t.description.toLowerCase().includes(searchTerm)
        );

    const priorityFilter = document.getElementById('priorityFilter')?.value;
    if (priorityFilter)
        filtered = filtered.filter(t => t.priority === priorityFilter);

    const sortBy = document.getElementById('sortBy')?.value || 'created_desc';
    const priorityOrder = { high: 3, medium: 2, low: 1 };

    filtered.sort((a, b) => {
        switch (sortBy) {
            case 'created_desc': return new Date(b.created_at) - new Date(a.created_at);
            case 'created_asc': return new Date(a.created_at) - new Date(b.created_at);
            case 'deadline_asc':
                if (!a.deadline) return 1;
                if (!b.deadline) return -1;
                return new Date(a.deadline) - new Date(b.deadline);
            case 'priority_desc': return priorityOrder[b.priority] - priorityOrder[a.priority];
            default: return 0;
        }
    });

    renderTasks(filtered);
}


function renderTasks(tasksToRender) {
    if (currentView === 'analytics' || currentView === 'groups') return;
    const container = document.getElementById('tasksContainer');
    const emptyState = document.getElementById('emptyState');
    if (!container) return;

    if (tasksToRender.length === 0) {
        container.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    container.style.display = 'grid';
    if (emptyState) emptyState.style.display = 'none';
    // Render markup
    container.innerHTML = tasksToRender.map(createTaskCard).join('');

    // Staggered reveal: add .task-enter and then trigger the animation with increasing delays
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cards = Array.from(container.children);
    cards.forEach((card, idx) => {
        if (prefersReduced) {
            // If user prefers reduced motion, just ensure visible
            card.style.opacity = '';
            card.style.transform = '';
            return;
        }
        card.classList.add('task-enter');
        // small stagger (ms)
        const delay = Math.min(300, idx * 60);
        // apply delay via timeout so animation-delay isn't needed in CSS
        setTimeout(() => {
            card.classList.add('task-enter--animate');
        }, delay);
    });

    // wire up action buttons after DOM is present
    setTimeout(() => {
        tasksToRender.forEach(task => {
            const taskCard = document.getElementById(`task-${task.id}`);
            
            // Make the entire card clickable to open task detail page
            if (taskCard) {
                taskCard.style.cursor = 'pointer';
                taskCard.addEventListener('click', (e) => {
                    // Don't navigate if clicking on action buttons
                    if (!e.target.closest('.task-action-btn')) {
                        window.location.href = `/task/${task.id}`;
                    }
                });
            }
            
            // Action buttons (stop propagation to prevent card click)
            document.getElementById(`edit-${task.id}`)?.addEventListener('click', (e) => {
                e.stopPropagation();
                openTaskModal(task);
            });
            document.getElementById(`delete-${task.id}`)?.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteTask(task.id);
            });
            document.getElementById(`complete-${task.id}`)?.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleComplete(task);
            });
        });
    }, 120 + Math.min(300, cards.length * 40));
}

function createTaskCard(task) {
    const deadline = task.deadline ? new Date(task.deadline) : null;
    const now = new Date();
    const isOverdue = deadline && deadline < now && task.status !== 'completed';
    const deadlineText = deadline ? formatDate(deadline) : '';
    const deadlineClass = isOverdue ? 'overdue' : '';
    
    // Check permissions for edit/delete
    const canEdit = window.currentUserRole === 'admin' || task.user_id === window.currentUserId;
    const canDelete = window.currentUserRole === 'admin' || task.user_id === window.currentUserId;

    return `
        <div class="task-card priority-${task.priority}" id="task-${task.id}">
            <div class="task-header">
                <h3 class="task-title">${escapeHtml(task.title)}</h3>
                <div class="task-actions">
                    <button class="task-action-btn" id="complete-${task.id}" title="Mark as ${task.status === 'completed' ? 'incomplete' : 'complete'}">
                        ${task.status === 'completed' ? '↩️' : '✅'}
                    </button>
                    ${canEdit ? `<button class="task-action-btn" id="edit-${task.id}" title="Edit">✏️</button>` : ''}
                    ${canDelete ? `<button class="task-action-btn" id="delete-${task.id}" title="Delete">🗑️</button>` : ''}
                </div>
            </div>
            ${task.description ? `<p class="task-description">${escapeHtml(task.description)}</p>` : ''}
            <div class="task-meta">
                <span class="task-badge badge-status ${task.status}">${formatStatus(task.status)}</span>
                <span class="task-badge badge-priority ${task.priority}">${task.priority.toUpperCase()}</span>
            </div>
            ${deadline ? `<div class="task-deadline ${deadlineClass}">📅 ${deadlineText}</div>` : ''}
            ${task.assignee_name ? `
                <div class="task-assignee">
                    <div class="assignee-avatar">${task.assignee_name[0].toUpperCase()}</div>
                    <span>Assigned to ${task.assignee_name}</span>
                </div>
            ` : ''}
            ${task.group_name ? `<div class="task-assignee">👥 Assigned to ${escapeHtml(task.group_name)}</div>` : ''}
            <div class="progress-label"><span>Progress</span><strong>${task.progress || 0}%</strong></div>
            <div class="progress-track"><div class="progress-fill ${task.progress === 100 ? 'complete' : ''}" style="width: ${task.progress || 0}%"></div></div>
        </div>
    `;
}


function showDeadlineAlert() {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;
    // remove any existing alert (we'll recreate a fresh one)
    document.getElementById('deadlineAlert')?.remove();
    if (currentView === 'groups' || currentView === 'analytics') return;

    // respect dismiss suppression stored in localStorage
    try {
        const dismissedUntil = parseInt(localStorage.getItem('deadlineAlertDismissedUntil') || '0', 10);
        if (Date.now() < dismissedUntil) {
            // Alert has been permanently dismissed
            return;
        }
    } catch (err) {
        // ignore storage errors
    }

    const now = new Date();
    const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const approaching = tasks.filter(t =>
        t.deadline && new Date(t.deadline) > now && new Date(t.deadline) <= soon && t.status !== 'completed'
    );

    if (approaching.length === 0) return;
    const alertDiv = document.createElement('div');
    alertDiv.id = 'deadlineAlert';
    alertDiv.className = 'deadline-warning';
    // include a dismiss (X) button and make the alert clickable to jump to the soonest task
    alertDiv.innerHTML = `
        <i>⏰</i>
        <div class="deadline-content">
            <span>You have <strong>${approaching.length}</strong> task${approaching.length > 1 ? 's' : ''} with deadlines approaching soon!</span>
        </div>
        <div class="deadline-actions">
            <button class="deadline-dismiss" aria-label="Close alert">✕</button>
        </div>
    `;
    // Try to place the alert above the page's view title (e.g. above "All Tasks")
    const viewTitle = document.getElementById('viewTitle');
    if (viewTitle && viewTitle.parentNode) {
        viewTitle.parentNode.insertBefore(alertDiv, viewTitle);
    } else {
        mainContent.prepend(alertDiv);
    }
    // add .show to trigger CSS slide/fade animation
    requestAnimationFrame(() => alertDiv.classList.add('show'));

    // Auto-hide after 1 minute (60000 milliseconds)
    const autoHideTimer = setTimeout(() => {
        alertDiv.classList.remove('show');
        setTimeout(() => alertDiv.remove(), 300); // Wait for fade animation
    }, 60000);

    // Dismiss button: remove alert now and never show again (permanent)
    alertDiv.querySelector('.deadline-dismiss')?.addEventListener('click', (e) => {
        e.stopPropagation();
        clearTimeout(autoHideTimer); // Cancel auto-hide timer
        try {
            // Set to a far future date so it never shows again
            const until = Date.now() + (365 * 24 * 60 * 60 * 1000); // 1 year
            localStorage.setItem('deadlineAlertDismissedUntil', String(until));
        } catch (err) {
            // ignore storage errors
        }
        alertDiv.classList.remove('show');
        setTimeout(() => alertDiv.remove(), 300); // Wait for fade animation
    });
}

// Small modal to show approaching tasks
function showApproachingModal(approaching) {
    // remove any existing modal
    document.getElementById('approachingModal')?.remove();

    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'approachingModal';
    modalOverlay.className = 'approaching-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'approaching-modal';

    const header = document.createElement('div');
    header.className = 'approaching-modal-header';
    header.innerHTML = `<h3>Approaching Tasks (${approaching.length})</h3><button class="approaching-close">✕</button>`;

    const list = document.createElement('div');
    list.className = 'approaching-list';

    approaching.slice().sort((a, b) => new Date(a.deadline) - new Date(b.deadline)).forEach(task => {
        const item = document.createElement('div');
        item.className = 'approaching-item';
        const dl = task.deadline ? new Date(task.deadline) : null;
        item.innerHTML = `
            <div class="approaching-title">${escapeHtml(task.title)}</div>
            <div class="approaching-meta">${dl ? formatDate(dl) : 'No deadline'}</div>
        `;
        item.addEventListener('click', () => {
            // close modal then scroll to task card
            modalOverlay.remove();
            const targetEl = document.getElementById(`task-${task.id}`);
            switchView('all');
            setTimeout(() => {
                if (targetEl) {
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    targetEl.classList.add('task-highlight');
                    setTimeout(() => targetEl.classList.remove('task-highlight'), 3000);
                }
            }, 120);
        });
        list.appendChild(item);
    });

    modal.appendChild(header);
    modal.appendChild(list);
    modalOverlay.appendChild(modal);
    document.body.appendChild(modalOverlay);

    // handlers
    modalOverlay.querySelector('.approaching-close')?.addEventListener('click', () => modalOverlay.remove());
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.remove(); });
}

// ================== TASK CRUD ==================
async function deleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
        const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete task');
        document.getElementById(`task-${taskId}`)?.remove();
        await loadTasks();
        await loadStats();
    } catch (err) {
        console.error('Error deleting task:', err);
        alert('Could not delete task.');
    }
}

async function toggleComplete(task) {
    const newStatus = task.status === 'completed' ? 'todo' : 'completed';
    try {
        const res = await fetch(`/api/tasks/${task.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        if (!res.ok) throw new Error('Failed to update task');
        
        // Server will create notification if needed (for task owner when assignee completes task)
        
        await loadTasks();
        await loadStats();
        await loadNotifications(); // Refresh notifications
    } catch (err) {
        console.error('Error toggling task:', err);
        alert('Could not update task.');
    }
}

// ================== TASK MODAL MANAGEMENT ==================
function openTaskModal(task = null) {
    const modal = document.getElementById('taskModal');
    const modalTitle = document.getElementById('modalTitle');
    const form = document.getElementById('taskForm');

    if (!modal) return;

    // Ensure modal lives in document.body so page re-renders elsewhere won't remove it
    if (modal.parentNode !== document.body) {
        try { document.body.appendChild(modal); } catch (err) { console.warn('Could not append modal to body', err); }
    }

    // mark the modal as just opened (kept for debug/history) and force visible
    modal.dataset.justOpened = String(Date.now());

    // Force modal-content visible immediately in case CSS animations or cascade
    // are causing it to remain hidden. We'll set inline styles when opening and
    // remove them when closing.
    const content = modal.querySelector('.modal-content');
    if (content) {
        content.style.opacity = '1';
        content.style.transform = 'none';
        content.style.transition = 'none';
    }

    console.log('[modal] openTaskModal called', { task: task ? { id: task.id, title: task.title } : null, time: new Date().toISOString() });

    if (task) {
        modalTitle.textContent = 'Edit Task';
        document.getElementById('taskId').value = task.id;
        document.getElementById('taskTitle').value = task.title;
        document.getElementById('taskDescription').value = task.description || '';
        document.getElementById('taskPriority').value = task.priority;
        document.getElementById('taskStatus').value = task.status;

        if (task.deadline) {
            const d = new Date(task.deadline);
            document.getElementById('taskDeadline').value = d.toISOString().slice(0, 16);
        } else {
            document.getElementById('taskDeadline').value = '';
        }

        document.getElementById('taskAssignee').value = task.assigned_to ? `user:${task.assigned_to}` : '';
        if (task.assigned_group_id) document.getElementById('taskAssignee').value = `group:${task.assigned_group_id}`;
        document.getElementById('taskProgress').value = task.progress || 0;
        document.getElementById('taskProgressValue').textContent = `${task.progress || 0}%`;
    } else {
        modalTitle.textContent = 'Create New Task';
        form.reset();
        document.getElementById('taskId').value = '';
        document.getElementById('taskProgress').value = 0;
        document.getElementById('taskProgressValue').textContent = '0%';
    }

    const fields = modal.querySelector('.modal-fields');
    if (fields) fields.scrollTop = 0;

    modal.classList.add('active');
}

function closeTaskModal() {
    const modal = document.getElementById('taskModal');
    if (!modal) return;
    // guard against accidental immediate closes right after opening
    const justOpenedAt = Number(modal.dataset.justOpened || '0');
    const sinceOpen = Date.now() - justOpenedAt;
    if (sinceOpen > 0 && sinceOpen < 500) {
        console.log('[modal] closeTaskModal ignored because modal was just opened', { sinceOpen });
        return;
    }

    console.log('[modal] closeTaskModal called', { time: new Date().toISOString(), sinceOpen });
    console.trace();
    // remove inline content flags we set when opening
    const content = modal.querySelector('.modal-content');
    if (content) {
        content.style.opacity = '';
        content.style.transform = '';
        content.style.transition = '';
    }
    modal.classList.remove('active');
    // keep form reset but log it so we can see when it happens
    try { document.getElementById('taskForm').reset(); } catch (err) { console.warn('reset failed', err); }
    try { document.querySelector('.modal-fields').scrollTop = 0; } catch (err) { console.warn('scroll reset failed', err); }
    try { document.getElementById('taskId').value = ''; } catch (err) { console.warn('clear id failed', err); }
}

// ================== FORM SUBMIT ==================
async function handleTaskSubmit(e) {
    e.preventDefault();
    const taskId = document.getElementById('taskId').value;
    const taskTitle = document.getElementById('taskTitle').value;
    const taskData = {
        title: taskTitle,
        description: document.getElementById('taskDescription').value,
        priority: document.getElementById('taskPriority').value,
        status: document.getElementById('taskStatus').value,
        deadline: document.getElementById('taskDeadline').value || null,
        assigned_to: null,
        assigned_group_id: null,
        progress: parseInt(document.getElementById('taskProgress').value, 10)
    };
    const assignment = document.getElementById('taskAssignee');
    const selected = assignment.options[assignment.selectedIndex];
    if (selected?.dataset.assignmentType === 'group') taskData.assigned_group_id = assignment.value.replace('group:', '');
    else taskData.assigned_to = assignment.value ? assignment.value.replace('user:', '') : null;

    try {
        const url = taskId ? `/api/tasks/${taskId}` : '/api/tasks';
        const method = taskId ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(taskData)
        });
        if (!res.ok) throw new Error('Failed to save task');
        
        // Server will create notifications automatically when tasks are assigned
        
        closeTaskModal();
        await loadTasks();
        await loadStats();
        await loadNotifications(); // Refresh notifications
    } catch (err) {
        console.error('Error saving task:', err);
        alert('An error occurred while saving the task.');
    }
}

function renderAnalytics(data) {
    const rate = document.getElementById('analyticsCompletionRate');
    if (rate) rate.textContent = `${data.completion_rate}%`;
    const status = document.getElementById('analyticsStatus');
    if (status) status.innerHTML = Object.entries(data.status).map(([name, count]) => `<div class="metric-row"><span>${formatStatus(name)}</span><strong>${count}</strong></div>`).join('');
    const distribution = document.getElementById('analyticsDistribution');
    if (distribution) distribution.innerHTML = Object.entries(data.distribution).map(([name, count]) => `<div class="metric-row"><span>${name}%</span><strong>${count}</strong></div>`).join('');
    const members = document.getElementById('analyticsMembers');
    if (members) members.innerHTML = data.members.length ? data.members.map(member => `<div class="member-row"><span>${escapeHtml(member.name)}</span><span>${member.tasks} tasks</span><strong>${member.completion_rate}%</strong></div>`).join('') : '<p class="muted">No assigned work yet.</p>';
}

function renderGroups() {
    const container = document.getElementById('groupsList');
    if (!container) return;
    container.innerHTML = groups.length ? groups.map(group => {
        const editing = editingGroupMembers.has(group.id);
        const members = group.members.map(member => escapeHtml(member.username)).join(', ');
        const memberControl = editing
            ? `<select id="group-members-${group.id}" class="select-field" multiple>${users.map(user => `<option value="${user.id}" ${group.members.some(member => member.id === user.id) ? 'selected' : ''}>${escapeHtml(user.username)}</option>`).join('')}</select>`
            : `<div class="group-member-list">${members || 'No members'}</div>`;
        const memberButton = editing
            ? `<button class="btn btn-primary btn-small" onclick="saveGroupMembers(${group.id})">Save members</button>`
            : `<button class="btn btn-primary btn-small" onclick="toggleGroupMembers(${group.id})">Edit members</button>`;
        return `<article class="group-card"><div class="panel-heading"><div><h3>${escapeHtml(group.name)}</h3><p>${escapeHtml(group.description || 'No description')}</p></div><span>${group.members.length} members</span></div><label>Members</label>${memberControl}<div class="group-actions"><button class="btn btn-outline btn-small" onclick="renameGroup(${group.id})">Rename</button>${memberButton}</div></article>`;
    }).join('') : '<p class="muted">No groups created yet.</p>';
}

function toggleGroupMembers(groupId) {
    editingGroupMembers.add(groupId);
    renderGroups();
}

async function createGroup() {
    const name = prompt('Group name');
    if (!name) return;
    const response = await fetch('/api/groups', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name}) });
    if (!response.ok) return alert('Could not create group.');
    await loadGroups();
}

async function renameGroup(groupId) {
    const group = groups.find(item => item.id === groupId);
    const name = prompt('Group name', group?.name || '');
    if (!name) return;
    const response = await fetch(`/api/groups/${groupId}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name}) });
    if (response.ok) await loadGroups();
}

async function saveGroupMembers(groupId) {
    const select = document.getElementById(`group-members-${groupId}`);
    const member_ids = Array.from(select.selectedOptions).map(option => Number(option.value));
    const response = await fetch(`/api/groups/${groupId}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({member_ids}) });
    if (response.ok) {
        editingGroupMembers.delete(groupId);
        await loadGroups();
    }
    else alert('Could not update group members.');
}


function formatDate(date) {
    const now = new Date();
    const diff = date - now;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days < 0) return `Overdue by ${Math.abs(days)} day(s)`;
    if (days === 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
    if (days < 7) return `Due in ${days} days`;
    return date.toLocaleDateString();
}

function formatStatus(status) {
    return { todo: 'To Do', in_progress: 'In Progress', completed: 'Completed' }[status] || status;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}


window.openTaskModal = openTaskModal;
window.closeTaskModal = closeTaskModal;
