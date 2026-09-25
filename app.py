from flask import Flask, render_template, request, jsonify, redirect, url_for, flash
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from models import db, User, Task, Notification, ActivityLog, Group, GroupMember, Subtask
from datetime import datetime, timedelta
import os

# ================== APP CONFIG ==================
app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-change-in-production'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///taskmanager.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# ================== EXTENSIONS ==================
db.init_app(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'


@login_manager.user_loader
def load_user(user_id):
    """Load a user by ID for Flask-Login."""
    return User.query.get(int(user_id))


# Create tables if not exist
with app.app_context():
    db.create_all()
    task_columns = {column['name'] for column in db.inspect(db.engine).get_columns('tasks')}
    with db.engine.begin() as connection:
        if 'progress' not in task_columns:
            connection.exec_driver_sql('ALTER TABLE tasks ADD COLUMN progress INTEGER NOT NULL DEFAULT 0')
        if 'assigned_group_id' not in task_columns:
            connection.exec_driver_sql('ALTER TABLE tasks ADD COLUMN assigned_group_id INTEGER')

# Note: create_notification helper removed - notifications are now session-only (not persisted)

def log_activity(user_id, action, target_type, target_id=None, description=None):
    """Helper to log user activities"""
    try:
        log = ActivityLog(
            user_id=user_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            description=description
        )
        db.session.add(log)
        db.session.commit()
    except Exception as e:
        print(f"Error logging activity: {e}")


def visible_tasks_query():
    if current_user.role == 'admin':
        return Task.query
    group_ids = db.session.query(GroupMember.group_id).filter_by(user_id=current_user.id)
    return Task.query.filter(
        (Task.user_id == current_user.id) |
        (Task.assigned_to == current_user.id) |
        (Task.assigned_group_id.in_(group_ids))
    )


def can_access_task(task):
    return visible_tasks_query().filter(Task.id == task.id).first() is not None


def managers_only():
    return current_user.role in ['admin', 'manager']

# ================== ROUTES ==================

@app.route('/')
def index():
    """Landing page"""
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    return render_template('index.html')


# ---------- REGISTER ----------
@app.route('/register', methods=['GET', 'POST'])
def register():
    """User registration"""
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    
    if request.method == 'POST':
        data = request.get_json() if request.is_json else request.form
        username = data.get('username')
        email = data.get('email')
        password = data.get('password')

        if not username or not email or not password:
            msg = 'All fields are required'
            if request.is_json:
                return jsonify({'error': msg}), 400
            flash(msg, 'error')
            return redirect(url_for('register'))

        if User.query.filter_by(username=username).first():
            msg = 'Username already exists'
            if request.is_json:
                return jsonify({'error': msg}), 400
            flash(msg, 'error')
            return redirect(url_for('register'))

        if User.query.filter_by(email=email).first():
            msg = 'Email already registered'
            if request.is_json:
                return jsonify({'error': msg}), 400
            flash(msg, 'error')
            return redirect(url_for('register'))

        user = User(username=username, email=email)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()

        login_user(user)
        if request.is_json:
            return jsonify({'success': True, 'redirect': url_for('dashboard')}), 201
        
        flash('Registration successful!', 'success')
        return redirect(url_for('dashboard'))
    
    # Render the dedicated registration template.
    return render_template('register.html')


# ---------- LOGIN ----------
@app.route('/login', methods=['GET', 'POST'])
def login():
    """User login"""
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))

    if request.method == 'POST':
        data = request.get_json() if request.is_json else request.form
        username = data.get('username')
        password = data.get('password')

        user = User.query.filter_by(username=username).first()
        if user and user.check_password(password):
            login_user(user)
            if request.is_json:
                return jsonify({'success': True, 'redirect': url_for('dashboard')}), 200
            flash('Login successful!', 'success')
            return redirect(url_for('dashboard'))
        
        msg = 'Invalid username or password'
        if request.is_json:
            return jsonify({'error': msg}), 401
        flash(msg, 'error')
        return redirect(url_for('login'))

    return render_template('login.html')


# ---------- LOGOUT ----------
@app.route('/logout')
@login_required
def logout():
    """Logout user"""
    logout_user()
    flash('You have been logged out', 'info')
    return redirect(url_for('index'))


