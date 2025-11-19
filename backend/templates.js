const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const jwt = require('jsonwebtoken');

// This will be set by server.js - DO NOT create a new connection here!
let pool = null;

// Initialize function to receive database pool from server.js
function initializeRouter(dbPool) {
    if (!dbPool) {
        throw new Error('Database pool is required to initialize templates router');
    }
    pool = dbPool;
    console.log('✅ Templates router initialized with database pool');
}

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_change_this';

// ==================== MIDDLEWARE: Check if pool is initialized ====================
function checkPoolInitialized(req, res, next) {
    if (!pool) {
        console.error('❌ Database pool not initialized!');
        return res.status(500).json({
            success: false,
            message: 'Database connection not initialized. Please restart the server.'
        });
    }
    next();
}

// Apply pool check to all routes
router.use(checkPoolInitialized);

// ==================== MIDDLEWARE: Authenticate Token ====================
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: 'Access denied. No token provided.' 
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        console.log('✅ Authenticated:', decoded.email, 'Role:', decoded.role);
        next();
    } catch (error) {
        return res.status(403).json({ 
            success: false, 
            message: 'Invalid or expired token.' 
        });
    }
}

// ==================== MIDDLEWARE: Check Mentor/Admin Role ====================
async function checkMentorOrAdmin(req, res, next) {
    try {
        const [users] = await pool.execute(
            'SELECT role FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const userRole = users[0].role;

        if (userRole !== 'admin' && userRole !== 'mentor') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Only mentors and admins can perform this action.'
            });
        }

        next();
    } catch (error) {
        console.error('❌ Error checking role:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying permissions'
        });
    }
}

// ==================== GET ALL TEMPLATES ====================
router.get('/', async (req, res) => {
    try {
        console.log('📥 Fetching all templates');
        
        const [templates] = await pool.execute(
            'SELECT * FROM project_templates ORDER BY created_at DESC'
        );
        
        // FIXED: Handle both JSON arrays and comma-separated strings
        const parsedTemplates = templates.map(t => {
            // Parse tech_stack - handle both formats
            let techStack = [];
            if (t.tech_stack) {
                try {
                    // Try to parse as JSON first
                    techStack = JSON.parse(t.tech_stack);
                    if (!Array.isArray(techStack)) {
                        // If it's not an array, try splitting by comma
                        techStack = typeof t.tech_stack === 'string' ? 
                            t.tech_stack.split(',').map(tech => tech.trim()) : 
                            [t.tech_stack];
                    }
                } catch (e) {
                    // If JSON parsing fails, treat as comma-separated string
                    techStack = typeof t.tech_stack === 'string' ? 
                        t.tech_stack.split(',').map(tech => tech.trim()) : 
                        [t.tech_stack];
                }
            }
            
            // Parse features - handle both formats
            let features = [];
            if (t.features) {
                try {
                    features = JSON.parse(t.features);
                    if (!Array.isArray(features)) {
                        features = typeof t.features === 'string' ? 
                            t.features.split('\n').filter(f => f.trim()) : 
                            [t.features];
                    }
                } catch (e) {
                    features = typeof t.features === 'string' ? 
                        t.features.split('\n').filter(f => f.trim()) : 
                        [t.features];
                }
            }
            
            // Parse learning_outcomes - handle both formats
            let learning_outcomes = [];
            if (t.learning_outcomes) {
                try {
                    learning_outcomes = JSON.parse(t.learning_outcomes);
                    if (!Array.isArray(learning_outcomes)) {
                        learning_outcomes = typeof t.learning_outcomes === 'string' ? 
                            t.learning_outcomes.split('\n').filter(o => o.trim()) : 
                            [t.learning_outcomes];
                    }
                } catch (e) {
                    learning_outcomes = typeof t.learning_outcomes === 'string' ? 
                        t.learning_outcomes.split('\n').filter(o => o.trim()) : 
                        [t.learning_outcomes];
                }
            }
            
            return {
                ...t,
                tech_stack: techStack,
                features: features,
                learning_outcomes: learning_outcomes
            };
        });
        
        console.log(`✅ Found ${parsedTemplates.length} templates`);
        
        res.json({
            success: true,
            count: parsedTemplates.length,
            templates: parsedTemplates
        });
        
    } catch (error) {
        console.error('❌ Error fetching templates:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching templates: ' + error.message
        });
    }
});
// ==================== GET TEMPLATE BY ID ====================
router.get('/:id', async (req, res) => {
    try {
        console.log('📥 Fetching template ID:', req.params.id);
        
        const [templates] = await pool.execute(
            'SELECT * FROM project_templates WHERE id = ?',
            [req.params.id]
        );
        
        if (templates.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }
        
        const template = templates[0];
        
        // FIXED: Handle both JSON arrays and comma-separated strings
        // Parse tech_stack
        let techStack = [];
        if (template.tech_stack) {
            try {
                techStack = JSON.parse(template.tech_stack);
                if (!Array.isArray(techStack)) {
                    techStack = typeof template.tech_stack === 'string' ? 
                        template.tech_stack.split(',').map(tech => tech.trim()) : 
                        [template.tech_stack];
                }
            } catch (e) {
                techStack = typeof template.tech_stack === 'string' ? 
                    template.tech_stack.split(',').map(tech => tech.trim()) : 
                    [template.tech_stack];
            }
        }
        
        // Parse features
        let features = [];
        if (template.features) {
            try {
                features = JSON.parse(template.features);
                if (!Array.isArray(features)) {
                    features = typeof template.features === 'string' ? 
                        template.features.split('\n').filter(f => f.trim()) : 
                        [template.features];
                }
            } catch (e) {
                features = typeof template.features === 'string' ? 
                    template.features.split('\n').filter(f => f.trim()) : 
                    [template.features];
            }
        }
        
        // Parse learning_outcomes
        let learning_outcomes = [];
        if (template.learning_outcomes) {
            try {
                learning_outcomes = JSON.parse(template.learning_outcomes);
                if (!Array.isArray(learning_outcomes)) {
                    learning_outcomes = typeof template.learning_outcomes === 'string' ? 
                        template.learning_outcomes.split('\n').filter(o => o.trim()) : 
                        [template.learning_outcomes];
                }
            } catch (e) {
                learning_outcomes = typeof template.learning_outcomes === 'string' ? 
                    template.learning_outcomes.split('\n').filter(o => o.trim()) : 
                    [template.learning_outcomes];
            }
        }
        
        template.tech_stack = techStack;
        template.features = features;
        template.learning_outcomes = learning_outcomes;
        
        console.log('✅ Template found:', template.name);
        
        res.json({
            success: true,
            template
        });
        
    } catch (error) {
        console.error('❌ Error fetching template:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching template'
        });
    }
});

