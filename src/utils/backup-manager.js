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
    this.sshKeyPath = '/run/secrets/backup_ssh_key';
  }

  async initialize() {
    // Only initialize backup functionality in production
    if (process.env.NODE_ENV !== 'prod') {
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
            if (process.env.NODE_ENV === 'prod') {
              console.log('Falling back to manual git commands...');
              await this.initializeWithManualCommands();
            }
          }
        }
        
        // Add remote if configured (check if it exists first)
        if (process.env.BACKUP_REPO_URL) {
          try {
            const remotes = await this.git.getRemotes(true);
            const hasOrigin = remotes.some(remote => remote.name === 'origin');
            
            if (!hasOrigin) {
              await this.git.addRemote('origin', process.env.BACKUP_REPO_URL);
              console.log('Remote origin added successfully');
            } else {
              console.log('Remote origin already exists, skipping addition');
            }
          } catch (remoteError) {
            console.error('Failed to check/add remote:', remoteError.message);
          }
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
      // Create /run/secrets directory if it doesn't exist
      await fs.mkdir(path.dirname(this.sshKeyPath), { recursive: true });
      
      // Create .ssh directory and known_hosts file
      const sshDir = '/root/.ssh';
      const knownHostsPath = path.join(sshDir, 'known_hosts');
      
      await fs.mkdir(sshDir, { recursive: true });
      
      // Add GitHub to known hosts to prevent verification failures
      const githubKnownHost = 'github.com ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC7smOX1lSfBuMqP5exwQmQjLu6iT6dlh6hqEF/dJnMAn70Sv6';
      const knownHostsEntry = `github.com,140.82.112.4 ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC7smOX1lSfBuMqP5exwQmQjLu6iT6dlh6hqEF/dJnMAn70Sv6\n`;
      
      await fs.writeFile(knownHostsPath, knownHostsEntry, { mode: 0o644 });
      
      // Write SSH key to persistent file
      await fs.writeFile(this.sshKeyPath, process.env.BACKUP_SSH_KEY, { mode: 0o600 });
      
      // Set git SSH command to use key with known hosts and fallback options
      process.env.GIT_SSH_COMMAND = `ssh -i ${this.sshKeyPath} -o StrictHostKeyChecking=no -o UserKnownHostsFile=${knownHostsPath}`;
      
      console.log('SSH key written to persistent file from environment variable');
      console.log('GitHub added to known hosts for SSH authentication');
    } catch (error) {
      console.error('Failed to setup SSH key:', error.message);
    }
  }

  async backupData(triggerEndpoint = 'unknown') {
    // Only perform backup in production
    if (process.env.NODE_ENV !== 'prod') {
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
              // Get current branch and use it instead of forcing main
              const status = await this.git.status();
              const currentBranch = status.current || 'master';
              
              // Push to current branch (avoid undefined main issue)
              await this.git.push('origin', currentBranch);
              console.log(`Backup pushed to remote: ${message} (branch: ${currentBranch})`);
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
      // Setup SSH command for manual git operations with enhanced options
      const gitEnv = { ...process.env };
      if (this.sshKeyPath) {
        const knownHostsPath = '/root/.ssh/known_hosts';
        gitEnv.GIT_SSH_COMMAND = `ssh -i ${this.sshKeyPath} -o StrictHostKeyChecking=no -o UserKnownHostsFile=${knownHostsPath} -v`;
      }
      
      // Add files and commit manually
      execSync('git add .', { cwd: this.backupDir, env: gitEnv });
      
      const timestamp = new Date().toISOString();
      const message = `Backup from ${triggerEndpoint} - ${timestamp}`;
      
      execSync(`git commit -m "${message}"`, { cwd: this.backupDir, env: gitEnv });
      
      // Push to remote if configured
      if (process.env.BACKUP_REPO_URL) {
        try {
          // Get current branch and push to it (avoid branch switching issues)
          const currentBranch = execSync('git branch --show-current', { cwd: this.backupDir, env: gitEnv }).toString().trim();
          
          execSync(`git push origin ${currentBranch}`, { cwd: this.backupDir, env: gitEnv });
          console.log(`Backup pushed to remote: ${message} (branch: ${currentBranch})`);
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