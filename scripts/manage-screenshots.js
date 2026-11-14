#!/usr/bin/env node

/**
 * MUSICFY Screenshot Management Tool
 * 
 * Strict management of UI/UX testing and browser inspection screenshots.
 * 
 * Standards:
 * 1. Primary Directory: img-local/ at project root
 * 2. Naming Schema: phase-task-device-page-timestamp.png
 * 3. Safe Archival: Uses OS `gio trash` exclusively. NEVER uses rm, unlink, or permanent deletion.
 * 4. Preservation: img-local/ directory and Brain artifacts are never deleted.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const IMG_LOCAL_DIR = path.join(PROJECT_ROOT, 'img-local');
const HOME_DIR = process.env.HOME || '/home/shanz';
const LINUX_TRASH_FILES = path.join(HOME_DIR, '.local', 'share', 'Trash', 'files');
const LINUX_TRASH_INFO = path.join(HOME_DIR, '.local', 'share', 'Trash', 'info');

// Generic / forbidden names blocklist
const GENERIC_BLOCKLIST = [
  'media_0.png',
  'media_1.png',
  'media_2.png',
  'image.png',
  'screenshot.png',
  'screen.png',
  'test.png',
  'dummy.png',
  'capture.png',
  'sample.png',
  'img.png',
];

/**
 * Validates a screenshot filename against required schema:
 * Schema: phase-task-device-page-timestamp.png
 * 
 * Must contain at least 4 hyphen-separated tokens.
 * Example valid names:
 *   - phase1-gesture-mobile-home-001.png
 *   - phase1-gesture-mobile-library-002.png
 *   - phase1-desktop-home-003.png
 *   - phase2-artist-section-mobile-001.png
 *   - phase3-settings-desktop-001.png
 */
function validateFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return {
      valid: false,
      reason: 'Filename must be a non-empty string.',
    };
  }

  const basename = path.basename(filename);

  // Check generic blocklist
  if (GENERIC_BLOCKLIST.includes(basename.toLowerCase())) {
    return {
      valid: false,
      reason: `Generic filename '${basename}' is strictly forbidden. Use 'phase-task-device-page-timestamp.png'.`,
    };
  }

  // Check generic pattern
  if (/^(media_\d+|image|screenshot|screen|dummy|capture|sample|img)[\d_.-]*\.(png|jpe?g|webp)$/i.test(basename)) {
    return {
      valid: false,
      reason: `Generic pattern '${basename}' is forbidden. Use descriptive name matching 'phase-task-device-page-timestamp.png'.`,
    };
  }

  // Extension check
  const extMatch = basename.match(/\.(png|jpe?g|webp)$/i);
  if (!extMatch) {
    return {
      valid: false,
      reason: `Invalid extension in '${basename}'. Must be .png (preferred), .jpg, or .webp.`,
    };
  }

  const nameWithoutExt = basename.slice(0, basename.lastIndexOf('.'));

  // Character check: only lowercase/uppercase alphanumeric and hyphens
  if (!/^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)+$/.test(nameWithoutExt)) {
    return {
      valid: false,
      reason: `Filename '${basename}' must contain only alphanumeric tokens separated by hyphens (e.g. 'phase1-desktop-home-001.png').`,
    };
  }

  const tokens = nameWithoutExt.split('-');
  if (tokens.length < 4) {
    return {
      valid: false,
      reason: `Filename '${basename}' has only ${tokens.length} segments. Required at least 4 segments: phase-task-device-page-timestamp.png (e.g. 'phase1-desktop-home-001.png' or 'phase1-gesture-mobile-home-001.png').`,
    };
  }

  // Phase check
  if (!/^phase\d+$/i.test(tokens[0]) && !/^p\d+$/i.test(tokens[0])) {
    return {
      valid: false,
      reason: `First segment '${tokens[0]}' should denote the project phase (e.g., 'phase1', 'phase2', 'phase3').`,
    };
  }

  return {
    valid: true,
    basename,
    tokens,
  };
}

/**
 * Checks gio tool availability
 */
function checkGioAvailability() {
  const check = spawnSync('which', ['gio'], { encoding: 'utf8' });
  if (check.status !== 0 || !check.stdout.trim()) {
    throw new Error("Linux desktop utility 'gio' is not found. Trash operation cannot proceed safely.");
  }
  return check.stdout.trim();
}

/**
 * Ensures img-local directory exists
 */
function ensureImgLocalDir() {
  if (!fs.existsSync(IMG_LOCAL_DIR)) {
    fs.mkdirSync(IMG_LOCAL_DIR, { recursive: true });
  }
  const keepFile = path.join(IMG_LOCAL_DIR, '.gitkeep');
  if (!fs.existsSync(keepFile)) {
    fs.writeFileSync(keepFile, '', 'utf8');
  }
}