// ==================== GET STATISTICS ====================
router.get('/stats', async (req, res) => {
    try {
        const [[{ totalDownloads }]] = await pool.execute(
            'SELECT COALESCE(SUM(downloads), 0) as totalDownloads FROM project_templates'
        );
        
        res.json({
            success: true,
            stats: {
                totalDownloads
            }
        });
        
    } catch (error) {
        console.error('❌ Error fetching stats:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching statistics'
        });
    }
});

// ==================== ADD NEW TEMPLATE (MENTOR/ADMIN ONLY) ====================
router.post('/admin/add', authenticateToken, checkMentorOrAdmin, async (req, res) => {
    try {
        console.log('📝 Creating new template via admin/add');
        console.log('👤 Created by user ID:', req.user.id);
        console.log('📦 Request body:', req.body);
        
        const {
            name,
            category,
            difficulty,
            description,
            tech_stack,
            features,
            learning_outcomes
        } = req.body;
        
        // Validation
        if (!name || !category || !description) {
            return res.status(400).json({
                success: false,
                message: 'Name, category, and description are required'
            });
        }
        
        // Parse tech stack from JSON string
        let techStackArray = [];
        try {
            techStackArray = typeof tech_stack === 'string' ? JSON.parse(tech_stack) : tech_stack;
            if (!Array.isArray(techStackArray)) {
                techStackArray = [techStackArray];
            }
        } catch (e) {
            console.error('❌ Error parsing tech_stack:', e);
            techStackArray = [];
        }
        
        if (techStackArray.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one technology is required'
            });
        }
        
        // Parse features
        let featuresArray = [];
        try {
            featuresArray = typeof features === 'string' ? JSON.parse(features) : features;
            if (!Array.isArray(featuresArray)) {
                featuresArray = features ? [features] : [];
            }
        } catch (e) {
            console.error('❌ Error parsing features:', e);
            featuresArray = [];
        }
        
        // Parse learning outcomes
        let outcomesArray = [];
        try {
            outcomesArray = typeof learning_outcomes === 'string' ? JSON.parse(learning_outcomes) : learning_outcomes;
            if (!Array.isArray(outcomesArray)) {
                outcomesArray = learning_outcomes ? [learning_outcomes] : [];
            }
        } catch (e) {
            console.error('❌ Error parsing learning_outcomes:', e);
            outcomesArray = [];
        }
        
        console.log('✅ Data parsed:', {
            name,
            category,
            techStackArray,
            featuresArray,
            outcomesArray
        });
        
        // Insert into database
        const [result] = await pool.execute(
            `INSERT INTO project_templates 
             (name, category, difficulty, description, tech_stack, features, learning_outcomes, downloads, rating, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, 5.0, NOW())`,
            [
                name.trim(),
                category,
                difficulty || 'Intermediate',
                description.trim(),
                JSON.stringify(techStackArray),
                JSON.stringify(featuresArray),
                JSON.stringify(outcomesArray)
            ]
        );
        
        console.log('✅ Template created with ID:', result.insertId);
        
        res.status(201).json({
            success: true,
            message: 'Template created successfully!',
            templateId: result.insertId
        });
        
    } catch (error) {
        console.error('❌ Error creating template:', error);
        
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                success: false,
                message: 'A template with this name already exists'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Database error: ' + error.message
        });
    }
});

