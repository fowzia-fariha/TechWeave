// Profile-related functions

// Load additional user profile data
async function loadUserProfileData(userId) {
    try {
        const response = await fetch(`${API_BASE}/user/${userId}/profile`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.ok) {
            const profileData = await response.json();
            
            // Fill profile form with existing data
            document.getElementById('profileDob').value = profileData.date_of_birth || '';
            document.getElementById('profileUniversity').value = profileData.university || '';
            document.getElementById('profileDepartment').value = profileData.department || '';
            document.getElementById('profileBio').value = profileData.bio || '';
            document.getElementById('profileSkills').value = profileData.skills || '';
            
            // Update avatar if exists
            if (profileData.profile_picture) {
                document.querySelectorAll('.profile-pic').forEach(img => img.src = profileData.profile_picture);
            }
        } else {
            // Initialize empty fields for new users
            document.getElementById('profileDob').value = '';
            document.getElementById('profileUniversity').value = '';
            document.getElementById('profileDepartment').value = '';
            document.getElementById('profileBio').value = '';
            document.getElementById('profileSkills').value = '';
        }
    } catch (error) {
        console.error('Error loading profile data:', error);
        // Initialize empty fields on error
        document.getElementById('profileDob').value = '';
        document.getElementById('profileUniversity').value = '';
        document.getElementById('profileDepartment').value = '';
        document.getElementById('profileBio').value = '';
        document.getElementById('profileSkills').value = '';
    }
}

// Update REAL user profile with new fields
async function updateProfile() {
    const name = document.getElementById('profileNameInput').value.trim();
    const email = document.getElementById('profileEmailInput').value.trim();
    const dob = document.getElementById('profileDob').value;
    const university = document.getElementById('profileUniversity').value.trim();
    const department = document.getElementById('profileDepartment').value.trim();
    const bio = document.getElementById('profileBio').value.trim();
    const skills = document.getElementById('profileSkills').value.trim();
    
    if (!name) {
        alert('Please enter your name');
        return;
    }

    try {
        // Update basic user info
        const response = await fetch(`${API_BASE}/user/${currentUser.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                username: name,
                email: email
            })
        });

        if (!response.ok) {
            throw new Error('Failed to update user profile');
        }

        // Update additional profile data
        const profileResponse = await fetch(`${API_BASE}/user/${currentUser.id}/profile`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                date_of_birth: dob,
                university: university,
                department: department,
                bio: bio,
                skills: skills
            })
        });

        if (!profileResponse.ok) {
            throw new Error('Failed to update profile details');
        }

        // Update the sidebar profile
        document.getElementById('profileName').textContent = name;
        document.getElementById('profileEmail').textContent = email;
        
        // Reload user data to ensure consistency
        await loadRealUserData(currentUser.id);
        
        closeModal('profileModal');
        alert('Profile updated successfully!');
        
    } catch (error) {
        console.error('Error updating profile:', error);
        alert('Failed to update profile: ' + error.message);
    }
}

// Change profile picture
function changeProfilePicture() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            await uploadProfilePicture(file);
        }
    };
    input.click();
}

// Upload profile picture
async function uploadProfilePicture(file) {
    try {
        const formData = new FormData();
        formData.append('profile_picture', file);

        const response = await fetch(`${API_BASE}/user/${currentUser.id}/profile-picture`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: formData
        });

        if (response.ok) {
            const result = await response.json();
            // Update all profile pictures on the page
            document.querySelectorAll('.profile-pic').forEach(img => img.src = result.profile_picture);
            document.querySelectorAll('.status-avatar').forEach(img => img.src = result.profile_picture);
            alert('Profile picture updated successfully!');
        } else {
            throw new Error('Failed to upload profile picture');
        }
    } catch (error) {
        console.error('Error uploading profile picture:', error);
        alert('Failed to upload profile picture');
    }
}

// Delete profile (with confirmation)
async function deleteProfile() {
    if (!confirm('Are you sure you want to delete your profile? This action cannot be undone and all your data will be permanently lost!')) {
        return;
    }

    if (!confirm('This is your final warning! All your posts, comments, and profile data will be permanently deleted. Type "DELETE" to confirm.')) {
        return;
    }

    const confirmation = prompt('Please type "DELETE" to confirm permanent deletion:');
    if (confirmation !== 'DELETE') {
        alert('Profile deletion cancelled.');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/user/${currentUser.id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.ok) {
            alert('Your profile has been permanently deleted.');
            logout();
        } else {
            throw new Error('Failed to delete profile');
        }
    } catch (error) {
        console.error('Error deleting profile:', error);
        alert('Failed to delete profile: ' + error.message);
    }
}