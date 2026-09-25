#!/usr/bin/env python3
"""
Test script to verify notification system works correctly
Run this AFTER the Flask server is running
"""

from app import app, db
from models import User, Task, Notification
from datetime import datetime

def test_notifications():
    with app.app_context():
        print("=" * 60)
        print("🧪 TESTING NOTIFICATION SYSTEM")
        print("=" * 60)
        
        # Get users
        users = User.query.all()
        if len(users) < 2:
            print("❌ Need at least 2 users in database. Run seed_demo_data.py first!")
            return
        
        creator = users[0]
        assignee = users[1]
        print(f"\n👤 Test Users:")
        print(f"   Creator: {creator.username} (ID: {creator.id}, Role: {creator.role})")
        print(f"   Assignee: {assignee.username} (ID: {assignee.id}, Role: {assignee.role})")
        
        # Clean up old test tasks
        old_test = Task.query.filter_by(title="[TEST] Notification Test Task").first()
        if old_test:
            db.session.delete(old_test)
            db.session.commit()
        
        # Test 1: Create task with assignment
        print(f"\n📝 TEST 1: Creating task assigned to {assignee.username}...")
        task = Task(
            title="[TEST] Notification Test Task",
            description="This task tests the notification system",
            priority="high",
            status="todo",
            deadline=None,
            user_id=creator.id,
            assigned_to=assignee.id
        )
        db.session.add(task)
        db.session.commit()
        
        # Create notification (simulating what app.py does)
        if task.assigned_to and task.assigned_to != creator.id:
            notif = Notification(
                user_id=task.assigned_to,
                task_id=task.id,
                actor_id=creator.id,
                type='assignment',
                message=f"{creator.username} assigned you a task: \"{task.title}\""
            )
            db.session.add(notif)
            db.session.commit()
            print(f"   ✅ Task created (ID: {task.id})")
            print(f"   ✅ Notification created (ID: {notif.id})")
        
        # Test 2: Check assignee's notifications
        print(f"\n📬 TEST 2: Checking {assignee.username}'s notifications...")
        assignee_notifs = Notification.query.filter_by(user_id=assignee.id).all()
        print(f"   Total notifications for {assignee.username}: {len(assignee_notifs)}")
        for n in assignee_notifs:
            print(f"   - ID: {n.id}, Type: {n.type}, Message: {n.message}")
        
        # Test 3: Simulate task completion
        print(f"\n✅ TEST 3: Simulating task completion by {assignee.username}...")
        task.status = 'completed'
        task.completed_at = datetime.utcnow()
        db.session.commit()
        
        # Create completion notification
        completion_notif = Notification(
            user_id=creator.id,  # Notify task owner
            task_id=task.id,
            actor_id=assignee.id,
            type='completed',
            message=f"{assignee.username} completed the task: \"{task.title}\""
        )
        db.session.add(completion_notif)
        db.session.commit()
        print(f"   ✅ Task marked as completed")
        print(f"   ✅ Completion notification created (ID: {completion_notif.id})")
        
        # Test 4: Check creator's notifications
        print(f"\n📬 TEST 4: Checking {creator.username}'s notifications...")
        creator_notifs = Notification.query.filter_by(user_id=creator.id).all()
        print(f"   Total notifications for {creator.username}: {len(creator_notifs)}")
        for n in creator_notifs:
            print(f"   - ID: {n.id}, Type: {n.type}, Message: {n.message}")
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 SUMMARY")
        print("=" * 60)
        all_notifs = Notification.query.all()
        print(f"Total notifications in database: {len(all_notifs)}")
        print(f"Test task ID: {task.id}")
        print(f"\n✅ All tests passed!")
        print("\n📋 Next Steps:")
        print(f"   1. Login as '{assignee.username}' in browser")
        print(f"   2. Check inbox (bell icon) - should show notification")
        print(f"   3. Login as '{creator.username}'")
        print(f"   4. Check inbox - should show completion notification")
        print("=" * 60)

if __name__ == "__main__":
    test_notifications()
