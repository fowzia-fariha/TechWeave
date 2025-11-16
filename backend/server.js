const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Database configuration
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '2021831026',
  database: 'techweave'
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// JWT Secret
const JWT_SECRET = 'your_super_secret_jwt_key_change_this';

// ============================================
// AUTHENTICATION ROUTES
// ============================================

// Student Signup
app.post("/signup", async (req, res) => {
  const { username, email, password, role = 'student' } = req.body;

  try {
    // Check if user exists
    const [existingUsers] = await pool.execute(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new user with role (verified = 1 for immediate login)
    const [result] = await pool.execute(
      'INSERT INTO users (username, email, password, verified, role) VALUES (?, ?, ?, 1, ?)',
      [username, email, hashedPassword, role]
    );

    const userId = result.insertId;

    // Auto-join "General Chat" group (ID = 1)
    try {
      await pool.execute(
        'INSERT INTO group_chat_users (group_id, user_id) VALUES (1, ?)',
        [userId]
      );
      console.log(` User ${userId} (${role}) auto-joined General Chat`);
    } catch (err) {
      console.error(' Error auto-joining group:', err);
    }

    res.json({ 
      message: "Signup successful! You can now login.",
      userId: userId
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ 
      message: "Server error during signup", 
      error: error.message 
    });
  }
});

// Mentor Signup
app.post("/mentor-signup", async (req, res) => {
  const { username, email, password, expertise, experience } = req.body;

  try {
    // Check if user exists
    const [existingUsers] = await pool.execute(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new mentor user (verified = 1 for immediate login)
    const [result] = await pool.execute(
      'INSERT INTO users (username, email, password, verified, role) VALUES (?, ?, ?, 1, "mentor")',
      [username, email, hashedPassword]
    );

    const userId = result.insertId;

    // Store mentor profile details
    if (expertise && experience) {
      try {
        await pool.execute(
          'INSERT INTO mentor_profiles (user_id, expertise, experience) VALUES (?, ?, ?)',
          [userId, expertise, experience]
        );
        console.log(` Mentor profile saved for user ${userId}`);
      } catch (err) {
        console.error(' Error saving mentor profile:', err);
      }
    }

    // Auto-join "General Chat" group (ID = 1)
    try {
      await pool.execute(
        'INSERT INTO group_chat_users (group_id, user_id) VALUES (1, ?)',
        [userId]
      );
      console.log(` Mentor ${userId} auto-joined General Chat`);
    } catch (err) {
      console.error(' Error auto-joining group:', err);
    }

    res.json({ 
      message: "Mentor registration successful! You can now login.",
      userId: userId
    });

  } catch (error) {
    console.error('Mentor signup error:', error);
    res.status(500).json({ 
      message: "Server error during mentor signup", 
      error: error.message 
    });
  }
});

// Login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const [users] = await pool.execute(
      'SELECT * FROM users WHERE email = ?', 
      [email]
    );
    
    if (users.length === 0) {
      return res.status(400).json({ message: 'User not found' });
    }
    
    const user = users[0];
    
    // Check if password matches
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role }, 
      JWT_SECRET, 
      { expiresIn: '7d' }
    );
    
    console.log(` User ${user.id} (${user.role}) logged in`);
    
    res.json({ 
      message: 'Login successful', 
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Error during login' });
  }
});

// Request password reset
app.post('/request-reset', async (req, res) => {
  const { email } = req.body;
  
  try {
    const [users] = await pool.execute(
      'SELECT * FROM users WHERE email = ?', 
      [email]
    );
    
    if (users.length === 0) {
      return res.status(400).json({ message: 'User not found' });
    }
    
    const resetToken = jwt.sign({ email }, JWT_SECRET, { expiresIn: '1h' });
    
    // In production, send email here
    console.log(`Reset link: http://localhost:3000/reset-password.html?token=${resetToken}`);
    
    res.json({ message: 'Password reset instructions sent (check console for link)' });
  } catch (error) {
    console.error('Reset request error:', error);
    res.status(500).json({ message: 'Error requesting password reset' });
  }
});

// Reset password
app.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await pool.execute(
      'UPDATE users SET password = ? WHERE email = ?',
      [hashedPassword, decoded.email]
    );
    
    console.log(` Password reset successful for ${decoded.email}`);
    res.json({ message: 'Password reset successful' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(400).json({ message: 'Invalid or expired token' });
  }
});

// ============================================
// USER ROUTES
// ============================================

// Get user by ID
app.get('/api/user/:id', async (req, res) => {
  try {
    const [users] = await pool.execute(
      'SELECT id, username, email, role, created_at FROM users WHERE id = ?',
      [req.params.id]
    );
    
    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(users[0]);
  } catch (error) {
    console.error('Fetch user error:', error);
    res.status(500).json({ message: 'Error fetching user' });
  }
});

