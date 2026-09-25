# TaskFlow - AI Coding Agent Instructions

## Architecture Overview

**TaskFlow** is a Flask-based task management system with Jinja2 SSR frontend enhanced by vanilla JavaScript. The app follows a traditional server-side rendering pattern with API endpoints for dynamic updates.

### Tech Stack
- **Backend**: Flask 3.0.0 with SQLAlchemy 3.1.1 (SQLite in `instance/taskmanager.db`)
- **Auth**: Flask-Login 0.6.3 with Werkzeug password hashing
- **Frontend**: Server-rendered Jinja2 templates + vanilla JavaScript (ES6+)
- **Styling**: Modular CSS with CSS variables and gradient themes (imported via `main.css`)

### Key Components
- `app.py` - Main Flask application (routes, API, auth) - SINGLE FILE monolith
- `models.py` - SQLAlchemy models (User, Task, Notification, ActivityLog)
- `static/js/app.js` - ALL client-side logic (no module splitting)
- `static/css/main.css` - CSS entry point importing 12 modular stylesheets
- `templates/` - Standalone Jinja2 templates (no base template inheritance)
- `seed_demo_data.py` - Database seeder (4 users + 15 tasks)

## Data Flow Pattern

1. **Initial Load**: Flask route renders Jinja2 template with server-side data
2. **Dynamic Updates**: JavaScript fetches `/api/*` endpoints and updates DOM
3. **Auto-refresh**: Dashboard polls `/api/tasks` and `/api/stats` every 30 seconds
4. **Notifications**: Session-only (in-memory) via `addNotification()` - NOT persisted to database

### Database Models
```python
User: id, username, email, password_hash, phone, role, bio, avatar_color
Task: id, title, description, status, priority, deadline, user_id, assigned_to
Notification: id, user_id, task_id, actor_id, type, message (model exists but unused)
ActivityLog: id, user_id, action, target_type, target_id, description
```

**Critical**: Tasks use dual foreign keys:
- `user_id` - Task owner (creator)
- `assigned_to` - Task assignee (nullable)
- All queries MUST filter: `(Task.user_id == current_user.id) | (Task.assigned_to == current_user.id)`

## Critical Patterns

### Modal Management (Anti-Accidental-Close)
The task modal has a sophisticated protection mechanism:
```javascript
openTaskModal(task) {
    modal.dataset.justOpened = String(Date.now());  // Timestamp on open
    form.onsubmit = handleTaskSubmit;               // Bind submit handler
}

closeTaskModal() {
    const sinceOpen = Date.now() - Number(modal.dataset.justOpened);
    if (sinceOpen < 500) return;  // Abort if opened < 500ms ago
}
```
- **Overlay clicks disabled** - users MUST use × button or Cancel button
- Form resets on close - never rely on form persistence
- Submit handler re-bound on every open to prevent stale references

### Notification System (Session-Only)
```javascript
// Notifications are in-memory only - vanish on refresh
addNotification(message, taskId, type) // Adds to `notifications[]` array
renderInbox()                           // Updates badge + dropdown UI
```
- Clicking notification → navigates to `/task/{task_id}` → removes from array
- The `Notification` model exists in DB but is **never used** by the app
- All notifications managed client-side in `notifications[]` global

### Deadline Alert System
```javascript
setInterval(() => showDeadlineAlert(), 60000)  // Every 60 seconds
```
- Shows tasks due within 24 hours (not completed)
- Dismissal sets `localStorage.deadlineAlertDismissedUntil` for 1 year
- Auto-hides after 60 seconds
- Server-side fallback renders alert in `dashboard.html` if `approaching_tasks` present

### Task Status Lifecycle
```python
'todo' → 'in_progress' → 'completed'
# Completing: task.completed_at = datetime.utcnow()
# Reopening:  task.completed_at = None
```

### Animation Pattern (Staggered Reveal)
```javascript
cards.forEach((card, idx) => {
    card.classList.add('task-enter');
    setTimeout(() => card.classList.add('task-enter--animate'), idx * 60);
});
```
- Respects `prefers-reduced-motion` media query
- 60ms stagger between cards (max 300ms delay)

## Development Workflows

### Starting the App
```bash
source venv/bin/activate  # zsh/bash
python app.py             # or ./start.sh
# Access: http://localhost:5000
```

### Seeding Demo Data
```bash
python seed_demo_data.py
# Creates: nasser (admin, pw: 2001), john_doe (pw: password123), +3 users
# 15 tasks with varied statuses, priorities, deadlines
```

### Database Reset (Quick Development Pattern)
```bash
rm instance/taskmanager.db
python app.py  # Tables auto-create via db.create_all()
python seed_demo_data.py  # Re-populate
```

**Why**: No Flask-Migrate installed - fastest iteration is DB deletion + recreation

### Testing Flows
- Login as `john_doe` to see tasks owned + assigned
- Login as `nasser` (admin role) for full access
- Test task assignment between users
- Test deadline alerts by creating tasks due within 24h

## Project-Specific Conventions