// ==================== SIMPLE ADD TEMPLATE (FOR TESTING) ====================
router.post('/simple-add', async (req, res) => {
    try {
        console.log('🧪 Simple template creation for testing');
        console.log('📦 Request body:', req.body);
        
        const { name, category, description, tech_stack } = req.body;
        
        if (!name || !category || !description) {
            return res.status(400).json({
                success: false,
                message: 'Name, category, and description are required'
            });
        }
        
        const techStackArray = Array.isArray(tech_stack) ? tech_stack : [tech_stack || 'JavaScript'];
        
        const [result] = await pool.execute(
            `INSERT INTO project_templates 
             (name, category, difficulty, description, tech_stack, features, learning_outcomes, downloads, rating, created_at) 
             VALUES (?, ?, 'Beginner', ?, ?, '[]', '[]', 0, 5.0, NOW())`,
            [
                name.trim(),
                category,
                description.trim(),
                JSON.stringify(techStackArray)
            ]
        );
        
        console.log('✅ Simple template created with ID:', result.insertId);
        
        res.status(201).json({
            success: true,
            message: 'Template created successfully!',
            templateId: result.insertId
        });
        
    } catch (error) {
        console.error('❌ Error in simple template creation:', error);
        res.status(500).json({
            success: false,
            message: 'Error: ' + error.message
        });
    }
});

