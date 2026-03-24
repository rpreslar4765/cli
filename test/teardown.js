const { execFileSync } = require('child_process');
const pidtree = require('pidtree');

// Timeout to wait for graceful shutdown before sending SIGKILL
const GRACEFUL_SHUTDOWN_TIMEOUT = 5000;

/**
 * Get process name/command for a given PID.
 * Returns null if process doesn't exist or on error.
 * Uses execFileSync with array args to avoid command injection.
 */
function getProcessName(pid) {
  // Validate PID is a positive integer
  const pidNum = Number(pid);
  if (!Number.isInteger(pidNum) || pidNum <= 0) {
    return null;
  }
  const pidStr = String(pidNum);

  try {
    if (process.platform === 'win32') {
      const output = execFileSync(
        'wmic',
        ['process', 'where', `ProcessId=${pidStr}`, 'get', 'CommandLine'],
        { encoding: 'utf-8', timeout: 1000 },
      );
      return output.toLowerCase();
    } else {
      // Unix: use ps to get command
      const output = execFileSync('ps', ['-p', pidStr, '-o', 'comm='], {
        encoding: 'utf-8',
        timeout: 1000,
      });
      return output.trim().toLowerCase();
    }
  } catch (err) {
    return null;
  }
}

/**
 * Check if a process is a Snyk CLI process.
 */
function isSnykProcess(pid) {
  const name = getProcessName(pid);
  if (!name) return false;
  return name.includes('snyk');
}

/**
 * Global teardown that kills any orphaned Snyk CLI processes.
 *
 * When Jest tests timeout, spawned CLI processes may be left running.
 * This teardown finds all descendant processes of the Jest runner,
 * filters for Snyk CLI processes, and sends SIGTERM (graceful) then
 * SIGKILL (force) to ensure they exit and have a chance to send
 * instrumentation data.
 */
module.exports = async function globalTeardown() {
  const jestPid = process.pid;

  let childPids;
  try {
    childPids = await pidtree(jestPid);
  } catch (err) {
    // No children or error getting process tree
    return;
  }

  if (!childPids || childPids.length === 0) {
    return;
  }

  // Filter for Snyk CLI processes only
  const snykPids = childPids.filter(isSnykProcess);

  if (snykPids.length === 0) {
    return;
  }

  console.log(
    `[teardown] Found ${snykPids.length} orphaned Snyk CLI process(es), sending SIGTERM...`,
  );

  // Send SIGTERM to Snyk processes for graceful shutdown
  for (const pid of snykPids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch (err) {
      // Process may have already exited
    }
  }

  // Wait for graceful shutdown (CLI teardown timeout is 5s)
  await new Promise((resolve) =>
    setTimeout(resolve, GRACEFUL_SHUTDOWN_TIMEOUT),
  );

  // Check which Snyk processes are still running and send SIGKILL
  let remainingPids;
  try {
    remainingPids = await pidtree(jestPid);
  } catch (err) {
    return;
  }

  const remainingSnykPids = (remainingPids || []).filter(isSnykProcess);

  if (remainingSnykPids.length > 0) {
    console.log(
      `[teardown] ${remainingSnykPids.length} Snyk process(es) still running, sending SIGKILL...`,
    );
    for (const pid of remainingSnykPids) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch (err) {
        // Process may have already exited
      }
    }
  }
};