# ---------- USER PROFILE PAGE ----------
@app.route('/profile')
@login_required
def profile():
    """User profile page"""
    return render_template('profile.html')


# ---------- TASK DETAIL PAGE ----------
@app.route('/task/<int:task_id>')
@login_required
def task_detail_page(task_id):
    """View a single task detail page"""
    task = Task.query.get_or_404(task_id)
    # Allow access if user is task owner, assignee, OR admin
    if not can_access_task(task):
        return render_template('error.html', message='You do not have access to this task'), 403
    return render_template('task_detail.html', task=task)


@app.route('/test-notifications')
@login_required
def test_notifications_page():
    """Test page for notification system"""
    return render_template('test_notifications.html')


# ---------- DASHBOARD ----------
@app.route('/dashboard')
@login_required
def dashboard():
    """Main dashboard"""
    now = datetime.utcnow()
    upcoming_deadline = now + timedelta(days=1)

    # Tasks based on role: admins see all, non-admins see their own tasks or tasks assigned to them
    if current_user.role == 'admin':
        user_tasks = Task.query.order_by(Task.created_at.desc()).all()
    else:
        user_tasks = visible_tasks_query().order_by(Task.created_at.desc()).all()

    # Filter tasks due within next 24 hours
    approaching_tasks = [
        t for t in user_tasks
        if t.deadline and now < t.deadline <= upcoming_deadline and t.status != 'completed'
    ]

    return render_template(
        'dashboard.html',
        user=current_user,
        approaching_tasks=approaching_tasks,
        now=now
    )

# ================== API ROUTES ==================

# ---------- TASKS ----------
@app.route('/api/tasks', methods=['GET', 'POST'])
@login_required
def tasks():
    """Get all tasks or create a new one"""
    if request.method == 'GET':
        # Admins see all tasks, non-admins see only their own tasks or tasks assigned to them
        if current_user.role == 'admin':
            user_tasks = Task.query.order_by(Task.created_at.desc()).all()
        else:
            user_tasks = visible_tasks_query().order_by(Task.created_at.desc()).all()
        return jsonify([task.to_dict() for task in user_tasks]), 200

    # POST - Create a task
    data = request.get_json(force=True, silent=True) or {}
    title = data.get('title')
    if not title:
        return jsonify({'error': 'Title is required'}), 400

    # Parse deadline safely
    deadline = None
    if data.get('deadline'):
        try:
            deadline = datetime.fromisoformat(data['deadline'])
        except Exception:
            try:
                deadline = datetime.strptime(data['deadline'], '%Y-%m-%dT%H:%M')
            except Exception:
                pass

    task = Task(
        title=title,
        description=data.get('description', ''),
        priority=data.get('priority', 'medium'),
        status=data.get('status', 'todo'),
        deadline=deadline,
        user_id=current_user.id,
        assigned_to=data.get('assigned_to') or None,
        assigned_group_id=data.get('assigned_group_id') or None,
        progress=max(0, min(100, int(data.get('progress', 0) or 0)))
    )

    if task.assigned_to and task.assigned_group_id:
        return jsonify({'error': 'Choose either a user or a group, not both'}), 400
    if task.assigned_group_id and not Group.query.get(task.assigned_group_id):
        return jsonify({'error': 'Group not found'}), 400

    db.session.add(task)
    db.session.commit()
    log_activity(current_user.id, 'created_task', 'task', task.id, f"Created task: {title}")
    
    # Create notification for assignee if task is assigned to someone else
    if task.assigned_to and task.assigned_to != current_user.id:
        notif = Notification(
            user_id=task.assigned_to,
            task_id=task.id,
            actor_id=current_user.id,
            type='assignment',
            message=f"{current_user.username} assigned you a task: \"{title}\""
        )
        db.session.add(notif)
        db.session.commit()
    
    return jsonify(task.to_dict()), 201


