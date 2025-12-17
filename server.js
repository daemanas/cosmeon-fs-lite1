const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/nodes', express.static('nodes'));

// Configuration
const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
const NODES = ['node1', 'node2', 'node3', 'node4'];
const NODES_DIR = path.join(__dirname, 'nodes');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const METADATA_FILE = path.join(__dirname, 'metadata.json');

// Initialize system
async function initializeSystem() {
    try {
        // Create directories
        await fs.mkdir(NODES_DIR, { recursive: true });
        await fs.mkdir(UPLOADS_DIR, { recursive: true });
        
        // Create node directories
        for (const node of NODES) {
            const nodePath = path.join(NODES_DIR, node);
            await fs.mkdir(nodePath, { recursive: true });
            
            // Create node status file
            const statusFile = path.join(nodePath, 'status.json');
            if (!await fileExists(statusFile)) {
                await fs.writeFile(statusFile, JSON.stringify({
                    nodeId: node,
                    status: 'online',
                    chunkCount: 0,
                    lastSeen: new Date().toISOString()
                }, null, 2));
            }
        }
        
        // Initialize metadata file if it doesn't exist
        if (!await fileExists(METADATA_FILE)) {
            await fs.writeFile(METADATA_FILE, JSON.stringify({ files: {} }, null, 2));
        }
        
        console.log('System initialized successfully');
    } catch (error) {
        console.error('Error initializing system:', error);
    }
}

// Helper function to check if file exists
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

// Generate SHA-256 hash
function generateHash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

// Read metadata
async function readMetadata() {
    try {
        const data = await fs.readFile(METADATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { files: {} };
    }
}

// Write metadata
async function writeMetadata(metadata) {
    await fs.writeFile(METADATA_FILE, JSON.stringify(metadata, null, 2));
}

// Get node status
async function getNodeStatus(nodeId) {
    try {
        const statusFile = path.join(NODES_DIR, nodeId, 'status.json');
        const data = await fs.readFile(statusFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { nodeId, status: 'offline', chunkCount: 0, lastSeen: null };
    }
}

// Update node status
async function updateNodeStatus(nodeId, status) {
    const statusFile = path.join(NODES_DIR, nodeId, 'status.json');
    const nodeStatus = await getNodeStatus(nodeId);
    nodeStatus.status = status;
    nodeStatus.lastSeen = new Date().toISOString();
    await fs.writeFile(statusFile, JSON.stringify(nodeStatus, null, 2));
    
    // Log status change
    logEvent(`Node ${nodeId} is now ${status}`);
    return nodeStatus;
}

// Get all nodes status
async function getAllNodesStatus() {
    const statuses = [];
    for (const node of NODES) {
        statuses.push(await getNodeStatus(node));
    }
    return statuses;
}

// Log events
function logEvent(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
    console.log(logMessage);
    
    // Store in memory for UI (in production, use proper logging)
    if (!global.systemLogs) {
        global.systemLogs = [];
    }
    global.systemLogs.unshift({
        timestamp,
        type,
        message
    });
    
    // Keep only last 100 logs
    if (global.systemLogs.length > 100) {
        global.systemLogs.pop();
    }
}

// Upload handler
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        cb(null, uniqueId + path.extname(file.originalname));
    }
});

const upload = multer({ storage });

// API Routes