// ==================== GENERATE & DOWNLOAD TEMPLATE - FIXED VERSION ====================
router.post('/generate', async (req, res) => {
    try {
        const { templateId, projectName, customizations } = req.body;
        
        console.log('🚀 Generating project:', { templateId, projectName });
        
        if (!templateId || !projectName) {
            return res.status(400).json({
                success: false,
                message: 'Template ID and project name are required'
            });
        }

        // Fetch template
        const [templates] = await pool.execute(
            'SELECT * FROM project_templates WHERE id = ?',
            [templateId]
        );
        
        if (templates.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }
        
        const template = templates[0];
        
        // Parse template data with proper error handling
        let techStack = [];
        if (template.tech_stack) {
            try {
                techStack = JSON.parse(template.tech_stack);
                if (!Array.isArray(techStack)) {
                    techStack = typeof template.tech_stack === 'string' ? 
                        template.tech_stack.split(',').map(tech => tech.trim()) : 
                        [template.tech_stack];
                }
            } catch (e) {
                techStack = typeof template.tech_stack === 'string' ? 
                    template.tech_stack.split(',').map(tech => tech.trim()) : 
                    [template.tech_stack];
            }
        }
        
        let features = [];
        if (template.features) {
            try {
                features = JSON.parse(template.features);
                if (!Array.isArray(features)) {
                    features = typeof template.features === 'string' ? 
                        template.features.split('\n').filter(f => f.trim()) : 
                        [template.features];
                }
            } catch (e) {
                features = typeof template.features === 'string' ? 
                    template.features.split('\n').filter(f => f.trim()) : 
                    [template.features];
            }
        }
        
        let learning_outcomes = [];
        if (template.learning_outcomes) {
            try {
                learning_outcomes = JSON.parse(template.learning_outcomes);
                if (!Array.isArray(learning_outcomes)) {
                    learning_outcomes = typeof template.learning_outcomes === 'string' ? 
                        template.learning_outcomes.split('\n').filter(o => o.trim()) : 
                        [template.learning_outcomes];
                }
            } catch (e) {
                learning_outcomes = typeof template.learning_outcomes === 'string' ? 
                    template.learning_outcomes.split('\n').filter(o => o.trim()) : 
                    [template.learning_outcomes];
            }
        }

        // Create parsed template object
        const parsedTemplate = {
            ...template,
            tech_stack: techStack,
            features: features,
            learning_outcomes: learning_outcomes
        };

        console.log('✅ Template parsed:', parsedTemplate.name);
        
        // Create temp directory
        const tempDir = path.join(__dirname, '../temp', projectName);
        const tempBaseDir = path.join(__dirname, '../temp');
        
        // Ensure temp directory exists
        if (!fs.existsSync(tempBaseDir)) {
            fs.mkdirSync(tempBaseDir, { recursive: true });
            console.log('✅ Created temp directory');
        }
        
        // Clean up existing directory if it exists
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        
        // Create project directory
        fs.mkdirSync(tempDir, { recursive: true });
        console.log('✅ Created project directory:', tempDir);
        
        // Generate project files
        await generateProjectFiles(parsedTemplate, projectName, tempDir, customizations);
        
        // Create ZIP
        const zipPath = path.join(__dirname, '../temp', `${projectName}.zip`);
        console.log('📦 Creating ZIP at:', zipPath);
        
        await createZip(tempDir, zipPath);
        
        // Update download count
        await pool.execute(
            'UPDATE project_templates SET downloads = downloads + 1 WHERE id = ?',
            [templateId]
        );
        
        console.log('✅ Project generated successfully, sending file...');
        
        // Set headers for file download
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${projectName}.zip"`);
        res.setHeader('Content-Transfer-Encoding', 'binary');
        res.setHeader('Cache-Control', 'no-cache');
        
        // Send file
        res.download(zipPath, `${projectName}.zip`, (err) => {
            // Cleanup regardless of success or error
            try {
                if (fs.existsSync(tempDir)) {
                    fs.rmSync(tempDir, { recursive: true, force: true });
                    console.log('✅ Cleaned up temp directory');
                }
                if (fs.existsSync(zipPath)) {
                    fs.unlinkSync(zipPath);
                    console.log('✅ Cleaned up ZIP file');
                }
            } catch (cleanupErr) {
                console.error('⚠️ Cleanup error:', cleanupErr);
            }
            
            if (err) {
                console.error('❌ Download error:', err);
                if (!res.headersSent) {
                    res.status(500).json({
                        success: false,
                        message: 'Download failed: ' + err.message
                    });
                }
            } else {
                console.log('✅ Download completed successfully');
            }
        });
        
    } catch (error) {
        console.error('❌ Error generating project:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating project: ' + error.message
        });
    }
});
// ==================== DEBUG DOWNLOAD ENDPOINT ====================
router.post('/debug-generate', async (req, res) => {
    try {
        console.log('🔍 DEBUG: Testing download endpoint');
        console.log('📦 Request body:', req.body);
        
        const { templateId } = req.body;
        
        // Create a simple test ZIP
        const testDir = path.join(__dirname, '../temp/test-project');
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        
        // Create a test file
        fs.writeFileSync(path.join(testDir, 'README.md'), '# Test Project\nThis is a test download.');
        
        // Create ZIP
        const zipPath = path.join(__dirname, '../temp/test-project.zip');
        await createZip(testDir, zipPath);
        
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="test-project.zip"');
        res.download(zipPath, 'test-project.zip', (err) => {
            // Cleanup
            try {
                if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true });
                if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
            } catch (e) {}
        });
        
    } catch (error) {
        console.error('❌ Debug error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});
// ==================== GENERATE TEMPLATE AS PDF ====================
router.post('/generate-pdf', async (req, res) => {
    try {
        const { templateId } = req.body;
        
        console.log('📄 Generating PDF for template ID:', templateId);
        
        if (!templateId) {
            return res.status(400).json({
                success: false,
                message: 'Template ID is required'
            });
        }

        // Fetch template
        const [templates] = await pool.execute(
            'SELECT * FROM project_templates WHERE id = ?',
            [templateId]
        );
        
        if (templates.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }
        
        const template = templates[0];
        
        // Parse template data
        let techStack = [];
        if (template.tech_stack) {
            try {
                techStack = JSON.parse(template.tech_stack);
                if (!Array.isArray(techStack)) {
                    techStack = typeof template.tech_stack === 'string' ? 
                        template.tech_stack.split(',').map(tech => tech.trim()) : 
                        [template.tech_stack];
                }
            } catch (e) {
                techStack = typeof template.tech_stack === 'string' ? 
                    template.tech_stack.split(',').map(tech => tech.trim()) : 
                    [template.tech_stack];
            }
        }
        
        let features = [];
        if (template.features) {
            try {
                features = JSON.parse(template.features);
                if (!Array.isArray(features)) {
                    features = typeof template.features === 'string' ? 
                        template.features.split('\n').filter(f => f.trim()) : 
                        [template.features];
                }
            } catch (e) {
                features = typeof template.features === 'string' ? 
                    template.features.split('\n').filter(f => f.trim()) : 
                    [template.features];
            }
        }
        
        let learning_outcomes = [];
        if (template.learning_outcomes) {
            try {
                learning_outcomes = JSON.parse(template.learning_outcomes);
                if (!Array.isArray(learning_outcomes)) {
                    learning_outcomes = typeof template.learning_outcomes === 'string' ? 
                        template.learning_outcomes.split('\n').filter(o => o.trim()) : 
                        [template.learning_outcomes];
                }
            } catch (e) {
                learning_outcomes = typeof template.learning_outcomes === 'string' ? 
                    template.learning_outcomes.split('\n').filter(o => o.trim()) : 
                    [template.learning_outcomes];
            }
        }

        // Generate PDF
        const pdfBuffer = await generateTemplatePDF({
            ...template,
            tech_stack: techStack,
            features: features,
            learning_outcomes: learning_outcomes
        });

        // Update download count
        await pool.execute(
            'UPDATE project_templates SET downloads = downloads + 1 WHERE id = ?',
            [templateId]
        );

        console.log('✅ PDF generated successfully');

        // Set headers for PDF download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${template.name.replace(/\s+/g, '-')}-template.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        
        // Send PDF
        res.send(pdfBuffer);
        
    } catch (error) {
        console.error('❌ Error generating PDF:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating PDF: ' + error.message
        });
    }
});

// ==================== GENERATE PDF CONTENT ====================
async function generateTemplatePDF(template) {
    const PDFDocument = require('pdfkit');
    const fs = require('fs');
    const path = require('path');
    
    return new Promise((resolve, reject) => {
        try {
            // Create a PDF document
            const doc = new PDFDocument({ margin: 50 });
            const buffers = [];
            
            // Collect PDF data
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const pdfData = Buffer.concat(buffers);
                resolve(pdfData);
            });
            
            // ===== PDF CONTENT =====
            
            // Header
            doc.fillColor('#6366f1')
               .fontSize(24)
               .font('Helvetica-Bold')
               .text(template.name, 50, 50, { align: 'center' });
            
            doc.fillColor('#666666')
               .fontSize(12)
               .font('Helvetica')
               .text(`Template ID: ${template.id} | Generated by TechWeave`, 50, 80, { align: 'center' });
            
            // Separator line
            doc.moveTo(50, 100)
               .lineTo(550, 100)
               .strokeColor('#6366f1')
               .lineWidth(2)
               .stroke();
            
            let yPosition = 130;
            
            // Basic Information
            doc.fillColor('#333333')
               .fontSize(16)
               .font('Helvetica-Bold')
               .text('Project Overview', 50, yPosition);
            
            yPosition += 30;
            
            doc.fillColor('#666666')
               .fontSize(11)
               .font('Helvetica')
               .text(`Category: ${template.category}`, 50, yPosition);
            
            yPosition += 20;
            doc.text(`Difficulty: ${template.difficulty}`, 50, yPosition);
            
            yPosition += 20;
            doc.text(`Description: ${template.description}`, 50, yPosition);
            
            yPosition += 40;
            
            // Tech Stack
            doc.fillColor('#333333')
               .fontSize(16)
               .font('Helvetica-Bold')
               .text('Technology Stack', 50, yPosition);
            
            yPosition += 30;
            
            doc.fillColor('#666666')
               .fontSize(11);
            
            template.tech_stack.forEach((tech, index) => {
                if (yPosition > 700) { // Page break check
                    doc.addPage();
                    yPosition = 50;
                }
                doc.text(`• ${tech}`, 70, yPosition);
                yPosition += 15;
            });
            
            yPosition += 20;
            
            // Features
            if (template.features && template.features.length > 0) {
                if (yPosition > 700) {
                    doc.addPage();
                    yPosition = 50;
                }
                
                doc.fillColor('#333333')
                   .fontSize(16)
                   .font('Helvetica-Bold')
                   .text('Key Features', 50, yPosition);
                
                yPosition += 30;
                
                doc.fillColor('#666666')
                   .fontSize(11);
                
                template.features.forEach((feature, index) => {
                    if (yPosition > 700) {
                        doc.addPage();
                        yPosition = 50;
                    }
                    doc.text(`✓ ${feature}`, 70, yPosition);
                    yPosition += 15;
                });
                
                yPosition += 20;
            }
            
            // Learning Outcomes
            if (template.learning_outcomes && template.learning_outcomes.length > 0) {
                if (yPosition > 700) {
                    doc.addPage();
                    yPosition = 50;
                }
                
                doc.fillColor('#333333')
                   .fontSize(16)
                   .font('Helvetica-Bold')
                   .text('Learning Outcomes', 50, yPosition);
                
                yPosition += 30;
                
                doc.fillColor('#666666')
                   .fontSize(11);
                
                template.learning_outcomes.forEach((outcome, index) => {
                    if (yPosition > 700) {
                        doc.addPage();
                        yPosition = 50;
                    }
                    doc.text(`🎯 ${outcome}`, 70, yPosition);
                    yPosition += 15;
                });
            }
            
            // Footer
            doc.page.margins = { bottom: 50 };
            const bottomY = doc.page.height - 50;
            
            doc.fillColor('#999999')
               .fontSize(10)
               .text(`Generated on ${new Date().toLocaleDateString()} by TechWeave Platform`, 
                     50, bottomY, { align: 'center' });
            
            // Finalize PDF
            doc.end();
            
        } catch (error) {
            reject(error);
        }
    });
}

