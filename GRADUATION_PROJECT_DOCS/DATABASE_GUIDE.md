# 🗄️ Database Architecture - How TaskFlow Database Works

## Overview

TaskFlow uses **SQLite** - a lightweight, file-based database stored in:
```
/home/nasser/task-management-system/instance/taskmanager.db
```

## 🏗️ Database Structure

### Tables in the Database

```
┌─────────────────┐
│     USER        │  ← Stores all registered users
├─────────────────┤
│     TASK        │  ← Stores all tasks
├─────────────────┤
│   NOTIFICATION  │  ← Stores notifications (not currently used)
├─────────────────┤
│  ACTIVITY_LOG   │  ← Stores user activity history
├─────────────────┤
│    COMMENT      │  ← Stores task comments/discussions
└─────────────────┘
```

## 📊 Table Details

### 1. **USER Table**
Stores information about all registered users.

**Columns:**
```
id              INTEGER      Primary key (auto-increment)
username        STRING(80)   Unique username
email           STRING(120)  Unique email address
password_hash   STRING(200)  Encrypted password (not plain text!)
phone           STRING(20)   Phone number (optional)
role            STRING(20)   User role: 'admin', 'manager', or 'user'
bio             TEXT         User biography (optional)
avatar_color    STRING(20)   Color for user avatar (#667eea, etc.)
created_at      DATETIME     When user registered
```

**Example Data:**
```
id=1, username='nasser', email='nasser@example.com', role='admin'
id=2, username='john_doe', email='john@example.com', role='user'
```

### 2. **TASK Table**
Stores all tasks created in the system.

**Columns:**
```
id              INTEGER      Primary key (auto-increment)
title           STRING(200)  Task title
description     TEXT         Task description
status          STRING(20)   'todo', 'in_progress', or 'completed'
priority        STRING(20)   'low', 'medium', or 'high'
deadline        DATETIME     When task is due (optional)
completed_at    DATETIME     When task was completed (optional)
user_id         INTEGER      Foreign key → User who CREATED the task
assigned_to     INTEGER      Foreign key → User who is ASSIGNED the task
created_at      DATETIME     When task was created
updated_at      DATETIME     Last time task was updated
```

**Example Data:**
```
id=1, title='Fix bug', status='todo', priority='high', user_id=1, assigned_to=2
id=2, title='Review code', status='completed', priority='medium', user_id=2, assigned_to=2
```

**Key Relationships:**
- `user_id` = Task creator (who made the task)
- `assigned_to` = Task assignee (who should do the task)

### 3. **NOTIFICATION Table**
Stores notifications for users (currently exists but not actively used).

**Columns:**
```
id              INTEGER      Primary key
user_id         INTEGER      Foreign key → User receiving notification
task_id         INTEGER      Foreign key → Related task
actor_id        INTEGER      Foreign key → User who triggered notification
type            STRING(50)   Notification type
message         TEXT         Notification message
is_read         BOOLEAN      Whether notification was read
created_at      DATETIME     When notification was created
```

### 4. **ACTIVITY_LOG Table**
Tracks all user actions for audit/history.

**Columns:**
```
id              INTEGER      Primary key
user_id         INTEGER      Foreign key → User who performed action
action          STRING(50)   Action type: 'created_task', 'updated_task', etc.
target_type     STRING(50)   What was affected: 'task', 'user', etc.
target_id       INTEGER      ID of the affected item
description     TEXT         Human-readable description
timestamp       DATETIME     When action occurred
```

**Example Data:**
```
id=1, user_id=1, action='created_task', target_type='task', target_id=5, description='Created task: Fix bug'
id=2, user_id=2, action='completed_task', target_type='task', target_id=5, description='Completed task: Fix bug'
```

### 5. **COMMENT Table**
Stores comments/discussions on tasks.

**Columns:**
```
id              INTEGER      Primary key
task_id         INTEGER      Foreign key → Task being commented on
user_id         INTEGER      Foreign key → User who wrote comment
content         TEXT         Comment text
created_at      DATETIME     When comment was posted
updated_at      DATETIME     Last time comment was edited
```

**Example Data:**
```
id=1, task_id=1, user_id=2, content='I'm working on this now'
id=2, task_id=1, user_id=1, content='Great! Let me know if you need help'
```

## 🔗 Relationships Between Tables

```
USER (1) ──────────> (Many) TASK [as creator]
     │
     └─────────────> (Many) TASK [as assignee]
     │
     └─────────────> (Many) COMMENT
     │
     └─────────────> (Many) ACTIVITY_LOG
     │
     └─────────────> (Many) NOTIFICATION

TASK (1) ──────────> (Many) COMMENT
     │
     └─────────────> (Many) NOTIFICATION
     │
     └─────────────> (Many) ACTIVITY_LOG
```