### API Response Format (Consistent Pattern)
```python
# Success: Return data directly or as array
return jsonify(task.to_dict()), 201
return jsonify([task.to_dict() for task in tasks]), 200

# Error: Always {"error": "message"} with 4xx/5xx
return jsonify({'error': 'Unauthorized'}), 403
```

### Frontend State Management
Global variables in `app.js` (no framework):
```javascript
let tasks = [];           // Cached task list
let users = [];           // All users for assignment dropdown
let currentView = 'all';  // Filter: all, todo, in_progress, completed, high, overdue
let notifications = [];   // Session-only notification list
```

### CSS Architecture (Modular Imports)
```css
/* main.css imports all modules */
@import url('variables.css');  /* CSS custom properties */
@import url('base.css');       /* Reset + global styles */
@import url('buttons.css');    /* Button system */
@import url('dashboard.css');  /* Dashboard layout */
@import url('tasks.css');      /* Task card styles */
@import url('modal.css');      /* Modal system */
@import url('animations.css'); /* Keyframes + transitions */
@import url('responsive.css'); /* Media queries */
```

**Design System**:
- Gradient overlays everywhere: `linear-gradient(135deg, var(--primary), var(--secondary))`
- CSS variables in `:root`: `--primary: #667eea`, `--secondary: #764ba2`, etc.
- No preprocessor (SCSS/LESS) - plain CSS

### Authentication Guards
```python
@login_required  # Flask-Login decorator on all dashboard/API routes

# Login/register routes redirect if authenticated
if current_user.is_authenticated:
    return redirect(url_for('dashboard'))

# Task access validation pattern
if task.user_id != current_user.id and task.assigned_to != current_user.id:
    return jsonify({'error': 'Unauthorized'}), 403
```

### Datetime Handling (Dual-Format Parser)
```python
# API accepts both ISO and datetime-local formats
try:
    deadline = datetime.fromisoformat(data['deadline'])
except:
    try:
        deadline = datetime.strptime(data['deadline'], '%Y-%m-%dT%H:%M')
    except:
        deadline = None
```

## Common Gotchas

1. **Modal Form Reset**: Form resets on close - never rely on values persisting
2. **Notification Model Mismatch**: `Notification` table exists but app uses session-only notifications
3. **Task Query Pattern**: ALWAYS filter by `(user_id == X) | (assigned_to == X)`
4. **Overdue Logic**: `deadline < now AND status != 'completed'` - completed tasks never overdue
5. **Template Inheritance**: No base template used - each template is standalone with full HTML
6. **No Build Step**: Direct file serving - edit CSS/JS and refresh browser
7. **Deadline Dismissal**: Stored in `localStorage` for 1 year, not 1 hour (see line 437 in app.js)

## Extending the System

### Adding Task Properties (5-Step Pattern)
1. Add column to `Task` model in `models.py`
2. Update `Task.to_dict()` method
3. Add form field in `templates/dashboard.html` modal
4. Update `handleTaskSubmit()` in `app.js` to include field
5. Delete `instance/taskmanager.db` and restart (no migrations)

### Adding Dashboard Views
1. Add route in `app.py` with `@login_required`
2. Create template in `templates/`
3. Add nav link in `dashboard.html` sidebar with `data-view="viewname"`
4. Add filter logic in `switchView()` and `filterTasks()` in `app.js`

### Adding Real-Time Features
**Current**: 30-second polling via `setInterval(() => { loadTasks(); loadStats(); }, 30000)`

**To upgrade**:
- Flask-SocketIO for WebSockets
- Server-Sent Events (SSE) for one-way updates
- Reduce polling interval (trade-off: server load)

## File Structure Logic
```
app.py                    # SINGLE FILE: all routes, API, auth (no blueprints)
models.py                 # SINGLE FILE: all models (no module splitting)
seed_demo_data.py         # Dev tool: creates test data

static/
  css/
    main.css              # Entry point: imports 12 modular stylesheets
    variables.css         # CSS custom properties
    dashboard.css, tasks.css, modal.css, etc.
  js/
    app.js                # SINGLE FILE: all client logic (no bundler)

templates/
  dashboard.html          # Main app (includes modal markup inline)
  task_detail.html        # Individual task page
  login.html, register.html, profile.html
  base.html              # EXISTS BUT UNUSED (no inheritance)

instance/
  taskmanager.db         # SQLite database (auto-created)
```

**No build step**: No webpack/vite/bundler - direct file serving via Flask's `static` folder.

## Key Files to Check When...

**Adding features**: `app.py` (routes), `models.py` (data), `app.js` (frontend), `dashboard.html` (UI)  
**Styling issues**: `static/css/main.css` → check imported modules  
**Auth issues**: `app.py` (@login_required), `models.py` (User.check_password)  
**Task filtering**: `app.js` (filterTasks, switchView)  
**Modal bugs**: `app.js` (openTaskModal, closeTaskModal)  
**Deadline alerts**: `app.js` (showDeadlineAlert), `dashboard.html` (server fallback)
