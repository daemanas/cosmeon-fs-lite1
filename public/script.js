class CosmeonFS {
    constructor() {
        this.baseUrl = 'http://localhost:3000/api';
        this.initializeEventListeners();
        this.loadNodes();
        this.loadFiles();
        this.loadLogs();
        this.setupAutoRefresh();
    }

    initializeEventListeners() {
        // File upload
        const dropArea = document.getElementById('dropArea');
        const fileInput = document.getElementById('fileInput');
        const browseBtn = document.getElementById('browseBtn');

        browseBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));

        dropArea.addEventListener('click', () => fileInput.click());

        dropArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropArea.style.borderColor = 'rgba(0, 212, 255, 0.8)';
            dropArea.style.background = 'rgba(0, 212, 255, 0.15)';
        });

        dropArea.addEventListener('dragleave', () => {
            dropArea.style.borderColor = 'rgba(0, 212, 255, 0.3)';
            dropArea.style.background = 'rgba(0, 212, 255, 0.05)';
        });

        dropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            dropArea.style.borderColor = 'rgba(0, 212, 255, 0.3)';
            dropArea.style.background = 'rgba(0, 212, 255, 0.05)';
            this.handleFiles(e.dataTransfer.files);
        });

        // Refresh logs
        document.getElementById('refreshLogs').addEventListener('click', () => {
            this.loadLogs();
            this.loadNodes();
            this.loadFiles();
        });
    }

    async handleFiles(files) {
        if (!files.length) return;

        const file = files[0];
        const formData = new FormData();
        formData.append('file', file);

        const progressBar = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const uploadProgress = document.getElementById('uploadProgress');

        uploadProgress.style.display = 'block';
        progressBar.style.width = '0%';
        progressText.textContent = 'Uploading...';

        try {
            const response = await fetch(`${this.baseUrl}/upload`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                progressBar.style.width = '100%';
                progressText.textContent = 'Upload complete! Distributing chunks...';
                
                // Update UI
                this.loadFiles();
                this.loadNodes();
                this.loadLogs();

                // Show success message
                setTimeout(() => {
                    uploadProgress.style.display = 'none';
                    this.showNotification('File uploaded and distributed successfully!', 'success');
                }, 2000);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            progressText.textContent = `Upload failed: ${error.message}`;
            progressBar.style.background = 'linear-gradient(90deg, #ff416c, #ff4b2b)';
            this.showNotification(`Upload failed: ${error.message}`, 'error');
        }
    }


    // catch (error) {
        //     progressText.textContent = `Upload failed: ${error.message}`;
        //     progressBar.style.background = 'linear-gradient(90deg, #ff416c, #ff4b2b)';
        //     this.showNotification(`Upload failed: ${error.message}`, 'error');
        // }

    async loadNodes() {
        try {
            const response = await fetch(`${this.baseUrl}/nodes`);
            const data = await response.json();

            const nodesContainer = document.getElementById('nodesContainer');
            nodesContainer.innerHTML = '';

            data.nodes.forEach(node => {
                const nodeElement = document.createElement('div');
                nodeElement.className = `node ${node.status}`;
                nodeElement.innerHTML = `
                    <h3><i class="fas fa-satellite"></i> ${node.nodeId}</h3>
                    <div class="node-status status-${node.status}">${node.status.toUpperCase()}</div>
                    <p>Chunks: ${node.chunkCount}</p>
                    <button class="btn ${node.status === 'online' ? 'btn-danger' : 'btn-success'}" 
                            onclick="cosmeon.toggleNode('${node.nodeId}')">
                        <i class="fas fa-power-off"></i> Turn ${node.status === 'online' ? 'Off' : 'On'}
                    </button>
                `;
                nodesContainer.appendChild(nodeElement);
            });
        } catch (error) {
            console.error('Error loading nodes:', error);
        }
    }

    async loadFiles() {
        try {
            const response = await fetch(`${this.baseUrl}/metadata`);
            const data = await response.json();

            const filesList = document.getElementById('filesList');
            filesList.innerHTML = '';

            Object.values(data.files || {}).forEach(file => {
                const fileElement = document.createElement('div');
                fileElement.className = 'file-item';
                fileElement.innerHTML = `
                    <div class="file-header">
                        <span class="file-name">${file.originalName}</span>
                        <button class="btn btn-primary" onclick="cosmeon.reconstructFile('${file.fileId}', '${file.originalName}')">
                            <i class="fas fa-puzzle-piece"></i> Reconstruct
                        </button>
                    </div>
                    <div class="file-meta">
                        <span><i class="fas fa-hashtag"></i> ${file.fileId}</span>
                        <span><i class="fas fa-cubes"></i> ${file.totalChunks} chunks</span>
                        <span><i class="fas fa-weight-hanging"></i> ${(file.size / 1024).toFixed(2)} KB</span>
                        <span><i class="fas fa-calendar"></i> ${new Date(file.uploadedAt).toLocaleDateString()}</span>
                    </div>
                `;
                filesList.appendChild(fileElement);
            });
        } catch (error) {
            console.error('Error loading files:', error);
        }
    }

    async loadLogs() {
        try {
            const response = await fetch(`${this.baseUrl}/logs`);
            const data = await response.json();

            const logsContainer = document.getElementById('logsContainer');
            logsContainer.innerHTML = '';

            data.logs.forEach(log => {
                const logElement = document.createElement('div');
                logElement.className = `log-entry ${log.type}`;
                logElement.innerHTML = `
                    <span class="log-timestamp">${new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span class="log-message">${log.message}</span>
                `;
                logsContainer.appendChild(logElement);
            });
        } catch (error) {
            console.error('Error loading logs:', error);
        }
    }

    async toggleNode(nodeId) {
        try {
            const response = await fetch(`${this.baseUrl}/nodes/${nodeId}/toggle`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            });

            const result = await response.json();
            if (result.success) {
                this.showNotification(`Node ${nodeId} is now ${result.status}`, 'success');
                this.loadNodes();
                this.loadLogs();
            }
        } catch (error) {
            console.error('Error toggling node:', error);
            this.showNotification(`Failed to toggle node: ${error.message}`, 'error');
        }
    }

    async reconstructFile(fileId, fileName) {
        try {
            this.showNotification(`Reconstructing ${fileName}...`, 'info');
            
            const response = await fetch(`${this.baseUrl}/reconstruct/${fileId}`, {
                method: 'POST'
            });

            const result = await response.json();
            
            if (result.success) {
                if (result.status === 'success') {
                    // Download the file
                    const link = document.createElement('a');
                    link.href = result.downloadUrl;
                    link.download = fileName;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    
                    this.showNotification(`${fileName} reconstructed and downloaded successfully!`, 'success');
                } else if (result.status === 'partial') {
                    this.showNotification(
                        `Partial reconstruction: ${result.availableChunks}/${result.totalChunks} chunks available`,
                        'warning'
                    );
                } else {
                    this.showNotification('Reconstruction failed - no chunks available', 'error');
                }
            } else {
                throw new Error(result.error);
            }

            this.loadLogs();
        } catch (error) {
            console.error('Error reconstructing file:', error);
            this.showNotification(`Reconstruction failed: ${error.message}`, 'error');
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;

        // Add to page
        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateY(0)';
        }, 10);

        // Remove after delay
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(20px)';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    setupAutoRefresh() {
        // Auto-refresh logs every 10 seconds
        setInterval(() => {
            this.loadLogs();
        }, 10000);

        // Auto-refresh nodes every 30 seconds
        setInterval(() => {
            this.loadNodes();
            this.loadFiles();
        }, 30000);
    }
}

