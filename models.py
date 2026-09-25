from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

db = SQLAlchemy()


class GroupMember(db.Model):
    __tablename__ = 'group_members'

    group_id = db.Column(db.Integer, db.ForeignKey('groups.id', ondelete='CASCADE'), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)


class User(UserMixin, db.Model):
    """User model for authentication and team collaboration"""
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    phone = db.Column(db.String(20), nullable=True)  # Phone number
    role = db.Column(db.String(20), default='user')  # admin, manager, user
    bio = db.Column(db.Text, nullable=True)
    avatar_color = db.Column(db.String(7), default='#667eea')  # Hex color for avatar
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    tasks = db.relationship(
        'Task',
        backref='owner',
        lazy=True,
        foreign_keys='Task.user_id',
        cascade='all, delete-orphan'
    )
    assigned_tasks = db.relationship(
        'Task',
        backref='assignee',
        lazy=True,
        foreign_keys='Task.assigned_to'
    )
    # Notifications received by the user (explicit foreign_keys to avoid ambiguity)
    notifications = db.relationship(
        'Notification',
        backref='recipient',
        lazy=True,
        foreign_keys='Notification.user_id',
        cascade='all, delete-orphan'
    )
    # Notifications sent/acted-by this user (optional)
    sent_notifications = db.relationship(
        'Notification',
        backref='actor',
        lazy=True,
        foreign_keys='Notification.actor_id'
    )
    groups = db.relationship('Group', secondary='group_members', back_populates='members')

    # (notifications relationship already defined above with explicit foreign_keys)

    # ---------- METHODS ----------
    def set_password(self, password):
        """Hash and set user password"""
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        """Verify user password"""
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        """Convert user to dictionary"""
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'phone': self.phone,
            'role': self.role,
            'bio': self.bio,
            'avatar_color': self.avatar_color,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }


class Task(db.Model):
    """Task model for task management"""
    __tablename__ = 'tasks'

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    answer = db.Column(db.Text, nullable=True)  # User's answer/response to the task
    status = db.Column(db.String(20), default='todo')  # todo, in_progress, completed
    priority = db.Column(db.String(20), default='medium')  # low, medium, high
    deadline = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = db.Column(db.DateTime)
    progress = db.Column(db.Integer, default=0, nullable=False)

    # Foreign keys
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    assigned_to = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    assigned_group_id = db.Column(db.Integer, db.ForeignKey('groups.id', ondelete='SET NULL'), nullable=True)

    # ---------- METHODS ----------
    def to_dict(self):
        """Convert task to dictionary (safe serialization)"""
        return {
            'id': self.id,
            'title': self.title,
            'description': self.description or '',
            'answer': self.answer or '',
            'status': self.status,
            'priority': self.priority,
            'deadline': self.deadline.isoformat() if self.deadline else None,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'user_id': self.user_id,
            'assigned_to': self.assigned_to,
            'assigned_group_id': self.assigned_group_id,
            'owner_name': self.owner.username if self.owner else None,
            'assignee_name': self.assignee.username if self.assignee else None,
            'group_name': self.assigned_group.name if self.assigned_group else None,
            'progress': self.progress or 0
        }


class Group(db.Model):
    __tablename__ = 'groups'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text, nullable=True)
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    creator = db.relationship('User', foreign_keys=[created_by_id], backref='created_groups')
    members = db.relationship('User', secondary='group_members', back_populates='groups')
    tasks = db.relationship('Task', backref='assigned_group', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description or '',
            'created_by_id': self.created_by_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'members': [user.to_dict() for user in self.members]
        }


class Subtask(db.Model):
    __tablename__ = 'subtasks'

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    is_completed = db.Column(db.Boolean, default=False, nullable=False)
    task_id = db.Column(db.Integer, db.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    task = db.relationship('Task', backref=db.backref('subtasks', lazy=True, cascade='all, delete-orphan'))

    def to_dict(self):
        return {'id': self.id, 'title': self.title, 'is_completed': self.is_completed, 'task_id': self.task_id}


class Notification(db.Model):
    """Notification / Inbox messages linked to users and optionally tasks"""
    __tablename__ = 'notifications'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    task_id = db.Column(db.Integer, db.ForeignKey('tasks.id', ondelete='SET NULL'), nullable=True)
    actor_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    type = db.Column(db.String(50), default='info')
    message = db.Column(db.String(500), nullable=False)
    link = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    read_at = db.Column(db.DateTime, nullable=True)

    # relationships (simple backrefs are available via User and Task if needed)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'task_id': self.task_id,
            'actor_id': self.actor_id,
            'type': self.type,
            'message': self.message,
            'link': self.link,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'read_at': self.read_at.isoformat() if self.read_at else None
        }


class ActivityLog(db.Model):
    """Activity log for tracking user actions"""
    __tablename__ = 'activity_logs'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    action = db.Column(db.String(100), nullable=False)  # 'created_task', 'updated_task', 'completed_task', 'deleted_task', etc.
    target_id = db.Column(db.Integer, nullable=True)  # ID of affected task/user
    target_type = db.Column(db.String(50), nullable=False)  # 'task', 'user', etc.
    description = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'action': self.action,
            'target_id': self.target_id,
            'target_type': self.target_type,
            'description': self.description,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class Comment(db.Model):
    """Comments/notes on tasks for discussion and updates"""
    __tablename__ = 'comments'

    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    task = db.relationship('Task', backref=db.backref('comments', lazy=True, cascade='all, delete-orphan'))
    user = db.relationship('User', backref=db.backref('comments', lazy=True))

    def to_dict(self):
        return {
            'id': self.id,
            'task_id': self.task_id,
            'user_id': self.user_id,
            'username': self.user.username if self.user else 'Unknown',
            'avatar_color': self.user.avatar_color if self.user else '#667eea',
            'content': self.content,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
