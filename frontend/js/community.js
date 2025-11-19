// community.js - Simple forum functionality
const API_BASE = 'http://localhost:5000/api';
let currentUser = null;
let posts = [];

// Check auth and load page
async function initCommunity() {
    const token = localStorage.getItem('token');
    if (!token) return window.location.href = 'login.html';
    
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        currentUser = await apiRequest(`/user/${payload.id}`);
        loadPage();
        loadPosts();
    } catch (error) {
        localStorage.removeItem('token');
        window.location.href = 'login.html';
    }
}

// API helper
async function apiRequest(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        ...options
    };
    if (config.body) config.body = JSON.stringify(config.body);
    
    const response = await fetch(`${API_BASE}${endpoint}`, config);
    if (!response.ok) throw new Error('API error');
    return await response.json();
}

// Load page elements
function loadPage() {
    document.getElementById('navbar').innerHTML = `
        <div class="top-nav">
            <div class="logo">
                <i class="fas fa-users"></i>
                <h2>TechWeave Forum</h2>
            </div>
            <div class="nav-icons">
                <div class="nav-icon" onclick="loadPosts()"><i class="fas fa-home"></i></div>
                <div class="nav-icon" onclick="openCreatePostModal()"><i class="fas fa-plus"></i></div>
                <div class="nav-icon" onclick="goBackToChat()"><i class="fas fa-comments"></i></div>
                <div class="nav-icon" onclick="logout()"><i class="fas fa-sign-out-alt"></i></div>
            </div>
        </div>
    `;

    document.getElementById('sidebar').innerHTML = `
        <div class="sidebar">
            <div class="user-profile">
                <img src="https://ui-avatars.com/api/?name=${currentUser.username}&background=1e3c72&color=fff" class="profile-pic">
                <div class="user-name">${currentUser.username}</div>
                <div class="user-email">${currentUser.email}</div>
                <div class="user-role">${currentUser.role.toUpperCase()}</div>
            </div>
        </div>
    `;

    document.getElementById('modals-container').innerHTML = `
        <div class="modal" id="createPostModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Create Post</h3>
                    <button class="close-modal" onclick="closeModal('createPostModal')">×</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <textarea class="form-control" id="modalPostText" rows="4" placeholder="What's on your mind?"></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="closeModal('createPostModal')">Cancel</button>
                    <button class="btn-primary" onclick="createPostFromModal()">Post</button>
                </div>
            </div>
        </div>
        
        <div class="modal" id="videoPostModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Share Video</h3>
                    <button class="close-modal" onclick="closeModal('videoPostModal')">×</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <textarea class="form-control" id="videoPostText" placeholder="Describe your video..."></textarea>
                    </div>
                    <div class="form-group">
                        <input type="text" class="form-control" id="videoUrl" placeholder="YouTube or video URL">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="closeModal('videoPostModal')">Cancel</button>
                    <button class="btn-primary" onclick="createVideoPost()">Share</button>
                </div>
            </div>
        </div>
    `;
}

// Load posts
async function loadPosts() {
    showLoading(true);
    try {
        posts = await apiRequest(`/forum/posts?userId=${currentUser.id}`);
        renderPosts();
    } catch (error) {
        console.error('Failed to load posts');
    } finally {
        showLoading(false);
    }
}

// Render posts
function renderPosts() {
    const feed = document.getElementById('feed');
    if (posts.length === 0) {
        feed.innerHTML = '<div class="post-card">No posts yet. Be the first to post!</div>';
        return;
    }

    feed.innerHTML = posts.map(post => `
        <div class="post-card">
            <div class="post-header">
                <img src="https://ui-avatars.com/api/?name=${post.username}&background=1e3c72&color=fff" class="post-avatar">
                <div class="post-user-info">
                    <div class="post-user-name">${post.username} ${post.role === 'mentor' ? '(Mentor)' : ''}</div>
                    <div class="post-time">${new Date(post.created_at).toLocaleDateString()}</div>
                </div>
            </div>
            <div class="post-content">${post.content}</div>
            ${post.video_url ? `<div style="margin:10px 0;"><iframe width="100%" height="315" src="${post.video_url}" frameborder="0" allowfullscreen></iframe></div>` : ''}
            <div class="post-stats">
                <span>${post.like_count} likes</span>
                <span>${post.comment_count} comments</span>
            </div>
            <div class="reaction-bar">
                <button class="reaction-btn ${post.user_liked ? 'liked' : ''}" onclick="toggleLike(${post.id})">
                    <i class="fas fa-thumbs-up"></i> Like
                </button>
                <button class="reaction-btn" onclick="focusComment(${post.id})">
                    <i class="fas fa-comment"></i> Comment
                </button>
            </div>
            <div class="comment-section">
                <div class="comment-input-container">
                    <img src="https://ui-avatars.com/api/?name=${currentUser.username}&background=1e3c72&color=fff" class="comment-avatar">
                    <input type="text" class="comment-input" id="comment-${post.id}" placeholder="Write a comment..." onkeypress="if(event.key==='Enter') addComment(${post.id})">
                </div>
                <div id="comments-${post.id}"></div>
            </div>
        </div>
    `).join('');

    // Load comments for each post
    posts.forEach(post => loadComments(post.id));
}

