const fs = require('fs').promises;
const path = require('path');
const simpleGit = require('simple-git');

class ProjectsManager {
  constructor() {
    this.projectsDir = '/app/projects';
    this.cache = new Map();
    this.cacheTimestamp = null;
    this.git = null;
    this.repoUrl = process.env.PROJECTS_REPO_URL;
    this.webhookSecret = process.env.PROJECTS_WEBHOOK_SECRET;
    this.gitToken = process.env.VULKAN_GIT_TOKEN;
    this.baseUrl = process.env.PROJECTS_BASE_URL || '';
  }

  async initialize() {
    if (!this.repoUrl) {
      console.warn('[projects] PROJECTS_REPO_URL not set - projects functionality disabled');
      return;
    }

    // Ensure projects directory exists
    await fs.mkdir(this.projectsDir, { recursive: true });

    // Initialize git
    this.git = simpleGit(this.projectsDir);

    // Configure git credentials if token available
    if (this.gitToken) {
      const authenticatedUrl = this.repoUrl.replace(
        'https://github.com/',
        `https://${this.gitToken}@github.com/`
      );
      
      try {
        await this.git.env('GIT_ASKPASS', 'echo');
        await this.git.env('GIT_USERNAME', this.gitToken);
        await this.git.env('GIT_PASSWORD', '');
        
        // Try to pull first (if repo already cloned)
        await this.syncProjects();
      } catch (error) {
        console.warn('[projects] Initial sync failed, will try clone:', error.message);
        // If pull fails, try to clone fresh
        try {
          await this.cloneRepo(authenticatedUrl);
          await this.loadProjects();
        } catch (cloneError) {
          console.error('[projects] Failed to initialize projects repo:', cloneError.message);
        }
      }
    } else {
      console.warn('[projects] VULKAN_GIT_TOKEN not set - may have auth issues');
      await this.syncProjects().catch(err => {
        console.warn('[projects] Initial sync failed:', err.message);
      });
    }
  }

  async cloneRepo(authenticatedUrl) {
    // Check if .git folder exists (meaning it's already a git repo)
    let isGitRepo = false;
    try {
      await fs.access(path.join(this.projectsDir, '.git'));
      isGitRepo = true;
    } catch {
      isGitRepo = false;
    }

    if (isGitRepo) {
      console.log('[projects] Repo already exists, pulling latest');
      await this.git.pull('origin', 'main').catch(async () => {
        await this.git.pull('origin', 'master').catch(err => {
          console.warn('[projects] Pull failed:', err.message);
        });
      });
    } else {
      // Directory exists but not a git repo (empty or stale), need to clone
      console.log('[projects] Cloning projects repo...');
      
      // Clean the directory first if it has files but no .git
      try {
        const files = await fs.readdir(this.projectsDir);
        if (files.length > 0) {
          console.log('[projects] Cleaning stale directory...');
          for (const file of files) {
            await fs.rm(path.join(this.projectsDir, file), { recursive: true, force: true });
          }
        }
      } catch {
        // Directory is empty, that's fine
      }

      try {
        // Try main first, then master
        await simpleGit().clone(authenticatedUrl, this.projectsDir).catch(async () => {
          // If main fails, try with explicit branch
          const git = simpleGit();
          await git.clone(authenticatedUrl, this.projectsDir, ['--branch', 'main']).catch(async () => {
            await git.clone(authenticatedUrl, this.projectsDir, ['--branch', 'master']);
          });
        });
        console.log('[projects] Projects repo cloned successfully');
      } catch (cloneError) {
        console.error('[projects] Clone failed:', cloneError.message);
        throw cloneError;
      }
    }
  }