// Dashboard-specific functionality
class Dashboard {
    constructor() {
        this.baseUrl = 'http://localhost:3000/api';
        this.initializeDashboard();
        this.setupAutoRefresh();
    }

    async initializeDashboard() {
        await this.loadDashboardData();
        this.loadLogs();
    }

    async loadDashboardData() {
        try {
            const response = await fetch(`${this.baseUrl}/dashboard`);
            const data = await response.json();

            // Update stats
            document.getElementById('totalNodes').textContent = data.nodes.length;
            document.getElementById('onlineNodes').textContent = 
                data.nodes.filter(n => n.status === 'online').length;
            document.getElementById('totalFiles').textContent = data.totalFiles;
            document.getElementById('totalChunks').textContent = data.totalChunks;
            document.getElementById('systemUptime').textContent = 
                this.formatUptime(data.systemUptime);

            // Update chunk distribution chart
            this.updateChunkChart(data.chunkDistribution);
            
            // Update nodes list
            this.updateNodesList(data.nodes);

        } catch (error) {
            console.error('Error loading dashboard data:', error);
        }
    }

    updateChunkChart(distribution) {
        const chartContainer = document.getElementById('chunkChart');
        chartContainer.innerHTML = '';

        const maxChunks = Math.max(...Object.values(distribution));
        
        Object.entries(distribution).forEach(([node, chunks]) => {
            const percentage = maxChunks > 0 ? (chunks / maxChunks) * 100 : 0;
            
            const chartItem = document.createElement('div');
            chartItem.className = 'chart-item';
            chartItem.innerHTML = `
                <div class="chart-label">
                    <span>${node}</span>
                    <span>${chunks} chunks</span>
                </div>
                <div class="chart-bar">
                    <div class="chart-fill" style="width: ${percentage}%"></div>
                </div>
            `;
            chartContainer.appendChild(chartItem);
        });
    }

