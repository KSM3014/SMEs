import { loadEntityFromDb } from '../services/entityPersistence.js';
import { mapEntityToCompanyDetail, fetchDartData } from '../services/entityDataMapper.js';
import sequelize from '../config/database.js';

const entity = await loadEntityFromDb({ brno: '1248100998' }, { allowStale: true });
console.log('Entity loaded:', entity?.entityId, entity?.canonicalName);

console.log('Fetching DART data...');
const dartData = await fetchDartData(entity);
console.log('DART company_info:', dartData?.company_info ? 'yes' : 'no');
console.log('DART officers:', dartData?.officers?.length);
console.log('DART ownership:', dartData?.ownership?.length);

const mapped = mapEntityToCompanyDetail(entity, dartData);
console.log('\n=== Mapped Output ===');
console.log('company_name:', mapped.company_name);
console.log('ceo_name:', mapped.ceo_name);
console.log('business_number:', mapped.business_number);
console.log('address:', mapped.address);
console.log('listed:', mapped.listed, '| stock_code:', mapped.stock_code);
console.log('revenue:', mapped.revenue);
console.log('operating_margin:', mapped.operating_margin);
console.log('roe:', mapped.roe);
console.log('debt_ratio:', mapped.debt_ratio);
console.log('financial_statements:', mapped.financial_statements ? 'present' : 'null');
if (mapped.financial_statements) {
  console.log('  BS keys:', Object.keys(mapped.financial_statements.balance_sheet || {}));
  console.log('  IS keys:', Object.keys(mapped.financial_statements.income_statement || {}));
  console.log('  CF keys:', Object.keys(mapped.financial_statements.cash_flow || {}));
}
console.log('officers:', mapped.officers?.length, '| first:', mapped.officers?.[0]?.name);
console.log('shareholders:', mapped.shareholders?.length, '| first:', mapped.shareholders?.[0]?.name);
console.log('red_flags:', mapped.red_flags?.length);
mapped.red_flags?.forEach(f => console.log('  ', f.severity, '-', f.title));
console.log('_entity:', mapped._entity?.entityId, 'conf:', mapped._entity?.confidence);
console.log('_hasDart:', mapped._hasDart);
console.log('_conflicts:', mapped._conflicts?.length);

await sequelize.close();
console.log('\nDone');
