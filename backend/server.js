const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const path = require('path');
require('dotenv').config();

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

// Serve static files from frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '2021831026',
  database: process.env.DB_NAME || 'techweave'
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_change_this';

// ============================================
// GOOGLE OAUTH2 FOR EMAIL
// ============================================
const OAuth2 = google.auth.OAuth2;
const oauth2Client = new OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);

oauth2Client.setCredentials({
  refresh_token: process.env.REFRESH_TOKEN,
});

// ============================================
// EMAIL SENDER FUNCTION
// ============================================
async function sendVerificationEmail(email, token) {
  try {
    const accessToken = await oauth2Client.getAccessToken();

    const transport = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: process.env.EMAIL_USER,
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        refreshToken: process.env.REFRESH_TOKEN,
        accessToken: accessToken,
      },
    });

    const verifyURL = `http://localhost:5000/verify?token=${token}`;

    const mailOptions = {
      from: `TechWeave <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Verify Your Email - TechWeave",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e3c72;">Email Verification</h2>
          <p>Welcome to TechWeave! Please verify your email address to activate your account.</p>
          <p>Click the button below to verify your email:</p>
          <a href="${verifyURL}" style="display: inline-block; background: #1e3c72; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0;">Verify Email</a>
          <p>Or copy this link to your browser:</p>
          <p style="color: #666; font-size: 14px;">${verifyURL}</p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">This link will expire in 24 hours.</p>
        </div>
      `,
    };

    await transport.sendMail(mailOptions);
    console.log(` Verification email sent to ${email}`);
  } catch (error) {
    console.error(' Error sending verification email:', error);
    throw error;
  }
}

async function sendPasswordResetEmail(email, token) {
  try {
    const accessToken = await oauth2Client.getAccessToken();

    const transport = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: process.env.EMAIL_USER,
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        refreshToken: process.env.REFRESH_TOKEN,
        accessToken: accessToken,
      },
    });

    const resetURL = `http://localhost:5000/reset-password.html?token=${token}`;

    await transport.sendMail({
      from: `TechWeave <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Password Reset - TechWeave",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e3c72;">Password Reset Request</h2>
          <p>We received a request to reset your password.</p>
          <p>Click the button below to reset your password:</p>
          <a href="${resetURL}" style="display: inline-block; background: #1e3c72; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0;">Reset Password</a>
          <p>Or copy this link to your browser:</p>
          <p style="color: #666; font-size: 14px;">${resetURL}</p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">This link will expire in 1 hour.</p>
          <p style="color: #999; font-size: 12px;">If you didn't request this, please ignore this email.</p>
        </div>
      `,
    });
    
    console.log(` Password reset email sent to ${email}`);
  } catch (error) {
    console.error(' Error sending password reset email:', error);
    throw error;
  }
}

// ============================================
// AUTHENTICATION ROUTES
// ============================================

// Student Signup (with email verification)
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

    // Insert new user with role (verified = 0, needs email verification)
    const [result] = await pool.execute(
      'INSERT INTO users (username, email, password, verified, role) VALUES (?, ?, ?, 0, ?)',
      [username, email, hashedPassword, role]
    );

    const userId = result.insertId;

    // Generate verification token
    const verificationToken = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: "1d" });

    // Send verification email
    try {
      await sendVerificationEmail(email, verificationToken);
    } catch (emailError) {
      console.error('Email sending failed, but user created:', emailError);
      // Still return success even if email fails
    }

    res.json({ 
      message: "Signup successful! Please check your email to verify your account.",
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

// Mentor Signup (with email verification)
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

    // Insert new mentor user (verified = 0, needs email verification)
    const [result] = await pool.execute(
      'INSERT INTO users (username, email, password, verified, role) VALUES (?, ?, ?, 0, "mentor")',
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

    // Generate verification token
    const verificationToken = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: "1d" });

    // Send verification email
    try {
      await sendVerificationEmail(email, verificationToken);
    } catch (emailError) {
      console.error('Email sending failed, but mentor created:', emailError);
    }

    res.json({ 
      message: "Mentor registration successful! Please check your email to verify your account.",
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

// Email Verification Route
app.get("/verify", async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.send(`
      <html>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h2>Invalid Verification Link</h2>
          <p>Please check your email for the correct link.</p>
        </body>
      </html>
    `);
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;

    // Update user as verified
    await pool.execute('UPDATE users SET verified = 1 WHERE id = ?', [userId]);

    // Get user details
    const [users] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId]);
    const user = users[0];

    // Auto-join General Chat after verification
    try {
      await pool.execute(
        'INSERT INTO group_chat_users (group_id, user_id) VALUES (1, ?)',
        [userId]
      );
      console.log(` User ${userId} (${user.role}) auto-joined General Chat after verification`);
    } catch (err) {
      console.error(' Error auto-joining group:', err);
    }

    // Serve verification success page or redirect
    res.sendFile(path.join(__dirname, '../frontend/verify.html'));

  } catch (error) {
    console.error('Verification error:', error);
    res.send(`
      <html>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h2>Verification Failed</h2>
          <p>Token is invalid or expired. Please request a new verification email.</p>
          <a href="/login.html" style="color: #1e3c72;">Go to Login</a>
        </body>
      </html>
    `);
  }
});