/**
 * Clean / move old screenshots to Linux Trash
 */
function cleanScreenshots() {
  ensureImgLocalDir();
  const gioPath = checkGioAvailability();

  console.log(`[Screenshot Manager] Using Trash binary: ${gioPath}`);
  console.log(`[Screenshot Manager] Inspecting directory: ${IMG_LOCAL_DIR}`);

  const entries = fs.readdirSync(IMG_LOCAL_DIR);
  const screenshotFiles = entries.filter((f) => f !== '.gitkeep' && !f.startsWith('.'));

  if (screenshotFiles.length === 0) {
    console.log('[Screenshot Manager] No previous screenshots found in img-local/. Directory is clean.');
    return { trashed: [], total: 0 };
  }

  console.log(`[Screenshot Manager] Found ${screenshotFiles.length} file(s) to move to Trash...`);
  const trashed = [];

  for (const file of screenshotFiles) {
    const fullPath = path.join(IMG_LOCAL_DIR, file);

    // CRITICAL SAFETY CHECK: NEVER use rm or fs.unlinkSync!
    console.log(`[Screenshot Manager] Trashing file: ${file}`);
    const result = spawnSync('gio', ['trash', fullPath], { encoding: 'utf8' });

    if (result.status !== 0) {
      const errMsg = result.stderr || result.stdout || `Exit code ${result.status}`;
      console.error(`\x1b[31m[Screenshot Manager ERROR] Failed to trash file '${file}': ${errMsg}\x1b[0m`);
      console.error('\x1b[31mProcess HALTED. Permanent deletion (rm/unlink) is strictly prohibited!\x1b[0m');
      process.exit(1);
    }

    // Verify file is no longer in img-local
    if (fs.existsSync(fullPath)) {
      console.error(`\x1b[31m[Screenshot Manager ERROR] File '${file}' still exists in img-local/ after gio trash.\x1b[0m`);
      process.exit(1);
    }

    trashed.push(file);
    console.log(`  ✓ Moved to OS Trash: ${file}`);
  }

  // Ensure img-local directory itself was NOT deleted
  if (!fs.existsSync(IMG_LOCAL_DIR)) {
    fs.mkdirSync(IMG_LOCAL_DIR, { recursive: true });
  }
  ensureImgLocalDir();

  console.log(`\n\x1b[32m[Screenshot Manager] ✓ Successfully moved ${trashed.length} screenshot(s) to OS Trash.\x1b[0m`);
  console.log(`[Screenshot Manager] Verified 'img-local/' directory is intact and ready for new task.\n`);

  return { trashed, total: trashed.length };
}

/**
 * Save / copy a new screenshot to img-local
 */
function saveScreenshot(sourcePath, targetName) {
  ensureImgLocalDir();

  if (!sourcePath) {
    console.error('\x1b[31m[Screenshot Manager ERROR] Missing source file path.\x1b[0m');
    console.error('Usage: node scripts/manage-screenshots.js save <sourcePath> <targetFilename>');
    process.exit(1);
  }

  if (!fs.existsSync(sourcePath)) {
    console.error(`\x1b[31m[Screenshot Manager ERROR] Source file not found: '${sourcePath}'\x1b[0m`);
    process.exit(1);
  }

  const validation = validateFilename(targetName);
  if (!validation.valid) {
    console.error(`\x1b[31m[Screenshot Manager ERROR] Invalid filename '${targetName}':\x1b[0m`);
    console.error(`  Reason: ${validation.reason}`);
    console.error('\nExample valid filenames:');
    console.error('  • phase1-gesture-mobile-home-001.png');
    console.error('  • phase1-gesture-mobile-library-002.png');
    console.error('  • phase1-desktop-home-003.png');
    console.error('  • phase2-artist-section-mobile-001.png');
    console.error('  • phase3-settings-desktop-001.png');
    process.exit(1);
  }

  const destPath = path.join(IMG_LOCAL_DIR, validation.basename);

  // Overwrite prevention rule: "Jangan menimpa screenshot sebelumnya selama task yang sama berlangsung"
  if (fs.existsSync(destPath)) {
    console.error(`\x1b[31m[Screenshot Manager ERROR] File '${validation.basename}' already exists in img-local/!\x1b[0m`);
    console.error('Overwriting existing screenshots within the same task is not permitted.');
    console.error('Please increment the timestamp / sequential counter (e.g. -002.png).');
    process.exit(1);
  }

  // Safely copy the file (source remains intact, Brain files preserved)
  try {
    fs.copyFileSync(sourcePath, destPath);
    const stats = fs.statSync(destPath);
    if (stats.size === 0) {
      throw new Error('Destination file has 0 bytes.');
    }

    console.log(`\n\x1b[32m[Screenshot Manager] ✓ Screenshot saved successfully!\x1b[0m`);
    console.log(`  • Destination : ${destPath}`);
    console.log(`  • File Size   : ${(stats.size / 1024).toFixed(1)} KB`);
    console.log(`  • Format      : Validated (${validation.tokens.length} segments)\n`);
    return destPath;
  } catch (err) {
    console.error(`\x1b[31m[Screenshot Manager ERROR] Failed to save screenshot: ${err.message}\x1b[0m`);
    process.exit(1);
  }
}