**Explanation:**
- One USER can create many TASKS
- One USER can be assigned many TASKS
- One TASK can have many COMMENTS
- One USER can post many COMMENTS
- All actions create ACTIVITY_LOG entries

## 🔄 How Data Flows

### Creating a Task
```
1. User fills form in dashboard → Submit
2. JavaScript sends POST to /api/tasks
3. Flask creates new Task record in database
4. Flask creates ActivityLog entry
5. Flask creates Notification (if assigned to someone)
6. Database saves all records
7. Flask returns task data to frontend
8. JavaScript displays new task card
```

### Viewing Tasks
```
1. User opens dashboard
2. Flask queries database:
   - Admin: SELECT * FROM task
   - Regular: SELECT * FROM task WHERE user_id=X OR assigned_to=X
3. Database returns matching tasks
4. Flask converts to JSON
5. JavaScript receives and displays task cards
```

### Adding a Comment
```
1. User types comment → Submit
2. JavaScript sends POST to /api/tasks/{id}/comments
3. Flask creates new Comment record
4. Flask creates ActivityLog entry
5. Database saves records
6. Flask returns comment data
7. JavaScript displays new comment
```

## 💾 Database Operations

### SQLAlchemy ORM (What We Use)
Instead of writing raw SQL, we use Python objects:

**Creating a User:**
```python
user = User(
    username='john',
    email='john@example.com',
    role='user'
)
db.session.add(user)
db.session.commit()
```

**Querying Tasks:**
```python
# Get all tasks
tasks = Task.query.all()

# Get specific user's tasks
user_tasks = Task.query.filter_by(user_id=1).all()

# Get tasks with conditions
high_priority = Task.query.filter(
    Task.priority == 'high',
    Task.status != 'completed'
).all()
```

**Updating a Task:**
```python
task = Task.query.get(5)
task.status = 'completed'
task.completed_at = datetime.utcnow()
db.session.commit()
```

**Deleting a Task:**
```python
task = Task.query.get(5)
db.session.delete(task)
db.session.commit()
```

## 🔐 Security Features

### 1. **Password Hashing**
Passwords are NEVER stored in plain text!

```python
# When user registers:
user.password_hash = generate_password_hash('password123')

# When user logs in:
check_password_hash(user.password_hash, 'password123')  # Returns True/False
```

### 2. **Foreign Key Constraints**
- If a User is deleted, all their tasks/comments can be automatically deleted
- Prevents orphaned records

### 3. **Authorization Checks**
Before any database operation:
```python
# Check if user has permission
if task.user_id != current_user.id and current_user.role != 'admin':
    return jsonify({'error': 'Unauthorized'}), 403
```

## 🛠️ Useful Database Commands

### View All Users
```bash
sqlite3 instance/taskmanager.db "SELECT id, username, email, role FROM user;"
```

### View All Tasks
```bash
sqlite3 instance/taskmanager.db "SELECT id, title, status, priority FROM task;"
```

### Count Tasks by Status
```bash
sqlite3 instance/taskmanager.db "SELECT status, COUNT(*) FROM task GROUP BY status;"
```

### View Recent Activity
```bash
sqlite3 instance/taskmanager.db "SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT 10;"
```

### Make User Admin
```bash
sqlite3 instance/taskmanager.db "UPDATE user SET role='admin' WHERE username='john_doe';"
```

### Delete All Tasks
```bash
sqlite3 instance/taskmanager.db "DELETE FROM task;"
```

### Backup Database
```bash
cp instance/taskmanager.db instance/taskmanager.db.backup
```

### Reset Database (Fresh Start)
```bash
rm instance/taskmanager.db
python3 app.py  # Creates new empty database
python3 seed_demo_data.py  # Adds demo data
```

## 📈 Database Performance

### Indexes (Automatic)
SQLAlchemy automatically creates indexes on:
- Primary keys (id columns)
- Foreign keys (user_id, task_id, etc.)
- Unique fields (username, email)

This makes queries FAST! ⚡

### Query Optimization
```python
# BAD - Loads all tasks then filters in Python
tasks = Task.query.all()
my_tasks = [t for t in tasks if t.user_id == 1]

# GOOD - Database filters before returning
my_tasks = Task.query.filter_by(user_id=1).all()
```

## 🎓 Summary

### Key Concepts:
1. **SQLite** = File-based database (taskmanager.db)
2. **SQLAlchemy** = Python library to interact with database
3. **ORM** = Object-Relational Mapping (Python objects ↔ Database rows)
4. **Foreign Keys** = Link tables together
5. **Migrations** = Update database structure without losing data

### Data Flow:
```
User Action → Flask Route → SQLAlchemy → Database → SQLAlchemy → Flask → JSON → Frontend
```

### Important Files:
- `models.py` - Defines table structure
- `app.py` - Queries and updates database
- `instance/taskmanager.db` - The actual database file

The database is the **brain** of TaskFlow - it remembers everything! 🧠✨