// Login (checks email verification)
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

    // Check if email is verified
    if (!user.verified) {
      return res.status(400).json({ message: 'Please verify your email before logging in. Check your inbox.' });
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
      return res.status(400).json({ message: 'No account with that email' });
    }
    
    const resetToken = jwt.sign({ email }, JWT_SECRET, { expiresIn: '1h' });
    
    // Send password reset email
    try {
      await sendPasswordResetEmail(email, resetToken);
      res.json({ message: 'Password reset email sent! Check your inbox.' });
    } catch (emailError) {
      console.error('Password reset email failed:', emailError);
      res.status(500).json({ message: 'Error sending reset email. Please try again later.' });
    }
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
  
  socket.on('user_connected', (userId) => {
    activeUsers.set(userId, socket.id);
    console.log(` User ${userId} connected with socket ${socket.id}`);
    socket.broadcast.emit('user_online', userId);
  });
  
  socket.on('join_room', ({ roomId, userId }) => {
    socket.join(roomId);
    console.log(` User ${userId} joined room ${roomId}`);
  });
  
  socket.on('join_group', ({ groupId, userId }) => {
    const groupRoom = `group_${groupId}`;
    socket.join(groupRoom);
    console.log(` User ${userId} joined group ${groupId}`);
  });
  
  socket.on('send_message', async (data) => {
    const { senderId, receiverId, message, roomId, senderName } = data;
    
    try {
      const savedMessage = await savePrivateMessage(senderId, receiverId, message);
      io.to(roomId).emit('receive_message', {
        ...savedMessage,
        sender_name: senderName
      });
      console.log(`💬 Private message: ${senderId} → ${receiverId}`);
    } catch (error) {
      console.error(' Error sending private message:', error);
      socket.emit('message_error', { error: 'Failed to send message' });
    }
  });
  
  socket.on('send_group_message', async (data) => {
    const { groupId, senderId, message, senderName } = data;
    
    try {
      const savedMessage = await saveGroupMessage(groupId, senderId, message);
      const groupRoom = `group_${groupId}`;
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
  
  socket.on('typing', ({ userId, userName, roomId }) => {
    socket.to(roomId).emit('user_typing', { userId, userName });
  });
  
  socket.on('stop_typing', ({ roomId }) => {
    socket.to(roomId).emit('user_stop_typing');
  });
  
  socket.on('group_typing', ({ userId, userName, groupId }) => {
    const groupRoom = `group_${groupId}`;
    socket.to(groupRoom).emit('group_user_typing', { userId, userName });
  });
  
  socket.on('group_stop_typing', ({ groupId }) => {
    const groupRoom = `group_${groupId}`;
    socket.to(groupRoom).emit('group_user_stop_typing');
  });
  
  socket.on('disconnect', () => {
    for (const [userId, socketId] of activeUsers.entries()) {
      if (socketId === socket.id) {
        activeUsers.delete(userId);
        console.log(` User ${userId} disconnected`);
        socket.broadcast.emit('user_offline', userId);
        break;
      }
    }
  });
});

// ============================================
// ADMIN ROUTES
// ============================================

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

app.get('/api/admin/stats', async (req, res) => {
  try {
    const [userCount] = await pool.execute('SELECT COUNT(*) as count FROM users');
    const [mentorCount] = await pool.execute('SELECT COUNT(*) as count FROM users WHERE role = "mentor"');
    const [messageCount] = await pool.execute('SELECT COUNT(*) as count FROM messages');
    const [groupMessageCount] = await pool.execute('SELECT COUNT(*) as count FROM group_messages');
    
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
// DATABASE CONNECTION TEST
// ============================================
async function testDatabaseConnection() {
  try {
    const connection = await pool.getConnection();
    console.log(' Database connected successfully!');
    connection.release();
  } catch (error) {
    console.error(' Database connection failed:', error.message);
    process.exit(1);
  }
}

async function ensureGeneralChatExists() {
  try {
    const [groups] = await pool.execute('SELECT * FROM group_chats WHERE id = 1');

    if (groups.length === 0) {
      console.log('⚠️  General Chat not found, creating...');
      
      const [users] = await pool.execute('SELECT id FROM users LIMIT 1');
      const creatorId = users.length > 0 ? users[0].id : 1;

      try {
        await pool.execute(
          'INSERT INTO group_chats (id, name, created_by, created_at) VALUES (1, ?, ?, NOW())',
          ['General Chat', creatorId]
        );
      } catch (err) {
        await pool.execute('SET FOREIGN_KEY_CHECKS = 0');
        await pool.execute(
          'INSERT INTO group_chats (id, name, created_by, created_at) VALUES (1, ?, 1, NOW())',
          ['General Chat']
        );
        await pool.execute('SET FOREIGN_KEY_CHECKS = 1');
      }

      console.log(' General Chat created successfully!');
    } else {
      console.log('  General Chat already exists');
    }
  } catch (error) {
    console.error(' Error ensuring General Chat exists:', error.message);
  }
}

// ============================================
// EMAIL SERVICE INITIALIZATION
// ============================================
async function initializeEmailService() {
  try {
    // Check if email credentials are configured
    if (!process.env.EMAIL_USER || !process.env.CLIENT_ID || !process.env.CLIENT_SECRET || !process.env.REFRESH_TOKEN) {
      console.log('⚠️  Email service not configured. Email verification will be skipped.');
      console.log('   Add EMAIL_USER, CLIENT_ID, CLIENT_SECRET, and REFRESH_TOKEN to .env file');
      return false;
    }
    
    // Test OAuth2 connection
    try {
      await oauth2Client.getAccessToken();
      console.log(' Email service initialized successfully!');
      return true;
    } catch (error) {
      console.log('⚠️  Email service connection failed. Check your OAuth2 credentials.');
      console.log('   Email verification will not work until this is fixed.');
      return false;
    }
  } catch (error) {
    console.error(' Error initializing email service:', error.message);
    return false;
  }
}

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 5000;

server.listen(PORT, async () => {
  console.log(' TechWeave Server Started');
  console.log(` Server running on: http://localhost:${PORT}`);
  console.log(` Socket.io ready for real-time connections`);

  
  await testDatabaseConnection();
  await ensureGeneralChatExists();
  await initializeEmailService();
  
  console.log(' All systems ready!');

});