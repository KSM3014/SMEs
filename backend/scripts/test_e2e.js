/**
 * End-to-end test: search for companies via orchestrator
 * Tests both FSC-listed companies and sole proprietors (via bulk DB fallback)
 */
import apiOrchestrator from '../services/apiOrchestrator.js';

async function testSearch(label, query) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: ${label}`);
  console.log(`Query: ${JSON.stringify(query)}`);
  console.log('='.repeat(60));

  try {
    const result = await apiOrchestrator.searchCompany(query);

    console.log(`\nEntities found: ${result.entities.length}`);
    console.log(`Unmatched: ${result.unmatched.length}`);
    console.log(`APIs: ${result.meta.apisSucceeded}/${result.meta.apisAttempted} succeeded`);
    console.log(`Time: ${result.meta.timing.totalMs}ms`);

    for (const entity of result.entities) {
      console.log(`\n  Entity: ${entity.canonicalName || 'Unknown'}`);
      console.log(`  BRN: ${entity.identifiers?.brno || '-'}`);
      console.log(`  CRN: ${entity.identifiers?.crno || '-'}`);
      console.log(`  Confidence: ${(entity.confidence * 100).toFixed(0)}% ${entity.matchLevel}`);
      console.log(`  Sources: ${entity.sources?.join(', ')}`);
    }

    if (result.meta.errors.length > 0) {
      console.log(`\n  Errors: ${result.meta.errors.map(e => e.api + ': ' + e.error).join(', ')}`);
    }
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
  }
}

async function main() {
  // Test 1: Known FSC company (아이센스)
  await testSearch('아이센스 (FSC-listed, by BRN)', { brno: '2108129428' });

  // Test 2: Search by name
  await testSearch('야놀자 (by name)', { companyName: '야놀자' });

  // Test 3: Sole proprietor from bulk DB (use a BRN from our test download)
  // BRN 3058634812 = (주)트윈스마일홀딩스 from our test data
  await testSearch('트윈스마일홀딩스 (from bulk DB)', { brno: '3058634812' });

  // Test 4: Samsung (full pipeline)
  await testSearch('삼성전자 (full pipeline)', { brno: '1248100998' });

  console.log('\n\nDone.');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
