import { ZephyrStatus, ZephyrTestResult } from '../types/zephyr.types';
import { ZephyrService } from './zephyr.service';
import { Reporter, FullConfig, TestCase, TestResult, TestStatus } from '@playwright/test/reporter';

function convertPwStatusToZephyr(status: TestStatus): ZephyrStatus {
  if (status === 'passed') return 'Pass';
  if (status === 'failed') return 'Fail';
  if (status === 'skipped') return 'Not Executed';
  if (status === 'timedOut') return 'Blocked';

  return 'Not Executed';
}

class ZephyrReporter implements Reporter {
  private zephyrService!: ZephyrService;
  private testResults: ZephyrTestResult[] = [];
  private projectKey!: string;
  private testCaseKeyPattern = /\[(.*?)\]/;

  async onBegin(config: FullConfig) {
    const reporter = config.reporter.find((reporter) =>
      reporter.find((name) => typeof name === 'string' && name.includes('/playwright-zephyr/')),
    );
    if (!reporter)
      throw new Error('Please provide required options in the config file: host, projectKey, user and password or authorizationToken');

    const [, { host, user, password, projectKey, authorizationToken, ...extraConfig }] = reporter;

    this.projectKey = projectKey;

    this.zephyrService = new ZephyrService({
      host,
      user,
      password,
      authorizationToken,
      projectKey,
      ...extraConfig
    });
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (test.title.match(this.testCaseKeyPattern) && test.title.match(this.testCaseKeyPattern)!.length > 1) {
      const [, projectName] = test.titlePath();
      const [, testCaseId] = test.title.match(this.testCaseKeyPattern)!;
      const testCaseKey = `${this.projectKey}-${testCaseId}`;
      const status = convertPwStatusToZephyr(result.status);
      // @ts-ignore
      const browserName = test._pool.registrations.get('browserName').fn;
      const capitalize = (word: string) => word && word[0]!.toUpperCase() + word.slice(1);

      this.testResults.push({
        testCaseKey,
        status,
        environment: projectName || capitalize(browserName),
        executionDate: new Date().toISOString(),
      });
    }
  }

  async onEnd() {
    if (this.testResults.length > 0) {
      await this.zephyrService.createRun(this.testResults);
    } else {
      console.log(`There are no tests with such ${this.testCaseKeyPattern} key pattern`);
    }
  }
}

export default ZephyrReporter;