// ==================== PREVIEW TEMPLATE (HTML) ====================
router.get('/preview/:id', async (req, res) => {
    try {
        const templateId = req.params.id;
        
        const [templates] = await pool.execute(
            'SELECT * FROM project_templates WHERE id = ?',
            [templateId]
        );
        
        if (templates.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Template not found'
            });
        }
        
        const template = templates[0];
        
        // Parse template data (same as above)
        let techStack = [];
        let features = [];
        let learning_outcomes = [];
        
        // ... (same parsing logic as above)
        
        // Generate HTML preview
        const htmlPreview = generateHTMLPreview({
            ...template,
            tech_stack: techStack,
            features: features,
            learning_outcomes: learning_outcomes
        });
        
        res.send(htmlPreview);
        
    } catch (error) {
        console.error('Error generating preview:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating preview'
        });
    }
});

function generateHTMLPreview(template) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>${template.name} - TechWeave</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
            .header { background: #6366f1; color: white; padding: 30px; border-radius: 10px; }
            .section { margin: 30px 0; }
            .tech-stack { display: flex; flex-wrap: wrap; gap: 10px; }
            .tech-badge { background: #e0e7ff; color: #6366f1; padding: 8px 15px; border-radius: 20px; }
            .feature-list li, .outcome-list li { margin: 10px 0; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>${template.name}</h1>
            <p>${template.description}</p>
        </div>
        
        <div class="section">
            <h2>Project Details</h2>
            <p><strong>Category:</strong> ${template.category}</p>
            <p><strong>Difficulty:</strong> ${template.difficulty}</p>
        </div>
        
        <div class="section">
            <h2>Technology Stack</h2>
            <div class="tech-stack">
                ${template.tech_stack.map(tech => `<span class="tech-badge">${tech}</span>`).join('')}
            </div>
        </div>
        
        ${template.features.length > 0 ? `
        <div class="section">
            <h2>Features</h2>
            <ul class="feature-list">
                ${template.features.map(feature => `<li>${feature}</li>`).join('')}
            </ul>
        </div>
        ` : ''}
        
        ${template.learning_outcomes.length > 0 ? `
        <div class="section">
            <h2>Learning Outcomes</h2>
            <ul class="outcome-list">
                ${template.learning_outcomes.map(outcome => `<li>${outcome}</li>`).join('')}
            </ul>
        </div>
        ` : ''}
        
        <div style="margin-top: 50px; padding: 20px; background: #f8f9fa; border-radius: 10px;">
            <p><strong>Generated by TechWeave</strong> - Empowering SUST SWE Students</p>
        </div>
    </body>
    </html>
    `;
}
// ==================== HELPER FUNCTIONS ====================

async function generateProjectFiles(template, projectName, tempDir, customizations) {
    // Generate README
    const readme = generateReadme(template, projectName, customizations);
    fs.writeFileSync(path.join(tempDir, 'README.md'), readme);
    
    // Generate .gitignore
    fs.writeFileSync(path.join(tempDir, '.gitignore'), generateGitignore());
    
    // Generate LICENSE
    fs.writeFileSync(path.join(tempDir, 'LICENSE'), generateLicense(projectName));
    
    // Category-specific files
    switch(template.category) {
        case 'Web':
            generateWebFiles(tempDir, projectName, template.tech_stack);
            break;
        case 'ML':
            generateMLFiles(tempDir, projectName);
            break;
        case 'Security':
            generateSecurityFiles(tempDir, projectName);
            break;
        case 'Mobile':
            generateMobileFiles(tempDir, projectName);
            break;
        case 'Backend':
            generateBackendFiles(tempDir, projectName);
            break;
        default:
            generateWebFiles(tempDir, projectName, template.tech_stack);
    }
}

function generateReadme(template, projectName, customizations) {
    const author = customizations?.author || 'Your Name';
    const description = customizations?.description || template.description;
    
    return `# ${projectName}

> ${description}

**Author:** ${author}  
**Category:** ${template.category}  
**Difficulty:** ${template.difficulty}

## 🚀 Quick Start

\`\`\`bash
# Install dependencies
${template.category === 'Web' || template.category === 'Backend' || template.category === 'Mobile' ? 'npm install' : 'pip install -r requirements.txt'}

# Run the application
${template.category === 'Web' || template.category === 'Backend' ? 'npm start' : template.category === 'Mobile' ? 'npm start' : 'python main.py'}
\`\`\`

## 🛠 Tech Stack

${template.tech_stack.map(tech => `- ${tech}`).join('\n')}

${template.features.length > 0 ? `## ✨ Features

${template.features.map(f => `- ✅ ${f}`).join('\n')}` : ''}

${template.learning_outcomes.length > 0 ? `## 📚 Learning Outcomes

${template.learning_outcomes.map(o => `- 🎯 ${o}`).join('\n')}` : ''}

## 📁 Project Structure

\`\`\`
${projectName}/
├── src/              # Source code
├── README.md         # This file
└── package.json      # Dependencies
\`\`\`

---

**Generated with ❤️ by TechWeave**  
*Empowering SUST SWE Students*
`;
}

function generateGitignore() {
    return `# Dependencies
node_modules/
__pycache__/
*.pyc
venv/
env/

# Environment
.env
.env.local

# Build
dist/
build/
*.egg-info/

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# Logs
*.log
logs/
`;
}

function generateLicense(projectName) {
    return `MIT License

Copyright (c) ${new Date().getFullYear()} ${projectName}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
}

function generateWebFiles(tempDir, projectName, techStack) {
    const hasReact = techStack.some(t => t.toLowerCase().includes('react'));
    
    // package.json
    const packageJson = {
        name: projectName.toLowerCase().replace(/\s+/g, '-'),
        version: "1.0.0",
        description: "Generated by TechWeave",
        main: "index.js",
        scripts: hasReact ? {
            start: "react-scripts start",
            build: "react-scripts build",
            test: "react-scripts test"
        } : {
            start: "node server.js"
        },
        dependencies: hasReact ? {
            "react": "^18.2.0",
            "react-dom": "^18.2.0",
            "react-scripts": "5.0.1"
        } : {
            "express": "^4.18.0"
        }
    };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));
    
    // Create src directory
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    
    if (hasReact) {
        // App.js
        const appJs = `import React from 'react';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Welcome to ${projectName}</h1>
        <p>Start building your amazing project!</p>
      </header>
    </div>
  );
}

export default App;`;
        fs.writeFileSync(path.join(srcDir, 'App.js'), appJs);
        
        // App.css
        const appCss = `.App {
  text-align: center;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

h1 {
  font-size: 3rem;
  margin-bottom: 1rem;
}

p {
  font-size: 1.2rem;
}`;
        fs.writeFileSync(path.join(srcDir, 'App.css'), appCss);
        
        // index.js
        const indexJs = `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`;
        fs.writeFileSync(path.join(srcDir, 'index.js'), indexJs);
        
        // public/index.html
        const publicDir = path.join(tempDir, 'public');
        fs.mkdirSync(publicDir, { recursive: true });
        const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${projectName}</title>
</head>
<body>
  <noscript>You need to enable JavaScript to run this app.</noscript>
  <div id="root"></div>
</body>
</html>`;
        fs.writeFileSync(path.join(publicDir, 'index.html'), indexHtml);
    } else {
        // Simple Express server
        const serverJs = `const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('<h1>Welcome to ${projectName}</h1>');
});

app.listen(PORT, () => {
  console.log(\`Server running on http://localhost:\${PORT}\`);
});`;
        fs.writeFileSync(path.join(tempDir, 'server.js'), serverJs);
    }
}

