// ========== PROFILE PAGE JAVASCRIPT ==========

document.addEventListener('DOMContentLoaded', () => {
    // Initialize dark mode
    initDarkMode();
    
    // Initialize profile avatar with user's initial
    const avatarEl = document.getElementById('profileAvatar');
    if (avatarEl && window.profileUsername) {
        avatarEl.textContent = window.profileUsername.charAt(0).toUpperCase();
        if (window.profileAvatarColor) {
            avatarEl.style.background = window.profileAvatarColor;
        }
    }

    // Load activity log
    loadActivity();

    // Edit Profile Button
    const editBtn = document.getElementById('editProfileBtn');
    if (editBtn) {
        editBtn.addEventListener('click', () => {
            openEditModal();
        });
    }

    // Color picker functionality
    const colorOptions = document.querySelectorAll('.color-option');
    if (window.profileAvatarColor) {
        colorOptions.forEach(option => {
            if (option.dataset.color === window.profileAvatarColor) {
                option.classList.add('selected');
            }
            option.addEventListener('click', () => {
                colorOptions.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                document.getElementById('editAvatarColor').value = option.dataset.color;
            });
        });
    }

    // Delete All Activity Button
    const deleteAllBtn = document.getElementById('deleteAllActivityBtn');
    if (deleteAllBtn) {
        deleteAllBtn.addEventListener('click', async () => {
            if (!confirm('Are you sure you want to delete all your activity logs? This cannot be undone.')) {
                return;
            }

            try {
                const response = await fetch('/api/profile/activity', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (response.ok) {
                    alert('All activity logs deleted successfully!');
                    loadActivity(); // Reload activity list
                } else {
                    alert('Failed to delete activity logs');
                }
            } catch (err) {
                console.error('Error deleting activity:', err);
                alert('An error occurred while deleting activity logs');
            }
        });
    }
});

async function loadActivity() {
    const activityList = document.getElementById('activityList');
    if (!activityList) return;

    try {
        const response = await fetch('/api/profile/activity');
        if (!response.ok) {
            activityList.innerHTML = '<p class="activity-empty">Failed to load activity</p>';
            return;
        }

        const activities = await response.json();
        
        if (activities.length === 0) {
            activityList.innerHTML = '<p class="activity-empty">No activity yet</p>';
            return;
        }

        activityList.innerHTML = activities.map(activity => `
            <div class="activity-item" style="margin-bottom: 0.8rem;">
                <div>
                    <strong>${escapeHtml(activity.action)}</strong>
                    <p style="margin: 0.3rem 0 0 0; color: var(--text-light); font-size: 0.9rem;">
                        ${escapeHtml(activity.description || '')}
                    </p>
                </div>
                <div style="text-align: right; color: var(--text-light); font-size: 0.85rem;">
                    ${new Date(activity.created_at).toLocaleString()}
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Error loading activity:', err);
        activityList.innerHTML = '<p class="activity-empty">Error loading activity</p>';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function openEditModal() {
    document.getElementById('editProfileModal').classList.add('active');
}

function closeEditModal() {
    document.getElementById('editProfileModal').classList.remove('active');
}

async function handleEditSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = {
        username: form.username.value,
        email: form.email.value,
        phone: form.phone.value,
        bio: form.bio.value,
        avatar_color: form.avatar_color.value
    };

    try {
        const response = await fetch('/api/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        if (response.ok) {
            alert('Profile updated successfully!');
            closeEditModal();
            // Reload page to show updated data
            window.location.reload();
        } else {
            const error = await response.json();
            alert(error.error || 'Failed to update profile');
        }
    } catch (err) {
        console.error('Error updating profile:', err);
        alert('An error occurred while updating profile');
    }
}

// ========== DARK MODE FUNCTIONALITY ==========

function initDarkMode() {
    // Check localStorage for saved preference
    const darkMode = localStorage.getItem('darkMode');
    
    if (darkMode === 'enabled') {
        document.body.classList.add('dark-mode');
    }
}

// Close modal when clicking outside
document.getElementById('editProfileModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'editProfileModal') {
        closeEditModal();
    }
});