# ---------- TASK DETAIL ----------
@app.route('/api/tasks/<int:task_id>', methods=['GET', 'PUT', 'DELETE'])
@login_required
def task_detail(task_id):
    """Get, update, or delete a specific task"""
    task = Task.query.get_or_404(task_id)
    # Allow access if user is task owner, assignee, OR admin
    if not can_access_task(task):
        return jsonify({'error': 'Unauthorized'}), 403

    if request.method == 'GET':
        return jsonify(task.to_dict()), 200

    if request.method == 'PUT':
        data = request.get_json() or {}

        # capture previous values for notification comparison
        prev_assigned = task.assigned_to
        prev_deadline = task.deadline

        task.title = data.get('title', task.title)
        task.description = data.get('description', task.description)
        task.priority = data.get('priority', task.priority)
        task.status = data.get('status', task.status)
        if 'progress' in data:
            task.progress = max(0, min(100, int(data.get('progress') or 0)))
        if data.get('status') == 'completed':
            task.progress = 100

        # Handle completion
        if data.get('status') == 'completed' and not task.completed_at:
            task.completed_at = datetime.utcnow()
        elif data.get('status') != 'completed':
            task.completed_at = None

        # Handle deadline
        if 'deadline' in data:
            if data['deadline']:
                try:
                    task.deadline = datetime.fromisoformat(data['deadline'])
                except Exception:
                    try:
                        task.deadline = datetime.strptime(data['deadline'], '%Y-%m-%dT%H:%M')
                    except Exception:
                        task.deadline = None
            else:
                task.deadline = None

        if 'assigned_to' in data:
            task.assigned_to = data['assigned_to'] or None
        if 'assigned_group_id' in data:
            task.assigned_group_id = data['assigned_group_id'] or None
        if task.assigned_to and task.assigned_group_id:
            return jsonify({'error': 'Choose either a user or a group, not both'}), 400
        if task.progress == 100:
            task.status = 'completed'
            task.completed_at = task.completed_at or datetime.utcnow()
        elif task.status == 'completed' and 'progress' in data:
            task.status = 'in_progress'
            task.completed_at = None

        task.updated_at = datetime.utcnow()
        db.session.commit()
        log_activity(current_user.id, 'updated_task', 'task', task.id, f"Updated task: {task.title}")

        # Create notification if assignment changed to a different user
        if 'assigned_to' in data and task.assigned_to and task.assigned_to != prev_assigned and task.assigned_to != current_user.id:
            notif = Notification(
                user_id=task.assigned_to,
                task_id=task.id,
                actor_id=current_user.id,
                type='assignment',
                message=f"{current_user.username} assigned you a task: \"{task.title}\""
            )
            db.session.add(notif)
            db.session.commit()
        
        # Create notification if task was completed and assigned to someone else
        if data.get('status') == 'completed' and task.assigned_to and task.assigned_to != current_user.id:
            notif = Notification(
                user_id=task.user_id,  # Notify the task owner
                task_id=task.id,
                actor_id=current_user.id,
                type='completed',
                message=f"{current_user.username} completed the task: \"{task.title}\""
            )
            db.session.add(notif)
            db.session.commit()

        return jsonify(task.to_dict()), 200

    # DELETE
    # Allow task owner OR admin to delete
    if task.user_id != current_user.id and current_user.role != 'admin':
        return jsonify({'error': 'Only task owner or admin can delete'}), 403

    task_title = task.title
    db.session.delete(task)
    db.session.commit()
    log_activity(current_user.id, 'deleted_task', 'task', task_id, f"Deleted task: {task_title}")
    return jsonify({'success': True}), 200


# ---------- SUBMIT ANSWER TO TASK ----------
@app.route('/api/tasks/<int:task_id>/answer', methods=['POST'])
@login_required
def submit_task_answer(task_id):
    """Submit an answer to a task (only assigned user can do this)"""
    task = Task.query.get_or_404(task_id)
    
    # Only the assigned user can submit an answer
    if task.assigned_to != current_user.id:
        return jsonify({'error': 'Only the assigned user can submit an answer'}), 403
    
    data = request.get_json() or {}
    answer = data.get('answer', '').strip()
    
    if not answer:
        return jsonify({'error': 'Answer cannot be empty'}), 400
    
    task.answer = answer
    task.updated_at = datetime.utcnow()
    db.session.commit()
    log_activity(current_user.id, 'submitted_answer', 'task', task.id, f"Submitted answer to: {task.title}")
    
    # Notify task owner that an answer was submitted
    notif = Notification(
        user_id=task.user_id,
        task_id=task.id,
        actor_id=current_user.id,
        type='answer_submitted',
        message=f"{current_user.username} submitted an answer to: \"{task.title}\""
    )
    db.session.add(notif)
    db.session.commit()
    
    return jsonify(task.to_dict()), 200