// Upload file and create chunks
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        const { originalname, filename, size } = req.file;
        const filePath = path.join(UPLOADS_DIR, filename);
        const fileId = path.basename(filename, path.extname(filename));
        
        logEvent(`Starting upload: ${originalname} (${(size / 1024).toFixed(2)} KB)`);
        
        // Read file
        const fileBuffer = await fs.readFile(filePath);
        const totalChunks = Math.ceil(fileBuffer.length / CHUNK_SIZE);
        
        logEvent(`Splitting into ${totalChunks} chunks`);
        
        // Initialize metadata
        const metadata = await readMetadata();
        metadata.files[fileId] = {
            fileId,
            originalName: originalname,
            size,
            totalChunks,
            uploadedAt: new Date().toISOString(),
            fileHash: generateHash(fileBuffer),
            chunks: {}
        };
        
        // Create and distribute chunks
        let nodeIndex = 0;
        
        for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, fileBuffer.length);
            const chunkBuffer = fileBuffer.slice(start, end);
            const chunkHash = generateHash(chunkBuffer);
            
            // Find next available node
            let assignedNode = null;
            for (let attempt = 0; attempt < NODES.length; attempt++) {
                const nodeId = NODES[nodeIndex % NODES.length];
                const nodeStatus = await getNodeStatus(nodeId);
                
                if (nodeStatus.status === 'online') {
                    assignedNode = nodeId;
                    nodeIndex++;
                    break;
                }
                nodeIndex++;
            }
            
            if (!assignedNode) {
                throw new Error('No online nodes available');
            }
            
            // Save chunk to node
            const chunkFilename = `${fileId}_chunk${i}`;
            const chunkPath = path.join(NODES_DIR, assignedNode, chunkFilename);
            await fs.writeFile(chunkPath, chunkBuffer);
            
            // Update node chunk count
            const nodeStatus = await getNodeStatus(assignedNode);
            nodeStatus.chunkCount++;
            await updateNodeStatus(assignedNode, nodeStatus.status);
            
            // Store metadata
            metadata.files[fileId].chunks[i] = {
                chunkId: i,
                node: assignedNode,
                hash: chunkHash,
                size: chunkBuffer.length,
                path: chunkPath
            };
            
            logEvent(`Chunk ${i} stored on ${assignedNode} (${chunkBuffer.length} bytes)`);
        }
        
        // Save metadata
        await writeMetadata(metadata);
        
        // Clean up original file
        await fs.unlink(filePath);
        
        logEvent(`Upload completed: ${originalname}`);
        
        res.json({
            success: true,
            fileId,
            originalName: originalname,
            totalChunks,
            message: 'File uploaded and distributed successfully'
        });
        
    } catch (error) {
        logEvent(`Upload error: ${error.message}`, 'error');
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Reconstruct file
app.post('/api/reconstruct/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const metadata = await readMetadata();
        
        if (!metadata.files[fileId]) {
            throw new Error('File not found');
        }
        
        const fileInfo = metadata.files[fileId];
        const totalChunks = fileInfo.totalChunks;
        
        logEvent(`Starting reconstruction: ${fileInfo.originalName}`);
        
        const chunks = [];
        let missingChunks = [];
        
        // Collect all chunks
        for (let i = 0; i < totalChunks; i++) {
            const chunkInfo = fileInfo.chunks[i];
            const nodeStatus = await getNodeStatus(chunkInfo.node);
            
            if (nodeStatus.status === 'online') {
                try {
                    const chunkPath = path.join(NODES_DIR, chunkInfo.node, `${fileId}_chunk${i}`);
                    const chunkBuffer = await fs.readFile(chunkPath);
                    
                    // Verify chunk hash
                    const chunkHash = generateHash(chunkBuffer);
                    if (chunkHash !== chunkInfo.hash) {
                        throw new Error(`Chunk ${i} hash mismatch`);
                    }
                    
                    chunks[i] = chunkBuffer;
                    logEvent(`Retrieved chunk ${i} from ${chunkInfo.node}`);
                } catch (error) {
                    missingChunks.push({ chunkId: i, node: chunkInfo.node, error: error.message });
                    logEvent(`Failed to retrieve chunk ${i} from ${chunkInfo.node}: ${error.message}`, 'error');
                }
            } else {
                missingChunks.push({ chunkId: i, node: chunkInfo.node, error: 'Node offline' });
                logEvent(`Chunk ${i} unavailable (node ${chunkInfo.node} is offline)`, 'warning');
            }
        }
        
        // Check if we can reconstruct
        const availableChunks = chunks.filter(chunk => chunk !== undefined).length;
        const reconstructionStatus = availableChunks === totalChunks ? 'success' :
                                   availableChunks > 0 ? 'partial' : 'failed';
        
        if (reconstructionStatus === 'success') {
            // Reconstruct file
            const reconstructedBuffer = Buffer.concat(chunks);
            const reconstructedHash = generateHash(reconstructedBuffer);
            
            // Verify file hash
            if (reconstructedHash !== fileInfo.fileHash) {
                throw new Error('File hash mismatch - data corrupted');
            }
            
            // Save reconstructed file
            const outputPath = path.join(UPLOADS_DIR, `reconstructed_${fileInfo.originalName}`);
            await fs.writeFile(outputPath, reconstructedBuffer);
            
            logEvent(`Reconstruction successful: ${fileInfo.originalName}`);
            
            res.json({
                success: true,
                status: 'success',
                fileId,
                originalName: fileInfo.originalName,
                downloadUrl: `/api/download/${fileId}`,
                message: 'File reconstructed successfully'
            });
        } else {
            res.json({
                success: reconstructionStatus === 'partial',
                status: reconstructionStatus,
                fileId,
                originalName: fileInfo.originalName,
                availableChunks,
                totalChunks,
                missingChunks,
                message: reconstructionStatus === 'partial' ? 
                    `Partial reconstruction (${availableChunks}/${totalChunks} chunks available)` :
                    'Reconstruction failed - no chunks available'
            });
        }
        
    } catch (error) {
        logEvent(`Reconstruction error: ${error.message}`, 'error');
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Download reconstructed file
app.get('/api/download/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const metadata = await readMetadata();
        
        if (!metadata.files[fileId]) {
            throw new Error('File not found');
        }
        
        const fileInfo = metadata.files[fileId];
        const filePath = path.join(UPLOADS_DIR, `reconstructed_${fileInfo.originalName}`);
        
        if (!await fileExists(filePath)) {
            throw new Error('File not reconstructed yet');
        }
        
        res.download(filePath, fileInfo.originalName);
        
    } catch (error) {
        res.status(404).json({ error: error.message });
    }
});

