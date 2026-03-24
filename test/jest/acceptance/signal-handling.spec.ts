import { startSnykCLI } from '../util/startSnykCLI';

jest.setTimeout(1000 * 60);

describe('signal handling', () => {
  const env = {
    ...process.env,
    SNYK_CFG_PREVIEW_FEATURES_ENABLED: 'true',
  };

  it('exits with SNYK-CLI-0025 when receiving SIGINT', async () => {
    // Use 'test -d' with debug output which takes time to initialize
    const cli = await startSnykCLI('test -d', { env });

    // Wait for CLI to initialize and start processing
    await new Promise((r) => setTimeout(r, 2000));

    // Send SIGINT to the CLI process
    cli.process.kill('SIGINT');

    const exitCode = await cli.wait({ timeout: 15000 });
    const stdout = cli.stdout.get();

    expect(exitCode).toBe(2);
    expect(stdout).toContain('SNYK-CLI-0025');
  });

  it('exits with SNYK-CLI-0025 when receiving SIGTERM', async () => {
    // Use 'test -d' with debug output which takes time to initialize
    const cli = await startSnykCLI('test -d', { env });

    // Wait for CLI to initialize and start processing
    await new Promise((r) => setTimeout(r, 2000));

    // Send SIGTERM to the CLI process
    cli.process.kill('SIGTERM');

    const exitCode = await cli.wait({ timeout: 15000 });
    const stdout = cli.stdout.get();

    expect(exitCode).toBe(2);
    expect(stdout).toContain('SNYK-CLI-0025');
  });
});