# ---------- USERS ----------
@app.route('/api/users', methods=['GET'])
@login_required
def get_users():
    """Return all users for task assignment"""
    users = User.query.all()
    return jsonify([user.to_dict() for user in users]), 200


@app.route('/api/groups', methods=['GET', 'POST'])
@login_required
def groups():
    if request.method == 'GET':
        return jsonify([group.to_dict() for group in Group.query.order_by(Group.name).all()]), 200
    if not managers_only():
        return jsonify({'error': 'Manager or admin access required'}), 403
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Group name is required'}), 400
    group = Group(name=name, description=data.get('description', ''), created_by_id=current_user.id)
    group.members = User.query.filter(User.id.in_(data.get('member_ids', []))).all()
    db.session.add(group)
    db.session.commit()
    return jsonify(group.to_dict()), 201


@app.route('/api/groups/<int:group_id>', methods=['PUT', 'DELETE'])
@login_required
def group_detail(group_id):
    if not managers_only():
        return jsonify({'error': 'Manager or admin access required'}), 403
    group = Group.query.get_or_404(group_id)
    if request.method == 'DELETE':
        db.session.delete(group)
    else:
        data = request.get_json() or {}
        group.name = (data.get('name') or group.name).strip()
        group.description = data.get('description', group.description)
        if 'member_ids' in data:
            group.members = User.query.filter(User.id.in_(data['member_ids'])).all()
    db.session.commit()
    return jsonify({'success': True} if request.method == 'DELETE' else group.to_dict()), 200


@app.route('/api/tasks/<int:task_id>/subtasks', methods=['GET', 'POST'])
@login_required
def task_subtasks(task_id):
    task = Task.query.get_or_404(task_id)
    if not can_access_task(task):
        return jsonify({'error': 'Unauthorized'}), 403
    if request.method == 'POST':
        title = (request.get_json() or {}).get('title', '').strip()
        if not title:
            return jsonify({'error': 'Subtask title is required'}), 400
        subtask = Subtask(title=title, task_id=task.id)
        db.session.add(subtask)
        db.session.commit()
    return jsonify([subtask.to_dict() for subtask in task.subtasks]), 201 if request.method == 'POST' else 200


@app.route('/api/subtasks/<int:subtask_id>', methods=['PUT', 'DELETE'])
@login_required
def subtask_detail(subtask_id):
    subtask = Subtask.query.get_or_404(subtask_id)
    if not can_access_task(subtask.task):
        return jsonify({'error': 'Unauthorized'}), 403
    if request.method == 'DELETE':
        db.session.delete(subtask)
    else:
        data = request.get_json() or {}
        subtask.title = data.get('title', subtask.title)
        subtask.is_completed = bool(data.get('is_completed', subtask.is_completed))
    db.session.commit()
    return jsonify({'success': True}), 200


# ---------- NOTIFICATIONS / INBOX ----------
@app.route('/api/notifications', methods=['GET'])
@login_required
def get_notifications():
    """Return notifications for current user (most recent first)"""
    notifs = Notification.query.filter_by(user_id=current_user.id).order_by(Notification.created_at.desc()).all()
    return jsonify([n.to_dict() for n in notifs]), 200


@app.route('/api/notifications/<int:notif_id>/read', methods=['PUT'])
@login_required
def mark_notification_read(notif_id):
    n = Notification.query.get_or_404(notif_id)
    if n.user_id != current_user.id:
        return jsonify({'error': 'Unauthorized'}), 403
    n.read_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'success': True}), 200


@app.route('/api/notifications/<int:notif_id>', methods=['DELETE'])
@login_required
def delete_notification(notif_id):
    """Delete a notification"""
    n = Notification.query.get_or_404(notif_id)
    if n.user_id != current_user.id:
        return jsonify({'error': 'Unauthorized'}), 403
    db.session.delete(n)
    db.session.commit()
    return jsonify({'success': True}), 200