// Toggle node status
app.post('/api/nodes/:nodeId/toggle', async (req, res) => {
    try {
        const { nodeId } = req.params;
        const { status } = req.body;
        
        if (!NODES.includes(nodeId)) {
            throw new Error('Invalid node ID');
        }
        
        const currentStatus = await getNodeStatus(nodeId);
        const newStatus = status || (currentStatus.status === 'online' ? 'offline' : 'online');
        
        const updatedStatus = await updateNodeStatus(nodeId, newStatus);
        
        res.json({
            success: true,
            nodeId,
            status: updatedStatus.status,
            message: `Node ${nodeId} is now ${updatedStatus.status}`
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get system logs
app.get('/api/logs', (req, res) => {
    res.json({
        logs: global.systemLogs || []
    });
});

// Get all nodes status
app.get('/api/nodes', async (req, res) => {
    try {
        const nodes = await getAllNodesStatus();
        res.json({ nodes });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get metadata
app.get('/api/metadata', async (req, res) => {
    try {
        const metadata = await readMetadata();
        res.json(metadata);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get dashboard data
app.get('/api/dashboard', async (req, res) => {
    try {
        const nodes = await getAllNodesStatus();
        const metadata = await readMetadata();
        const totalFiles = Object.keys(metadata.files).length;
        const totalChunks = Object.values(metadata.files).reduce((sum, file) => sum + file.totalChunks, 0);
        
        // Calculate chunk distribution
        const chunkDistribution = {};
        for (const node of NODES) {
            chunkDistribution[node] = 0;
        }
        
        Object.values(metadata.files).forEach(file => {
            Object.values(file.chunks).forEach(chunk => {
                chunkDistribution[chunk.node] = (chunkDistribution[chunk.node] || 0) + 1;
            });
        });
        
        res.json({
            nodes,
            totalFiles,
            totalChunks,
            chunkDistribution,
            systemUptime: process.uptime()
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server
async function startServer() {
    await initializeSystem();
    
    app.listen(PORT, () => {
        console.log(`COSMEON FS-Lite running on http://localhost:${PORT}`);
        logEvent('System started');
    });
}

startServer();