function generateMLFiles(tempDir, projectName) {
    // main.py
    const mainPy = `"""
${projectName}
Machine Learning Project
"""

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

def main():
    print("Welcome to ${projectName}")
    print("Start building your ML model!")
    
    # Your code here
    
if __name__ == "__main__":
    main()
`;
    fs.writeFileSync(path.join(tempDir, 'main.py'), mainPy);
    
    // requirements.txt
    const requirements = `numpy>=1.24.0
pandas>=2.0.0
scikit-learn>=1.3.0
matplotlib>=3.7.0
jupyter>=1.0.0
`;
    fs.writeFileSync(path.join(tempDir, 'requirements.txt'), requirements);
    
    // Create data directory
    const dataDir = path.join(tempDir, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, '.gitkeep'), '');
}

function generateSecurityFiles(tempDir, projectName) {
    // scanner.py
    const scannerPy = `"""
${projectName}
Security Testing Toolkit
⚠️  FOR EDUCATIONAL PURPOSES ONLY
"""

import socket
import sys

def scan_port(host, port):
    """Scan a single port"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1)
        result = sock.connect_ex((host, port))
        sock.close()
        return result == 0
    except:
        return False

def main():
    print("Security Testing Toolkit")
    print("Use responsibly!")
    
    if len(sys.argv) < 2:
        print("Usage: python scanner.py <host>")
        return
    
    host = sys.argv[1]
    print(f"Scanning {host}...")
    
    # Scan common ports
    for port in [21, 22, 80, 443, 3306, 5432, 8080]:
        if scan_port(host, port):
            print(f"Port {port} is OPEN")

if __name__ == "__main__":
    main()
`;
    fs.writeFileSync(path.join(tempDir, 'scanner.py'), scannerPy);
    
    // requirements.txt
    const requirements = `requests>=2.31.0
beautifulsoup4>=4.12.0
`;
    fs.writeFileSync(path.join(tempDir, 'requirements.txt'), requirements);
}