# ---------- STATS ----------
@app.route('/api/stats', methods=['GET'])
@login_required
def get_stats():
    """Return dashboard statistics"""
    # Admins see all tasks, non-admins see only assigned tasks
    all_tasks = visible_tasks_query().all()

    now = datetime.utcnow()
    return jsonify({
        'total': len(all_tasks),
        'completed': len([t for t in all_tasks if t.status == 'completed']),
        'in_progress': len([t for t in all_tasks if t.status == 'in_progress']),
        'todo': len([t for t in all_tasks if t.status == 'todo']),
        'overdue': len([t for t in all_tasks if t.deadline and t.deadline < now and t.status != 'completed']),
        'high_priority': len([t for t in all_tasks if t.priority == 'high' and t.status != 'completed']),
        'medium_priority': len([t for t in all_tasks if t.priority == 'medium' and t.status != 'completed']),
        'low_priority': len([t for t in all_tasks if t.priority == 'low' and t.status != 'completed']),
        'completion_rate': round(sum((t.progress or 0) for t in all_tasks) / len(all_tasks)) if all_tasks else 0
    }), 200


@app.route('/api/analytics', methods=['GET'])
@login_required
def get_analytics():
    all_tasks = visible_tasks_query().all()
    now = datetime.utcnow()
    status_counts = {status: len([task for task in all_tasks if task.status == status]) for status in ['todo', 'in_progress', 'completed']}
    status_counts['overdue'] = len([task for task in all_tasks if task.deadline and task.deadline < now and task.status != 'completed'])
    distribution = {
        '0-25': len([task for task in all_tasks if (task.progress or 0) <= 25]),
        '26-50': len([task for task in all_tasks if 26 <= (task.progress or 0) <= 50]),
        '51-75': len([task for task in all_tasks if 51 <= (task.progress or 0) <= 75]),
        '76-99': len([task for task in all_tasks if 76 <= (task.progress or 0) < 100])
    }
    members = []
    for user in User.query.order_by(User.username).all():
        member_tasks = [task for task in all_tasks if task.assigned_to == user.id or (task.assigned_group and user in task.assigned_group.members)]
        if member_tasks:
            members.append({'name': user.username, 'tasks': len(member_tasks), 'completion_rate': round(sum((task.progress or 0) for task in member_tasks) / len(member_tasks))})
    return jsonify({
        'completion_rate': round(sum((task.progress or 0) for task in all_tasks) / len(all_tasks)) if all_tasks else 0,
        'status': status_counts,
        'distribution': distribution,
        'members': members
    }), 200


# ---------- USER PROFILE & PERMISSIONS ----------
@app.route('/api/profile', methods=['GET'])
@login_required
def get_profile():
    """Get current user's profile"""
    return jsonify(current_user.to_dict()), 200


@app.route('/api/profile', methods=['PUT'])
@login_required
def update_profile():
    """Update current user's profile"""
    data = request.get_json() or {}
    
    # Allow updating email, username, phone, bio, avatar_color
    if 'email' in data and data['email'] != current_user.email:
        # Check if email is already in use
        if User.query.filter_by(email=data['email']).first():
            return jsonify({'error': 'Email already in use'}), 400
        current_user.email = data['email']
    
    if 'username' in data and data['username'] != current_user.username:
        # Check if username is already in use
        if User.query.filter_by(username=data['username']).first():
            return jsonify({'error': 'Username already in use'}), 400
        current_user.username = data['username']
    
    if 'phone' in data:
        current_user.phone = data['phone']
    
    if 'bio' in data:
        current_user.bio = data['bio']
    
    if 'avatar_color' in data:
        current_user.avatar_color = data['avatar_color']
    
    current_user.updated_at = datetime.utcnow()
    db.session.commit()
    log_activity(current_user.id, 'updated_profile', 'user', current_user.id)
    return jsonify(current_user.to_dict()), 200


@app.route('/api/users/<int:user_id>/profile', methods=['GET'])
@login_required
def get_user_profile(user_id):
    """Get any user's public profile"""
    user = User.query.get_or_404(user_id)
    return jsonify(user.to_dict()), 200


# ---------- PROFILE ACTIVITY LOG ----------
@app.route('/api/profile/activity', methods=['GET'])
@login_required
def get_profile_activity():
    """Get activity log for current user's profile page"""
    limit = request.args.get('limit', 20, type=int)
    logs = ActivityLog.query.filter_by(user_id=current_user.id).order_by(ActivityLog.created_at.desc()).limit(limit).all()
    return jsonify([log.to_dict() for log in logs]), 200


