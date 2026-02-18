import http from 'http';

const url = 'http://localhost:3000/api/company/live/1248100998';
console.log('Connecting to SSE:', url);

http.get(url, (res) => {
  let eventCount = 0;
  res.on('data', (chunk) => {
    const text = chunk.toString();
    const lines = text.split('\n').filter(l => l.trim());
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventCount++;
        console.log(`\n--- Event ${eventCount}: ${line.slice(7)} ---`);
      } else if (line.startsWith('data:')) {
        try {
          const data = JSON.parse(line.slice(5));
          // Print summary, not full data
          if (data.entity) {
            console.log(`  entity: ${data.entity.canonicalName || data.entity.entityId || '?'}`);
            console.log(`  sources: ${data.entity.apiData?.length || data.entity.sourcesCount || '?'}`);
          }
          if (data.diff) {
            console.log(`  diff: +${data.diff.added.length} added, ~${data.diff.updated.length} updated, -${data.diff.removed.length} removed, =${data.diff.unchangedCount} unchanged`);
            console.log(`  hasChanges: ${data.diff.hasChanges}`);
          }
          if (data.meta) {
            console.log(`  apis: ${data.meta.apisSucceeded}/${data.meta.apisAttempted}, ${data.meta.durationMs}ms`);
          }
          if (data.conflicts) {
            console.log(`  conflicts: ${data.conflicts.length}`);
          }
          if (data.message) {
            console.log(`  message: ${data.message}`);
          }
        } catch {
          console.log('  ', line.slice(5, 100));
        }
      }
    }
  });
  res.on('end', () => {
    console.log(`\n=== SSE stream ended (${eventCount} events) ===`);
    process.exit(0);
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

// Timeout
setTimeout(() => { console.log('\n[Timeout] 2 min'); process.exit(0); }, 120000);