function generateMobileFiles(tempDir, projectName) {
    // package.json
    const packageJson = {
        name: projectName.toLowerCase().replace(/\s+/g, '-'),
        version: "1.0.0",
        main: "index.js",
        scripts: {
            start: "expo start",
            android: "expo start --android",
            ios: "expo start --ios"
        },
        dependencies: {
            "expo": "~49.0.0",
            "react": "18.2.0",
            "react-native": "0.72.0"
        }
    };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));
    
    // App.js
    const appJs = `import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>${projectName}</Text>
      <Text style={styles.subtitle}>Start building your mobile app!</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#667eea',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: 'white',
  },
});
`;
    fs.writeFileSync(path.join(tempDir, 'App.js'), appJs);
}

function generateBackendFiles(tempDir, projectName) {
    // package.json
    const packageJson = {
        name: projectName.toLowerCase().replace(/\s+/g, '-'),
        version: "1.0.0",
        main: "server.js",
        scripts: {
            start: "node server.js",
            dev: "nodemon server.js"
        },
        dependencies: {
            "express": "^4.18.0",
            "cors": "^2.8.5",
            "dotenv": "^16.0.0"
        },
        devDependencies: {
            "nodemon": "^3.0.0"
        }
    };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));
    
    // server.js
    const serverJs = `const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to ${projectName} API' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Start server
app.listen(PORT, () => {
  console.log(\`🚀 Server running on http://localhost:\${PORT}\`);
});
`;
    fs.writeFileSync(path.join(tempDir, 'server.js'), serverJs);
    
    // .env.example
    const envExample = `PORT=5000
NODE_ENV=development
`;
    fs.writeFileSync(path.join(tempDir, '.env.example'), envExample);
}

function createZip(sourceDir, outPath) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        output.on('close', () => {
            console.log(`✅ ZIP created: ${archive.pointer()} bytes`);
            resolve();
        });
        
        archive.on('error', (err) => {
            console.error('❌ Archive error:', err);
            reject(err);
        });
        
        archive.pipe(output);
        archive.directory(sourceDir, false);
        archive.finalize();
    });
}

// Export router and initialization function
module.exports = router;
module.exports.initializeRouter = initializeRouter;