  async syncProjects() {
    if (!this.repoUrl) {
      return { success: false, message: 'Not initialized' };
    }

    // Check if it's a valid git repo, if not, clone it
    let isGitRepo = false;
    try {
      await fs.access(path.join(this.projectsDir, '.git'));
      isGitRepo = true;
    } catch {
      isGitRepo = false;
    }

    if (!isGitRepo) {
      console.log('[projects] Not a git repo, cloning...');
      const authenticatedUrl = this.repoUrl.replace(
        'https://github.com/',
        `https://${this.gitToken}@github.com/`
      );
      await this.cloneRepo(authenticatedUrl);
      await this.loadProjects();
      return { success: true, message: 'Projects cloned', filesUpdated: 0 };
    }

    try {
      // Re-initialize git in case directory changed
      this.git = simpleGit(this.projectsDir);
      
      // Configure authenticated URL
      let remoteUrl = this.repoUrl;
      if (this.gitToken) {
        remoteUrl = this.repoUrl.replace(
          'https://github.com/',
          `https://${this.gitToken}@github.com/`
        );
        
        // Set the remote URL with auth
        try {
          await this.git.remote(['set-url', 'origin', remoteUrl]);
        } catch {
          // Remote might not exist yet
          await this.git.remote(['add', 'origin', remoteUrl]);
        }
      }

      // Fetch and pull
      await this.git.fetch('origin');
      
      // Try main first, then master
      const pulled = await this.git.pull('origin', 'main').catch(async () => {
        return await this.git.pull('origin', 'master');
      }).catch(err => {
        console.warn('[projects] Pull failed:', err.message);
        return { files: [] };
      });

      // Clear cache to force reload
      this.cache.clear();
      this.cacheTimestamp = null;

      // Reload projects
      await this.loadProjects();

      console.log('[projects] Sync completed successfully');
      return { success: true, message: 'Projects synced', filesUpdated: pulled?.files?.length || 0 };

    } catch (error) {
      console.error('[projects] Sync failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  async loadProjects() {
    try {
      const entries = await fs.readdir(this.projectsDir, { withFileTypes: true });
      
      for (const entry of entries) {
        // Only process directories
        if (!entry.isDirectory()) continue;
        
        const slug = entry.name;
        const projectDir = path.join(this.projectsDir, slug);
        
        // Look for .md file in the project folder (prefer index.md)
        const mdFiles = (await fs.readdir(projectDir)).filter(f => f.endsWith('.md'));
        if (mdFiles.length === 0) continue;
        
        // Use index.md if exists, otherwise first .md file
        const mdFile = mdFiles.includes('index.md') ? 'index.md' : mdFiles[0];
        
        const content = await fs.readFile(path.join(projectDir, mdFile), 'utf8');
        const project = this.parseMarkdown(content, slug, projectDir);
        this.cache.set(slug, project);
      }

      this.cacheTimestamp = new Date().toISOString();
      console.log(`[projects] Loaded ${this.cache.size} projects`);

    } catch (error) {
      console.error('[projects] Failed to load projects:', error.message);
    }
  }

  resolveAssetUrl(slug, filename) {
    if (!filename) return null;
    // If it's already a full URL, return as-is
    if (filename.startsWith('http') || filename.startsWith('//')) {
      return filename;
    }
    // Resolve to /projects/slug/assets/filename
    return `${this.baseUrl}/projects/${slug}/assets/${filename}`;
  }

  parseMarkdown(content, slug, projectDir = null) {
    // Parse YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    
    if (!frontmatterMatch) {
      return { slug, error: 'No frontmatter found' };
    }

    const frontmatter = frontmatterMatch[1];
    const body = content.replace(frontmatterMatch[0], '').trim();

    // Parse YAML fields manually (simple parser for known fields)
    const project = {
      slug,
      title: null,
      date: null,
      group: [],
      tech: [],
      skills: [],
      company: null,
      image: null,
      images: [],
      video: null,
      link: null,
      draft: false,
      description: null
    };

    // Simple YAML parsing for our known fields
    const lines = frontmatter.split('\n');
    let currentArray = null;

    for (const line of lines) {
      // Check for array fields
      if (line.includes(':')) {
        const [key, ...valueParts] = line.split(':');
        const value = valueParts.join(':').trim();
        
        currentArray = null;
        
        if (key === 'title') {
          project.title = value.replace(/^["']|["']$/g, '');
        } else if (key === 'date') {
          project.date = value.replace(/^["']|["']$/g, '');
        } else if (key === 'group') {
          currentArray = 'group';
          if (value.startsWith('[')) {
            // Array format: ['a', 'b']
            const match = value.match(/\[(.*)\]/);
            if (match) {
              project.group = match[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
            }
          } else if (value) {
            project.group = [value.replace(/^["']|["']$/g, '')];
          }
        } else if (key === 'tech') {
          currentArray = 'tech';
          if (value.startsWith('[')) {
            const match = value.match(/\[(.*)\]/);
            if (match) {
              project.tech = match[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
            }
          } else if (value) {
            project.tech = [value.replace(/^["']|["']$/g, '')];
          }
        } else if (key === 'skills') {
          currentArray = 'skills';
          if (value.startsWith('[')) {
            const match = value.match(/\[(.*)\]/);
            if (match) {
              project.skills = match[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
            }
          } else if (value) {
            project.skills = [value.replace(/^["']|["']$/g, '')];
          }
        } else if (key === 'company') {
          project.company = value.replace(/^["']|["']$/g, '') || null;
        } else if (key === 'image') {
          // Single image - store as first in images array
          const img = value.replace(/^["']|["']$/g, '');
          if (img) {
            project.image = img;
            project.images = [img];
          }
        } else if (key === 'images') {
          // Multiple images array
          currentArray = 'images';
          if (value.startsWith('[')) {
            const match = value.match(/\[(.*)\]/);
            if (match) {
              project.images = match[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
              // Only set image from images[0] if image wasn't explicitly set
              if (!project.image && project.images.length > 0) {
                project.image = project.images[0];
              }
            }
          } else if (value) {
            project.images = [value.replace(/^["']|["']$/g, '')];
            // Only set image from images[0] if image wasn't explicitly set
            if (!project.image && project.images.length > 0) {
              project.image = project.images[0];
            }
          }
        } else if (key === 'video') {
          project.video = value.replace(/^["']|["']$/g, '') || null;
        } else if (key === 'link') {
          project.link = value.replace(/^["']|["']$/g, '') || null;
        } else if (key === 'draft') {
          project.draft = value.trim() === 'true';
        } else if (key === 'description') {
          project.description = value.replace(/^["']|["']$/g, '') || null;
        }
      } else if (currentArray && line.trim()) {
        // Continuation of array
        const value = line.trim().replace(/^["']|["']$/g, '');
        if (currentArray === 'group') project.group.push(value);
        else if (currentArray === 'tech') project.tech.push(value);
        else if (currentArray === 'skills') project.skills.push(value);
        else if (currentArray === 'images') {
          project.images.push(value);
          if (!project.image) project.image = value;
        }
      }
    }

    // Parse H1 sections from body and wrap in text object
    const h1Sections = {};
    let lastH1 = null;
    const bodyLines = body.split('\n');

    for (const line of bodyLines) {
      const h1Match = line.match(/^#\s+(.+)$/);
      if (h1Match) {
        lastH1 = h1Match[1].trim();
        h1Sections[lastH1] = '';
      } else if (lastH1) {
        h1Sections[lastH1] += (h1Sections[lastH1] ? '\n' : '') + line;
      }
    }

    // Store H1 sections in text object
    project.text = h1Sections;

    return project;
  }

  getProjects(filters = {}) {
    const includeDrafts = filters.include_drafts === 'true' || filters.include_drafts === true;
    let projects = Array.from(this.cache.values()).map(p => {
      // Resolve asset URLs
      const resolved = { ...p };
      if (resolved.image) {
        resolved.image = this.resolveAssetUrl(p.slug, p.image);
      }
      if (resolved.images && resolved.images.length > 0) {
        resolved.images = resolved.images.map(img => this.resolveAssetUrl(p.slug, img));
      }
      if (resolved.video) {
        resolved.video = this.resolveAssetUrl(p.slug, p.video);
      }
      return resolved;
    });

    // Filter out drafts unless explicitly requested
    if (!includeDrafts) {
      projects = projects.filter(p => !p.draft);
    }

    // Apply filters
    if (filters.group) {
      const groups = Array.isArray(filters.group) ? filters.group : [filters.group];
      projects = projects.filter(p => 
        p.group.some(g => groups.includes(g))
      );
    }

    if (filters.tech) {
      const techs = Array.isArray(filters.tech) ? filters.tech : [filters.tech];
      projects = projects.filter(p => 
        p.tech.some(t => techs.includes(t))
      );
    }

    if (filters.skills) {
      const skillList = Array.isArray(filters.skills) ? filters.skills : [filters.skills];
      projects = projects.filter(p => 
        p.skills.some(s => skillList.includes(s))
      );
    }

    if (filters.company) {
      projects = projects.filter(p => p.company === filters.company);
    }

    // Sort by date (newest first)
    projects.sort((a, b) => {
      if (!a.date || !b.date) return 0;
      return new Date(b.date) - new Date(a.date);
    });

    return projects;
  }

  getProject(slug) {
    const project = this.cache.get(slug);
    if (!project) return null;
    
    // Resolve asset URLs
    const resolved = { ...project };
    if (resolved.image) {
      resolved.image = this.resolveAssetUrl(slug, project.image);
    }
    if (resolved.images && resolved.images.length > 0) {
      resolved.images = resolved.images.map(img => this.resolveAssetUrl(slug, img));
    }
    if (resolved.video) {
      resolved.video = this.resolveAssetUrl(slug, project.video);
    }
    return resolved;
  }

  async getMediaFiles() {
    try {
      const mediaExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.mp4', '.webm', '.mov', '.avi'];
      const allFiles = [];
      
      const entries = await fs.readdir(this.projectsDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        
        const projectDir = path.join(this.projectsDir, entry.name);
        const assetsDir = path.join(projectDir, 'assets');
        
        try {
          const assetsExist = await fs.access(assetsDir).then(() => true).catch(() => false);
          if (!assetsExist) continue;
          
          const assetFiles = await fs.readdir(assetsDir);
          for (const file of assetFiles) {
            if (mediaExtensions.some(ext => file.toLowerCase().endsWith(ext))) {
              allFiles.push({
                project: entry.name,
                filename: file,
                url: `${this.baseUrl}/projects/${entry.name}/assets/${file}`
              });
            }
          }
        } catch (err) {
          // Skip if can't read assets folder
        }
      }
      
      return allFiles;
    } catch (error) {
      console.error('[projects] Failed to get media files:', error.message);
      return [];
    }
  }

  getCacheInfo() {
    return {
      projectCount: this.cache.size,
      lastUpdated: this.cacheTimestamp,
      repoUrl: this.repoUrl
    };
  }
}

module.exports = new ProjectsManager();