// Get all users (separated by role)
app.get('/api/all-users', async (req, res) => {
  try {
    const [users] = await pool.execute(
      'SELECT id, username, email, role FROM users WHERE verified = 1 ORDER BY role DESC, username ASC'
    );
    res.json(users);
  } catch (error) {
    console.error('Fetch all users error:', error);
    res.status(500).json({ message: 'Error fetching users' });
  }
});

// Get mentors only
app.get('/api/mentors', async (req, res) => {
  try {
    const [mentors] = await pool.execute(
      'SELECT id, username, email FROM users WHERE role = "mentor" AND verified = 1'
    );
    res.json(mentors);
  } catch (error) {
    console.error('Fetch mentors error:', error);
    res.status(500).json({ message: 'Error fetching mentors' });
  }
});

// ============================================
// PRIVATE CHAT ROUTES
// ============================================

// Save private message to database
async function savePrivateMessage(senderId, receiverId, message) {
  try {
    const roomId = [senderId, receiverId].sort().join('_');
    
    const [result] = await pool.execute(
      'INSERT INTO messages (sender_id, receiver_id, message, room_id) VALUES (?, ?, ?, ?)',
      [senderId, receiverId, message, roomId]
    );
    
    const [messages] = await pool.execute(
      `SELECT m.*, u.username as sender_name, u.role as sender_role
       FROM messages m 
       JOIN users u ON m.sender_id = u.id 
       WHERE m.id = ?`,
      [result.insertId]
    );
    
    return messages[0];
  } catch (error) {
    console.error('Error saving private message:', error);
    throw error;
  }
}

// Get chat history between two users
app.get('/api/chats/:userId', async (req, res) => {
  try {
    const [messages] = await pool.execute(
      `SELECT m.*, u.username as sender_name, u.role as sender_role
       FROM messages m 
       JOIN users u ON m.sender_id = u.id 
       WHERE m.sender_id = ? OR m.receiver_id = ? 
       ORDER BY m.timestamp ASC`,
      [req.params.userId, req.params.userId]
    );
    res.json(messages);
  } catch (error) {
    console.error('Fetch chat history error:', error);
    res.status(500).json({ message: 'Error fetching chat history' });
  }
});

// ============================================
// GROUP CHAT ROUTES
// ============================================

// Get all groups
app.get('/api/group-chats', async (req, res) => {
  try {
    const [groups] = await pool.execute(
      `SELECT gc.*, u.username as creator_name,
       (SELECT COUNT(*) FROM group_chat_users WHERE group_id = gc.id) as member_count
       FROM group_chats gc 
       JOIN users u ON gc.created_by = u.id 
       ORDER BY gc.created_at DESC`
    );
    res.json(groups);
  } catch (error) {
    console.error('Fetch groups error:', error);
    res.status(500).json({ message: 'Error fetching groups' });
  }
});

// Get group messages
app.get('/api/group-chat/:groupId/messages', async (req, res) => {
  try {
    const [messages] = await pool.execute(
      `SELECT gm.*, u.username as sender_name, u.role as sender_role
       FROM group_messages gm 
       JOIN users u ON gm.sender_id = u.id 
       WHERE gm.group_id = ? 
       ORDER BY gm.timestamp ASC`,
      [req.params.groupId]
    );
    res.json(messages);
  } catch (error) {
    console.error('Fetch group messages error:', error);
    res.status(500).json({ message: 'Error fetching group messages' });
  }
});

// Get group members
app.get('/api/group-chat/:groupId/members', async (req, res) => {
  try {
    const [members] = await pool.execute(
      `SELECT u.id, u.username, u.email, u.role, gcu.joined_at
       FROM group_chat_users gcu
       JOIN users u ON gcu.user_id = u.id
       WHERE gcu.group_id = ?
       ORDER BY u.role DESC, u.username ASC`,
      [req.params.groupId]
    );
    res.json(members);
  } catch (error) {
    console.error('Fetch group members error:', error);
    res.status(500).json({ message: 'Error fetching group members' });
  }
});

// Save group message
async function saveGroupMessage(groupId, senderId, message) {
  try {
    const [result] = await pool.execute(
      'INSERT INTO group_messages (group_id, sender_id, message) VALUES (?, ?, ?)',
      [groupId, senderId, message]
    );
    
    const [messages] = await pool.execute(
      `SELECT gm.*, u.username as sender_name, u.role as sender_role
       FROM group_messages gm 
       JOIN users u ON gm.sender_id = u.id 
       WHERE gm.id = ?`,
      [result.insertId]
    );
    
    return messages[0];
  } catch (error) {
    console.error('Error saving group message:', error);
    throw error;
  }
}

// ============================================
// SOCKET.IO REAL-TIME CHAT
// ============================================

const activeUsers = new Map();

