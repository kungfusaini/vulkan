let simpleGit;
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class BackupManager {
  constructor() {
    this.backupDir = '/app/data-backup';
    this.sourceDir = path.join(__dirname, '../../data');
    this.git = null;
    this.isBackingUp = false;
    this.sshKeyPath = null;
  }

  async initialize() {
    // Only initialize backup functionality in production
    if (process.env.NODE_ENV !== 'production') {
      console.log('Development mode - backup functionality disabled');
      return;
    }

    // Setup SSH key from environment variable if provided
    if (process.env.BACKUP_SSH_KEY) {
      await this.setupSshKey();
    }

    // Initialize git functionality only in production
    try {
      simpleGit = require('simple-git');
      this.git = simpleGit(this.backupDir);
    } catch (error) {
      console.error('Failed to load simple-git:', error.message);
      return;
    }

    try {
      // Ensure backup directory exists
      await fs.mkdir(this.backupDir, { recursive: true });
      
      // Check if we're in a git repo
      if (this.git) {
        // Initialize git repository first if it doesn't exist
        try {
          // Try to initialize using simple-git first
          await this.git.init();
          console.log('Git repository initialized successfully');
        } catch (initError) {
          // Repository might already exist, try to get status
          try {
            await this.git.status();
            console.log('Git repository already exists');
          } catch (statusError) {
            // If simple-git fails completely, fall back to manual git commands
            if (process.env.NODE_ENV === 'production') {
              console.log('Falling back to manual git commands...');
              await this.initializeWithManualCommands();
            }
          }
        }
        
        // Add remote if configured
        if (process.env.BACKUP_REPO_URL) {
          await this.git.addRemote('origin', process.env.BACKUP_REPO_URL);
        }
      }
      try {
        if (this.git) {
          await this.git.status();
          console.log('Backup repository already initialized');
        }
      } catch {
        if (this.git) {
          console.log('Initializing backup repository...');
          try {
            await this.git.init();
            if (process.env.BACKUP_REPO_URL) {
              await this.git.addRemote('origin', process.env.BACKUP_REPO_URL);
            }
          } catch (initError) {
            console.error('Failed to initialize git repository:', initError.message);
            // Don't throw for local testing scenarios
            if (initError.message.includes('already exists')) {
              // Repository might already be initialized, try to get status
              await this.git.status();
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to initialize backup manager:', error);
      throw error;
    }
  }

  async setupSshKey() {
    try {
      // Create temporary SSH key file
      this.sshKeyPath = path.join(os.tmpdir(), `backup-ssh-key-${Date.now()}`);
      await fs.writeFile(this.sshKeyPath, process.env.BACKUP_SSH_KEY, { mode: 0o600 });
      
      // Set git SSH command to use the key
      process.env.GIT_SSH_COMMAND = `ssh -i ${this.sshKeyPath} -o StrictHostKeyChecking=no`;
      
      console.log('SSH key set up from environment variable');
    } catch (error) {
      console.error('Failed to setup SSH key:', error.message);
    }
  }

  async cleanupSshKey() {
    if (this.sshKeyPath) {
      try {
        await fs.unlink(this.sshKeyPath);
        this.sshKeyPath = null;
        delete process.env.GIT_SSH_COMMAND;
      } catch (error) {
        console.error('Failed to cleanup SSH key:', error.message);
      }
    }
  }

  async backupData(triggerEndpoint = 'unknown') {
    // Only perform backup in production
    if (process.env.NODE_ENV !== 'production') {
      return { success: false, message: 'Development mode - backup disabled' };
    }

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
        return { success: false, message: 'Development mode - backup disabled' };
      }

      // Try simple-git first, fall back to manual commands if it fails
      try {
        const status = await this.git.status();
        if (!status.isClean()) {
          // Add all files and commit
          await this.git.add(['.']);
          
          const timestamp = new Date().toISOString();
          const message = `Backup from ${triggerEndpoint} - ${timestamp}`;
          
          // Configure git user if environment variables are set
          if (process.env.GIT_AUTHOR_NAME && process.env.GIT_AUTHOR_EMAIL) {
            await this.git.addConfig('user.name', process.env.GIT_AUTHOR_NAME);
            await this.git.addConfig('user.email', process.env.GIT_AUTHOR_EMAIL);
          }
          
          await this.git.commit(message);
          
          // Push to remote if configured
          if (process.env.BACKUP_REPO_URL) {
            try {
              await this.git.push('origin', 'main');
              console.log(`Backup pushed to remote: ${message}`);
            } catch (pushError) {
              console.error('Failed to push to remote:', pushError);
              // Still return success since local backup worked
              return { success: true, message: `${message} (push failed)`, timestamp, pushError: pushError.message };
            }
          } else {
            console.log(`Local backup completed: ${message}`);
          }
          
          return { success: true, message, timestamp };
        } else {
          console.log('No changes to backup');
          return { success: true, message: 'No changes to backup' };
        }
      } catch (gitError) {
        console.log('Falling back to manual git commands...');
        return await this.backupWithManualCommands(triggerEndpoint);
      }
    } catch (error) {
      console.error('Backup failed:', error);
      return { success: false, error: error.message };
    } finally {
      this.isBackingUp = false;
      await this.cleanupSshKey();
    }
  }

  async copyFiles() {
    try {
      const files = await fs.readdir(this.sourceDir);
      
      for (const file of files) {
        const sourcePath = path.join(this.sourceDir, file);
        const backupPath = path.join(this.backupDir, file);
        
        // Check if it's a file (not directory)
        const stat = await fs.stat(sourcePath);
        if (stat.isFile()) {
          const content = await fs.readFile(sourcePath);
          await fs.writeFile(backupPath, content);
        }
      }
    } catch (error) {
      console.error('Failed to copy files:', error);
      throw error;
    }
  }

  async initializeWithManualCommands() {
    const { execSync } = require('child_process');
    const fs = require('fs').promises;
    
    try {
      // Initialize git repository manually
      execSync('git init', { cwd: this.backupDir });
      console.log('Git repository initialized manually');
      
      // Add remote if configured
      if (process.env.BACKUP_REPO_URL) {
        execSync(`git remote add origin ${process.env.BACKUP_REPO_URL}`, { cwd: this.backupDir });
        console.log('Remote added manually');
      }
    } catch (error) {
      console.error('Manual git initialization failed:', error.message);
      throw error;
    }
  }

  async backupWithManualCommands(triggerEndpoint) {
    const { execSync } = require('child_process');
    
    try {
      // Setup SSH command for manual git operations
      const gitEnv = { ...process.env };
      if (this.sshKeyPath) {
        gitEnv.GIT_SSH_COMMAND = `ssh -i ${this.sshKeyPath} -o StrictHostKeyChecking=no`;
      }
      
      // Add files and commit manually
      execSync('git add .', { cwd: this.backupDir, env: gitEnv });
      
      const timestamp = new Date().toISOString();
      const message = `Backup from ${triggerEndpoint} - ${timestamp}`;
      
      execSync(`git commit -m "${message}"`, { cwd: this.backupDir, env: gitEnv });
      
      // Push to remote if configured
      if (process.env.BACKUP_REPO_URL) {
        try {
          execSync('git push origin main', { cwd: this.backupDir, env: gitEnv });
          console.log(`Backup pushed to remote: ${message}`);
        } catch (pushError) {
          console.error('Failed to push to remote:', pushError.message);
          return { success: true, message: `${message} (push failed)`, timestamp, pushError: pushError.message };
        }
      }
      
      return { success: true, message, timestamp };
    } catch (error) {
      console.error('Manual backup failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  async getStatus() {
    try {
      if (this.git) {
        const status = await this.git.status();
        const log = await this.git.log({ maxCount: 5 });
        
        return {
          isBackingUp: this.isBackingUp,
          isClean: status.isClean,
          currentBranch: status.current,
          latest: log.latest,
          files: await fs.readdir(this.backupDir).catch(() => [])
        };
      } else {
        return {
          isBackingUp: this.isBackingUp,
          files: await fs.readdir(this.backupDir).catch(() => []),
          method: 'manual'
        };
      }
    } catch (error) {
      return { error: error.message };
    }
  }
}

module.exports = new BackupManager();