    updateNodesList(nodes) {
        const nodesList = document.getElementById('nodesStatusList');
        nodesList.innerHTML = '';

        nodes.forEach(node => {
            const nodeItem = document.createElement('div');
            nodeItem.className = 'status-item';
            nodeItem.innerHTML = `
                <div class="status-header">
                    <span class="status-node ${node.status}">
                        <i class="fas fa-satellite"></i> ${node.nodeId}
                    </span>
                    <span class="status-badge ${node.status}">${node.status.toUpperCase()}</span>
                </div>
                <div class="status-details">
                    <span><i class="fas fa-cubes"></i> ${node.chunkCount} chunks</span>
                    <span><i class="fas fa-clock"></i> ${new Date(node.lastSeen).toLocaleTimeString()}</span>
                </div>
            `;
            nodesList.appendChild(nodeItem);
        });
    }

    async loadLogs() {
        try {
            const response = await fetch(`${this.baseUrl}/logs`);
            const data = await response.json();

            const logsContainer = document.getElementById('dashboardLogs');
            logsContainer.innerHTML = '';

            // Show only last 20 logs
            data.logs.slice(0, 20).forEach(log => {
                const logElement = document.createElement('div');
                logElement.className = `log-entry ${log.type}`;
                logElement.innerHTML = `
                    <span class="log-timestamp">${new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span class="log-message">${log.message}</span>
                `;
                logsContainer.appendChild(logElement);
            });
        } catch (error) {
            console.error('Error loading logs:', error);
        }
    }

    formatUptime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        return `${hours}h ${minutes}m ${secs}s`;
    }

    setupAutoRefresh() {
        // Auto-refresh dashboard every 5 seconds
        setInterval(() => {
            this.loadDashboardData();
            this.loadLogs();
        }, 5000);
    }
}

// Initialize the appropriate class based on current page
if (window.location.pathname.includes('dashboard')) {
    window.dashboard = new Dashboard();
} else {
    window.cosmeon = new CosmeonFS();
}

// Add notification styles dynamically
const style = document.createElement('style');
style.textContent = `
.notification {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 20px;
    border-radius: 8px;
    background: rgba(16, 20, 48, 0.95);
    border-left: 4px solid;
    display: flex;
    align-items: center;
    gap: 10px;
    z-index: 1000;
    transform: translateY(-20px);
    opacity: 0;
    transition: all 0.3s ease;
    box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
    min-width: 300px;
    max-width: 400px;
}

.notification.success {
    border-left-color: #00b09b;
}

.notification.error {
    border-left-color: #ff416c;
}

.notification.info {
    border-left-color: #00d4ff;
}

.notification.warning {
    border-left-color: #ffb347;
}

.notification i {
    font-size: 1.2rem;
}

.notification.success i {
    color: #00b09b;
}

.notification.error i {
    color: #ff416c;
}

.notification.info i {
    color: #00d4ff;
}

.notification.warning i {
    color: #ffb347;
}
`;
document.head.appendChild(style);









