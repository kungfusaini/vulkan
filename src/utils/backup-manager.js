const fs = require('fs').promises;
const path = require('path');

class BackupManager {
  constructor() {
    this.backupDir = '/app/data-backup';
    this.sourceDir = path.join(__dirname, '../../data');
    this.git = null;
    this.isBackingUp = false;
    this.gitToken = process.env.VULKAN_GIT_TOKEN;
  }

  async initialize() {
    if (process.env.NODE_ENV !== 'prod') {
      console.log('Development mode - backup functionality disabled');
      return;
    }

    if (!this.gitToken) {
      console.warn('VULKAN_GIT_TOKEN not set - backup functionality will be limited');
    }

    try {
      const git = require('simple-git');
      this.git = git(this.backupDir);
    } catch (error) {
      console.error('Failed to load simple-git:', error.message);
      return;
    }

    await fs.mkdir(this.backupDir, { recursive: true });
    
    // Now initialize git after directory exists
    try {
      const git = require('simple-git');
      this.git = git(this.backupDir);
    } catch (error) {
      console.error('Failed to load simple-git:', error.message);
      return;
    }
    
    if (this.git) {
      await this.initializeGitRepo();
      await this.setupRemote();
      await this.setupGitCredentials();
    }
  }

  async initializeGitRepo() {
    try {
      await this.git.init();
      console.log('Git repository initialized successfully');
    } catch (initError) {
      try {
        await this.git.status();
        console.log('Git repository already exists');
      } catch (statusError) {
        console.log('Falling back to manual git commands...');
        await this.initializeWithManualCommands();
      }
    }
  }

  async setupRemote() {
    if (!process.env.BACKUP_REPO_URL) return;
    
    try {
      const remotes = await this.git.getRemotes(true);
      const hasOrigin = remotes.some(remote => remote.name === 'origin');
      
      if (!hasOrigin) {
        // Convert SSH URL to HTTPS if needed
        const httpsUrl = process.env.BACKUP_REPO_URL.replace('git@github.com:', 'https://github.com/');
        await this.git.addRemote('origin', httpsUrl);
        console.log('Remote origin added successfully (HTTPS)');
      } else {
        console.log('Remote origin already exists, skipping addition');
      }
    } catch (remoteError) {
      console.error('Failed to check/add remote:', remoteError.message);
    }
  }

  async setupGitCredentials() {
    if (!this.gitToken) {
      console.warn('No git token available, skipping credential setup');
      return;
    }
    
    try {
      // Configure git to use token for HTTPS authentication
      const httpsUrl = `https://${this.gitToken}@github.com/`;
      await this.git.addConfig('credential.helper', 'store');
      await this.git.addConfig('user.name', process.env.GIT_AUTHOR_NAME || 'Vulkan Backup Bot');
      await this.git.addConfig('user.email', process.env.GIT_AUTHOR_EMAIL || 'backup@vulkan.sumeetsaini.com');
      console.log('Git credentials configured with token');
    } catch (error) {
      console.error('Failed to setup git credentials:', error.message);
    }
  }

  async backupData(triggerEndpoint = 'unknown') {
    // Only perform backup in production
    if (process.env.NODE_ENV !== 'prod') {
      return { success: false, message: 'Development mode - backup disabled' };
    }

    // Use atomic check and set to prevent race conditions
    if (this.isBackingUp) {
      console.log('Backup already in progress, skipping');
      return { success: false, message: 'Backup already in progress' };
    }

    this.isBackingUp = true;
    
    try {
      console.log(`Starting backup triggered by: ${triggerEndpoint}`);
      
      // Copy files from source to backup directory
      await this.copyFiles();
      
      // Check git status
      if (!this.git) {
        return { success: false, message: 'Git not initialized' };
      }

      // Always use manual commands with token authentication for reliability
      return await this.backupWithManualCommands(triggerEndpoint);
    } catch (error) {
      console.error('Backup failed:', error);
      return { success: false, error: error.message };
    } finally {
      this.isBackingUp = false;
    }
  }

