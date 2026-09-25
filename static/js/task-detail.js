// ========== TASK DETAIL PAGE JAVASCRIPT ==========

// Initialize dark mode on page load
document.addEventListener('DOMContentLoaded', function() {
    initDarkMode();
    
    // Load comments on page load
    loadComments();
    
    // Add comment button click handler
    document.getElementById('submitCommentBtn')?.addEventListener('click', submitComment);
});

// ========== DARK MODE FUNCTIONALITY ==========

function initDarkMode() {
    // Check localStorage for saved preference
    const darkMode = localStorage.getItem('darkMode');
    
    if (darkMode === 'enabled') {
        document.body.classList.add('dark-mode');
    }
}

// Get task ID from data attribute to avoid Jinja2 linter issues
const taskIdElement = document.getElementById('taskData');
const TASK_ID = parseInt(taskIdElement.getAttribute('data-task-id'), 10);
const CURRENT_USER_ID = parseInt(taskIdElement.getAttribute('data-current-user-id'), 10);
const TASK_OWNER_ID = parseInt(taskIdElement.getAttribute('data-task-owner-id'), 10);
const TASK_ASSIGNED_TO = taskIdElement.getAttribute('data-task-assigned-to') ? parseInt(taskIdElement.getAttribute('data-task-assigned-to'), 10) : null;

document.getElementById('editTaskBtn')?.addEventListener('click', function() {
    window.location.href = '/dashboard?edit=' + TASK_ID;
});

document.getElementById('submitAnswerBtn')?.addEventListener('click', function() {
    openAnswerModal();
});

function openAnswerModal() {
    const modal = document.getElementById('answerModal');
    if (modal) {
        modal.classList.add('active');
    }
}

function closeAnswerModal() {
    const modal = document.getElementById('answerModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

function submitAnswerForm(event) {
    event.preventDefault();
    const answerText = document.getElementById('answerText').value;
    
    if (!answerText.trim()) {
        alert('Please enter an answer');
        return;
    }
    
    // Submit the answer via API
    fetch(`/api/tasks/${TASK_ID}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: answerText })
    })
    .then(res => {
        if (res.ok) {
            alert('Answer submitted successfully! ✅');
            closeAnswerModal();
            location.reload();
        } else {
            alert('Error submitting answer');
        }
    })
    .catch(err => {
        console.error('Error:', err);
        alert('Error submitting answer');
    });
}

// Complete button
document.getElementById('completeTaskBtn')?.addEventListener('click', async function() {
    try {
        const response = await fetch(`/api/tasks/${TASK_ID}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'completed' })
        });

        if (response.ok) {
            alert('Task marked as complete! ✅');
            location.reload();
        } else {
            alert('Error completing task');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error completing task');
    }
});

// Reopen button
document.getElementById('reopenTaskBtn')?.addEventListener('click', async function() {
    try {
        const response = await fetch(`/api/tasks/${TASK_ID}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'todo' })
        });

        if (response.ok) {
            alert('Task reopened! 🔄');
            location.reload();
        } else {
            alert('Error reopening task');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error reopening task');
    }
});

// Delete button
document.getElementById('deleteTaskBtn')?.addEventListener('click', async function() {
    if (!confirm('Are you sure you want to delete this task? This action cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch(`/api/tasks/${TASK_ID}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            alert('Task deleted! 🗑️');
            window.location.href = '/dashboard';
        } else {
            alert('Error deleting task');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error deleting task');
    }
});

// ========== COMMENTS FUNCTIONALITY ==========

// Load comments on page load
document.addEventListener('DOMContentLoaded', function() {
    loadComments();
    
    // Add comment form submission
    document.getElementById('commentForm')?.addEventListener('submit', submitComment);
});

async function loadComments() {
    try {
        const response = await fetch(`/api/tasks/${TASK_ID}/comments`);
        if (response.ok) {
            const comments = await response.json();
            renderComments(comments);
        } else {
            console.error('Failed to load comments');
        }
    } catch (error) {
        console.error('Load comments error:', error);
    }
}

function renderComments(comments) {
    const commentsList = document.getElementById('commentsList');
    const commentsCount = document.getElementById('commentsCount');
    
    if (!commentsList) return;

    // Update count badge
    if (commentsCount) {
        commentsCount.textContent = comments.length;
    }

    // Clear list
    commentsList.innerHTML = '';

    // Show message if no comments
    if (comments.length === 0) {
        commentsList.innerHTML = '<div class="no-comments">No comments yet. Be the first to comment!</div>';
        return;
    }

    // Render each comment
    comments.forEach(comment => {
        const commentEl = document.createElement('div');
        commentEl.className = 'comment-item';
        commentEl.dataset.commentId = comment.id;

        const avatar = document.createElement('div');
        avatar.className = 'comment-avatar';
        avatar.style.background = comment.avatar_color || '#667eea';
        avatar.textContent = comment.username.charAt(0).toUpperCase();

        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'comment-content-wrapper';

        const header = document.createElement('div');
        header.className = 'comment-header';

        const author = document.createElement('div');
        author.className = 'comment-author';
        author.textContent = comment.username;

        const time = document.createElement('div');
        time.className = 'comment-time';
        time.textContent = formatCommentTime(comment.created_at);

        header.appendChild(author);
        header.appendChild(time);

        const content = document.createElement('div');
        content.className = 'comment-content';
        content.textContent = comment.content;

        contentWrapper.appendChild(header);
        contentWrapper.appendChild(content);

        // Add delete button if user owns the comment
        if (comment.can_delete) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'comment-delete-btn';
            deleteBtn.textContent = '×';
            deleteBtn.title = 'Delete comment';
            deleteBtn.onclick = () => deleteComment(comment.id);
            header.appendChild(deleteBtn);
        }

        commentEl.appendChild(avatar);
        commentEl.appendChild(contentWrapper);
        commentsList.appendChild(commentEl);
    });
}

async function submitComment(e) {
    if (e) e.preventDefault();
    
    const input = document.getElementById('commentInput');
    const content = input.value.trim();

    if (!content) {
        alert('Please enter a comment');
        return;
    }

    try {
        const response = await fetch(`/api/tasks/${TASK_ID}/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ content })
        });

        if (response.ok) {
            input.value = '';
            await loadComments();
        } else {
            const error = await response.json();
            alert('Error: ' + (error.error || 'Failed to post comment'));
        }
    } catch (error) {
        console.error('Submit comment error:', error);
        alert('Failed to post comment');
    }
}

async function deleteComment(commentId) {
    if (!confirm('Are you sure you want to delete this comment?')) {
        return;
    }

    try {
        const response = await fetch(`/api/comments/${commentId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            await loadComments();
        } else {
            const error = await response.json();
            alert('Error: ' + (error.error || 'Failed to delete comment'));
        }
    } catch (error) {
        console.error('Delete comment error:', error);
        alert('Failed to delete comment');
    }
}

function formatCommentTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined 
    });
}