@app.route('/api/profile/activity', methods=['DELETE'])
@login_required
def delete_all_profile_activity():
    """Delete all activity logs for current user"""
    ActivityLog.query.filter_by(user_id=current_user.id).delete()
    db.session.commit()
    # Don't create a new log entry - user wants ALL logs cleared
    return jsonify({'success': True, 'message': 'All activity logs deleted'}), 200


# ---------- ACTIVITY LOG ----------
@app.route('/api/activity', methods=['GET'])
@login_required
def get_activity_log():
    """Get activity log for current user"""
    limit = request.args.get('limit', 50, type=int)
    logs = ActivityLog.query.filter_by(user_id=current_user.id).order_by(ActivityLog.created_at.desc()).limit(limit).all()
    return jsonify([log.to_dict() for log in logs]), 200


@app.route('/api/activity/global', methods=['GET'])
@login_required
def get_global_activity():
    """Get global activity log (all users) - admin only"""
    if current_user.role not in ['admin', 'manager']:
        return jsonify({'error': 'Unauthorized'}), 403
    limit = request.args.get('limit', 100, type=int)
    logs = ActivityLog.query.order_by(ActivityLog.created_at.desc()).limit(limit).all()
    return jsonify([log.to_dict() for log in logs]), 200


# ---------- ACTIVITY LOG DELETE ----------
@app.route('/api/activity/<int:log_id>', methods=['DELETE'])
@login_required
def delete_activity(log_id):
    """Delete a specific activity log entry"""
    log = ActivityLog.query.get_or_404(log_id)
    if log.user_id != current_user.id:
        return jsonify({'error': 'Unauthorized'}), 403
    db.session.delete(log)
    db.session.commit()
    return jsonify({'success': True}), 200


@app.route('/api/activity/all', methods=['DELETE'])
@login_required
def delete_all_activity():
    """Delete all activity logs for current user"""
    ActivityLog.query.filter_by(user_id=current_user.id).delete()
    db.session.commit()
    return jsonify({'success': True}), 200


# ---------- COMMENTS / TASK NOTES ----------
@app.route('/api/tasks/<int:task_id>/comments', methods=['GET'])
@login_required
def get_task_comments(task_id):
    """Get all comments for a specific task"""
    from models import Comment
    task = Task.query.get_or_404(task_id)
    
    # Check if user has access to this task
    if not can_access_task(task):
        return jsonify({'error': 'Unauthorized'}), 403
    
    comments = Comment.query.filter_by(task_id=task_id).order_by(Comment.created_at.asc()).all()
    
    # Add can_delete flag to each comment
    comments_data = []
    for comment in comments:
        comment_dict = comment.to_dict()
        comment_dict['can_delete'] = (comment.user_id == current_user.id or current_user.role == 'admin')
        comments_data.append(comment_dict)
    
    return jsonify(comments_data), 200


@app.route('/api/tasks/<int:task_id>/comments', methods=['POST'])
@login_required
def create_task_comment(task_id):
    """Create a new comment on a task"""
    from models import Comment
    task = Task.query.get_or_404(task_id)
    
    # Check if user has access to this task
    if not can_access_task(task):
        return jsonify({'error': 'Unauthorized'}), 403
    
    data = request.get_json()
    content = data.get('content', '').strip()
    
    if not content:
        return jsonify({'error': 'Comment content is required'}), 400
    
    comment = Comment(
        task_id=task_id,
        user_id=current_user.id,
        content=content
    )
    
    db.session.add(comment)
    db.session.commit()
    
    # Log activity
    log_activity(current_user.id, 'commented_on_task', 'task', task_id, f'Added comment to task: {task.title}')
    
    return jsonify(comment.to_dict()), 201


@app.route('/api/comments/<int:comment_id>', methods=['DELETE'])
@login_required
def delete_comment(comment_id):
    """Delete a comment (only owner or admin)"""
    from models import Comment
    comment = Comment.query.get_or_404(comment_id)
    
    # Only comment owner or admin can delete
    if comment.user_id != current_user.id and current_user.role != 'admin':
        return jsonify({'error': 'Unauthorized'}), 403
    
    db.session.delete(comment)
    db.session.commit()
    
    return jsonify({'success': True}), 200


# ================== MAIN ==================
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