io.on('connection', (socket) => {
  console.log(' User connected:', socket.id);
  
  // User connects with their ID
  socket.on('user_connected', (userId) => {
    activeUsers.set(userId, socket.id);
    console.log(` User ${userId} connected with socket ${socket.id}`);
    
    // Broadcast to others that user is online
    socket.broadcast.emit('user_online', userId);
  });
  
  // Join private chat room
  socket.on('join_room', ({ roomId, userId }) => {
    socket.join(roomId);
    console.log(`🚪 User ${userId} joined room ${roomId}`);
  });
  
  // Join group chat
  socket.on('join_group', ({ groupId, userId }) => {
    const groupRoom = `group_${groupId}`;
    socket.join(groupRoom);
    console.log(`👥 User ${userId} joined group ${groupId}`);
  });
  
  // Send private message
  socket.on('send_message', async (data) => {
    const { senderId, receiverId, message, roomId, senderName } = data;
    
    try {
      const savedMessage = await savePrivateMessage(senderId, receiverId, message);
      
      // Emit to the room (both sender and receiver)
      io.to(roomId).emit('receive_message', {
        ...savedMessage,
        sender_name: senderName
      });
      
      console.log(`💬 Private message: ${senderId} → ${receiverId}`);
    } catch (error) {
      console.error('❌ Error sending private message:', error);
      socket.emit('message_error', { error: 'Failed to send message' });
    }
  });
  
  // Send group message
  socket.on('send_group_message', async (data) => {
    const { groupId, senderId, message, senderName } = data;
    
    try {
      const savedMessage = await saveGroupMessage(groupId, senderId, message);
      const groupRoom = `group_${groupId}`;
      
      // Emit to all users in the group
      io.to(groupRoom).emit('receive_group_message', {
        ...savedMessage,
        sender_name: senderName
      });
      
      console.log(`💬 Group message: User ${senderId} → Group ${groupId}`);
    } catch (error) {
      console.error(' Error sending group message:', error);
      socket.emit('message_error', { error: 'Failed to send group message' });
    }
  });
  
  // User typing indicator for private chat
  socket.on('typing', ({ userId, userName, roomId }) => {
    socket.to(roomId).emit('user_typing', { userId, userName });
  });
  
  socket.on('stop_typing', ({ roomId }) => {
    socket.to(roomId).emit('user_stop_typing');
  });
  
  // User typing indicator for group chat
  socket.on('group_typing', ({ userId, userName, groupId }) => {
    const groupRoom = `group_${groupId}`;
    socket.to(groupRoom).emit('group_user_typing', { userId, userName });
  });
  
  socket.on('group_stop_typing', ({ groupId }) => {
    const groupRoom = `group_${groupId}`;
    socket.to(groupRoom).emit('group_user_stop_typing');
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    for (const [userId, socketId] of activeUsers.entries()) {
      if (socketId === socket.id) {
        activeUsers.delete(userId);
        console.log(` User ${userId} disconnected`);
        // Broadcast to others that user is offline
        socket.broadcast.emit('user_offline', userId);
        break;
      }
    }
  });
});

// ============================================
// ADMIN ROUTES (For testing)
// ============================================

// Promote user to mentor
app.post('/api/admin/promote-to-mentor/:userId', async (req, res) => {
  try {
    await pool.execute(
      'UPDATE users SET role = "mentor" WHERE id = ?',
      [req.params.userId]
    );
    console.log(` User ${req.params.userId} promoted to mentor`);
    res.json({ message: 'User promoted to mentor' });
  } catch (error) {
    console.error('Promote user error:', error);
    res.status(500).json({ message: 'Error promoting user' });
  }
});

// Get system stats
app.get('/api/admin/stats', async (req, res) => {
  try {
    const [userCount] = await pool.execute(
      'SELECT COUNT(*) as count FROM users'
    );
    const [mentorCount] = await pool.execute(
      'SELECT COUNT(*) as count FROM users WHERE role = "mentor"'
    );
    const [messageCount] = await pool.execute(
      'SELECT COUNT(*) as count FROM messages'
    );
    const [groupMessageCount] = await pool.execute(
      'SELECT COUNT(*) as count FROM group_messages'
    );
    
    res.json({
      totalUsers: userCount[0].count,
      totalMentors: mentorCount[0].count,
      privateMessages: messageCount[0].count,
      groupMessages: groupMessageCount[0].count
    });
  } catch (error) {
    console.error('Fetch stats error:', error);
    res.status(500).json({ message: 'Error fetching stats' });
  }
});

// ============================================
// TEST DATABASE CONNECTION
// ============================================
async function testDatabaseConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('Database connected successfully!');
    connection.release();
  } catch (error) {
    console.error(' Database connection failed:', error.message);
    process.exit(1);
  }
}

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 5000;

server.listen(PORT, async () => {
 // console.log('='.repeat(50));
  console.log('TechWeave Server Started');
  //console.log('='.repeat(50));
  console.log(`Server running on: http://localhost:${PORT}`);
  // console.log('='.repeat(50));
  
  // Test database connection on startup
  await testDatabaseConnection();
  

  // console.log('='.repeat(50));
});