  async copyFiles() {
    try {
      // Check if source directory exists
      try {
        await fs.access(this.sourceDir);
      } catch (accessError) {
        console.log('Source data directory does not exist, creating it...');
        await fs.mkdir(this.sourceDir, { recursive: true });
        console.log('Created empty source data directory');
        return; // No files to copy yet
      }
      
      const files = await fs.readdir(this.sourceDir).catch(() => []);
      console.log(`Found ${files.length} files to backup:`, files.join(', '));
      
      for (const file of files) {
        const sourcePath = path.join(this.sourceDir, file);
        const backupPath = path.join(this.backupDir, file);
        
        try {
          // Check if it's a file (not directory)
          const stat = await fs.stat(sourcePath);
          if (stat.isFile()) {
            const content = await fs.readFile(sourcePath);
            await fs.writeFile(backupPath, content);
            console.log(`Copied file: ${file}`);
          }
        } catch (fileError) {
          console.error(`Failed to copy file ${file}:`, fileError.message);
          // Continue with other files
        }
      }
    } catch (error) {
      console.error('Failed to copy files:', error);
      throw error;
    }
  }

  async initializeWithManualCommands() {
    const { execSync } = require('child_process');
    
    try {
      execSync('git init', { cwd: this.backupDir });
      console.log('Git repository initialized manually');
      
      if (process.env.BACKUP_REPO_URL) {
        execSync(`git remote add origin ${process.env.BACKUP_REPO_URL}`, { cwd: this.backupDir });
        console.log('Remote added manually');
      }
    } catch (error) {
      console.error('Manual git initialization failed:', error.message);
      throw error;
    }
  }

  getGitEnvironment() {
    const gitEnv = { ...process.env };
    if (this.gitToken) {
      // Configure git to use token for HTTPS authentication
      gitEnv.GIT_ASKPASS = 'echo';
      gitEnv.GIT_USERNAME = this.gitToken;
      gitEnv.GIT_PASSWORD = '';
    }
    return gitEnv;
  }

  async backupWithManualCommands(triggerEndpoint) {
    const { execSync } = require('child_process');
    const gitEnv = this.getGitEnvironment();
    
    try {
      execSync('git add .', { cwd: this.backupDir, env: gitEnv });
      
      const timestamp = new Date().toISOString();
      const message = `Backup from ${triggerEndpoint} - ${timestamp}`;
      
      // Configure git user for manual commands
      if (process.env.GIT_AUTHOR_NAME) {
        execSync(`git config user.name "${process.env.GIT_AUTHOR_NAME}"`, { cwd: this.backupDir, env: gitEnv });
      }
      if (process.env.GIT_AUTHOR_EMAIL) {
        execSync(`git config user.email "${process.env.GIT_AUTHOR_EMAIL}"`, { cwd: this.backupDir, env: gitEnv });
      }
      
      execSync(`git commit -m "${message}"`, { cwd: this.backupDir, env: gitEnv });
      
      if (process.env.BACKUP_REPO_URL) {
        try {
          // Get current branch and push to it (support both master and main)
          const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: this.backupDir, env: gitEnv }).toString().trim();
          
          // Use HTTPS with token for pushing
          const httpsUrl = process.env.BACKUP_REPO_URL.replace('git@github.com:', 'https://github.com/');
          const authenticatedUrl = this.gitToken ? 
            httpsUrl.replace('https://github.com/', `https://${this.gitToken}@github.com/`) : 
            httpsUrl;
          
          execSync(`git remote set-url origin ${authenticatedUrl}`, { cwd: this.backupDir, env: gitEnv });
          execSync(`git push origin ${currentBranch}`, { cwd: this.backupDir, env: gitEnv });
          
          console.log(`Backup pushed to remote: ${message} (branch: ${currentBranch})`);
        } catch (pushError) {
          console.error('Failed to push to remote:', pushError.message);
          return { success: true, message: `${message} (push failed)`, timestamp, pushError: pushError.message };
        }
      } else {
        console.log(`Local backup completed: ${message}`);
      }
    } catch (error) {
      console.error('Manual backup failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  async getStatus() {
    try {
      const files = await fs.readdir(this.backupDir).catch(() => []);
      
      if (this.git) {
        const status = await this.git.status();
        const log = await this.git.log({ maxCount: 5 });
        
        return {
          isBackingUp: this.isBackingUp,
          isClean: status.isClean,
          currentBranch: status.current,
          latest: log.latest,
          files
        };
      } else {
        return {
          isBackingUp: this.isBackingUp,
          files,
          method: 'manual'
        };
      }
    } catch (error) {
      return { error: error.message };
    }
  }
}

module.exports = new BackupManager();