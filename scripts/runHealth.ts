import { runAllHealthDiagnostics } from '../src/modules/health/tests/index';

async function main() {
  console.log('Running Chamber Health Diagnostics...');
  const results = await runAllHealthDiagnostics();
  const passed = results.filter((r) => r.passed);
  const failed = results.filter((r) => !r.passed);

  console.log(`Diagnostics completed: ${results.length} total, ${passed.length} passed, ${failed.length} failed.`);

  if (failed.length > 0) {
    console.error('Failed checks:', failed);
    process.exit(1);
  } else {
    console.log('ALL HEALTH CHECKS PASSED.');
  }
}

main().catch((err) => {
  console.error('Health test runner error:', err);
  process.exit(1);
});