// Post functions
async function createPost() {
    const text = document.getElementById('postText').value.trim();
    if (!text) return;
    
    try {
        await apiRequest('/forum/posts', {
            method: 'POST',
            body: { userId: currentUser.id, content: text }
        });
        document.getElementById('postText').value = '';
        loadPosts();
    } catch (error) {
        alert('Failed to create post');
    }
}

async function createPostFromModal() {
    const text = document.getElementById('modalPostText').value.trim();
    if (!text) return;
    
    try {
        await apiRequest('/forum/posts', {
            method: 'POST',
            body: { userId: currentUser.id, content: text }
        });
        closeModal('createPostModal');
        document.getElementById('modalPostText').value = '';
        loadPosts();
    } catch (error) {
        alert('Failed to create post');
    }
}

async function createVideoPost() {
    const text = document.getElementById('videoPostText').value.trim();
    const videoUrl = document.getElementById('videoUrl').value.trim();
    if (!text || !videoUrl) return;
    
    try {
        await apiRequest('/forum/posts', {
            method: 'POST',
            body: { userId: currentUser.id, content: text, postType: 'video', videoUrl }
        });
        closeModal('videoPostModal');
        document.getElementById('videoPostText').value = '';
        document.getElementById('videoUrl').value = '';
        loadPosts();
    } catch (error) {
        alert('Failed to create video post');
    }
}

// Like function
async function toggleLike(postId) {
    try {
        await apiRequest(`/forum/posts/${postId}/like`, {
            method: 'POST',
            body: { userId: currentUser.id }
        });
        loadPosts();
    } catch (error) {
        console.error('Failed to toggle like');
    }
}

// Comment functions
async function addComment(postId) {
    const input = document.getElementById(`comment-${postId}`);
    const text = input.value.trim();
    if (!text) return;
    
    try {
        await apiRequest(`/forum/posts/${postId}/comments`, {
            method: 'POST',
            body: { userId: currentUser.id, content: text }
        });
        input.value = '';
        loadComments(postId);
    } catch (error) {
        console.error('Failed to add comment');
    }
}

async function loadComments(postId) {
    try {
        const comments = await apiRequest(`/forum/posts/${postId}/comments`);
        const container = document.getElementById(`comments-${postId}`);
        container.innerHTML = comments.map(comment => `
            <div class="comment">
                <img src="https://ui-avatars.com/api/?name=${comment.username}&background=1e3c72&color=fff" class="comment-avatar">
                <div class="comment-content">
                    <div class="comment-user">${comment.username}</div>
                    <div class="comment-text">${comment.content}</div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Failed to load comments');
    }
}

// Utility functions
function showLoading(show) {
    document.getElementById('loadingIndicator').style.display = show ? 'flex' : 'none';
}

function openCreatePostModal() {
    document.getElementById('createPostModal').style.display = 'flex';
}

function openVideoPostModal() {
    document.getElementById('videoPostModal').style.display = 'flex';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function focusComment(postId) {
    document.getElementById(`comment-${postId}`).focus();
}

function goBackToChat() {
    window.location.href = 'chat.html';
}

function logout() {
    localStorage.removeItem('token');
    window.location.href = 'login.html';
}

// Close modal when clicking outside
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
    }
});

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initCommunity);


//Maybe it will be updated later or be switched 