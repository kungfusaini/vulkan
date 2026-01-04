const fs = require('fs').promises;
const path = require('path');

class BackupManager {
  constructor() {
    this.backupDir = '/app/data-backup';
    this.sourceDir = path.join(__dirname, '../../data');
    this.git = null;
    this.isBackingUp = false;
    this.sshKeyPath = '/run/secrets/backup_ssh_key';
  }

  async initialize() {
    if (process.env.NODE_ENV !== 'prod') {
      console.log('Development mode - backup functionality disabled');
      return;
    }

    if (process.env.BACKUP_SSH_KEY) {
      await this.setupSshKey();
    }

    try {
      const git = require('simple-git');
      this.git = git(this.backupDir);
    } catch (error) {
      console.error('Failed to load simple-git:', error.message);
      return;
    }

    await fs.mkdir(this.backupDir, { recursive: true });
    
    if (this.git) {
      await this.initializeGitRepo();
      await this.setupRemote();
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
        await this.git.addRemote('origin', process.env.BACKUP_REPO_URL);
        console.log('Remote origin added successfully');
      } else {
        console.log('Remote origin already exists, skipping addition');
      }
    } catch (remoteError) {
      console.error('Failed to check/add remote:', remoteError.message);
    }
  }

  async setupSshKey() {
    try {
      // Create /run/secrets directory if it doesn't exist
      await fs.mkdir(path.dirname(this.sshKeyPath), { recursive: true });
      
      // Write SSH key to persistent file with proper encoding
      const sshKey = process.env.BACKUP_SSH_KEY;
      if (!sshKey) {
        throw new Error('BACKUP_SSH_KEY environment variable is empty');
      }
      
      // Log SSH key info for debugging
      console.log('SSH key length:', sshKey.length);
      console.log('SSH key starts with:', sshKey.substring(0, 50));
      console.log('SSH key ends with:', sshKey.substring(sshKey.length - 50));
      
      // Validate SSH key format - PEM format only
      if (!sshKey.includes('-----BEGIN OPENSSH PRIVATE KEY-----') || !sshKey.includes('-----END OPENSSH PRIVATE KEY-----')) {
        throw new Error('SSH key must be in PEM format with proper BEGIN/END headers');
      }
      
      await fs.writeFile(this.sshKeyPath, sshKey, { mode: 0o600, encoding: 'utf8' });
      
      // Verify SSH key was written correctly
      const writtenKey = await fs.readFile(this.sshKeyPath, 'utf8');
      if (writtenKey !== sshKey) {
        throw new Error('SSH key was corrupted during file write');
      }
      console.log('SSH key validation passed');
    } catch (error) {
      console.error('Failed to setup SSH key:', error.message);
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
              // Get current branch and push to it (support both master and main)
              const status = await this.git.status();
              const currentBranch = status.current || 'master';
              
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
      const files = await fs.readdir(this.sourceDir).catch(() => []);
      
      for (const file of files) {
        const sourcePath = path.join(this.sourceDir, file);
        const backupPath = path.join(this.backupDir, file);
        
        try {
          // Check if it's a file (not directory)
          const stat = await fs.stat(sourcePath);
          if (stat.isFile()) {
            const content = await fs.readFile(sourcePath);
            await fs.writeFile(backupPath, content);
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
    if (this.sshKeyPath) {
      const knownHostsPath = '/root/.ssh/known_hosts';
      gitEnv.GIT_SSH_COMMAND = `ssh -i ${this.sshKeyPath} -o StrictHostKeyChecking=no -o UserKnownHostsFile=${knownHostsPath}`;
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
      
      execSync(`git commit -m "${message}"`, { cwd: this.backupDir, env: gitEnv });
      
      if (process.env.BACKUP_REPO_URL) {
        try {
          // Get current branch and push to it (support both master and main)
          const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: this.backupDir, env: gitEnv }).toString().trim();
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