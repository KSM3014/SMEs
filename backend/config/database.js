import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

// Only load dotenv if not already loaded (allows calling scripts to load it first with custom path)
if (!process.env.DB_NAME) {
  dotenv.config();
}

/**
 * PostgreSQL Database Configuration using Sequelize
 */
const sequelize = new Sequelize(
  process.env.DB_NAME || 'sme_investor_db',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    dialect: process.env.DB_DIALECT || 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: parseInt(process.env.DB_POOL_MAX || '5'),
      min: parseInt(process.env.DB_POOL_MIN || '0'),
      acquire: parseInt(process.env.DB_POOL_ACQUIRE || '30000'),
      idle: parseInt(process.env.DB_POOL_IDLE || '10000')
    },
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: true
    },
    dialectOptions: {
      ssl: process.env.NODE_ENV === 'production' ? {
        require: true,
        rejectUnauthorized: true
      } : false
    }
  }
);

/**
 * Test database connection
 */
export async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('✅ PostgreSQL connection established successfully');
    return true;
  } catch (error) {
    console.error('❌ Unable to connect to PostgreSQL:', error.message);
    return false;
  }
}

/**
 * Initialize database (create tables if not exist)
 */
export async function initializeDatabase() {
  try {
    // Note: Tables are created via schema.sql
    // This function can be used for additional setup
    await testConnection();
    console.log('✅ Database initialized');
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    throw error;
  }
}

/**
 * Raw query helper with error handling
 */
export async function executeQuery(sql, replacements = {}) {
  try {
    const [results, metadata] = await sequelize.query(sql, {
      replacements,
      type: Sequelize.QueryTypes.SELECT
    });
    return results;
  } catch (error) {
    console.error('Query execution error:', error.message);
    throw error;
  }
}

/**
 * Insert helper with encryption support
 */
export async function insertWithEncryption(table, data, encryptFields = []) {
  try {
    const encKey = process.env.ENCRYPTION_KEY;
    if (encryptFields.length > 0 && !encKey) {
      throw new Error('ENCRYPTION_KEY not configured');
    }

    const fields = Object.keys(data);
    const values = Object.values(data);

    // Pass encryption key as an additional bind parameter
    const encKeyIdx = fields.length + 1;
    const valuesPart = fields.map((field, idx) => {
      if (encryptFields.includes(field)) {
        return `PGP_SYM_ENCRYPT($${idx + 1}, $${encKeyIdx})`;
      }
      return `$${idx + 1}`;
    }).join(', ');

    const bindValues = encryptFields.length > 0 ? [...values, encKey] : values;

    const sql = `
      INSERT INTO ${table} (${fields.join(', ')})
      VALUES (${valuesPart})
      RETURNING *
    `;

    const [result] = await sequelize.query(sql, {
      bind: bindValues,
      type: Sequelize.QueryTypes.INSERT
    });

    return result;
  } catch (error) {
    console.error('Insert with encryption error:', error.message);
    throw error;
  }
}

/**
 * Batch insert helper for performance
 */
export async function batchInsert(table, dataArray, batchSize = 100) {
  if (!dataArray || dataArray.length === 0) {
    return { inserted: 0, errors: [] };
  }

  const results = { inserted: 0, errors: [] };

  for (let i = 0; i < dataArray.length; i += batchSize) {
    const batch = dataArray.slice(i, i + batchSize);

    try {
      const fields = Object.keys(batch[0]);
      const valuePlaceholders = batch.map((_, batchIdx) =>
        `(${fields.map((_, fieldIdx) => `$${batchIdx * fields.length + fieldIdx + 1}`).join(', ')})`
      ).join(', ');

      const values = batch.flatMap(item => fields.map(field => item[field]));

      const sql = `
        INSERT INTO ${table} (${fields.join(', ')})
        VALUES ${valuePlaceholders}
        ON CONFLICT DO NOTHING
      `;

      await sequelize.query(sql, {
        bind: values,
        type: Sequelize.QueryTypes.INSERT
      });

      results.inserted += batch.length;
    } catch (error) {
      results.errors.push({
        batch: i / batchSize + 1,
        error: error.message
      });
    }
  }

  return results;
}

export default sequelize;