/**
 * List all screenshots in img-local/
 */
function listScreenshots() {
  ensureImgLocalDir();

  const entries = fs.readdirSync(IMG_LOCAL_DIR);
  const screenshotFiles = entries.filter((f) => f !== '.gitkeep' && !f.startsWith('.'));

  console.log(`\n============================================================`);
  console.log(` MUSICFY Screenshot Directory: img-local/`);
  console.log(` Total files: ${screenshotFiles.length}`);
  console.log(`============================================================`);

  if (screenshotFiles.length === 0) {
    console.log(' (Directory is currently empty)');
  } else {
    screenshotFiles.forEach((file, index) => {
      const fullPath = path.join(IMG_LOCAL_DIR, file);
      const stat = fs.statSync(fullPath);
      const val = validateFilename(file);
      const statusTag = val.valid ? '\x1b[32m[VALID]\x1b[0m' : '\x1b[31m[INVALID NAME]\x1b[0m';
      console.log(` ${index + 1}. ${statusTag} ${file} (${(stat.size / 1024).toFixed(1)} KB) - ${stat.mtime.toLocaleTimeString()}`);
    });
  }
  console.log(`============================================================\n`);
}

/**
 * Print status of screenshot management
 */
function printStatus() {
  ensureImgLocalDir();
  let gioAvailable = false;
  let gioPath = 'Not found';
  try {
    gioPath = checkGioAvailability();
    gioAvailable = true;
  } catch (e) {
    gioAvailable = false;
  }

  const entries = fs.readdirSync(IMG_LOCAL_DIR);
  const screenshotFiles = entries.filter((f) => f !== '.gitkeep' && !f.startsWith('.'));

  const trashExists = fs.existsSync(LINUX_TRASH_FILES);

  console.log(`\n--- MUSICFY Screenshot Manager Status ---`);
  console.log(`Directory       : ${IMG_LOCAL_DIR} (Exists: ✓)`);
  console.log(`Active Files    : ${screenshotFiles.length}`);
  console.log(`GIO Trash Tool  : ${gioAvailable ? `✓ (${gioPath})` : '✗ Not Available'}`);
  console.log(`OS Trash Path   : ${LINUX_TRASH_FILES} (Exists: ${trashExists ? '✓' : '✗'})`);
  console.log(`-----------------------------------------\n`);
}

// CLI Command Parser
const args = process.argv.slice(2);
const command = args[0] || 'status';

switch (command) {
  case 'clean':
  case 'trash':
    cleanScreenshots();
    break;

  case 'save': {
    // Parse arguments: save <sourcePath> <targetFilename> or save --src <src> --name <name>
    let src = '';
    let name = '';
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--src' && args[i + 1]) {
        src = args[++i];
      } else if (args[i] === '--name' && args[i + 1]) {
        name = args[++i];
      } else if (!src) {
        src = args[i];
      } else if (!name) {
        name = args[i];
      }
    }
    saveScreenshot(src, name);
    break;
  }

  case 'validate': {
    const filenameToValidate = args[1];
    if (!filenameToValidate) {
      console.error('Usage: node scripts/manage-screenshots.js validate <filename>');
      process.exit(1);
    }
    const res = validateFilename(filenameToValidate);
    if (res.valid) {
      console.log(`\x1b[32m✓ '${filenameToValidate}' is VALID!\x1b[0m`);
      console.log(`  Segments: ${res.tokens.join(' | ')}`);
    } else {
      console.error(`\x1b[31m✗ '${filenameToValidate}' is INVALID!\x1b[0m`);
      console.error(`  Reason: ${res.reason}`);
      process.exit(1);
    }
    break;
  }

  case 'list':
    listScreenshots();
    break;

  case 'status':
    printStatus();
    break;

  default:
    console.log(`Usage: node scripts/manage-screenshots.js [clean|save|validate|list|status]`);
    console.log(`  • clean                         : Move previous screenshots in img-local/ to OS Trash`);
    console.log(`  • save <sourcePath> <filename>  : Validate and copy screenshot to img-local/`);
    console.log(`  • validate <filename>           : Test if a filename matches naming standard`);
    console.log(`  • list                          : List all current screenshots in img-local/`);
    console.log(`  • status                        : Show screenshot manager environment status`);
    break;
}
